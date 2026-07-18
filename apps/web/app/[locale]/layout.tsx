import {NextIntlClientProvider, hasLocale} from 'next-intl';
import {getMessages} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {locales} from '@/lib/i18n-request';
import {Header} from '@/components/header';
import {Footer} from '@/components/footer';

export function generateStaticParams() {return locales.map((locale) => ({locale}));}

export default async function LocaleLayout({children, params}: {
  children: React.ReactNode; params: Promise<{locale: string}>;
}) {
  const {locale} = await params;
  if (!hasLocale(locales, locale)) notFound();
  const messages = await getMessages();
  return <NextIntlClientProvider messages={messages}>
    <Header locale={locale}/><main>{children}</main><Footer/>
  </NextIntlClientProvider>;
}

