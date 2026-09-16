import Link from 'next/link';
import { AdsCampaigns } from '@/components/ads/campaigns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConnectionBadge } from '@/components/projects/connection-badge';
import { ProjectHeader } from '@/components/projects/project-header';
import { guardProject } from '@/components/projects/project-guard';
import { googleAdsAvailable, projectConnections } from '@/src/projects/connections';

export const dynamic = 'force-dynamic';

/**
 * Campañas: ANUNCIOS, no proyectos.
 *
 * Hasta la corrida 2 "campaña" era el contenedor de todo y el proyecto vivía
 * dentro. Se dio la vuelta: el contenedor es el proyecto y campaña vuelve a
 * significar lo único que siempre significó para quien vende — la pauta que
 * trae gente.
 */
export default async function CampanasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardProject(id, 'campanas');
  if ('denied' in guard) return guard.denied;
  const { project, projectRole } = guard.ctx;

  const { cards } = await projectConnections(project);
  const meta = cards.find((c) => c.id === 'meta');
  // Los elegidos traen solo id y nombre; los disponibles traen además cuántos
  // leads lleva Facebook para ese formulario. Se pintan juntos, así que el tipo
  // deja el conteo opcional en vez de mentirle a uno de los dos.
  const formularios = (meta?.data.forms ?? []) as Array<{
    id: string;
    name: string;
    leadsCount?: number;
  }>;
  const disponibles = (meta?.data.available_forms ?? []) as Array<{
    id: string;
    name: string;
    leadsCount?: number;
  }>;
  const googleListo = googleAdsAvailable();

  return (
    <div className="space-y-6">
      <ProjectHeader
        projectId={id}
        name={project.name}
        kind={project.kind}
        role={projectRole}
        section="Campañas"
        description="Tus anuncios: de dónde viene la gente que llega a este proyecto."
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Anuncios de Facebook e Instagram</h2>
        {meta?.state !== 'conectado' ? (
          <Card>
            <CardContent className="space-y-3 py-8 text-center">
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Conecta Facebook para ver de qué anuncios te llegan los leads.
              </p>
              <Button asChild className="btn-brand">
                <Link href={`/projects/${id}/conexiones`}>Ir a Conexiones</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-[var(--color-border)]">
                {(disponibles.length > 0 ? disponibles : formularios).map((f) => {
                  const activo = formularios.some((x) => x.id === f.id);
                  const leads = typeof f.leadsCount === 'number' ? f.leadsCount : null;
                  return (
                    <li key={f.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{f.name}</p>
                        {leads !== null && (
                          <p className="text-[11px] text-[var(--color-muted-foreground)]">
                            {leads} {leads === 1 ? 'lead' : 'leads'} en Facebook
                          </p>
                        )}
                      </div>
                      <ConnectionBadge state={activo ? 'conectado' : 'sin_conectar'} />
                    </li>
                  );
                })}
                {disponibles.length === 0 && formularios.length === 0 && (
                  <li className="px-5 py-8 text-center text-sm text-[var(--color-muted-foreground)]">
                    Esta página todavía no tiene formularios de anuncios.
                  </li>
                )}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Anuncios de Google</h2>
          {!googleListo && <ConnectionBadge state="proximamente" />}
        </div>
        {googleListo ? (
          <AdsCampaigns />
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-sm text-[var(--color-muted-foreground)]">
              Pronto vas a poder administrar tus campañas de Google desde aquí.
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
