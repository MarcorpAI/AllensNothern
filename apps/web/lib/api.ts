import type {MenuResponse, Order} from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';
type NextRequestInit = RequestInit & {next?: {revalidate?: number; tags?: string[]}};

async function request<T>(path: string, init?: NextRequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({detail: 'Something went wrong'}));
    throw new Error(body.detail ?? 'Something went wrong');
  }
  return response.json() as Promise<T>;
}

export async function getMenu(locale: string): Promise<MenuResponse> {
  try {
    return await request<MenuResponse>(`/menu?locale=${locale}`, {
      next: {revalidate: 15, tags: [`menu:${locale}`]}
    });
  } catch (error) {
    console.error('Menu request failed', error);
    return {locale: locale === 'tr' ? 'tr' : 'en', is_open: false, categories: []};
  }
}

export async function trackOrder(token: string): Promise<Order> {
  return request<Order>(`/orders/track/${encodeURIComponent(token)}`, {cache: 'no-store'});
}

export {API_URL, request};
