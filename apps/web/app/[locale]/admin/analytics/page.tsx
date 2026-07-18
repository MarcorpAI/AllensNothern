'use client';

import {FormEvent, useCallback, useEffect, useState} from 'react';
import {useAppAuth} from '@/lib/auth';
import {adminRequest} from '@/lib/admin-api';
import {money} from '@/lib/money';

type ItemMetric = {name: string; quantity: number; revenue_kurus: number};
type Summary = {revenue_kurus: number; order_count: number; average_order_value_kurus: number; grouping: string;
  series: {period: string; order_count: number; revenue_kurus: number}[]; top_items: ItemMetric[]; worst_items: ItemMetric[];
  zones: {name: string; order_count: number; revenue_kurus: number}[]; peak_periods: {weekday: number; hour: number; order_count: number}[]};
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function isoDate(date: Date) { return new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Istanbul'}).format(date); }

export default function Analytics() {
  const {getToken} = useAppAuth(); const now = new Date(); const monthAgo = new Date(now); monthAgo.setDate(now.getDate() - 30);
  const [from, setFrom] = useState(isoDate(monthAgo)); const [to, setTo] = useState(isoDate(now));
  const [grouping, setGrouping] = useState('daily'); const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); setError(''); try {
    setData(await adminRequest<Summary>(`/analytics/summary?date_from=${from}&date_to=${to}&grouping=${grouping}`, await getToken()));
  } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load analytics.'); } finally { setLoading(false); }
  }, [from, to, grouping, getToken]);
  useEffect(() => { void load(); }, [load]);
  function submit(event: FormEvent) { event.preventDefault(); void load(); }
  const maxRevenue = Math.max(1, ...(data?.series.map((item) => item.revenue_kurus) ?? [1]));
  return <section><div className="section-header"><div><div className="eyebrow">Europe/Istanbul reporting</div><h2>Sales analytics</h2></div></div>
    <form className="analytics-filters" onSubmit={submit}><label className="field"><span>From</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)}/></label><label className="field"><span>To</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)}/></label>
      <label className="field"><span>Group by</span><select value={grouping} onChange={(event) => setGrouping(event.target.value)}><option value="daily">Day</option><option value="weekly">Week</option><option value="monthly">Month</option></select></label><button className="button" disabled={loading}>{loading ? 'Loading…' : 'Apply'}</button></form>
    {error && <div className="error" role="alert">{error}</div>}
    <div className="metric-grid"><div className="metric">Revenue<strong>{money(data?.revenue_kurus ?? 0, 'en')}</strong></div><div className="metric">Paid orders<strong>{data?.order_count ?? 0}</strong></div><div className="metric">Average order<strong>{money(data?.average_order_value_kurus ?? 0, 'en')}</strong></div></div>
    <div className="form-card analytics-chart"><h2>Revenue and order volume</h2>{!data?.series.length && !loading ? <p className="admin-help">No paid orders in this period.</p> : data?.series.map((point) => <div className="chart-row" key={point.period}><time>{point.period}</time><div className="chart-track"><span style={{width: `${Math.max(2, point.revenue_kurus / maxRevenue * 100)}%`}}/></div><strong>{money(point.revenue_kurus, 'en')}</strong><small>{point.order_count} orders</small></div>)}</div>
    <div className="analytics-grid"><div className="form-card"><h2>Best-selling dishes</h2>{data?.top_items.map((item) => <div className="summary-row" key={item.name}><span>{item.name} · {item.quantity}</span><strong>{money(item.revenue_kurus, 'en')}</strong></div>)}</div>
      <div className="form-card"><h2>Lowest-selling dishes</h2>{data?.worst_items.map((item) => <div className="summary-row" key={item.name}><span>{item.name} · {item.quantity}</span><strong>{money(item.revenue_kurus, 'en')}</strong></div>)}</div>
      <div className="form-card"><h2>Delivery areas</h2>{data?.zones.map((zone) => <div className="summary-row" key={zone.name}><span>{zone.name} · {zone.order_count}</span><strong>{money(zone.revenue_kurus, 'en')}</strong></div>)}</div>
      <div className="form-card"><h2>Peak periods</h2>{data?.peak_periods.map((peak) => <div className="summary-row" key={`${peak.weekday}-${peak.hour}`}><span>{days[peak.weekday]} {String(peak.hour).padStart(2, '0')}:00</span><strong>{peak.order_count} orders</strong></div>)}</div></div>
  </section>;
}
