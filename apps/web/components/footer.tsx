import {useTranslations} from 'next-intl';

export function Footer() {
  const t = useTranslations('footer');
  return <footer className="store-footer"><div className="store-brand light">ALLENS<span>NOTHERN</span></div><p>{t('tagline')}</p><small>© {new Date().getFullYear()} AllensNothern · <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a></small></footer>;
}
