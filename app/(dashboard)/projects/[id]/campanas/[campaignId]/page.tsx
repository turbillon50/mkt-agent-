import { notFound } from 'next/navigation';
import { ProjectHeader } from '@/components/projects/project-header';
import { guardProject } from '@/components/projects/project-guard';
import { CampaignDetail } from '@/components/marketing/campaign-detail';
import { campaignCounts, campaignLeads, getCampaign, toSummary } from '@/src/marketing/campaigns';
import { projectConnections } from '@/src/projects/connections';

export const dynamic = 'force-dynamic';

/**
 * Una campaña por dentro: qué es, qué trajo y cómo se apaga.
 *
 * Los leads se leen en el servidor y no por `fetch` del navegador: ya pasamos
 * por la puerta del proyecto aquí, y una segunda vuelta a la API para lo mismo
 * es una pantalla que parpadea sin razón.
 */
export default async function CampanaPage({
  params,
}: {
  params: Promise<{ id: string; campaignId: string }>;
}) {
  const { id, campaignId } = await params;
  const guard = await guardProject(id, 'campanas');
  if ('denied' in guard) return guard.denied;
  const { project, projectRole, orgId, can } = guard.ctx;

  const campana = await getCampaign(orgId, id, campaignId);
  if (!campana) notFound();

  const [conteo, leads, conexiones] = await Promise.all([
    campaignCounts(orgId, id, campaignId),
    campaignLeads(orgId, id, campaignId),
    projectConnections(project),
  ]);

  // El nombre que el cliente le puso a cada formulario en Facebook. Se resuelve
  // aquí y no se guarda en la campaña: si lo renombran en Facebook, guardarlo
  // dejaría la pantalla diciendo el nombre viejo para siempre.
  const meta = conexiones.cards.find((c) => c.id === 'meta');
  const formularios = [
    ...((meta?.data.available_forms ?? []) as Array<{ id: string; name: string }>),
    ...((meta?.data.forms ?? []) as Array<{ id: string; name: string }>),
  ];
  const nombresDeFormulario = Object.fromEntries(formularios.map((f) => [f.id, f.name]));

  return (
    <div className="space-y-6">
      <ProjectHeader
        projectId={id}
        name={project.name}
        kind={project.kind}
        role={projectRole}
        section={campana.name}
        description={`Campaña de ${project.name}`}
      />

      <CampaignDetail
        projectId={id}
        campana={toSummary(campana, conteo)}
        leads={leads.map((l) => ({
          id: l.id,
          nombre: l.fullName,
          telefono: l.phone,
          etapa: l.stage,
          grado: l.grade,
          puntaje: l.score,
          creado: l.createdAt.toISOString(),
        }))}
        nombresDeFormulario={nombresDeFormulario}
        puedeEditar={can('operar')}
        puedeBorrar={can('administrar')}
      />
    </div>
  );
}
