'use client';

import Image from 'next/image';
import Link from 'next/link';
import {Search, X} from 'lucide-react';
import {useTranslations} from 'next-intl';
import {useEffect, useMemo, useState} from 'react';
import {money} from '@/lib/money';
import type {MenuResponse} from '@/lib/types';

export function MenuClient({menu, locale}: {menu: MenuResponse; locale: string}) {
  const t = useTranslations('menu');
  const [active, setActive] = useState(menu.categories[0]?.id ?? '');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const categories = useMemo(() => normalizedQuery ? menu.categories.map((category) => ({
    ...category,
    items: category.items.filter((item) => `${item.name} ${item.description}`.toLocaleLowerCase(locale).includes(normalizedQuery))
  })).filter((category) => category.items.length) : menu.categories, [locale, menu.categories, normalizedQuery]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActive(visible.target.id);
    }, {rootMargin: '-145px 0px -55% 0px', threshold: [0, .2, .5]});
    categories.forEach((category) => {
      const section = document.getElementById(category.id);
      if (section) observer.observe(section);
    });
    return () => observer.disconnect();
  }, [categories]);

  return <>
    <header className="store-menu-route-header"><strong>{t('title')}</strong><button type="button" aria-label={searching ? t('closeSearch') : t('searchMenu')} aria-expanded={searching} onClick={() => {setSearching((value) => !value); if (searching) setQuery('');}}>{searching ? <X/> : <Search/>}</button></header>
    {searching && <label className="store-menu-search"><span>{t('searchMenu')}</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('searchPlaceholder')}/></label>}
    <nav className="store-category-nav" aria-label={t('categories')}>{categories.map((category) => <a className={active === category.id ? 'active' : ''} aria-current={active === category.id ? 'true' : undefined} href={`#${category.id}`} key={category.id}>{category.name}</a>)}</nav>
    {!categories.length && <div className="store-empty">{t('noMatches')}</div>}
    {categories.map((category) => <section className="store-menu-category" id={category.id} key={category.id}>
      <h2>{category.name}</h2><div className="store-menu-grid">{category.items.map((item) => <article className="store-product" key={item.id}>
        <Link className="store-product-link" href={`/${locale}/menu/${item.id}`} aria-label={`${item.name}, ${money(item.price_kurus, locale)}`}>
          <div className="store-product-media">{item.image_url ? <Image src={item.image_url} alt={item.name} fill quality={90} sizes="(max-width: 550px) 46vw, (max-width: 900px) 45vw, 320px"/> : <div className="store-photo-fallback" aria-hidden="true"/>}{!item.is_available && <span className="store-flag">{t('soldOut')}</span>}</div>
          <div className="store-product-heading"><h3>{item.name}</h3><strong>{item.modifiers.length ? `${locale === 'tr' ? 'Başlangıç ' : 'From '}${money(item.price_kurus, locale)}` : money(item.price_kurus, locale)}</strong></div>
          {item.minimum_order_quantity > 1 && <small>{locale === 'tr' ? `Minimum ${item.minimum_order_quantity} adet` : `Minimum ${item.minimum_order_quantity}`}</small>}
          <p>{item.description}</p>
        </Link>
      </article>)}</div>
    </section>)}
  </>;
}
