import { redirect } from 'next/navigation';
import { orgContextOrNull } from '@/lib/org';
import { visibleProjects } from '@/lib/project-access';

export const dynamic = 'force-dynamic';

/**
 * Competencia GLOBAL: desvío.
 *
 * Desde la corrida 7 la competencia vive DENTRO del proyecto. No es un cambio
 * de menú: la competencia de V&LIVING no es la de MOMENTUM, y una lista de
 * rivales compartida por tres clientes de la misma agencia no le sirve a
 * ninguno. La ruta se queda porque hay marcadores y enlaces apuntando aquí, y
 * romperlos no le arregla nada a nadie.
 */
export default async function CompetenciaGlobalPage() {
  const ctx = await orgContextOrNull();
  if (!ctx) redirect('/onboarding');
  const visible = await visibleProjects(ctx);
  if (visible.length === 0) redirect('/projects/new');
  const activo = visible.find((v) => v.project.id === ctx.activeProjectId) ?? visible[0];
  redirect(`/projects/${activo.project.id}/competencia`);
}
