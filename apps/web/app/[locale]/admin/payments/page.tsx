'use client';

import {FormEvent, useCallback, useEffect, useState} from 'react';
import {adminRequest} from '@/lib/admin-api';
import {useAppAuth} from '@/lib/auth';

type Route = {
  id: string; code: string; name_en: string; name_tr: string;
  route_type: 'local_transfer' | 'assisted'; currency: string | null;
  account_holder: string; bank_name: string; account_label: string;
  account_identifier: string; contact_url: string; customer_rate: string | null;
  rounding_increment_minor: number; quote_minutes: number; rate_valid_until: string | null;
  is_enabled: boolean; sort_order: number;
};

function localDate(value: string | null) {
  if (!value) return '';
  const date = new Date(value); date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export default function PaymentsPage() {
  const {getToken} = useAppAuth(); const [routes, setRoutes] = useState<Route[]>([]);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [saving, setSaving] = useState('');
  const load = useCallback(async () => {
    try {setRoutes(await adminRequest<Route[]>('/payment-routes', await getToken())); setError('');}
    catch (reason) {setError(reason instanceof Error ? reason.message : 'Could not load payment routes.');}
  }, [getToken]);
  useEffect(() => {void load();}, [load]);

  function update(id: string, values: Partial<Route>) {
    setRoutes((current) => current.map((route) => route.id === id ? {...route, ...values} : route));
  }
  async function save(event: FormEvent<HTMLFormElement>, route: Route) {
    event.preventDefault(); setSaving(route.id); setError(''); setMessage('');
    try {
      await adminRequest(`/payment-routes/${route.id}`, await getToken(), {method: 'PUT', body: JSON.stringify({
        ...route, currency: route.route_type === 'assisted' ? null : route.currency,
        customer_rate: route.currency === 'TRY' || route.route_type === 'assisted' ? null : route.customer_rate,
        rate_valid_until: route.currency === 'TRY' || route.route_type === 'assisted' ? null : route.rate_valid_until,
      })});
      setMessage(`${route.name_en} saved.`); await load();
    } catch (reason) {setError(reason instanceof Error ? reason.message : 'Could not save this payment route.');}
    finally {setSaving('');}
  }
  async function addInternational() {
    setSaving('new'); setError('');
    try {
      await adminRequest('/payment-routes', await getToken(), {method: 'POST', body: JSON.stringify({
        code: `international-${Date.now()}`, name_en: 'International wire assistance',
        name_tr: 'Uluslararası havale desteği', route_type: 'assisted', currency: null,
        account_holder: '', bank_name: '', account_label: 'Account', account_identifier: '',
        contact_url: 'mailto:support@example.com', customer_rate: null, rounding_increment_minor: 1,
        quote_minutes: 20, rate_valid_until: null, is_enabled: false, sort_order: 30,
      })}); await load();
    } catch (reason) {setError(reason instanceof Error ? reason.message : 'Could not add the assisted route.');}
    finally {setSaving('');}
  }

  return <section><div className="section-header"><div><div className="eyebrow">Checkout settings</div><h2>Payments</h2><p className="admin-help">Customers see only enabled, complete routes. Existing orders retain the account and rate originally quoted.</p></div><button className="button" disabled={saving === 'new'} onClick={() => void addInternational()}>Add international contact</button></div>
    {error && <div className="error" role="alert">{error}</div>}{message && <p className="success" role="status">{message}</p>}
    <div className="payment-settings-list">{routes.map((route) => <form className="form-card" key={route.id} onSubmit={(event) => void save(event, route)}>
      <div className="section-header"><div><h2>{route.name_en}</h2><small>{route.route_type === 'assisted' ? 'Contact-assisted; does not create an order' : `${route.currency} local transfer`}</small></div><label className="store-checkbox"><input type="checkbox" checked={route.is_enabled} onChange={(event) => update(route.id, {is_enabled: event.target.checked})}/> Enabled</label></div>
      <div className="field-grid"><label className="field"><span>English name</span><input value={route.name_en} onChange={(event) => update(route.id, {name_en: event.target.value})}/></label><label className="field"><span>Turkish name</span><input value={route.name_tr} onChange={(event) => update(route.id, {name_tr: event.target.value})}/></label></div>
      {route.route_type === 'assisted' ? <label className="field"><span>WhatsApp or email URL</span><input type="url" value={route.contact_url} onChange={(event) => update(route.id, {contact_url: event.target.value})} required/></label>
        : <><div className="field-grid"><label className="field"><span>Currency</span><input value={route.currency ?? ''} maxLength={3} onChange={(event) => update(route.id, {currency: event.target.value.toUpperCase()})}/></label><label className="field"><span>Bank name</span><input value={route.bank_name} onChange={(event) => update(route.id, {bank_name: event.target.value})}/></label><label className="field"><span>Account holder</span><input value={route.account_holder} onChange={(event) => update(route.id, {account_holder: event.target.value})} required/></label><label className="field"><span>Account field label</span><input value={route.account_label} onChange={(event) => update(route.id, {account_label: event.target.value})}/></label></div>
          <label className="field"><span>IBAN or account number</span><input value={route.account_identifier} onChange={(event) => update(route.id, {account_identifier: event.target.value})} required/></label>
          {route.currency !== 'TRY' && <div className="field-grid"><label className="field"><span>Customer rate ({route.currency || 'currency'} per TRY)</span><input type="number" min="0.00000001" step="0.00000001" value={route.customer_rate ?? ''} onChange={(event) => update(route.id, {customer_rate: event.target.value, rate_valid_until: route.rate_valid_until ?? new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()})} required/></label><label className="field"><span>Rate valid until</span><input type="datetime-local" value={localDate(route.rate_valid_until)} onChange={(event) => update(route.id, {rate_valid_until: event.target.value ? new Date(event.target.value).toISOString() : null})} required/></label><label className="field"><span>Round upward (minor units; 100 = 1.00)</span><input type="number" min={1} value={route.rounding_increment_minor} onChange={(event) => update(route.id, {rounding_increment_minor: Number(event.target.value)})}/></label><label className="field"><span>Quote lifetime (minutes)</span><input type="number" min={5} max={120} value={route.quote_minutes} onChange={(event) => update(route.id, {quote_minutes: Number(event.target.value)})}/></label></div>}</>}
      <button className="button" disabled={saving === route.id}>{saving === route.id ? 'Saving…' : 'Save payment route'}</button>
    </form>)}</div>
  </section>;
}
