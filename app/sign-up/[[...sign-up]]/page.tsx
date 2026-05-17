import Link from 'next/link';
import { isClerkConfigured } from '@/lib/clerk-config';

export default async function Page() {
  if (!isClerkConfigured()) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--color-background)] p-6 text-center">
        <h1 className="text-2xl font-semibold brand-gradient">Goossip — modo demo</h1>
        <p className="max-w-md text-sm text-[var(--color-muted-foreground)]">
          La autenticación con Clerk no está configurada todavía. Visita el dashboard sin login.
        </p>
        <Link href="/dashboard" className="btn-brand rounded-md px-4 py-2 text-sm font-medium">
          Entrar al dashboard
        </Link>
      </main>
    );
  }
  const { SignUp } = await import('@clerk/nextjs');
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-background)] p-6">
      <SignUp appearance={{ variables: { colorPrimary: '#fff' } }} />
    </main>
  );
}
