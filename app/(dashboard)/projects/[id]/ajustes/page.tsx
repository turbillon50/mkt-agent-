import { ProjectHeader } from '@/components/projects/project-header';
import { guardProject } from '@/components/projects/project-guard';
import { ProjectSettings } from '@/components/projects/project-settings';
import { PanelAutonomia } from '@/components/projects/autonomia';

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
        description="El negocio, tu vendedor, cuánto hace solo y cuándo te avisa."
      />

      {/*
        La autonomía va ARRIBA de los ajustes de siempre. Es la decisión más
        grande que se toma en esta pantalla —cuánto puede hacer Goossip sin
        preguntar— y tenerla al final, después de la ciudad y el sitio web, la
        enterraba.
      */}
      <PanelAutonomia projectId={id} rules={(project.rules ?? {}) as Record<string, unknown>} />
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
