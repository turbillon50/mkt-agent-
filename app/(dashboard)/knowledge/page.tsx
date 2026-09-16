import { redirect } from 'next/navigation';
import { orgContextOrNull } from '@/lib/org';
import { visibleProjects } from '@/lib/project-access';

export const dynamic = 'force-dynamic';

/**
 * Lo que sabe el vendedor.
 *
 * Desde la corrida 3 esta sección vive DENTRO del proyecto. La ruta vieja se
 * queda como desvío: hay enlaces guardados, correos y marcadores apuntando aquí
 * y romperlos no le arregla nada a nadie.
 */
export default async function Page() {
  const ctx = await orgContextOrNull();
  if (!ctx) redirect('/onboarding');
  const visible = await visibleProjects(ctx);
  if (visible.length === 0) redirect('/projects/new');
  const activo = visible.find((v) => v.project.id === ctx.activeProjectId) ?? visible[0];
  redirect(`/projects/${activo.project.id}/conocimiento`);
}
