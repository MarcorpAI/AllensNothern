import type {Metadata, Viewport} from 'next';
import {PwaRegister} from '@/components/pwa-register';
import {AuthProvider} from '@/lib/auth';
import './globals.css';

export const metadata: Metadata = {
  title: {default: 'AllensNothern', template: '%s · AllensNothern'},
  description: 'Fresh comfort food delivered locally in Istanbul.',
  manifest: '/manifest.webmanifest'
};
export const viewport: Viewport = {themeColor: '#F7F3EA', width: 'device-width', initialScale: 1};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return <html suppressHydrationWarning><body><AuthProvider><PwaRegister/>{children}</AuthProvider></body></html>;
}
