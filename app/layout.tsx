import './globals.css';
import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { isClerkConfigured } from '@/lib/clerk-config';

export const metadata: Metadata = {
  title: 'Goossip — Tu agente social autónomo',
  description: 'Goossip AI: planea, redacta, publica y aprende en tus redes 24/7.',
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
