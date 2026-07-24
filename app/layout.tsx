import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Header } from '@/components/organisms/Header/Header';
import { Footer } from '@/components/organisms/Footer/Footer';
import { WalletProvider } from '@/contexts/WalletContext';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://farmcredit.app';
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
      <body className={`${inter.variable} font-sans antialiased`}>
        <WalletProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-50 bg-stellar-blue text-stellar-navy px-4 py-2 rounded-md font-semibold focus:ring-2 focus:ring-stellar-blue focus:ring-offset-2"
          >
            Skip to main content
          </a>
          {children}
          <Footer />
        </WalletProvider>
      </body>
    </html>
  );
}
