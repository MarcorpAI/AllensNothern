import {createServerClient} from '@supabase/ssr';
import createMiddleware from 'next-intl/middleware';
import type {NextRequest} from 'next/server';
import {locales} from './lib/i18n-request';

const intlMiddleware = createMiddleware({locales, defaultLocale: 'en', localePrefix: 'always'});

export default async function middleware(request: NextRequest) {
  const response = intlMiddleware(request);
  if (process.env.NEXT_PUBLIC_E2E_AUTH_ENABLED === 'true') return response;

  // Home and menu pages are public and do not need to wait for an auth refresh.
  // AuthProvider still handles sign-in state in the browser.
  if (/^\/(?:en|tr)(?:\/menu(?:\/.*)?|\/?)$/.test(request.nextUrl.pathname)) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headersToSet) => {
          cookiesToSet.forEach(({name, value, options}) => response.cookies.set(name, value, options));
          Object.entries(headersToSet).forEach(([name, value]) => response.headers.set(name, value));
        }
      }
    }
  );
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)'
  ]
};
