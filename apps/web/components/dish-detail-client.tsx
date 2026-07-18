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
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [favorite, setFavorite] = useState(false);

  function submit() {
    if (!item.is_available) return;
    addQuantity(item, quantity); setAdded(true);
  }

  return <div className="store-dish">
    <div className="store-dish-media">{item.image_url ? <Image src={item.image_url} alt={item.name} fill priority sizes="(max-width: 900px) 100vw, 900px"/> : <div className="store-photo-fallback"/>}
      <Link className="store-photo-control" href={`/${locale}/menu#${item.category_id}`} aria-label={t('back')}><ArrowLeft/></Link>
      <button className={`store-photo-control favorite ${favorite ? 'active' : ''}`} type="button" aria-label={favorite ? t('removeFavorite') : t('addFavorite')} aria-pressed={favorite} onClick={() => setFavorite((value) => !value)}><Heart fill={favorite ? 'currentColor' : 'none'}/></button>
      {!item.is_available && <span className="store-flag">{t('soldOut')}</span>}
    </div>
    <div className="store-dish-content"><div className="store-dish-heading"><h1>{item.name}</h1><strong>{money(item.price_kurus, locale)}</strong></div><p className="store-dish-description">{item.description}</p>
      {added && <p className="store-added-message" role="status">{t('added')} <Link href={`/${locale}/cart`}>{t('viewCart')}</Link></p>}
    </div>
    <div className="store-dish-bar"><div className="store-quantity" aria-label={t('quantity')}><button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label={t('decrease')}><Minus/></button><span>{quantity}</span><button type="button" onClick={() => setQuantity((value) => Math.min(25, value + 1))} aria-label={t('increase')}><Plus/></button></div>
      <button className="store-button primary" type="button" disabled={!item.is_available} onClick={submit}>{t('add')} — {money(item.price_kurus * quantity, locale)}</button>
    </div>
  </div>;
}
