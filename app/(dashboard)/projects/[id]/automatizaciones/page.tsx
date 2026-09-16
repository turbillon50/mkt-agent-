import { QueueBoard } from '@/components/sales/queue-board';
import { ProjectHeader } from '@/components/projects/project-header';
import { guardProject } from '@/components/projects/project-guard';

export const dynamic = 'force-dynamic';

export default async function AutomatizacionesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardProject(id, 'automatizaciones');
  if ('denied' in guard) return guard.denied;
  const { project, projectRole } = guard.ctx;

  return (
    <div className="space-y-5">
      <ProjectHeader
        projectId={id}
        name={project.name}
        kind={project.kind}
        role={projectRole}
        section="Automatizaciones"
        description="Lo que tu vendedor propone hacer y está esperando tu visto bueno."
      />
      <QueueBoard />
    </div>
  );
}
