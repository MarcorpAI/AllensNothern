'use client';

import Link from 'next/link';
import {useParams} from 'next/navigation';
import {useEffect, useState} from 'react';
import {useTranslations} from 'next-intl';
import {API_URL} from '@/lib/api';
import {useAppAuth} from '@/lib/auth';
import {money} from '@/lib/money';
import {modifierOptionCounts} from '@/lib/modifier-display';
import type {CustomerOrderDetail} from '@/lib/types';

export default function CustomerOrderPage() {
  const {locale, id} = useParams<{locale: string; id: string}>(); const t = useTranslations('account');
  const {getToken, isLoaded, isSignedIn} = useAppAuth(); const [order, setOrder] = useState<CustomerOrderDetail | null>(null);
  const [error, setError] = useState(''); const [pollState, setPollState] = useState('');
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return; let active = true; let timer = 0; let delay = 10_000;
    const load = async () => { try { const token = await getToken(); const response = await fetch(`${API_URL}/orders/${id}`, {headers: {Authorization: `Bearer ${token}`}});
        if (!response.ok) throw new Error(); const value = await response.json(); if (!active) return; setOrder(value); setError(''); setPollState(t('trackingUpdated')); delay = 10_000;
        if (value.status !== 'delivered') timer = window.setTimeout(load, delay);
      } catch { if (!active) return; setError(t('orderLoadFailed')); setPollState(t('trackingRetrying')); delay = Math.min(delay * 2, 60_000); timer = window.setTimeout(load, delay); }};
    void load(); return () => {active = false; window.clearTimeout(timer);};
  }, [getToken, id, isLoaded, isSignedIn, t]);
  if (!isLoaded) return <div className="section"><p>{t('loading')}</p></div>;
  if (!isSignedIn) return <div className="section"><p>{t('signInPrompt')}</p><Link className="button" href={`/${locale}/sign-in`}>{t('signIn')}</Link></div>;
  if (!order) return <div className="section">{error ? <p className="error" role="alert">{error}</p> : <p>{t('loading')}</p>}</div>;
  return <div className="section customer-order-detail"><Link className="pill" href={`/${locale}/account`}>{t('back')}</Link><div className="eyebrow">{order.order_number}</div><h1>{t(`status.${order.status}`)}</h1><p className="tracking-poll-state">{pollState}</p>{error && <p className="error">{error}</p>}
    <div className="customer-order-grid"><section className="form-card"><h2>{t('items')}</h2>{order.items.map((item) => <article className="customer-order-item" key={item.id}><strong><span>{item.quantity}×</span> {item.item_name}</strong><b>{money(item.line_total_kurus, locale)}</b>{item.selected_modifiers.map((modifier) => <p key={modifier.id}>{locale === 'tr' ? modifier.name_tr : modifier.name_en}: {modifierOptionCounts(modifier, locale)}</p>)}</article>)}</section>
      <aside><section className="form-card"><h2>{t('delivery')}</h2><p>{order.delivery_address}</p>{order.delivery_instructions && <p>{order.delivery_instructions}</p>}<small>{order.delivery_zone_name}</small></section><section className="form-card"><h2>{t('totals')}</h2><div className="summary-row"><span>{t('subtotal')}</span><strong>{money(order.subtotal_kurus, locale)}</strong></div><div className="summary-row"><span>{t('deliveryFee')}</span><strong>{money(order.delivery_fee_kurus, locale)}</strong></div><div className="summary-row"><span>{t('total')}</span><strong>{money(order.total_kurus, locale)}</strong></div></section></aside></div>
    <section className="form-card"><h2>{t('timeline')}</h2><div className="customer-timeline">{order.status_history.map((entry) => <div key={`${entry.status}-${entry.changed_at}`}><strong>{t(`status.${entry.status}`)}</strong><time>{new Intl.DateTimeFormat(locale, {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(entry.changed_at))}</time></div>)}</div></section>
  </div>;
}
