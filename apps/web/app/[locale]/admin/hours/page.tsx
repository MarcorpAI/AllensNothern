'use client';

import {useAppAuth} from '@/lib/auth';
import {FormEvent, useCallback, useEffect, useState} from 'react';
import {adminRequest} from '@/lib/admin-api';

type Interval = {id: string; weekday: number; opens_at: string; closes_at: string};
type Hours = {intervals: Interval[]; closures: {id: string; closure_date: string; reason: string}[]; is_temporarily_closed: boolean; timezone: string};
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function HoursPage() {
  const {getToken} = useAppAuth();
  const [data, setData] = useState<Hours | null>(null);
  const [intervals, setIntervals] = useState<Interval[]>([]);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { const next = await adminRequest<Hours>('/hours', await getToken()); setData(next); setIntervals(next.intervals); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load opening hours.'); }
  }, [getToken]);
  useEffect(() => { void load(); }, [load]);

  function addInterval(weekday: number) {
    setIntervals((current) => [...current, {id: crypto.randomUUID(), weekday, opens_at: '09:00', closes_at: '17:00'}]);
  }
  function updateInterval(id: string, field: 'opens_at' | 'closes_at', value: string) {
    setIntervals((current) => current.map((item) => item.id === id ? {...item, [field]: value} : item));
  }
  async function saveHours() {
    setSaving(true); setError(''); setMessage('');
    try { await adminRequest('/hours', await getToken(), {method: 'PUT', body: JSON.stringify({intervals: intervals.map(({weekday, opens_at, closes_at}) => ({weekday, opens_at, closes_at}))})});
      setMessage('Opening times saved.'); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save opening hours.'); }
    finally { setSaving(false); }
  }
  async function toggle() {
    setSaving(true); setError('');
    try { await adminRequest(`/temporary-closure?closed=${!data?.is_temporarily_closed}`, await getToken(), {method: 'PATCH'}); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update the restaurant status.'); }
    finally { setSaving(false); }
  }
  async function addClosure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); setSaving(true);
    try { await adminRequest('/closures', await getToken(), {method: 'POST', body: JSON.stringify({closure_date: values.get('date'), reason: values.get('reason')})}); form.reset(); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not add this closure.'); }
    finally { setSaving(false); }
  }
  async function removeClosure(id: string) {
    try { await adminRequest(`/closures/${id}`, await getToken(), {method: 'DELETE'}); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete this closure.'); }
  }

  return <section><div className="section-header"><div><h2>Opening times</h2><p className="admin-help">Customers see these times in Istanbul time. They can still place an order while you are shown as closed; use Order limits when you need to stop taking more orders.</p></div>
    <button className={data?.is_temporarily_closed ? 'button orange' : 'button'} disabled={saving || !data} onClick={() => void toggle()}>{data?.is_temporarily_closed ? 'Show as open' : 'Show as temporarily closed'}</button></div>
    {error && <div className="error" role="alert">{error}</div>}{message && <p className="success" role="status">{message}</p>}
    <div className="form-card"><div className="section-header"><h2>Weekly schedule</h2><button className="button" disabled={saving} onClick={() => void saveHours()}>{saving ? 'Saving…' : 'Save weekly hours'}</button></div>
      <div className="hours-editor">{days.map((day, weekday) => { const dayIntervals = intervals.filter((item) => item.weekday === weekday); return <div className="hours-day" key={day}>
        <div><strong>{day}</strong><small>{dayIntervals.length ? `${dayIntervals.length} opening period${dayIntervals.length === 1 ? '' : 's'}` : 'Closed'}</small></div>
        <div className="hours-intervals">{dayIntervals.map((interval) => <div className="hours-interval" key={interval.id}>
          <label><span>Open</span><input aria-label={`${day} opening time`} type="time" value={interval.opens_at.slice(0, 5)} onChange={(event) => updateInterval(interval.id, 'opens_at', event.target.value)}/></label>
          <label><span>Close</span><input aria-label={`${day} closing time`} type="time" value={interval.closes_at.slice(0, 5)} onChange={(event) => updateInterval(interval.id, 'closes_at', event.target.value)}/></label>
          <button className="pill danger" type="button" onClick={() => setIntervals((current) => current.filter((item) => item.id !== interval.id))}>Remove</button></div>)}
          <button className="pill" type="button" onClick={() => addInterval(weekday)}>Add opening period</button></div>
      </div>; })}</div></div>
    <form className="form-card" onSubmit={addClosure}><h2>Add a closed date</h2><div className="field-grid"><label className="field"><span>Date</span><input name="date" type="date" required/></label><label className="field"><span>Reason shown to staff</span><input name="reason" maxLength={250}/></label></div><button className="button" disabled={saving}>{saving ? 'Saving…' : 'Add closed date'}</button></form>
    <div className="admin-list">{data?.closures.map((closure) => <div className="admin-record" key={closure.id}><div><strong>{closure.closure_date}</strong><p>{closure.reason || 'No reason entered'}</p></div><button className="pill danger" onClick={() => void removeClosure(closure.id)}>Delete closure</button></div>)}</div>
  </section>;
}
