import { redirect } from 'next/navigation';
import { orgContextOrNull } from '@/lib/org';
import { visibleProjects } from '@/lib/project-access';

export const dynamic = 'force-dynamic';

/**
 * Prospección GLOBAL: desvío.
 *
 * Desde la corrida 7 la prospección es una pestaña de Leads DENTRO del
 * proyecto: los prospectos de un cliente no son los del otro, y el contador de
 * búsquedas de Google Maps —que cuesta dinero— se lleva por proyecto porque es
 * por proyecto que se paga.
 */
export default async function ProspectosGlobalPage() {
  const ctx = await orgContextOrNull();
  if (!ctx) redirect('/onboarding');
  const visible = await visibleProjects(ctx);
  if (visible.length === 0) redirect('/projects/new');
  const activo = visible.find((v) => v.project.id === ctx.activeProjectId) ?? visible[0];
  redirect(`/projects/${activo.project.id}/leads?vista=prospeccion`);
}
