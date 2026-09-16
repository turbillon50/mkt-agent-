import { redirect } from 'next/navigation';
import { IconLogoMark } from '@/components/icons';
import { isClerkConfigured } from '@/lib/clerk-config';
import { getOrCreateUser, ensureSocialAccounts } from '@/lib/users';
import { resolveOrg } from '@/lib/org';
import { listProjects } from '@/lib/projects';
import { CreateOrgStep } from '@/components/orgs/create-org-step';

export const dynamic = 'force-dynamic';

/**
 * Dos pasos, en este orden y sin brincos:
 *
 *   1. ORGANIZACIÓN — es el tenant. Sin ella no hay dónde colgar nada; la
 *      migración 0013 dejó `org_id NOT NULL` en todas las tablas de datos.
 *   2. PRIMER PROYECTO — se manda al asistente de tres pasos (`/projects/new`),
 *      que es donde vive el alta desde la corrida 3. Aquí ya no hay formulario:
 *      dos altas distintas del mismo objeto terminan separándose.
 *
 * Con las dos cosas listas, a su proyecto.
 */
export default async function OnboardingPage() {
  if (!isClerkConfigured()) {
    redirect('/dashboard');
  }

  let dbError: string | null = null;
  let user = null;
  try {
    user = await getOrCreateUser();
  } catch (e) {
    dbError = e instanceof Error ? e.message : 'unknown';
  }

  if (!user) {
    return (
      <Marco>
        <p className="max-w-md text-sm text-[var(--color-muted-foreground)]">
          {dbError
            ? `No pudimos preparar tu cuenta: ${dbError}`
            : 'Necesitas iniciar sesión para continuar.'}
        </p>
      </Marco>
    );
  }

  const resolution = await resolveOrg();

  // --- paso 1: no hay organización ------------------------------------------
  if (!resolution.ok) {
    if (resolution.problem === 'org_suspended') {
      return (
        <Marco>
          <div className="w-full max-w-lg space-y-3 text-center">
            <h1 className="text-2xl font-semibold">Organización suspendida</h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Esta organización está suspendida. Escríbele al administrador de Goossip para
              reactivarla.
            </p>
          </div>
        </Marco>
      );
    }

    return (
      <Marco>
        <div className="w-full max-w-lg space-y-6 text-center">
          <Logo />
          <div>
            <h1 className="text-2xl font-semibold">
              ¡Bienvenido, {user.firstName ?? 'a Goossip'}!
            </h1>
            <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
              Primero, tu <strong>organización</strong>: es la cuenta que agrupa a tu equipo, tus
              proyectos y tus leads. Puedes invitar gente después.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-2 text-left card-glow">
            <CreateOrgStep />
          </div>
        </div>
      </Marco>
    );
  }

  // --- paso 2: hay organización, ¿y proyecto? --------------------------------
  const { orgId } = resolution.ctx;
  await ensureSocialAccounts(orgId, user.id).catch(() => undefined);

  const projects = await listProjects(orgId).catch(() => []);
  if (projects.length > 0) {
    redirect('/dashboard');
  }

  // Ya hay organización y no hay proyectos: el alta de proyecto es una pantalla
  // de tres pasos con nombre propio, no un formulario incrustado aquí. Se manda
  // allá en vez de mantener dos formularios de alta que se van a ir separando.
  redirect('/projects/new');
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-background)] px-6 py-12">
      {children}
    </div>
  );
}

function Logo() {
  return (
    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[var(--color-brand-1)] to-[var(--color-brand-3)] text-white shadow-lg shadow-[var(--color-primary)]/25">
      <IconLogoMark className="h-7 w-7" />
    </div>
  );
}
