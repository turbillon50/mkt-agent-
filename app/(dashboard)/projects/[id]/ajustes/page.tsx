import { ProjectHeader } from '@/components/projects/project-header';
import { guardProject } from '@/components/projects/project-guard';
import { ProjectSettings } from '@/components/projects/project-settings';

export const dynamic = 'force-dynamic';

export default async function AjustesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardProject(id, 'ajustes');
  if ('denied' in guard) return guard.denied;
  const { project, projectRole } = guard.ctx;

  return (
    <div className="space-y-5">
      <ProjectHeader
        projectId={id}
        name={project.name}
        kind={project.kind}
        role={projectRole}
        section="Ajustes"
        description="El negocio, tu vendedor y cuándo te avisa."
      />
      <ProjectSettings
        projectId={id}
        editable={guard.ctx.can('administrar')}
        initial={{
          name: project.name,
          kind: project.kind,
          website: project.website ?? '',
          city: project.city ?? '',
          country: project.country ?? '',
          sellerPersona: project.sellerPersona ?? '',
          audience: project.audience ?? '',
          rules: project.rules ?? {},
        }}
      />
    </div>
  );
}
