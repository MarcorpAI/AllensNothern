'use client';

import Link from 'next/link';
import {useParams} from 'next/navigation';
import {useCallback, useEffect, useState} from 'react';
import {useTranslations} from 'next-intl';
import {API_URL} from '@/lib/api';
import {AppSignedIn, AppSignedOut, AppSignInButton, useAppAuth} from '@/lib/auth';
import {money} from '@/lib/money';
import type {Order, SavedAddress} from '@/lib/types';

export default function AccountPage() {
  const {locale} = useParams<{locale: string}>(); const t = useTranslations('account');
  const {getToken, isSignedIn} = useAppAuth(); const [orders, setOrders] = useState<Order[]>([]);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]); const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!isSignedIn) return; const token = await getToken(); const headers = {Authorization: `Bearer ${token}`};
    const [orderResponse, addressResponse] = await Promise.all([fetch(`${API_URL}/orders`, {headers}), fetch(`${API_URL}/addresses`, {headers})]);
    if (!orderResponse.ok || !addressResponse.ok) {setError(t('loadFailed')); return;}
    setOrders(await orderResponse.json()); setAddresses(await addressResponse.json()); setError('');
  }, [getToken, isSignedIn, t]);
  useEffect(() => {void load();}, [load]);
  async function remove(address: SavedAddress) {
    if (!window.confirm(t('deleteConfirm', {label: address.label}))) return; const token = await getToken();
    const response = await fetch(`${API_URL}/addresses/${address.id}`, {method: 'DELETE', headers: {Authorization: `Bearer ${token}`}});
    if (response.ok) setAddresses((current) => current.filter((item) => item.id !== address.id)); else setError(t('deleteFailed'));
  }
  return <div className="section account-page"><AppSignedOut><div className="form-card"><h1>{t('title')}</h1><p>{t('signInPrompt')}</p><AppSignInButton><button className="button">{t('signIn')}</button></AppSignInButton></div></AppSignedOut>
    <AppSignedIn>{error && <p className="error" role="alert">{error}</p>}<h1>{t('orders')}</h1>{orders.length ? <div className="account-orders">{orders.map((order) => <Link className="account-order" href={`/${locale}/account/orders/${order.id}`} key={order.id}><div><strong>{order.order_number}</strong><p>{new Intl.DateTimeFormat(locale, {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(order.created_at))}</p></div><div><strong>{money(order.total_kurus, locale)}</strong><p>{t(`status.${order.status}`)}</p></div><span>{t('viewDetails')}</span></Link>)}</div>
      : <div className="empty-state"><p>{t('noOrders')}</p><Link className="button" href={`/${locale}/menu`}>{t('exploreMenu')}</Link></div>}
      <div className="form-card account-addresses"><div className="section-header"><h2>{t('savedAddresses')}</h2><Link className="pill" href={`/${locale}/checkout`}>{t('manageAtCheckout')}</Link></div>{addresses.length ? addresses.map((address) => <div className="account-address" key={address.id}><div><strong>{address.label}</strong><span>{address.full_address}</span>{address.instructions && <small>{address.instructions}</small>}</div><button className="pill danger" onClick={() => void remove(address)}>{t('delete')}</button></div>) : <p>{t('noAddresses')}</p>}</div></AppSignedIn></div>;
}
