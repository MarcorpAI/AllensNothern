'use client';

import {useAppAuth} from '@/lib/auth';
import Image from 'next/image';
import {useCallback, useEffect, useState} from 'react';
import {CategoryManager} from '@/components/category-manager';
import {MenuItemEditor} from '@/components/menu-item-editor';
import {adminRequest} from '@/lib/admin-api';
import type {AdminMenu, AdminMenuItem} from '@/lib/admin-menu-types';
import {money} from '@/lib/money';

export default function AdminMenuPage() {
  const {getToken} = useAppAuth();
  const [menu, setMenu] = useState<AdminMenu>({categories: []});
  const [editing, setEditing] = useState<AdminMenuItem | 'new' | null>(null);
  const [showCategories, setShowCategories] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try { setMenu(await adminRequest('/menu', await getToken())); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load the menu.'); }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  async function toggle(item: AdminMenuItem, available: boolean) {
    setUpdatingId(item.id); setError(''); setMessage('');
    setMenu((current) => ({categories: current.categories.map((category) => ({...category,
      items: category.items.map((currentItem) => currentItem.id === item.id ? {...currentItem, is_available: available} : currentItem)}))}));
    try {
      await adminRequest(`/menu/items/${item.id}/availability`, await getToken(), {method: 'PATCH', body: JSON.stringify({is_available: available})});
      setMessage(available ? `${item.name_en} is available.` : `${item.name_en} is sold out.`);
    } catch (reason) {
      setMenu((current) => ({categories: current.categories.map((category) => ({...category,
        items: category.items.map((currentItem) => currentItem.id === item.id ? {...currentItem, is_available: !available} : currentItem)}))}));
      setError(reason instanceof Error ? reason.message : 'Could not update availability.');
    } finally { setUpdatingId(null); }
  }

  async function remove(item: AdminMenuItem) {
    if (!window.confirm(`Delete “${item.name_en}”? Previous orders will keep their original item details.`)) return;
    setUpdatingId(item.id); setError('');
    try {
      await adminRequest(`/menu/items/${item.id}`, await getToken(), {method: 'DELETE'});
      if (editing !== 'new' && editing?.id === item.id) setEditing(null);
      setMessage(`${item.name_en} was deleted.`); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete this item.'); }
    finally { setUpdatingId(null); }
  }

  return <section>
    <div className="section-header"><div><div className="eyebrow">Customer menu</div><h2>Food & prices</h2></div><div className="compact-actions"><button className="pill" type="button" onClick={() => setShowCategories((current) => !current)}>{showCategories ? 'Hide sections' : 'Edit menu sections'}</button><button className="button" type="button" disabled={!menu.categories.length} onClick={() => setEditing('new')}>Add food</button></div></div>
    <p className="admin-help">Add dishes, photos, prices, sizes, spice levels, and extras. Use the availability button for a quick sold-out update.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p className="success" role="status">{message}</p>}
    {!menu.categories.length && <p className="notice">Add a menu section before adding your first item.</p>}
    {showCategories && <CategoryManager categories={menu.categories} token={getToken} onChanged={load}/>} 
    {editing && <MenuItemEditor key={editing === 'new' ? 'new' : editing.id} item={editing === 'new' ? null : editing} categories={menu.categories} token={getToken} onSaved={async (saved, replacedImage) => {setMessage(`${saved.name_en} saved${replacedImage ? ' with its food picture' : ''}.`); await load();}} onClose={() => setEditing(null)}/>} 

    <div className="admin-menu-groups">{menu.categories.map((category) => <section className="admin-menu-group" key={category.id}>
      <div className="admin-group-heading"><div><h3>{category.name_en}</h3><small>{category.name_tr} · {category.items.length} item{category.items.length === 1 ? '' : 's'}</small></div>{!category.is_active && <span className="status-badge">Hidden section</span>}</div>
      {!category.items.length && <p className="admin-help">No items in this section.</p>}
      {category.items.map((item) => <article className="admin-menu-row" key={item.id}>
        <div className="admin-menu-thumb">{item.image_url ? <Image src={item.image_url} alt="" width={148} height={128}/> : <span>No photo</span>}</div>
        <div className="admin-menu-copy"><strong>{item.name_en}</strong><small>{money(item.price_kurus, 'en')}{!item.is_published ? ' · Hidden from menu' : ''}</small></div>
        <div className="compact-actions"><button className={item.is_available ? 'availability-control available' : 'availability-control sold-out'} disabled={updatingId === item.id} onClick={() => void toggle(item, !item.is_available)}>{updatingId === item.id ? 'Saving…' : item.is_available ? 'Available' : 'Sold out'}</button><button className="pill" type="button" onClick={() => setEditing(item)}>Edit</button><button className="danger-link" type="button" disabled={updatingId === item.id} onClick={() => void remove(item)}>Delete</button></div>
      </article>)}
    </section>)}</div>
  </section>;
}
