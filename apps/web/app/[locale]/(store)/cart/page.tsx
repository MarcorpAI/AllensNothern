'use client';

import Link from 'next/link';
import Image from 'next/image';
import {Minus, Plus} from 'lucide-react';
import {useParams} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {linePrice, useCart} from '@/lib/cart';
import {money} from '@/lib/money';

export default function CartPage() {
  const {locale} = useParams<{locale: string}>();
  const t = useTranslations('cart');
  const {lines, setQuantity, remove} = useCart();
  const subtotal = lines.reduce((sum, line) => sum + linePrice(line), 0);

  return <div className="store-page store-cart-page"><header className="store-page-heading"><h1>{t('title')}</h1></header>{!lines.length ? <div className="store-empty"><p>{t('empty')}</p><Link className="store-button secondary" href={`/${locale}/menu`}>{t('menu')}</Link></div> :
    <div className="store-cart-layout"><div className="store-cart-lines">{lines.map((line) => {
      return <article className="store-cart-line" key={line.key}><Link className="store-cart-thumb" href={`/${locale}/menu/${line.item.id}`}>{line.item.image_url ? <Image src={line.item.image_url} alt="" fill sizes="110px"/> : <span className="store-photo-fallback"/>}</Link><div className="store-cart-copy"><h2>{line.item.name}</h2><div className="store-cart-actions"><button type="button" onClick={() => remove(line.key)}>{t('remove')}</button></div></div><div className="store-quantity"><button type="button" onClick={() => setQuantity(line.key, line.quantity - 1)} aria-label={t('decrease')}><Minus/></button><span>{line.quantity}</span><button type="button" onClick={() => setQuantity(line.key, line.quantity + 1)} aria-label={t('increase')}><Plus/></button></div><strong className="store-cart-price">{money(linePrice(line), locale)}</strong></article>;
    })}</div><aside className="store-summary"><div className="store-summary-row"><strong>{t('subtotal')}</strong><strong>{money(subtotal, locale)}</strong></div><Link className="store-button primary" href={`/${locale}/checkout`}>{t('checkout')}</Link></aside></div>}
  </div>;
}
