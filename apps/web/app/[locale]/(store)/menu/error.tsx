'use client';

import {useTranslations} from 'next-intl';

export default function MenuError({reset}: {error: Error & {digest?: string}; reset: () => void}) {
  const t = useTranslations('menu');
  return <div className="store-page store-menu-page">
    <div className="store-empty" role="alert">
      <p>{t('loadFailed')}</p>
      <button className="store-button primary" type="button" onClick={reset}>{t('retry')}</button>
    </div>
  </div>;
}
