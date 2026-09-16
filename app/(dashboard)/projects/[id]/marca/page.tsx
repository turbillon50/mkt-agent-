import { ProjectHeader } from '@/components/projects/project-header';
import { guardProject } from '@/components/projects/project-guard';
import { BrandKitBoard } from '@/components/marca/brand-kit-board';
import { AuditoriaDeMarca } from '@/components/marca/auditoria';
import { getBrandKit } from '@/src/creative/brand-kit';

export const dynamic = 'force-dynamic';

export default async function MarcaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardProject(id, 'marca');
  if ('denied' in guard) return guard.denied;
  const { project, projectRole, orgId, can } = guard.ctx;

  const kit = await getBrandKit(orgId, id).catch(() => null);

  return (
    <div className="space-y-5">
      <ProjectHeader
        projectId={id}
        name={project.name}
        kind={project.kind}
        role={projectRole}
        section="Marca"
        description="Tu logo, tus colores y tu forma de hablar. Todo lo que Goossip haga para este proyecto sale de aquí."
      />

      <BrandKitBoard
        projectId={id}
        puedeEditar={can('operar')}
        inicial={
          kit
            ? {
                logoUrl: kit.logoUrl,
                paleta: kit.paleta,
                tipografias: kit.tipografias,
                tono: kit.tono,
                palabrasProhibidas: kit.palabrasProhibidas,
                aprobadoPor: kit.aprobadoPor,
                aprobadoEn: kit.aprobadoEn?.toISOString() ?? null,
              }
            : null
        }
      />

      {/*
        La auditoría va DEBAJO del kit y no arriba: primero se define cómo debe
        verse la marca, después se mide si lo que sale se le parece. Al revés no
        hay contra qué medir.
      */}
      <AuditoriaDeMarca projectId={id} />
    </div>
  );
}
