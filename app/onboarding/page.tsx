import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { isClerkConfigured } from '@/lib/clerk-config';
import { getOrCreateUser } from '@/lib/users';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  if (!isClerkConfigured()) {
    redirect('/dashboard');
  }

  let user = null;
  let dbError: string | null = null;
  try {
    user = await getOrCreateUser();
  } catch (e) {
    dbError = e instanceof Error ? e.message : 'unknown';
  }

  if (user) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-background)] px-6 py-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-pink-500">
        <Sparkles className="h-7 w-7 text-white" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold brand-gradient">¡Bienvenido a Goossip!</h1>
      <p className="mt-3 max-w-md text-sm text-[var(--color-muted-foreground)]">
        Estamos preparando tu cuenta. Si esta página no avanza sola en 5 segundos, dale al botón.
      </p>

      {dbError && (
        <p className="mt-4 max-w-md rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
          Error preparando tu perfil: {dbError}
        </p>
      )}

      <Link
        href="/dashboard"
        className="btn-brand mt-8 inline-flex items-center justify-center rounded-md px-6 py-3 text-sm font-medium shadow-lg shadow-fuchsia-500/30"
      >
        Continuar al dashboard
      </Link>

      <script
        dangerouslySetInnerHTML={{
          __html: `setTimeout(() => { window.location.href = '/dashboard'; }, 1200);`,
        }}
      />
    </div>
  );
}
