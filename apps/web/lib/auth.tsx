'use client';

import type {User} from '@supabase/supabase-js';
import {usePathname, useRouter} from 'next/navigation';
import {createContext, cloneElement, isValidElement, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {createClient} from '@/lib/supabase/client';

type TestRole = '' | 'customer' | 'admin';
type AuthContextValue = {
  getToken: () => Promise<string | null>;
  isLoaded: boolean;
  isSignedIn: boolean;
  signOut: () => Promise<void>;
  user: User | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const e2eEnabled = process.env.NEXT_PUBLIC_E2E_AUTH_ENABLED === 'true';

function readTestRole(): TestRole {
  if (!e2eEnabled || typeof document === 'undefined') return '';
  const value = document.cookie.match(/(?:^|; )e2e-auth=(customer|admin)(?:;|$)/)?.[1];
  return value === 'customer' || value === 'admin' ? value : '';
}

export function AuthProvider({children}: {children: React.ReactNode}) {
  const router = useRouter();
  const [testRole, setTestRole] = useState<TestRole>('');
  const [user, setUser] = useState<User | null>(null);
  const [isLoaded, setLoaded] = useState(false);
  const supabase = useMemo(() => e2eEnabled ? null : createClient(), []);

  useEffect(() => {
    if (e2eEnabled) {
      setTestRole(readTestRole());
      setLoaded(true);
      return;
    }
    if (!supabase) return;
    void supabase.auth.getUser().then(async ({data, error}) => {
      if (error?.code === 'refresh_token_not_found') {
        await supabase.auth.signOut({scope: 'local'});
      }
      setUser(data.user);
      setLoaded(true);
    });
    const {data: listener} = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoaded(true);
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  const getToken = useCallback(async () => {
    if (e2eEnabled) return testRole ? `test_e2e-${testRole}_${testRole}` : null;
    return (await supabase!.auth.getSession()).data.session?.access_token ?? null;
  }, [supabase, testRole]);

  const signOut = useCallback(async () => {
    if (e2eEnabled) {
      document.cookie = 'e2e-auth=; Max-Age=0; Path=/; SameSite=Lax';
      setTestRole('');
    } else {
      await supabase!.auth.signOut();
      setUser(null);
    }
    router.refresh();
  }, [router, supabase]);

  const value = useMemo<AuthContextValue>(() => ({
    getToken,
    isLoaded,
    isSignedIn: e2eEnabled ? Boolean(testRole) : Boolean(user),
    signOut,
    user
  }), [getToken, isLoaded, signOut, testRole, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAppAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAppAuth must be used within AuthProvider');
  return value;
}

export function AppSignedIn({children}: {children: React.ReactNode}) {
  const {isLoaded, isSignedIn} = useAppAuth();
  return isLoaded && isSignedIn ? children : null;
}

export function AppSignedOut({children}: {children: React.ReactNode}) {
  const {isLoaded, isSignedIn} = useAppAuth();
  return isLoaded && !isSignedIn ? children : null;
}

export function AppSignInButton({children}: {children: React.ReactNode}) {
  const pathname = usePathname();
  const locale = pathname.split('/')[1] === 'tr' ? 'tr' : 'en';
  const router = useRouter();
  if (!isValidElement<{onClick?: () => void}>(children)) return children;
  return cloneElement(children, {onClick: () => router.push(`/${locale}/sign-in`)});
}

export function AppSignOutButton({children}: {children: React.ReactNode}) {
  const {signOut} = useAppAuth();
  if (!isValidElement<{onClick?: () => void}>(children)) return children;
  return cloneElement(children, {onClick: () => void signOut()});
}

export function AppUserButton() {
  const {signOut} = useAppAuth();
  return <button className="store-auth-button" type="button" onClick={() => void signOut()} aria-label="Sign out">Sign out</button>;
}
