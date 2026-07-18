import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {DishDetailClient} from '@/components/dish-detail-client';
import {getMenu} from '@/lib/api';

type PageProps = {params: Promise<{locale: string; itemId: string}>};

async function getItem(locale: string, itemId: string) {
  const menu = await getMenu(locale);
  return {menu, item: menu.categories.flatMap((category) => category.items).find((candidate) => candidate.id === itemId)};
}

export async function generateMetadata({params}: PageProps): Promise<Metadata> {
  const {locale, itemId} = await params;
  const {item} = await getItem(locale, itemId);
  return item ? {title: item.name, description: item.description} : {};
}

export default async function DishPage({params}: PageProps) {
  const {locale, itemId} = await params;
  const {item} = await getItem(locale, itemId);
  if (!item) notFound();
  return <DishDetailClient item={item} locale={locale}/>;
}
