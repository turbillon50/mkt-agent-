import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { isClerkConfigured } from '@/lib/clerk-config';
import { resolveOrg } from '@/lib/org';
import { leerPreferencias, PANEL_POR_OMISION } from '@/src/assistant/preferencias';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Sin Clerk (entorno local sin llaves) el shell se muestra tal cual: es el
  // modo en el que se navega la app sin sesión.
  if (!isClerkConfigured()) {
    return (
      <AppShell isAdmin={false} panel={PANEL_POR_OMISION}>
        {children}
      </AppShell>
    );
  }

  // `proxy.ts` ya mandó a /onboarding a quien no trae orgId en el token. Este
  // es el segundo candado, del lado del servidor: si el espejo dice que la org
  // no existe o está suspendida, tampoco se entra. Esconder el link no basta.
  const resolution = await resolveOrg();
  if (!resolution.ok) {
    if (resolution.problem === 'unauthenticated') redirect('/sign-in');
    redirect('/onboarding');
  }

  // El ancho y el plegado del panel salen de aquí y no de una llamada del
  // cliente: es lo que permite que el script de arranque los tenga ANTES del
  // primer pintado cuando el navegador no los trae guardados.
  return (
    <AppShell
      isAdmin={resolution.ctx.user.isAdmin}
      orgName={resolution.ctx.org.name}
      panel={leerPreferencias(resolution.ctx.user.settings)}
    >
      {children}
    </AppShell>
  );
}
