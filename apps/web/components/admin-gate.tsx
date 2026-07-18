'use client';

import {useCallback, useEffect, useState} from 'react';
import {AdminApiError, adminRequest} from '@/lib/admin-api';
import {AppSignOutButton, useAppAuth} from '@/lib/auth';

type AccessState = 'checking' | 'allowed' | 'denied' | 'expired' | 'unavailable';

export function AdminGate({children}: {children: React.ReactNode}) {
  const {getToken} = useAppAuth();
  const [access, setAccess] = useState<AccessState>('checking');

  const checkAccess = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) {
        setAccess('expired');
        return;
      }
      await adminRequest('/access', token);
      setAccess('allowed');
    } catch (reason) {
      if (reason instanceof AdminApiError && reason.status === 401) setAccess('expired');
      else if (reason instanceof AdminApiError && reason.status === 403) setAccess('denied');
      else setAccess('unavailable');
    }
  }, [getToken]);

  useEffect(() => {
    void checkAccess();
    const interval = window.setInterval(() => void checkAccess(), 60_000);
    window.addEventListener('focus', checkAccess);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', checkAccess);
    };
  }, [checkAccess]);

  if (access === 'checking') return <div className="form-card"><h2>Checking access…</h2><p>Please wait a moment.</p></div>;
  if (access === 'allowed') return children;

  const expired = access === 'expired';
  return <div className="form-card admin-access-message">
    <h2>{expired ? 'Your session has ended' : access === 'denied' ? 'Administrator access required' : 'Could not verify access'}</h2>
    <p>{expired ? 'Sign in again to continue.' : access === 'denied' ? 'This account is signed in but has not been approved as a restaurant administrator.' : 'The authentication service could not be reached. Please try again.'}</p>
    {access === 'unavailable' && <button className="button" type="button" onClick={() => {setAccess('checking'); void checkAccess();}}>Try again</button>}
    {access !== 'unavailable' && <AppSignOutButton><button className="button" type="button">Sign out</button></AppSignOutButton>}
  </div>;
}
