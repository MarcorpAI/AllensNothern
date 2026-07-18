'use client';

import {useAppAuth} from '@/lib/auth';
import dynamic from 'next/dynamic';
import {FormEvent, useCallback, useEffect, useState} from 'react';
import {adminRequest} from '@/lib/admin-api';
import {money} from '@/lib/money';

export type MapPoint = [number, number];
export type Zone = {
  id: string;
  name: string;
  delivery_fee_kurus: number;
  priority: number;
  is_active: boolean;
  polygon: {type: 'Polygon'; coordinates: number[][][]};
  overlaps_with: {id: string; name: string}[];
};

const ZoneMapEditor = dynamic(() => import('@/components/zone-map-editor'), {
  ssr: false,
  loading: () => <div className="zone-map-loading">Loading delivery map…</div>
});

function polygonPoints(zone: Zone): MapPoint[] {
  return (zone.polygon.coordinates[0] ?? []).slice(0, -1).map(([longitude, latitude]) => [latitude, longitude]);
}

export default function Zones() {
  const {getToken} = useAppAuth();
  const [zones, setZones] = useState<Zone[]>([]);
  const [editing, setEditing] = useState<Zone | null>(null);
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [name, setName] = useState('');
  const [fee, setFee] = useState('');
  const [priority, setPriority] = useState('100');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setZones(await adminRequest('/zones', await getToken())); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load delivery areas.'); }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  function resetEditor() {
    setEditing(null); setPoints([]); setName(''); setFee(''); setPriority(String(100 + zones.length));
  }

  function startEdit(zone: Zone) {
    setEditing(zone); setName(zone.name); setFee(String(zone.delivery_fee_kurus / 100));
    setPriority(String(zone.priority)); setPoints(polygonPoints(zone)); setMessage(''); setError('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage('');
    if (points.length < 3) { setError('Click at least three points on the map to outline the delivery area.'); return; }
    const feeLira = Number(fee); const priorityValue = Number(priority);
    if (!Number.isFinite(feeLira) || feeLira < 0 || !Number.isInteger(priorityValue)) {
      setError('Enter a valid delivery fee and whole-number priority.'); return;
    }
    const ring = [...points.map(([latitude, longitude]) => [longitude, latitude]), [points[0][1], points[0][0]]];
    setSaving(true);
    try {
      await adminRequest(editing ? `/zones/${editing.id}` : '/zones', await getToken(), {
        method: editing ? 'PUT' : 'POST', body: JSON.stringify({name, delivery_fee_kurus: Math.round(feeLira * 100),
          priority: priorityValue, is_active: editing?.is_active ?? true,
          polygon: {type: 'Polygon', coordinates: [ring]}})
      });
      setMessage(editing ? 'Delivery area updated.' : 'Delivery area saved.'); resetEditor(); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this delivery area.'); }
    finally { setSaving(false); }
  }

  async function toggle(zone: Zone) {
    setError('');
    try { await adminRequest(`/zones/${zone.id}/active`, await getToken(), {method: 'PATCH',
      body: JSON.stringify({is_active: !zone.is_active})}); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update this delivery area.'); }
  }

  async function remove(zone: Zone) {
    if (!window.confirm(`Delete “${zone.name}”? Historical orders keep the saved area name.`)) return;
    try { await adminRequest(`/zones/${zone.id}`, await getToken(), {method: 'DELETE'}); if (editing?.id === zone.id) resetEditor(); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete this delivery area.'); }
  }

  return <section>
    <div className="section-header"><div><div className="eyebrow">Delivery settings</div><h2>Delivery areas</h2></div></div>
    <p className="admin-help">Draw where you deliver and set the fee. If two areas overlap, the area placed first below is used. Pausing an area stops new orders to it.</p>
    {error && <p className="error" role="alert">{error}</p>}{message && <p className="success" role="status">{message}</p>}
    <div className="admin-list">{zones.map((zone) => <article className="admin-record" key={zone.id}>
      <div><strong>{zone.name}</strong><p>{money(zone.delivery_fee_kurus, 'en')} delivery · Position {zone.priority}</p>
        {!!zone.overlaps_with.length && <p className="admin-warning">Shares some streets with: {zone.overlaps_with.map((item) => item.name).join(', ')}</p>}</div>
      <span className={`status-badge ${zone.is_active ? 'active' : ''}`}>{zone.is_active ? 'Active' : 'Paused'}</span>
      <div className="record-actions"><button className="pill" onClick={() => startEdit(zone)}>Edit</button>
        <button className="pill" onClick={() => void toggle(zone)}>{zone.is_active ? 'Pause' : 'Activate'}</button>
        <button className="pill danger" onClick={() => void remove(zone)}>Delete</button></div>
    </article>)}</div>
    <form className="form-card zone-form" onSubmit={save}>
      <div className="section-header"><h2>{editing ? `Edit ${editing.name}` : 'Add a delivery area'}</h2>{editing && <button type="button" className="pill" onClick={resetEditor}>Cancel edit</button>}</div>
      <div className="field-grid"><label className="field"><span>Area name</span><input value={name} onChange={(event) => setName(event.target.value)} required/></label>
        <label className="field"><span>Delivery fee (₺)</span><input value={fee} onChange={(event) => setFee(event.target.value)} type="number" min="0" step="0.01" required/></label>
        <label className="field"><span>Position when areas overlap <small>(1 is first)</small></span><input value={priority} onChange={(event) => setPriority(event.target.value)} type="number" min="1" step="1" required/></label></div>
      <div className="map-instructions"><strong>{points.length < 3 ? `${3 - points.length} more point${3 - points.length === 1 ? '' : 's'} needed` : 'Area ready to save'}</strong><span>Click or drag points around the outside edge.</span></div>
      <ZoneMapEditor zones={zones} points={points} onChange={setPoints}/>
      <div className="zone-actions"><button className="pill" type="button" disabled={!points.length} onClick={() => setPoints((current) => current.slice(0, -1))}>Undo</button>
        <button className="pill" type="button" disabled={!points.length} onClick={() => setPoints([])}>Clear</button>
        <button className="button" type="submit" disabled={saving || points.length < 3}>{saving ? 'Saving…' : editing ? 'Update area' : 'Save area'}</button></div>
    </form>
  </section>;
}
