import {getTranslations} from 'next-intl/server';
import {MenuClient} from '@/components/menu-client';
import {getMenu} from '@/lib/api';

export default async function MenuPage({params}: {params: Promise<{locale: string}>}) {
  const {locale} = await params;
  const [menu, t] = await Promise.all([getMenu(locale), getTranslations('menu')]);
  return <div className="store-page store-menu-page">
    {menu.categories.length ? <MenuClient menu={menu} locale={locale}/> : <div className="store-empty">{t('empty')}</div>}
  </div>;
}
