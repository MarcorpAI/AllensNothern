'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {adminRequest} from '@/lib/admin-api';
import {currencyMoney, money} from '@/lib/money';
import {modifierOptionCounts} from '@/lib/modifier-display';
import {useAppAuth} from '@/lib/auth';
import type {KitchenOrderDetail, Order, PendingBankTransferOrder} from '@/lib/types';

const next: Record<string, string> = {received: 'preparing', preparing: 'out_for_delivery', out_for_delivery: 'delivered'};
const ACKNOWLEDGED_KEY = 'allens-kitchen-acknowledged-orders';
const SOUND_KEY = 'allens-kitchen-sound-enabled';
const OVERDUE_MINUTES = 20;

function readAcknowledged(): string[] {
  try { return JSON.parse(window.localStorage.getItem(ACKNOWLEDGED_KEY) ?? '[]') as string[]; }
  catch { return []; }
}

function elapsedMinutes(order: Pick<Order, 'created_at' | 'paid_at'>, now: number) {
  return Math.max(0, Math.floor((now - new Date(order.paid_at ?? order.created_at).getTime()) / 60_000));
}

function displayStatus(status: string) { return status.replaceAll('_', ' '); }

export default function AdminOrders() {
  const {getToken} = useAppAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [paymentOrders, setPaymentOrders] = useState<PendingBankTransferOrder[]>([]);
  const [detail, setDetail] = useState<KitchenOrderDetail | null>(null);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [pollLabel, setPollLabel] = useState('Loading orders…');
  const [now, setNow] = useState(() => Date.now());
  const knownIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    setSoundEnabled(window.localStorage.getItem(SOUND_KEY) === 'true');
    const clock = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(clock);
  }, []);

  const soundAlert = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const AudioContextConstructor = window.AudioContext ??
        (window as Window & {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
      if (!AudioContextConstructor) return;
      const context = new AudioContextConstructor();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      gain.gain.setValueAtTime(0.12, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.55);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(); oscillator.stop(context.currentTime + 0.55);
      oscillator.addEventListener('ended', () => void context.close());
    } catch { /* Visual alerts remain available if browser audio is blocked. */ }
  }, [soundEnabled]);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const [incoming, pendingTransfers] = await Promise.all([
        adminRequest<Order[]>('/orders', token),
        adminRequest<PendingBankTransferOrder[]>('/payment-orders', token),
      ]);
      const acknowledged = new Set(readAcknowledged());
      const detected = incoming.filter((order) => order.status === 'received' &&
        !acknowledged.has(order.id) && (!knownIds.current || !knownIds.current.has(order.id))).map((order) => order.id);
      if (detected.length) {
        setAlerts((current) => [...new Set([...current, ...detected])]);
        soundAlert();
      }
      knownIds.current = new Set(incoming.map((order) => order.id));
      setOrders(incoming);
      setPaymentOrders(pendingTransfers);
      setError('');
      setPollLabel('Up to date');
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load orders.');
      return false;
    }
  }, [getToken, soundAlert]);

  useEffect(() => {
    let active = true;
    let timer = 0;
    let retryDelay = 4_000;
    const poll = async () => {
      const succeeded = await load();
      if (!active) return;
      retryDelay = succeeded ? 8_000 : Math.min(retryDelay * 2, 60_000);
      if (!succeeded) setPollLabel('Trying to reconnect…');
      timer = window.setTimeout(() => void poll(), retryDelay);
    };
    void poll();
    return () => { active = false; window.clearTimeout(timer); };
  }, [load]);

  async function openTicket(orderId: string) {
    setDetailLoading(true);
    try {
      setDetail(await adminRequest<KitchenOrderDetail>(`/orders/${orderId}`, await getToken()));
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load this ticket.');
    } finally { setDetailLoading(false); }
  }

  function acknowledge() {
    const ids = [...new Set([...readAcknowledged(), ...alerts])].slice(-200);
    window.localStorage.setItem(ACKNOWLEDGED_KEY, JSON.stringify(ids));
    setAlerts([]);
  }

  function enableSound() {
    window.localStorage.setItem(SOUND_KEY, 'true');
    setSoundEnabled(true);
  }

  async function advance(order: Pick<Order, 'id' | 'status'>) {
    setUpdatingId(order.id);
    try {
      await adminRequest(`/orders/${order.id}/status`, await getToken(), {method: 'PATCH', body: JSON.stringify({status: next[order.status]})});
      await load();
      if (detail?.id === order.id) await openTicket(order.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update this order.');
    } finally { setUpdatingId(null); }
  }

  async function confirmTransfer(order: PendingBankTransferOrder) {
    const expected = (order.settlement_amount_minor / 100).toFixed(2);
    const entered = window.prompt(`Enter the amount visible in the ${order.settlement_currency} receiving account. Expected ${expected}.`, expected);
    if (entered === null) return;
    const receivedAmount = Math.round(Number(entered) * 100);
    if (!Number.isFinite(receivedAmount) || receivedAmount < 0) {setError('Enter a valid received amount.'); return;}
    if (!window.confirm(`Confirm ${currencyMoney(receivedAmount, order.settlement_currency, 'en')} is visible for ${order.order_number}? A screenshot is not enough.`)) return;
    setUpdatingId(order.id);
    try {
      await adminRequest(`/orders/${order.id}/confirm-bank-transfer`, await getToken(),
        {method: 'POST', body: JSON.stringify({reference: order.transfer_customer_reference ?? order.order_number,
          received_amount_minor: receivedAmount, mismatch_note: receivedAmount < order.settlement_amount_minor ? 'Customer underpaid' : ''})});
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not confirm this transfer.');
    } finally { setUpdatingId(null); }
  }

  return <section className="kitchen-page">
    <div className="section-header"><div><h2>Live order queue</h2><p className="kitchen-poll-state">{pollLabel}</p></div><div className="kitchen-toolbar">{!soundEnabled && <button className="pill" type="button" onClick={enableSound}>Enable sound</button>}<button className="pill" type="button" onClick={() => void load()}>Refresh</button></div></div>
    {alerts.length > 0 && <div className="kitchen-alert" role="status"><div><strong>{alerts.length} new paid {alerts.length === 1 ? 'order' : 'orders'}</strong><span>Open the queue and acknowledge the alert.</span></div><button className="button orange" type="button" onClick={acknowledge}>Acknowledge</button></div>}
    {error && <div className="error" role="alert"><p>{error}</p><button className="pill" type="button" onClick={() => void load()}>Try again</button></div>}
    <section className="payment-review" aria-labelledby="payment-review-title">
      <div className="section-header"><div><h2 id="payment-review-title">Payments to check</h2><p>Confirm an order only after the exact amount appears in your bank account.</p></div><strong>{paymentOrders.length}</strong></div>
      {!paymentOrders.length && <div className="empty-state">No bank transfers are waiting.</div>}
      <div className="payment-review-list">{paymentOrders.map((order) => <article key={order.id} className={order.transfer_notified_at ? 'payment-review-card reported' : 'payment-review-card'}>
        <div><span className="eyebrow">{order.transfer_notified_at ? 'Customer says transfer sent' : 'Waiting for customer — do not prepare'}</span><h3>{order.order_number}</h3><p>{order.customer_name} · <a href={`tel:${order.customer_phone}`}>{order.customer_phone}</a></p>
          <div className="pending-order-items">{order.items.map((item, index) => <div key={`${item.item_name}-${index}`}><strong>{item.quantity}× {item.item_name}</strong>{item.selected_modifiers.map((modifier) => <small key={modifier.id}>{modifier.name_en}: {modifierOptionCounts(modifier)}</small>)}</div>)}</div>
          <small>Deliver to: {order.delivery_address}{order.delivery_instructions ? ` · ${order.delivery_instructions}` : ''}</small>
          <small>{order.payment_route_name} · Sender: {order.transfer_sender_name || 'not reported'} · Ref: {order.transfer_customer_reference || order.order_number}</small>{order.transfer_mismatch_note && <small className="store-error">{order.transfer_mismatch_note}</small>}<small>Expires {new Date(order.payment_expires_at).toLocaleTimeString('en', {hour: '2-digit', minute: '2-digit'})}</small></div>
        <strong>{currencyMoney(order.settlement_amount_minor, order.settlement_currency, 'en')}<small>{money(order.total_kurus, 'en')} base</small></strong>
        <button className="button orange" type="button" disabled={updatingId === order.id} onClick={() => void confirmTransfer(order)}>{updatingId === order.id ? 'Confirming…' : 'Confirm money received'}</button>
      </article>)}</div>
    </section>
    <div className="kitchen-layout"><div className="kitchen-queue">
      {!orders.length && <div className="empty-state">No active paid orders.</div>}
      {orders.map((order) => { const minutes = elapsedMinutes(order, now); const overdue = minutes >= OVERDUE_MINUTES && ['received', 'preparing'].includes(order.status); return <article className={`kitchen-queue-card${overdue ? ' overdue' : ''}`} key={order.id}>
        <button className="kitchen-open-ticket" type="button" onClick={() => void openTicket(order.id)} aria-label={`Open ticket ${order.order_number}`}><span><strong>{order.order_number}</strong><small>{order.customer_name}</small></span><span className="kitchen-age">{minutes} min</span><span className="kitchen-status">{displayStatus(order.status)}</span><span>{money(order.total_kurus, 'en')}</span></button>
        {next[order.status] && <button className="button orange" disabled={updatingId === order.id} onClick={() => void advance(order)}>{updatingId === order.id ? 'Saving…' : `Mark ${displayStatus(next[order.status])}`}</button>}
      </article>; })}
    </div>
    <aside className="kitchen-ticket" aria-live="polite">
      {detailLoading && <p>Loading ticket…</p>}
      {!detailLoading && !detail && <div className="empty-state">Select an order to open its kitchen ticket.</div>}
      {!detailLoading && detail && <><header><div><span className="eyebrow">Paid kitchen ticket</span><h2>{detail.order_number}</h2></div><strong className="kitchen-ticket-age">{elapsedMinutes(detail, now)} min</strong></header>
        <div className="kitchen-ticket-meta"><strong>{displayStatus(detail.status)}</strong><span>Paid {detail.paid_at ? new Date(detail.paid_at).toLocaleTimeString('en', {hour: '2-digit', minute: '2-digit'}) : 'time unavailable'}</span></div>
        <div className="kitchen-items">{detail.items.map((item) => <div className="kitchen-item" key={item.id}><strong><span>{item.quantity}×</span> {item.item_name}</strong>{item.selected_modifiers.map((modifier) => <p key={modifier.id}>{modifier.name_en}: {modifierOptionCounts(modifier)}</p>)}</div>)}</div>
        <section className="kitchen-customer"><h3>Delivery</h3><strong>{detail.customer_name}</strong><a href={`tel:${detail.customer_phone}`}>{detail.customer_phone}</a><a href={`mailto:${detail.customer_email}`}>{detail.customer_email}</a><p>{detail.delivery_address}</p><small>{detail.delivery_zone_name}</small>{detail.delivery_instructions && <div className="kitchen-instructions"><strong>Instructions</strong><p>{detail.delivery_instructions}</p></div>}</section>
        <div className="kitchen-totals"><span>Total</span><strong>{money(detail.total_kurus, 'en')}</strong></div>
        <dl className="kitchen-reference"><dt>Payment reference</dt><dd>{detail.payment_reference ?? 'Not supplied'}</dd><dt>Ordered</dt><dd>{new Date(detail.created_at).toLocaleString('en')}</dd></dl>
        {next[detail.status] && <button className="button orange kitchen-primary-action" disabled={updatingId === detail.id} onClick={() => void advance(detail)}>{updatingId === detail.id ? 'Saving…' : `Mark ${displayStatus(next[detail.status])}`}</button>}
      </>}
    </aside></div>
  </section>;
}
