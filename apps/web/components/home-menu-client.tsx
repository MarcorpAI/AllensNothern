'use client';

import Image from 'next/image';
import Link from 'next/link';
import {ArrowRight} from 'lucide-react';
import {useTranslations} from 'next-intl';
import {money} from '@/lib/money';
import type {MenuResponse} from '@/lib/types';

export function HomeMenuClient({menu, locale}: {menu: MenuResponse; locale: string}) {
  const t = useTranslations('menu');

  if (!menu.categories.length) return <section className="store-home-menu"><div className="store-empty">{t('empty')}</div></section>;

  return <section className="store-home-menu" aria-label={t('title')}>
    {menu.categories.map((category) => <section className="store-home-category" key={category.id} aria-labelledby={`home-${category.id}`}>
      <header className="store-home-category-heading"><h2 id={`home-${category.id}`}>{category.name}</h2></header>
      <div className="store-home-grid">{category.items.slice(0, 2).map((item) => <article className="store-home-product" key={item.id}><Link href={`/${locale}/menu/${item.id}`}>
        <div className="store-home-product-media">{item.image_url ? <Image src={item.image_url} alt={item.name} fill quality={90} sizes="(max-width: 550px) 46vw, (max-width: 900px) 42vw, 330px"/> : <span className="store-photo-fallback"/>}{!item.is_available && <span className="store-flag">{t('soldOut')}</span>}</div>
        <div><h3>{item.name}</h3><strong>{item.modifiers.length ? `${locale === 'tr' ? 'Başlangıç ' : 'From '}${money(item.price_kurus, locale)}` : money(item.price_kurus, locale)}</strong></div><p>{item.description}</p>
      </Link></article>)}</div>
      <Link className="store-home-menu-link" href={`/${locale}/menu#${category.id}`}>{t('seeMenu')} <ArrowRight aria-hidden="true" size={16}/></Link>
    </section>)}
  </section>;
}
