import Image from 'next/image';
import {HomeMenuClient} from '@/components/home-menu-client';
import {getMenu} from '@/lib/api';

export default async function Home({params}: {params: Promise<{locale: string}>}) {
  const {locale} = await params;
  const menu = await getMenu(locale);
  return <>
    <section className="brand-hero" aria-label="Allen's Northern Restaurant — One for the culture.">
      <Image className="brand-hero-doodles" src="/hero-doodles.png" alt="" fill priority sizes="100vw"/>
      <Image className="brand-hero-art" src="/hero-brand-v2.png" alt="Allen's Northern Restaurant. One for the culture." fill priority sizes="100vw"/>
    </section>
    <HomeMenuClient menu={menu} locale={locale}/>
  </>;
}
