import './globals.css';
import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata, Viewport } from 'next';
import { isClerkConfigured } from '@/lib/clerk-config';

export const metadata: Metadata = {
  title: 'Goossip — Tu agente social autónomo',
  description: 'Goossip AI: planea, redacta, publica y aprende en tus redes 24/7.',
  applicationName: 'Goossip',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Goossip',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  themeColor: '#0c0a18',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const body = (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
  if (!isClerkConfigured()) return body;
  return <ClerkProvider>{body}</ClerkProvider>;
}
