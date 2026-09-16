import { Suspense } from 'react';
import { ConnectionsBoard } from '@/components/projects/connections-board';
import { ProjectHeader } from '@/components/projects/project-header';
import { guardProject } from '@/components/projects/project-guard';

export const dynamic = 'force-dynamic';

export default async function ConexionesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardProject(id, 'conexiones');
  if ('denied' in guard) return guard.denied;
  const { project, projectRole } = guard.ctx;

  return (
    <div className="space-y-5">
      <ProjectHeader
        projectId={id}
        name={project.name}
        kind={project.kind}
        role={projectRole}
        section="Conexiones"
        description="Por dónde entran tus leads y por dónde les contesta tu vendedor."
      />
      {/* `useSearchParams` lee la vuelta de Facebook: Next exige el Suspense. */}
      <Suspense>
        <ConnectionsBoard projectId={id} />
      </Suspense>
    </div>
  );
}
