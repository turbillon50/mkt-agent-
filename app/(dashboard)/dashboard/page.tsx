import { redirect } from 'next/navigation';
import { orgContextOrNull } from '@/lib/org';
import { visibleProjects } from '@/lib/project-access';

export const dynamic = 'force-dynamic';

/**
 * `/dashboard` ya no es una pantalla: es un desvío.
 *
 * Desde la corrida 3 el centro es el PROYECTO, así que quien llega aquí — por
 * un enlace viejo, por el retorno de Clerk o por el selector de organización —
 * cae en su proyecto activo. Y si todavía no tiene ninguno, en el alta: un
 * panel vacío no le dice a nadie qué hacer.
 */
export default async function DashboardPage() {
  const ctx = await orgContextOrNull();
  if (!ctx) redirect('/onboarding');

  const visible = await visibleProjects(ctx);
  if (visible.length === 0) redirect('/projects/new');

  const activo =
    visible.find((v) => v.project.id === ctx.activeProjectId) ?? visible[0];
  redirect(`/projects/${activo.project.id}`);
}
