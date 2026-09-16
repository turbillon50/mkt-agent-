import { redirect } from 'next/navigation';
import { IconLogoMark } from '@/components/icons';
import { isClerkConfigured } from '@/lib/clerk-config';
import { getOrCreateUser } from '@/lib/users';
import { listProjects } from '@/lib/projects';
import { OnboardingForm } from '@/components/projects/onboarding-form';

export const dynamic = 'force-dynamic';

/**
 * Alta del tenant + su primer proyecto en un solo paso. Solo pide lo mínimo
 * (nombre, tipo, persona del vendedor): ley de Luis, primero se entra y se
 * navega, los canales se conectan después.
 */
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

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-background)] px-6 py-12 text-center">
        <p className="max-w-md text-sm text-[var(--color-muted-foreground)]">
          {dbError
            ? `No pudimos preparar tu cuenta: ${dbError}`
            : 'Necesitas iniciar sesión para continuar.'}
        </p>
      </div>
    );
  }

  const projects = await listProjects(user.id).catch(() => []);
  if (projects.length > 0) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-background)] px-6 py-12">
      <div className="w-full max-w-lg space-y-6 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[var(--color-brand-1)] to-[var(--color-brand-3)] text-white shadow-lg shadow-[var(--color-primary)]/25">
          <IconLogoMark className="h-7 w-7" />
        </div>

        <div>
          <h1 className="text-2xl font-semibold">
            ¡Bienvenido, {user.firstName ?? 'a Goossip'}!
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            Un proyecto es un negocio con su propio vendedor: sus canales, sus campañas y sus
            leads. Crea el primero — puedes entrar y navegar todo el panel antes de conectar nada.
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 text-left card-glow">
          <OnboardingForm />
        </div>

        <p className="text-xs text-[var(--color-muted-foreground)]">
          ¿Prefieres explorar primero?{' '}
          <a href="/dashboard" className="text-[var(--color-primary)] hover:underline">
            Ir al dashboard
          </a>
        </p>
      </div>
    </div>
  );
}
