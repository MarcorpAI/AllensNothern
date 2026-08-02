'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';

export function AdminNav({locale}: {locale: string}) {
  const pathname = usePathname();
  const links = [
    ['orders', 'Orders'], ['menu', 'Food & prices'], ['zones', 'Delivery areas'],
    ['hours', 'Opening times'], ['capacity', 'Order limits'], ['payments', 'Payments'],
    ['notifications', 'Email alerts'], ['analytics', 'Sales']
  ];
  return <nav className="admin-nav" aria-label="Dashboard sections">{links.map(([path, label]) => {
    const href = `/${locale}/admin/${path}`;
    return <Link className={pathname.startsWith(href) ? 'active' : ''} aria-current={pathname.startsWith(href) ? 'page' : undefined} href={href} key={path}>{label}</Link>;
  })}</nav>;
}
