'use client';

import {useParams} from 'next/navigation';
import {AdminNav} from '@/components/admin-nav';
import {AdminGate} from '@/components/admin-gate';
import {AppSignedIn, AppSignedOut, AppSignInButton} from '@/lib/auth';

export default function AdminLayout({children}: {children: React.ReactNode}) {
  const {locale} = useParams<{locale: string}>();
  return <div className="admin-shell"><AppSignedOut><div className="form-card"><h1>Staff sign in</h1><p>This area is restricted to AllensNothern administrators.</p><AppSignInButton><button className="button">Sign in</button></AppSignInButton></div></AppSignedOut>
    <AppSignedIn><AdminGate><header className="admin-heading"><span>AllensNothern</span><h1>Restaurant dashboard</h1><p>Orders, food, delivery and sales in one place.</p></header><AdminNav locale={locale}/><div className="admin-content">{children}</div></AdminGate></AppSignedIn></div>;
}
