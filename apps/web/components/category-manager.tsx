'use client';

import {FormEvent, useState} from 'react';
import {adminRequest} from '@/lib/admin-api';
import type {AdminCategory} from '@/lib/admin-menu-types';

export function CategoryManager({categories, token, onChanged}: {
  categories: AdminCategory[];
  token: () => Promise<string | null>;
  onChanged: () => Promise<void>;
}) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true); setError('');
    try {
      await adminRequest('/categories', await token(), {method: 'POST', body: JSON.stringify({
        name_en: data.get('name_en'), name_tr: data.get('name_tr'), sort_order: categories.length, is_active: true
      })});
      form.reset(); await onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not add category.'); }
    finally { setSaving(false); }
  }

  async function update(event: FormEvent<HTMLFormElement>, category: AdminCategory) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true); setError('');
    try {
      await adminRequest(`/categories/${category.id}`, await token(), {method: 'PUT', body: JSON.stringify({
        name_en: data.get('name_en'), name_tr: data.get('name_tr'), sort_order: category.sort_order,
        is_active: data.get('is_active') === 'on'
      })});
      await onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update category.'); }
    finally { setSaving(false); }
  }

  async function remove(category: AdminCategory) {
    if (!window.confirm(`Delete “${category.name_en}”?`)) return;
    setSaving(true); setError('');
    try { await adminRequest(`/categories/${category.id}`, await token(), {method: 'DELETE'}); await onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete category.'); }
    finally { setSaving(false); }
  }

  return <div className="form-card category-manager"><h2>Menu sections</h2>
    <p className="admin-help">Sections organize the customer menu, such as Starters, Mains, Drinks, and Desserts.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {categories.map((category) => <form className="category-edit-row" key={category.id} onSubmit={(event) => void update(event, category)}>
      <label className="field"><span>English name</span><input name="name_en" defaultValue={category.name_en} required/></label>
      <label className="field"><span>Turkish name</span><input name="name_tr" defaultValue={category.name_tr} required/></label>
      <label className="friendly-check"><input name="is_active" type="checkbox" defaultChecked={category.is_active}/> Show on menu</label>
      <div className="compact-actions"><button className="pill" disabled={saving}>Save</button><button className="danger-link" type="button" disabled={saving} onClick={() => void remove(category)}>Delete</button></div>
    </form>)}
    <form className="category-add-row" onSubmit={create}><label className="field"><span>New section in English</span><input name="name_en" required placeholder="Desserts"/></label><label className="field"><span>New section in Turkish</span><input name="name_tr" required placeholder="Tatlılar"/></label><button className="button" disabled={saving}>{saving ? 'Saving…' : 'Add section'}</button></form>
  </div>;
}
