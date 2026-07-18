import {notFound} from 'next/navigation';
import {OrderTracker} from '@/components/order-tracker';
import {trackOrder} from '@/lib/api';

export default async function OrderPage({params}: {params: Promise<{locale: string; token: string}>}) {
  const {locale, token} = await params;
  try {
    const order = await trackOrder(token);
    return <div className="section"><OrderTracker token={token} locale={locale} initial={order}/></div>;
  } catch {notFound();}
}

