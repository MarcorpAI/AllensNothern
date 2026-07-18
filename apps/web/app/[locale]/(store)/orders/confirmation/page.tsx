'use client';

import Link from 'next/link';
import {useParams, useSearchParams} from 'next/navigation';
import {useEffect, useState} from 'react';
import {useCart} from '@/lib/cart';

export default function ConfirmationPage() {
  const {locale} = useParams<{locale: string}>();
  const id = useSearchParams().get('order');
  const clear = useCart((state) => state.clear);
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    setToken(id ? localStorage.getItem(`order-token:${id}`) : null);
    clear();
    localStorage.removeItem('allensnothern-checkout-draft');
  }, [clear, id]);
  return <div className="section"><div className="eyebrow">Payment received</div><h1>Thank you.</h1><p>Your order has reached our kitchen.</p>
    {token ? <Link className="button orange" href={`/${locale}/orders/${token}`}>Track your order</Link> : <p>Check your email for the secure tracking link.</p>}</div>;
}
