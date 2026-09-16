import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { isClerkConfigured } from '@/lib/clerk-config';
import { resolveOrg } from '@/lib/org';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Sin Clerk (entorno local sin llaves) el shell se muestra tal cual: es el
  // modo en el que se navega la app sin sesión.
  if (!isClerkConfigured()) {
    return <AppShell isAdmin={false}>{children}</AppShell>;
  }

  // `proxy.ts` ya mandó a /onboarding a quien no trae orgId en el token. Este
  // es el segundo candado, del lado del servidor: si el espejo dice que la org
  // no existe o está suspendida, tampoco se entra. Esconder el link no basta.
  const resolution = await resolveOrg();
  if (!resolution.ok) {
    if (resolution.problem === 'unauthenticated') redirect('/sign-in');
    redirect('/onboarding');
  }

  return (
    <AppShell
      isAdmin={resolution.ctx.user.isAdmin}
      orgName={resolution.ctx.org.name}
      role={resolution.ctx.role}
    >
      {children}
    </AppShell>
  );
}
