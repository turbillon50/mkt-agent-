import { TeamBoard } from '@/components/projects/team-board';
import { ProjectHeader } from '@/components/projects/project-header';
import { guardProject } from '@/components/projects/project-guard';

export const dynamic = 'force-dynamic';

export default async function EquipoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardProject(id, 'equipo');
  if ('denied' in guard) return guard.denied;
  const { project, projectRole } = guard.ctx;

  return (
    <div className="space-y-5">
      <ProjectHeader
        projectId={id}
        name={project.name}
        kind={project.kind}
        role={projectRole}
        section="Equipo"
        description="Quién entra a este proyecto y qué puede hacer aquí."
      />
      <TeamBoard projectId={id} />
    </div>
  );
}
