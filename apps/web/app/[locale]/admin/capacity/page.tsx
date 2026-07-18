'use client';

import {FormEvent, useCallback, useEffect, useState} from 'react';
import {useAppAuth} from '@/lib/auth';
import {adminRequest} from '@/lib/admin-api';

type Rule = {id: string; name: string; weekday: number | null; target_date: string | null; starts_at: string | null; ends_at: string | null; max_orders: number; is_active: boolean};
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function rulePeriod(rule: Rule) {
  return rule.starts_at ? `${rule.starts_at.slice(0, 5)} to ${rule.ends_at?.slice(0, 5)}` : 'the whole day';
}

export default function CapacityPage() {
  const {getToken} = useAppAuth();
  const [rules, setRules] = useState<Rule[]>([]);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [scope, setScope] = useState<'everyday' | 'weekday' | 'date'>('everyday');
  const [timed, setTimed] = useState(false);
  const [weekday, setWeekday] = useState(5);
  const [targetDate, setTargetDate] = useState('');
  const [startsAt, setStartsAt] = useState('17:00');
  const [endsAt, setEndsAt] = useState('20:00');
  const [maxOrders, setMaxOrders] = useState(10);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setRules(await adminRequest('/capacity-rules', await getToken())); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load order limits.'); }
  }, [getToken]);
  useEffect(() => { void load(); }, [load]);

  function resetEditor() {
    setEditing(null); setScope('everyday'); setTimed(false); setWeekday(5); setTargetDate('');
    setStartsAt('17:00'); setEndsAt('20:00'); setMaxOrders(10);
  }

  function beginEdit(rule: Rule) {
    setEditing(rule); setScope(rule.target_date ? 'date' : rule.weekday !== null ? 'weekday' : 'everyday'); setTimed(Boolean(rule.starts_at));
    setWeekday(rule.weekday ?? 5); setTargetDate(rule.target_date ?? ''); setStartsAt(rule.starts_at?.slice(0, 5) ?? '17:00');
    setEndsAt(rule.ends_at?.slice(0, 5) ?? '20:00'); setMaxOrders(rule.max_orders); setError(''); setMessage('');
    window.scrollTo({top: document.body.scrollHeight, behavior: 'smooth'});
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    const dayLabel = scope === 'everyday' ? 'Every day' : scope === 'weekday' ? `Every ${days[weekday]}` : targetDate;
    const periodLabel = timed ? `${startsAt}–${endsAt}` : 'all day';
    const payload = {name: `${dayLabel} · ${periodLabel}`, weekday: scope === 'weekday' ? weekday : null,
      target_date: scope === 'date' ? targetDate : null, starts_at: timed ? startsAt : null,
      ends_at: timed ? endsAt : null, max_orders: maxOrders, is_active: editing?.is_active ?? true};
    try {
      await adminRequest(editing ? `/capacity-rules/${editing.id}` : '/capacity-rules', await getToken(),
        {method: editing ? 'PUT' : 'POST', body: JSON.stringify(payload)});
      setMessage(editing ? 'Order limit updated.' : 'Order limit saved.'); resetEditor(); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this order limit.'); }
    finally { setSaving(false); }
  }

  async function toggle(rule: Rule) {
    setError(''); setMessage('');
    try {
      await adminRequest(`/capacity-rules/${rule.id}`, await getToken(), {method: 'PUT', body: JSON.stringify({...rule, is_active: !rule.is_active})});
      setMessage(rule.is_active ? 'Order limit paused.' : 'Order limit switched on.'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update this order limit.'); }
  }

  async function remove(rule: Rule) {
    if (!window.confirm('Delete this order limit?')) return;
    setError(''); setMessage('');
    try { await adminRequest(`/capacity-rules/${rule.id}`, await getToken(), {method: 'DELETE'}); setMessage('Order limit deleted.'); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete this order limit.'); }
  }

  const selectedDay = scope === 'everyday' ? 'every day' : scope === 'weekday' ? `every ${days[weekday]}` : targetDate ? `on ${targetDate}` : 'on the selected date';
  const selectedPeriod = timed ? `between ${startsAt} and ${endsAt}` : 'during the whole day';

  return <section>
    <div className="section-header"><div><div className="eyebrow">Keep the workload manageable</div><h2>Order limits</h2></div></div>
    <div className="admin-explainer"><strong>Set as many daily windows as you need</strong><p>For example, add “Every day, 10:00–16:00, 5 orders”, then add another limit for “Every day, 16:00–21:00”. Each window keeps its own count and limit.</p><p>When a window fills, checkout stops until the next window begins. Times refer to when the customer places the order.</p></div>
    {error && <p className="error" role="alert">{error}</p>}{message && <p className="success" role="status">{message}</p>}

    <div className="admin-list">{rules.map((rule) => <article className="admin-record capacity-record" key={rule.id}>
      <div><strong>{rule.target_date ? rule.target_date : rule.weekday !== null ? `Every ${days[rule.weekday]}` : 'Every day'}</strong><p>{rulePeriod(rule)} · Stop after {rule.max_orders} order{rule.max_orders === 1 ? '' : 's'}</p></div>
      <span className={`status-badge ${rule.is_active ? 'active' : ''}`}>{rule.is_active ? 'On' : 'Paused'}</span>
      <div className="record-actions"><button className="pill" onClick={() => beginEdit(rule)}>Change</button><button className="pill" onClick={() => void toggle(rule)}>{rule.is_active ? 'Pause' : 'Switch on'}</button><button className="pill danger" onClick={() => void remove(rule)}>Delete</button></div>
    </article>)}</div>

    <form className="form-card capacity-form" onSubmit={save}>
      <div className="section-header"><div><span className="admin-step">Set a limit</span><h2>{editing ? 'Change this order limit' : 'Add an order limit'}</h2></div>{editing && <button className="pill" type="button" onClick={resetEditor}>Cancel</button>}</div>
      <fieldset className="admin-choice-group"><legend>1. Which days?</legend><label><input type="radio" checked={scope === 'everyday'} onChange={() => setScope('everyday')}/> Every day</label><label><input type="radio" checked={scope === 'weekday'} onChange={() => setScope('weekday')}/> One day each week</label><label><input type="radio" checked={scope === 'date'} onChange={() => setScope('date')}/> One particular date</label></fieldset>
      {scope !== 'everyday' && <div className="field-grid">{scope === 'weekday' ? <label className="field"><span>Day of the week</span><select aria-label="Day of the week" value={weekday} onChange={(event) => setWeekday(Number(event.target.value))}>{days.map((day, index) => <option value={index} key={day}>{day}</option>)}</select></label>
        : <label className="field"><span>Date</span><input type="date" aria-label="Date" required value={targetDate} onChange={(event) => setTargetDate(event.target.value)}/></label>}</div>}
      <fieldset className="admin-choice-group"><legend>2. Which part of the day?</legend><label><input type="radio" checked={!timed} onChange={() => setTimed(false)}/> The whole day</label><label><input type="radio" checked={timed} onChange={() => setTimed(true)}/> Only between certain times</label></fieldset>
      {timed && <div className="capacity-times"><label className="field"><span>From</span><input aria-label="From" type="time" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)}/></label><label className="field"><span>Until</span><input aria-label="Until" type="time" required value={endsAt} onChange={(event) => setEndsAt(event.target.value)}/></label></div>}
      <label className="field capacity-number"><span>3. How many orders can you manage?</span><input aria-label="Maximum orders" type="number" min="1" max="500" required value={maxOrders} onChange={(event) => setMaxOrders(Number(event.target.value))}/></label>
      <div className="capacity-preview"><span>Customers will be able to place</span><strong>up to {maxOrders || 0} orders {selectedDay} {selectedPeriod}.</strong></div>
      <button className="button" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Save order limit'}</button>
    </form>
  </section>;
}
