'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import {useParams, useSearchParams} from 'next/navigation';
import {FormEvent, useEffect, useState} from 'react';
import {useTranslations} from 'next-intl';
import {API_URL} from '@/lib/api';
import {linePrice, useCart} from '@/lib/cart';
import {currencyMoney, money} from '@/lib/money';
import {useAppAuth} from '@/lib/auth';
import {normalizeTurkishMobile} from '@/lib/phone';
import type {SavedAddress, ZoneCheck} from '@/lib/types';
import type {BankTransferInstructions, PaymentQuote, PaymentRoute} from '@/lib/types';
import {BankTransferPayment} from '@/components/bank-transfer-payment';

const AddressMap = dynamic(() => import('@/components/address-map'), {ssr: false});
type SearchResult = {display_name: string; latitude: number; longitude: number};
type CheckoutResult = {order_id: string; tracking_token: string; order_number: string; total_kurus: number;
  payment_method: 'bank_transfer'; bank_transfer: BankTransferInstructions};
type CapacityStatus = {available: boolean};
type Draft = {name: string; phone: string; email: string; address: string; instructions: string; label: string; position: [number, number]};
const emptyDraft: Draft = {name: '', phone: '', email: '', address: '', instructions: '', label: 'Home', position: [41.035, 28.99]};

export default function CheckoutPage() {
  const {locale} = useParams<{locale: string}>(); const params = useSearchParams(); const t = useTranslations('checkout');
  const tp = useTranslations('paymentFlow');
  const {getToken, isSignedIn, user} = useAppAuth(); const {lines, clear: clearCart} = useCart();
  const [draft, setDraft] = useState<Draft>(emptyDraft); const [draftLoaded, setDraftLoaded] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]); const [searching, setSearching] = useState(false);
  const [error, setError] = useState(''); const [submitting, setSubmitting] = useState(false);
  const [payment, setPayment] = useState<CheckoutResult | null>(null); const [zone, setZone] = useState<ZoneCheck | null>(null);
  const [checkingZone, setCheckingZone] = useState(false); const [capacity, setCapacity] = useState<CapacityStatus | null>(null);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]); const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [editingAddress, setEditingAddress] = useState<string | null>(null); const [saveNewAddress, setSaveNewAddress] = useState(false);
  const [consent, setConsent] = useState(false); const paymentFailed = params.get('payment') === 'failed';
  const [routes, setRoutes] = useState<PaymentRoute[]>([]); const [routeId, setRouteId] = useState('');
  const [quote, setQuote] = useState<PaymentQuote | null>(null); const [quoting, setQuoting] = useState(false);
  const subtotal = lines.reduce((sum, line) => sum + linePrice(line), 0);
  const total = subtotal + (zone?.deliverable ? zone.delivery_fee_kurus ?? 0 : 0);
  const updateDraft = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({...current, [key]: value}));

  useEffect(() => {
    try { const saved = localStorage.getItem('allensnothern-checkout-draft'); if (saved) setDraft({...emptyDraft, ...JSON.parse(saved)}); }
    catch { localStorage.removeItem('allensnothern-checkout-draft'); }
    finally { setDraftLoaded(true); }
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/payment-routes?locale=${locale}`).then(async (response) => {
      if (!response.ok) throw new Error(); const available: PaymentRoute[] = await response.json();
      setRoutes(available);
      const firstLocal = available.find((route) => route.route_type === 'local_transfer');
      if (firstLocal) setRouteId(firstLocal.id);
    }).catch(() => setRoutes([]));
  }, [locale]);

  useEffect(() => {
    const route = routes.find((item) => item.id === routeId);
    if (!route || route.route_type !== 'local_transfer' || !zone?.deliverable || !lines.length) {
      setQuote(null); return;
    }
    const controller = new AbortController(); const timer = window.setTimeout(() => {
      setQuoting(true); setQuote(null);
      fetch(`${API_URL}/checkout/quote`, {method: 'POST', headers: {'Content-Type': 'application/json'},
        signal: controller.signal, body: JSON.stringify({payment_route_id: route.id,
          address: {full_address: draft.address || 'Delivery address', instructions: draft.instructions,
            latitude: draft.position[0], longitude: draft.position[1]},
          items: lines.map((line) => ({menu_item_id: line.item.id, quantity: line.quantity,
            modifiers: line.selections}))})})
        .then(async (response) => {const body = await response.json(); if (!response.ok) throw new Error(body.detail); setQuote(body);})
        .catch((reason) => {if (reason instanceof Error && reason.name !== 'AbortError') setError(reason.message || tp('quoteFailed'));})
        .finally(() => {if (!controller.signal.aborted) setQuoting(false);});
    }, 350);
    return () => {window.clearTimeout(timer); controller.abort();};
  }, [draft.address, draft.instructions, draft.position, lines, routeId, routes, tp, zone?.deliverable]);
  useEffect(() => { if (draftLoaded) localStorage.setItem('allensnothern-checkout-draft', JSON.stringify(draft)); }, [draft, draftLoaded]);

  useEffect(() => {
    if (!isSignedIn || !draftLoaded) return;
    void getToken().then(async (token) => {
      const headers = {Authorization: `Bearer ${token}`};
      const [profileResponse, addressResponse] = await Promise.all([
        fetch(`${API_URL}/profile`, {headers}), fetch(`${API_URL}/addresses`, {headers})]);
      const profile = profileResponse.ok ? await profileResponse.json() : {};
      setDraft((current) => ({...current,
        name: current.name || profile.full_name || user?.user_metadata.full_name || user?.user_metadata.username || '',
        email: current.email || profile.email || user?.email || '', phone: current.phone || profile.phone || ''}));
      if (addressResponse.ok) setAddresses(await addressResponse.json());
    });
  }, [draftLoaded, getToken, isSignedIn, user]);

  useEffect(() => {
    const controller = new AbortController(); setCheckingZone(true);
    fetch(`${API_URL}/delivery-zones/check`, {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({latitude: draft.position[0], longitude: draft.position[1]}), signal: controller.signal})
      .then(async (response) => { if (!response.ok) throw new Error(); setZone(await response.json()); })
      .catch((reason) => { if (reason instanceof Error && reason.name !== 'AbortError') setZone(null); })
      .finally(() => { if (!controller.signal.aborted) setCheckingZone(false); });
    return () => controller.abort();
  }, [draft.position]);

  useEffect(() => {
    let active = true; const check = () => fetch(`${API_URL}/order-capacity`).then((response) => response.ok ? response.json() : Promise.reject())
      .then((value) => {if (active) setCapacity(value);}).catch(() => {if (active) setCapacity(null);});
    void check(); const timer = window.setInterval(check, 30_000); return () => {active = false; window.clearInterval(timer);};
  }, []);

  async function searchAddress() {
    if (draft.address.trim().length < 3) return; setSearching(true); setError('');
    try { const response = await fetch(`${API_URL}/geocoding/search?q=${encodeURIComponent(draft.address)}`); const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? t('searchFailed')); setResults(body); if (!body.length) setError(t('noAddresses')); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t('searchFailed')); } finally { setSearching(false); }
  }

  function selectSavedAddress(address: SavedAddress, edit = false) {
    setDraft((current) => ({...current, address: address.full_address, instructions: address.instructions,
      label: address.label, position: [address.latitude, address.longitude]}));
    setSelectedAddress(address.id); setEditingAddress(edit ? address.id : null); setResults([]);
  }

  async function deleteAddress(address: SavedAddress) {
    if (!window.confirm(t('deleteAddressConfirm', {label: address.label}))) return;
    const token = await getToken(); const response = await fetch(`${API_URL}/addresses/${address.id}`,
      {method: 'DELETE', headers: {Authorization: `Bearer ${token}`}});
    if (!response.ok) { setError(t('addressDeleteFailed')); return; }
    setAddresses((current) => current.filter((item) => item.id !== address.id));
    if (selectedAddress === address.id) { setSelectedAddress(null); setEditingAddress(null); }
  }

  async function saveAddressChanges() {
    if (!editingAddress || !zone?.deliverable) return; const token = await getToken();
    const response = await fetch(`${API_URL}/addresses/${editingAddress}`, {method: 'PUT',
      headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`}, body: JSON.stringify({
        label: draft.label, full_address: draft.address, instructions: draft.instructions,
        latitude: draft.position[0], longitude: draft.position[1]})});
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.detail ?? t('addressSaveFailed')); return; }
    setAddresses((current) => current.map((item) => item.id === body.id ? body : item)); setEditingAddress(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const phone = normalizeTurkishMobile(draft.phone); if (!phone) {setError(tp('invalidPhone')); return;}
    if (!consent) {setError(t('consentRequired')); return;}
    const selectedRoute = routes.find((item) => item.id === routeId);
    if (!selectedRoute || selectedRoute.route_type !== 'local_transfer' || !quote) {setError(tp('choosePayment')); return;}
    setSubmitting(true);
    try {
      const zoneResponse = await fetch(`${API_URL}/delivery-zones/check`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({latitude: draft.position[0], longitude: draft.position[1]})});
      const confirmedZone: ZoneCheck = await zoneResponse.json(); if (!confirmedZone.deliverable) throw new Error(t('outside'));
      const authToken = await getToken(); const response = await fetch(`${API_URL}/checkout`, {method: 'POST', headers: {'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), ...(authToken ? {Authorization: `Bearer ${authToken}`} : {})}, body: JSON.stringify({
        locale, customer: {full_name: draft.name, email: draft.email, phone}, address: {full_address: draft.address,
          instructions: draft.instructions, latitude: draft.position[0], longitude: draft.position[1]},
        save_address: Boolean(authToken && saveNewAddress && !selectedAddress), address_label: draft.label || t('homeLabel'),
        payment_route_id: selectedRoute.id, payment_quote_id: quote.id,
        terms_accepted: consent, legal_version: 'prelaunch-v1', items: lines.map((line) => ({menu_item_id: line.item.id,
          quantity: line.quantity, modifiers: line.selections}))})});
      const body = await response.json(); if (!response.ok) throw new Error(typeof body.detail === 'object' ? body.detail.message : body.detail ?? t('checkoutFailed'));
      localStorage.setItem(`order-token:${body.order_id}`, body.tracking_token);
      setPayment(body);
      clearCart();
      localStorage.removeItem('allensnothern-checkout-draft');
    } catch (reason) {setError(reason instanceof Error ? reason.message : t('checkoutFailed'));}
    finally {setSubmitting(false);}
  }

  if (payment) return <div className="store-page store-payment"><h1>{payment.order_number}</h1><p>{t('awaitingPayment')}</p>
    <BankTransferPayment token={payment.tracking_token} locale={locale}
      instructions={payment.bank_transfer}/><p>{t('cartHeld')}</p>
    <Link className="store-button secondary" href={`/${locale}/orders/${payment.tracking_token}`}>{t('viewStatus')}</Link></div>;
  if (!lines.length) return <div className="store-page"><div className="store-empty"><p>{t('empty')}</p><Link className="store-button secondary" href={`/${locale}/menu`}>{t('menu')}</Link></div></div>;
  return <div className="store-page store-checkout-page"><header className="store-page-heading"><h1>{t('title')}</h1></header>
    {paymentFailed && <div className="checkout-recovery" role="alert"><strong>{t('paymentFailed')}</strong><p>{t('paymentFailedHelp')}</p><a href="#checkout-form">{t('retryPayment')}</a><a href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'support@example.com'}`}>{t('contactSupport')}</a></div>}
    {isSignedIn && !!addresses.length && <section className="saved-address-picker"><h2>{t('savedAddresses')}</h2><div>{addresses.map((address) => <article className={selectedAddress === address.id ? 'selected' : ''} key={address.id}><strong>{address.label}</strong><span>{address.full_address}</span><div><button type="button" onClick={() => selectSavedAddress(address)}>{t('useAddress')}</button><button type="button" onClick={() => selectSavedAddress(address, true)}>{t('editAddress')}</button><button type="button" onClick={() => void deleteAddress(address)}>{t('deleteAddress')}</button></div></article>)}</div></section>}
    <form id="checkout-form" className="store-checkout-grid" onSubmit={submit}><div>
      <section className="store-form-section"><h2>{t('contact')}</h2><div className="store-field-grid"><label className="store-field"><span>{t('fullName')}</span><input value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} required minLength={2}/></label>
        <label className="store-field"><span>{t('phone')}</span><input value={draft.phone} onChange={(event) => updateDraft('phone', event.target.value)} required type="tel" inputMode="tel" placeholder="+90 555 111 22 33"/></label></div>
        <label className="store-field"><span>{t('email')}</span><input value={draft.email} onChange={(event) => updateDraft('email', event.target.value)} required type="email"/></label></section>
      <section className="store-form-section"><h2>{t('address')}</h2><div className="store-search-row"><input value={draft.address} onChange={(event) => updateDraft('address', event.target.value)} placeholder={t('search')}/><button className="store-button secondary" type="button" onClick={searchAddress} disabled={searching}>{searching ? t('searching') : t('search')}</button></div>
        {!!results.length && <div className="store-search-results">{results.map((result) => <button type="button" key={`${result.latitude}-${result.longitude}`} onClick={() => {setDraft((current) => ({...current, address: result.display_name, position: [result.latitude,result.longitude]}));setResults([]);setSelectedAddress(null);}}>{result.display_name}</button>)}</div>}
        <AddressMap position={draft.position} onChange={(position) => {updateDraft('position', position); setSelectedAddress(null);}}/><div className={`store-zone-result ${zone?.deliverable ? 'valid' : zone ? 'invalid' : ''}`}>{checkingZone ? t('checkingZone') : zone?.deliverable ? t('deliversTo', {zone: zone.zone_name ?? ''}) : zone ? t('outside') : t('zoneUnavailable')}</div>
        <label className="store-field"><span>{t('fullAddress')}</span><textarea required minLength={5} value={draft.address} onChange={(event) => updateDraft('address', event.target.value)}/></label>
        <label className="store-field"><span>{t('instructions')}</span><textarea value={draft.instructions} onChange={(event) => updateDraft('instructions', event.target.value)}/></label>
        <label className="store-field"><span>{t('addressLabel')}</span><input value={draft.label} onChange={(event) => updateDraft('label', event.target.value)}/></label>
        {editingAddress ? <button className="store-button secondary" type="button" onClick={() => void saveAddressChanges()}>{t('saveAddressChanges')}</button>
          : isSignedIn && !selectedAddress && <label className="store-checkbox"><input type="checkbox" checked={saveNewAddress} onChange={(event) => setSaveNewAddress(event.target.checked)}/> {t('saveAddress')}</label>}</section></div>
      <aside className="store-summary"><div className="store-summary-row"><span>{t('subtotal')}</span><strong>{money(subtotal, locale)}</strong></div><div className="store-summary-row"><span>{t('deliveryFee')}</span><strong>{zone?.deliverable ? money(zone.delivery_fee_kurus ?? 0, locale) : '—'}</strong></div><div className="store-summary-row total"><span>{t('total')}</span><strong>{zone?.deliverable ? money(total, locale) : '—'}</strong></div>
        <fieldset className="payment-route-picker"><legend>{tp('paymentCurrency')}</legend>
          {routes.map((route) => route.route_type === 'local_transfer' ? <label key={route.id} className={routeId === route.id ? 'selected' : ''}><input type="radio" name="payment_route" value={route.id} checked={routeId === route.id} onChange={() => setRouteId(route.id)}/><span><strong>{route.name}</strong>{route.currency && <small>{route.currency}</small>}</span></label>
            : <a key={route.id} href={route.contact_url} target="_blank" rel="noreferrer"><strong>{route.name}</strong><small>{tp('internationalHelp')}</small></a>)}
        </fieldset>
        {quoting && <p className="quote-status">{tp('quoting')}</p>}
        {quote && <div className="payment-quote"><span>{tp('exactTransfer')}</span><strong>{currencyMoney(quote.settlement_amount_minor, quote.settlement_currency, locale)}</strong>{quote.settlement_currency !== 'TRY' && <small>{tp('rate', {rate: quote.customer_rate})}</small>}<small>{tp('quoteUntil', {time: new Intl.DateTimeFormat(locale, {timeStyle: 'short'}).format(new Date(quote.expires_at))})}</small></div>}
        <label className="store-checkbox checkout-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required/> {t('consent')}</label>
        {capacity && !capacity.available && <p className="store-error" role="alert">{t('capacityFull')}</p>}{error && <p className="store-error" role="alert">{error}</p>}<button className="store-button primary" disabled={submitting || quoting || !quote || checkingZone || !zone?.deliverable || capacity?.available === false} type="submit">{submitting ? '…' : t('pay')}</button></aside>
    </form></div>;
}
