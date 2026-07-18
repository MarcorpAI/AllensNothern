'use client';

import {useEffect} from 'react';

export function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV === 'production') {
      void navigator.serviceWorker.register('/sw.js', {updateViaCache: 'none'});
      return;
    }

    // A production worker registered on localhost survives later dev sessions
    // unless it is explicitly removed, where it can serve stale Next.js chunks.
    void navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())));
    if ('caches' in window) {
      void caches.keys().then((keys) => Promise.all(
        keys.filter((key) => key.startsWith('allensnothern-')).map((key) => caches.delete(key))
      ));
    }
  }, []);
  return null;
}
