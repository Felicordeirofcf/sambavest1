import type { Metadata, Viewport } from 'next';
import { Inter, Poppins } from 'next/font/google';
import './globals.css';

import Header from '../components/layout/Header';
import Minicart from '../components/layout/Minicart';
import Footer from '../components/layout/Footer';
import WhatsAppButton from '../components/layout/WhatsAppButton';
import { FREE_SHIPPING_THRESHOLD } from '../lib/shipping';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-poppins',
});

export const viewport: Viewport = {
  themeColor: '#0B1B34',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL('https://www.sambavest.com.br'),
  title: {
    default: 'Samba Vest | Camisas Oficiais de Enredo',
    template: '%s | Samba Vest',
  },
  description: `Samba Vest — camisas oficiais de enredo das escolas campeãs do carnaval. Estampas exclusivas, tecido leve e de secagem rápida, do P ao EXG. Frete Grátis acima de R$${FREE_SHIPPING_THRESHOLD}.`,
  keywords: [
    'camisa de enredo',
    'samba vest',
    'carnaval',
    'escola de samba',
    'beija-flor',
    'viradouro',
    'camisa de escola de samba',
    'fantasia de carnaval',
  ],

  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    // 🚀 CORRIGIDO AQUI: Estava apontando para atelie-ebon.vercel.app
    url: 'https://www.sambavest.com.br', 
    siteName: 'Samba Vest',
    title: 'Samba Vest | Camisas Oficiais de Enredo',
    description:
      'Vista a emoção do carnaval. Camisas oficiais de enredo das escolas campeãs, do P ao EXG.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Samba Vest — Camisas Oficiais de Enredo',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Samba Vest | Camisas Oficiais de Enredo',
    description: 'Vista a emoção do carnaval. Camisas oficiais de enredo das escolas campeãs.',
    images: ['/og-image.png'],
  },

  icons: {
    icon: '/icon-mark.png',
    apple: '/apple-touch-icon.png',
    shortcut: '/favicon.ico',
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${inter.variable} ${poppins.variable} ${inter.className} bg-[#FAF7EF] text-[#1E2233] antialiased`}
      >
        <Header />

        <main className="min-h-screen">{children}</main>

        <Minicart />
        <Footer />
        <WhatsAppButton />
      </body>
    </html>
  );
}