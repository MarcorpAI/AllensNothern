'use client';

import {useEffect, useState} from 'react';
import {useTranslations} from 'next-intl';
import {trackOrder} from '@/lib/api';
import {money} from '@/lib/money';
import type {Order} from '@/lib/types';
import {BankTransferPayment} from '@/components/bank-transfer-payment';
import {useCart} from '@/lib/cart';

const states = ['received', 'preparing', 'out_for_delivery', 'delivered'];

export function OrderTracker({token, locale, initial}: {token: string; locale: string; initial: Order}) {
  const t = useTranslations('tracking'); const [order, setOrder] = useState(initial);
  const clearCart = useCart((state) => state.clear);
  const [connection, setConnection] = useState(t('updated'));
  useEffect(() => {
    if (order.payment_status !== 'paid') return;
    clearCart(); window.localStorage.removeItem('allensnothern-checkout-draft');
  }, [clearCart, order.payment_status]);
  useEffect(() => {
    if (order.status === 'delivered') return; let active = true; let timer = 0; let delay = 10_000;
    const poll = async () => { try { const next = await trackOrder(token); if (!active) return; setOrder(next); setConnection(t('updated')); delay = 10_000;
        if (next.status !== 'delivered') timer = window.setTimeout(poll, delay);
      } catch { if (!active) return; setConnection(t('retrying')); delay = Math.min(delay * 2, 60_000); timer = window.setTimeout(poll, delay); }};
    timer = window.setTimeout(poll, delay); return () => {active = false; window.clearTimeout(timer);};
  }, [order.status, t, token]);
  const current = states.indexOf(order.status);
  return <><div className="eyebrow">{order.order_number}</div><h1>{t(`status.${order.status}`)}</h1><p className="tracking-poll-state">{connection}</p>
    {order.payment_method === 'bank_transfer' && order.payment_status === 'pending' && order.bank_transfer &&
      <BankTransferPayment token={token} locale={locale} instructions={order.bank_transfer}
        notifiedAt={order.transfer_notified_at}
        onUpdated={(value) => setOrder((currentOrder) => ({...currentOrder,
          transfer_notified_at: value.transfer_notified_at, payment_expires_at: value.payment_expires_at,
          bank_transfer: currentOrder.bank_transfer ? {...currentOrder.bank_transfer, expires_at: value.payment_expires_at} : null}))}/>} 
    {order.payment_method === 'bank_transfer' && order.payment_status === 'failed' &&
      <div className="checkout-recovery" role="alert"><strong>{t('expired')}</strong><p>{t('expiredHelp')}</p></div>}
    <div className="status-track">{states.map((state, index) => {const history = order.status_history?.find((entry) => entry.status === state); return <div className={index <= current ? 'status-step done' : 'status-step'} key={state}><strong>{t(`status.${state}`)}</strong>{history && <time>{new Intl.DateTimeFormat(locale, {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(history.changed_at))}</time>}</div>;})}</div>
    <div className="form-card"><p><strong>{order.customer_name}</strong></p><p>{order.delivery_address}</p><p className="price">{money(order.total_kurus, locale)}</p></div></>;
}
