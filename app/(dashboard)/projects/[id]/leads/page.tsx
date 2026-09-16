import { SalesPipeline } from '@/components/sales/pipeline';
import { ProjectHeader } from '@/components/projects/project-header';
import { guardProject } from '@/components/projects/project-guard';

export const dynamic = 'force-dynamic';

/**
 * El pipeline de la corrida 1, dentro del proyecto. `guardProject` ya dejó este
 * proyecto activo, así que el tablero — que pide el proyecto activo por API —
 * mira exactamente el que está en la URL. Una sola implementación, no dos.
 */
export default async function LeadsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardProject(id, 'leads');
  if ('denied' in guard) return guard.denied;
  const { project, projectRole } = guard.ctx;

  return (
    <div className="space-y-5">
      <ProjectHeader
        projectId={id}
        name={project.name}
        kind={project.kind}
        role={projectRole}
        section="Leads"
        description="Toda la gente que levantó la mano, ordenada por qué tan caliente está."
      />
      <SalesPipeline />
    </div>
  );
}
