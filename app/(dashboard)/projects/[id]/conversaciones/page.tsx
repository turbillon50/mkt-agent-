import { ProjectHeader } from '@/components/projects/project-header';
import { guardProject } from '@/components/projects/project-guard';
import { BandejaSocial } from '@/components/projects/bandeja-social';

export const dynamic = 'force-dynamic';

/**
 * Conversaciones del proyecto, TODOS los canales.
 *
 * Antes esta pantalla leía la lista en el servidor y solo de `whatsapp / sms /
 * email`. La QA del 16-sep la marcó en rojo: MOMENTUM tenía 8 hilos vivos en
 * Instagram y uno en Messenger, y aquí no salía ninguno. Ahora la lista la lleva
 * un componente de cliente, que además deja contestar y pedirle al vendedor que
 * proponga la respuesta sin salir de aquí.
 */
export default async function ConversacionesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardProject(id, 'conversaciones');
  if ('denied' in guard) return guard.denied;
  const { project, projectRole } = guard.ctx;

  return (
    <div className="space-y-5">
      <ProjectHeader
        projectId={id}
        name={project.name}
        kind={project.kind}
        role={projectRole}
        section="Conversaciones"
        description="Messenger, DMs de Instagram y WhatsApp en un solo lugar. Contesta desde aquí."
      />
      <BandejaSocial projectId={id} />
    </div>
  );
}
