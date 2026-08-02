'use client';

import {FormEvent, useCallback, useEffect, useState} from 'react';
import {adminRequest} from '@/lib/admin-api';
import {useAppAuth} from '@/lib/auth';

type NotificationSettings = {admin_email: string; uses_environment_fallback: boolean};

export default function NotificationSettingsPage() {
  const {getToken} = useAppAuth();
  const [email, setEmail] = useState('');
  const [fallback, setFallback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const value = await adminRequest<NotificationSettings>('/notification-settings', await getToken());
      setEmail(value.admin_email); setFallback(value.uses_environment_fallback); setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load notification settings.');
    } finally {setLoading(false);}
  }, [getToken]);

  useEffect(() => {void load();}, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      const value = await adminRequest<NotificationSettings>('/notification-settings', await getToken(), {
        method: 'PUT', body: JSON.stringify({admin_email: email})
      });
      setEmail(value.admin_email); setFallback(false);
      setMessage('Order notification recipient updated. New alerts will use this address immediately.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save the notification email.');
    } finally {setSaving(false);}
  }

  return <section>
    <div className="section-header"><div><h2>Email notifications</h2><p>Choose who receives transfer and new paid-order alerts.</p></div></div>
    {error && <div className="error" role="alert">{error}</div>}
    {message && <div className="success" role="status">{message}</div>}
    <form className="form-card admin-notification-settings" onSubmit={save}>
      <h2>Order recipient</h2>
      <p>This address receives customer transfer reports and complete paid-order details for the kitchen.</p>
      <label className="field"><span>Recipient email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required disabled={loading}/></label>
      {fallback && <small>The current address comes from the server environment. Saving here moves control to the dashboard.</small>}
      <button className="button orange" type="submit" disabled={loading || saving}>{saving ? 'Saving…' : 'Save recipient'}</button>
    </form>
  </section>;
}
