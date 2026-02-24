import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Header } from '@/components/organisms/Header/Header';
import { Footer } from '@/components/organisms/Footer/Footer';
import './globals.css';
import { WalletProviderWrapper } from '@/components/providers/WalletProviderWrapper';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'FarmCredit',
  description: 'FarmCredit - Decentralized agricultural credit on Stellar',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'FarmCredit',
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
  const themeInitScript = `
    (function () {
      try {
        var storedTheme = localStorage.getItem("theme");
        var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        var useDark = storedTheme ? storedTheme === "dark" : prefersDark;
        document.documentElement.classList.toggle("dark", useDark);
      } catch {
        document.documentElement.classList.remove("dark");
      }
    })();
  `;

  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="FarmCredit" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <WalletProviderWrapper>
          <Header />
          <main id="main-content" className="min-h-[calc(100vh-4rem)]">
            {children}
          </main>
          <Footer />
        </WalletProviderWrapper>
      </body>
    </html>
  );
}
