'use client';

import Link from 'next/link';
import {Menu, ShoppingBag, X} from 'lucide-react';
import {useTranslations} from 'next-intl';
import {usePathname} from 'next/navigation';
import {useState} from 'react';
import {AppSignedIn, AppSignedOut, AppSignInButton, AppUserButton} from '@/lib/auth';
import {useCart} from '@/lib/cart';

export function Header({locale}: {locale: string}) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const count = useCart((state) => state.lines.reduce((total, line) => total + line.quantity, 0));
  const other = locale === 'en' ? 'tr' : 'en';
  const localizedPath = pathname.replace(new RegExp(`^/${locale}(?=/|$)`), `/${other}`);
  return <header className="store-header">
    <Link className="store-brand" href={`/${locale}`}>ALLENS<span>NOTHERN</span></Link>
    <button className="store-icon-button store-menu-button" type="button" onClick={() => setOpen(!open)} aria-label={t('toggle')} aria-expanded={open}>{open ? <X/> : <Menu/>}</button>
    <nav className={open ? 'store-nav open' : 'store-nav'} aria-label={t('primary')}>
      <Link href={`/${locale}`} onClick={() => setOpen(false)}>{t('home')}</Link><Link href={`/${locale}/menu`} onClick={() => setOpen(false)}>{t('menu')}</Link>
      <AppSignedOut><AppSignInButton><button className="store-auth-button">{t('signIn')}</button></AppSignInButton></AppSignedOut>
      <AppSignedIn><Link href={`/${locale}/account`} onClick={() => setOpen(false)}>{t('account')}</Link><AppUserButton/></AppSignedIn>
      <Link href={localizedPath || `/${other}`} className="store-locale" hrefLang={other}>{other.toUpperCase()}</Link>
    </nav>
    <Link className="store-cart-link" href={`/${locale}/cart`} aria-label={`${t('cart')}: ${count}`}><ShoppingBag/><span>{count}</span></Link>
  </header>;
}
