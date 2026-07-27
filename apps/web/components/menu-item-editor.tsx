'use client';

import {FormEvent, useEffect, useMemo, useState} from 'react';
import Image from 'next/image';
import {adminUpload} from '@/lib/admin-api';
import type {AdminCategory, AdminMenuItem} from '@/lib/admin-menu-types';

export function MenuItemEditor({item, categories, token, onSaved, onClose}: {
  item: AdminMenuItem | null;
  categories: AdminCategory[];
  token: () => Promise<string | null>;
  onSaved: (saved: AdminMenuItem, replacedImage: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const [image, setImage] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const preview = useMemo(() => image ? URL.createObjectURL(image) : item?.image_url ?? null, [image, item?.image_url]);

  useEffect(() => () => { if (image && preview) URL.revokeObjectURL(preview); }, [image, preview]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const form = new FormData(event.currentTarget);
    const priceLira = Number(form.get('price'));
    const name = String(form.get('name') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();
    if (image && !['image/jpeg', 'image/png', 'image/webp'].includes(image.type)) {
      setError('Choose a JPEG, PNG, or WebP food picture.'); return;
    }
    if (image && image.size > 10 * 1024 * 1024) { setError('Choose a food picture smaller than 10 MB.'); return; }

    setSaving(true);
    try {
      const payload = {category_id: form.get('category_id'), name_en: name, name_tr: name,
        description_en: description, description_tr: description, price_kurus: Math.round(priceLira * 100),
        minimum_order_quantity: Number(form.get('minimum_order_quantity')),
        is_available: form.get('is_available') === 'on', is_published: form.get('is_published') === 'on',
        sort_order: Number(form.get('sort_order'))};
      const complete = new FormData();
      complete.append('item', JSON.stringify(payload));
      complete.append('modifiers', JSON.stringify(item?.modifiers ?? []));
      if (image) complete.append('image', image);
      const saved = await adminUpload<AdminMenuItem>(item ? `/menu/items/${item.id}/complete` : '/menu/items/complete',
        await token(), complete, item ? 'PUT' : 'POST');
      if (image && !saved.image_url) throw new Error('The item was saved, but its food picture was not stored. Please try the picture again.');
      await onSaved(saved, Boolean(image)); onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this food.'); }
    finally { setSaving(false); }
  }

  return <form className="form-card item-editor" onSubmit={save}>
    <div className="section-header"><div><div className="eyebrow">{item ? 'Edit food' : 'New food'}</div><h2>{item?.name_en ?? 'Add food'}</h2></div><button className="pill" type="button" onClick={onClose}>Close</button></div>
    {error && <p className="error" role="alert">{error}</p>}
    <p className="admin-help">Add the food name, price, description and picture. A landscape 4:3 picture works best; the full image will be kept visible.</p>
    <div className="field-grid">
      <label className="field"><span>Menu section</span><select name="category_id" defaultValue={item?.category_id ?? categories[0]?.id} required>{categories.map((category) => <option value={category.id} key={category.id}>{category.name_en}</option>)}</select></label>
      <label className="field"><span>Price (₺)</span><input name="price" type="number" min="0" step="0.01" defaultValue={item ? item.price_kurus / 100 : ''} required/></label>
      <label className="field"><span>Food name</span><input name="name" defaultValue={item?.name_en} required maxLength={150}/></label>
      <label className="field admin-image-picker"><span>Food picture (optional)</span><input type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="food-picture-help" onChange={(event) => setImage(event.target.files?.[0] ?? null)}/><small id="food-picture-help">{image ? `${image.name} selected. It will upload when you save.` : item?.image_url ? 'Current picture will stay unless you choose a replacement.' : 'You can add a JPEG, PNG, or WebP later.'}</small></label>
    </div>
    <label className="field"><span>Description</span><textarea name="description" defaultValue={item?.description_en} required maxLength={2000}/></label>
    {preview && <figure className="admin-image-preview"><Image className="image-preview" src={preview} alt="Food picture preview" width={360} height={270} unoptimized={preview.startsWith('blob:')}/><figcaption>{image ? 'New picture ready to upload' : 'Current food picture'}</figcaption></figure>}
    <div className="field-grid"><label className="field"><span>Position in this section</span><input name="sort_order" type="number" min="0" defaultValue={item?.sort_order ?? 0}/></label><label className="field"><span>Minimum quantity per item</span><input name="minimum_order_quantity" type="number" min="1" max="25" defaultValue={item?.minimum_order_quantity ?? 1}/></label></div>
    <div className="check-row"><label className="friendly-check"><input name="is_available" type="checkbox" defaultChecked={item?.is_available ?? true}/> Available to order</label><label className="friendly-check"><input name="is_published" type="checkbox" defaultChecked={item?.is_published ?? true}/> Show on customer menu</label></div>
    <button className="button" disabled={saving || !categories.length}>{saving ? 'Saving food…' : 'Save food'}</button>
  </form>;
}
