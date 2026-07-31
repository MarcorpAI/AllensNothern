'use client';

import Image from 'next/image';
import Link from 'next/link';
import {ArrowLeft, Heart, Minus, Plus} from 'lucide-react';
import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {useCart} from '@/lib/cart';
import {money} from '@/lib/money';
import type {MenuItem} from '@/lib/types';

export function DishDetailClient({item, locale}: {item: MenuItem; locale: string}) {
  const t = useTranslations('dish');
  const addQuantity = useCart((state) => state.addQuantity);
  const [quantity, setQuantity] = useState(item.minimum_order_quantity);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [selectionError, setSelectionError] = useState(false);
  const [added, setAdded] = useState(false);
  const [favorite, setFavorite] = useState(false);

  function changeOption(modifierId: string, optionId: string, change: 1 | -1, maximum: number) {
    setSelected((current) => {
      const choices = current[modifierId] ?? [];
      if (change === 1 && choices.length >= maximum) return current;
      const next = [...choices];
      if (change === 1) next.push(optionId);
      else {
        const index = next.lastIndexOf(optionId);
        if (index < 0) return current;
        next.splice(index, 1);
      }
      return {...current, [modifierId]: next};
    });
  }

  function submit() {
    if (!item.is_available) return;
    const valid = item.modifiers.every((modifier) => {
      const count = selected[modifier.id]?.length ?? 0;
      return count >= modifier.min_select && count <= modifier.max_select;
    });
    if (!valid) {setSelectionError(true); return;}
    addQuantity(item, quantity, Object.entries(selected).map(([modifier_id, option_ids]) => ({
      modifier_id, option_ids
    }))); setAdded(true); setSelectionError(false);
  }
  const extras = item.modifiers.reduce((sum, modifier) => sum + (selected[modifier.id] ?? []).reduce(
    (subtotal, id) => subtotal + (modifier.options.find((option) => option.id === id)?.price_delta_kurus ?? 0), 0), 0);

  return <div className="store-dish">
    <div className="store-dish-media">{item.image_url ? <Image src={item.image_url} alt={item.name} fill priority sizes="(max-width: 900px) 100vw, 900px"/> : <div className="store-photo-fallback"/>}
      <Link className="store-photo-control" href={`/${locale}/menu#${item.category_id}`} aria-label={t('back')}><ArrowLeft/></Link>
      <button className={`store-photo-control favorite ${favorite ? 'active' : ''}`} type="button" aria-label={favorite ? t('removeFavorite') : t('addFavorite')} aria-pressed={favorite} onClick={() => setFavorite((value) => !value)}><Heart fill={favorite ? 'currentColor' : 'none'}/></button>
      {!item.is_available && <span className="store-flag">{t('soldOut')}</span>}
    </div>
    <div className="store-dish-content"><div className="store-dish-heading"><h1>{item.name}</h1><strong>{item.modifiers.length ? `${locale === 'tr' ? 'Başlangıç ' : 'From '}${money(item.price_kurus, locale)}` : money(item.price_kurus, locale)}</strong></div><p className="store-dish-description">{item.description}</p>
      {added && <p className="store-added-message" role="status">{t('added')} <Link href={`/${locale}/cart`}>{t('viewCart')}</Link></p>}
      {item.minimum_order_quantity > 1 && <p className="store-added-message">{locale === 'tr' ? `Minimum sipariş: Bu üründen ${item.minimum_order_quantity} adet. Farklı atıştırmalıklar birleştirilemez.` : `Minimum order: ${item.minimum_order_quantity} of this item. Different snacks cannot be combined.`}</p>}
      {item.modifiers.map((modifier) => <fieldset className="dish-options" key={modifier.id}><legend>{modifier.name} {modifier.is_required && <span>{locale === 'tr' ? 'Zorunlu' : 'Required'}</span>}</legend>
        <p className="protein-choice-help">{locale === 'tr' ? `Birden fazla protein seçebilirsiniz (en fazla ${modifier.max_select}).` : `Choose one or more proteins, including extra portions of the same choice (up to ${modifier.max_select}).`}</p>
        {modifier.options.map((option) => {
          const count = (selected[modifier.id] ?? []).filter((id) => id === option.id).length;
          const total = selected[modifier.id]?.length ?? 0;
          return <div className={`protein-choice ${count ? 'selected' : ''}`} key={option.id}>
            <span>{option.name}</span><strong>+{money(option.price_delta_kurus, locale)}</strong>
            <div className="protein-choice-quantity">
              <button type="button" disabled={count === 0} onClick={() => changeOption(modifier.id, option.id, -1, modifier.max_select)} aria-label={`${locale === 'tr' ? 'Azalt' : 'Decrease'} ${option.name}`}><Minus/></button>
              <span aria-label={`${option.name}: ${count}`}>{count}</span>
              <button type="button" disabled={total >= modifier.max_select} onClick={() => changeOption(modifier.id, option.id, 1, modifier.max_select)} aria-label={`${locale === 'tr' ? 'Artır' : 'Increase'} ${option.name}`}><Plus/></button>
            </div>
          </div>;
        })}
      </fieldset>)}
      {selectionError && <p className="store-error" role="alert">{t('selectionNeeded')}</p>}
    </div>
    <div className="store-dish-bar"><div className="store-quantity" aria-label={t('quantity')}><button type="button" onClick={() => setQuantity((value) => Math.max(item.minimum_order_quantity, value - 1))} aria-label={t('decrease')}><Minus/></button><span>{quantity}</span><button type="button" onClick={() => setQuantity((value) => Math.min(25, value + 1))} aria-label={t('increase')}><Plus/></button></div>
      <button className="store-button primary" type="button" disabled={!item.is_available} onClick={submit}>{t('add')} — {money((item.price_kurus + extras) * quantity, locale)}</button>
    </div>
  </div>;
}
