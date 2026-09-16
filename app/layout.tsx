import './globals.css';
import { ClerkProvider } from '@clerk/nextjs';
import { esMX } from '@clerk/localizations';
import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { isClerkConfigured } from '@/lib/clerk-config';
import { PWABoot } from '@/components/pwa';
import { ToastProvider } from '@/components/ui/toast-provider';

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
    <html
      lang="es"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="min-h-screen antialiased">
        <ToastProvider>
          {children}
          <PWABoot />
        </ToastProvider>
      </body>
    </html>
  );
  if (!isClerkConfigured()) return body;
  /**
   * Clerk en español mexicano.
   *
   * `shimmer: false` quita el brillito de carga de los widgets, que no pega con
   * el resto de la app.
   *
   * Sobre el "Secured by Clerk": MEDIDO el 16-sep-2026. Se intentó quitarlo por
   * la Backend API — `PATCH /v1/instance` con `branded:false`, `clerk_branding`
   * y `show_clerk_branding` devuelve **204** las tres veces y el entorno sigue
   * respondiendo `display_config.branded = true`. No se puede desde código en
   * este plan, y taparlo con CSS sería violar los términos de Clerk. Queda
   * declarado como bloqueo de Luis: es un botón del plan, no una línea de aquí.
   */
  return (
    <ClerkProvider localization={esMX} appearance={{ layout: { shimmer: false } }}>
      {body}
    </ClerkProvider>
  );
}
