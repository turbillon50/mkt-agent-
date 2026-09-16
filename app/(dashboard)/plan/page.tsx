import { redirect } from 'next/navigation';
import { orgContextOrNull } from '@/lib/org';
import { visibleProjects } from '@/lib/project-access';

export const dynamic = 'force-dynamic';

/**
 * Calendario GLOBAL: desvío a la vista "Semana" del Contenido del proyecto.
 *
 * Un calendario que mezcla el contenido de tres clientes no sirve para planear
 * el de ninguno: lo que se quiere ver es "qué sale esta semana de ESTE cliente,
 * en qué red y qué día". Eso es la vista Semana de Contenido, donde además cada
 * pieza trae su estado de aprobación — que es la pregunta que de verdad se hace
 * quien abre un calendario de contenido.
 */
export default async function PlanPage() {
  const ctx = await orgContextOrNull();
  if (!ctx) redirect('/onboarding');
  const visible = await visibleProjects(ctx);
  if (visible.length === 0) redirect('/projects/new');
  const activo = visible.find((v) => v.project.id === ctx.activeProjectId) ?? visible[0];
  redirect(`/projects/${activo.project.id}/contenido?vista=semana`);
}
