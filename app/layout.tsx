import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Header } from '@/components/organisms/Header/Header';
import { Footer } from '@/components/organisms/Footer/Footer';
import { CookieBanner } from '@/components/CookieBanner';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { WalletProviderWrapper } from '@/components/providers/WalletProviderWrapper';
import { FavoritesProvider } from '@/contexts/FavouritesContext';
import './globals.css';

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://farmcredit.app';
const siteName = 'FarmCredit';
const siteDescription = 'FarmCredit - Decentralized agricultural credit on Stellar';
const ogImage = '/icons/icon-512x512.png';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteName,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  applicationName: siteName,
  keywords: [
    'Stellar',
    'FarmCredit',
    'agriculture',
    'decentralized finance',
    'DeFi',
    'credit',
    'farming',
    'blockchain',
  ],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: siteName,
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    shortcut: '/icon-source.svg',
  },
  openGraph: {
    type: 'website',
    siteName,
    title: siteName,
    description: siteDescription,
    url: siteUrl,
    locale: 'en_US',
    images: [
      {
        url: ogImage,
        width: 512,
        height: 512,
        alt: `${siteName} - Decentralized agricultural credit on Stellar`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteName,
    description: siteDescription,
    images: [ogImage],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: '#14B6E7',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

import { QueryProvider } from '@/components/providers/QueryProvider';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="FarmCredit" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="font-sans antialiased">
        <Script id="theme-init" strategy="beforeInteractive">
          {`
            (function() {
              try {
                var stored = localStorage.getItem('theme');
                var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                var theme = stored === 'light' || stored === 'dark' ? stored : (prefersDark ? 'dark' : 'light');
                document.documentElement.classList.toggle('dark', theme === 'dark');
                document.documentElement.classList.add('no-transitions');
                window.addEventListener('load', function() {
                  document.documentElement.classList.remove('no-transitions');
                });
              } catch(e) {}
            })();
          `}
        </Script>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Skip to content
        </a>
        <QueryProvider>
          <WalletProviderWrapper>
            <FavoritesProvider>
              <ToastProvider>
                <CookieBanner />
                <Header />
                <main id="main" tabIndex={-1}>
                  {children}
                </main>
                <Footer />
              </ToastProvider>
            </FavoritesProvider>
          </WalletProviderWrapper>
        </QueryProvider>
      </body>
    </html>
  );
}
