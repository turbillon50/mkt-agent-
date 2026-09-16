import { redirect } from 'next/navigation';
import { orgContextOrNull } from '@/lib/org';
import { visibleProjects } from '@/lib/project-access';

export const dynamic = 'force-dynamic';

/**
 * Los anuncios de Google son campañas de UN proyecto, no de la cuenta entera.
 * La ruta vieja se queda como desvío.
 */
export default async function Page() {
  const ctx = await orgContextOrNull();
  if (!ctx) redirect('/onboarding');
  const visible = await visibleProjects(ctx);
  if (visible.length === 0) redirect('/projects/new');
  const activo = visible.find((v) => v.project.id === ctx.activeProjectId) ?? visible[0];
  redirect(`/projects/${activo.project.id}/campanas`);
}
