import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ProjectHeader } from '@/components/projects/project-header';
import { guardProject } from '@/components/projects/project-guard';
import { CampaignsBoard } from '@/components/marketing/campaigns-board';
import { AdsCampaigns } from '@/components/ads/campaigns';
import { MetaAds } from '@/components/ads/meta-ads';
import { channelAvailable, googleAdsAvailable, projectConnections } from '@/src/projects/connections';
import type { ConnectionChannel } from '@/src/projects/types';

export const dynamic = 'force-dynamic';

/**
 * Campañas, EN PLURAL: un proyecto tiene muchas.
 *
 * Tres corridas con la palabra significando dos cosas a la vez se acaban aquí:
 *   · PROYECTO — el negocio del cliente. Es el contenedor. Vive en el menú.
 *   · CAMPAÑA  — una pauta concreta dentro del proyecto. Vive en esta pantalla,
 *                y "Nueva campaña" existe SOLO aquí. Nunca en el menú lateral.
 *
 * Los formularios de Facebook ya no son la pantalla: son un dato de la campaña.
 * Ver la lista de formularios sueltos no le decía a nadie cuánto trae cada
 * pauta; amarrados a una campaña, sí.
 */
export default async function CampanasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardProject(id, 'campanas');
  if ('denied' in guard) return guard.denied;
  const { project, projectRole } = guard.ctx;

  const { cards } = await projectConnections(project);
  const conectados = cards
    .filter((c) => c.state === 'conectado')
    .map((c) => c.id as ConnectionChannel);

  // Los formularios de lead ads de la página conectada: con ellos se amarra la
  // campaña a Meta, que es de donde sale la atribución de cada lead.
  const meta = cards.find((c) => c.id === 'meta');
  const disponibles = (meta?.data.available_forms ?? meta?.data.forms ?? []) as Array<{
    id: string;
    name: string;
    leadsCount?: number;
  }>;
  const googleListo = googleAdsAvailable();
  const metaAdsListo = channelAvailable('metaads');

  return (
    <div className="space-y-6">
      <ProjectHeader
        projectId={id}
        name={project.name}
        kind={project.kind}
        role={projectRole}
        section="Campañas"
        description="Cada pauta por separado: qué trae, cuánto cuesta y de cuál viene cada lead."
      />

      {meta?.state !== 'conectado' && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Conecta Facebook para que los leads de tus anuncios se cuenten solos en la campaña
              que los trajo.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href={`/projects/${id}/conexiones`}>Ir a Conexiones</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <CampaignsBoard
        projectId={id}
        canalesConectados={conectados}
        formulariosMeta={disponibles}
      />

      {/*
        Corrida 11. Los anuncios de Meta van ANTES que los de Google porque es
        donde está la pauta de los clientes de hoy, y por lo mismo que los de
        Google: son de la cuenta del cliente, se leen de allá y se administran
        allá. Goossip aquí solo contesta "¿cuánto llevo gastado y cuánto me está
        costando cada lead?", que es la pregunta de cada mañana.
      */}
      {metaAdsListo && (
        <section className="space-y-3 border-t border-[var(--color-border)] pt-6">
          <div>
            <h2 className="text-lg font-semibold">Anuncios de Meta</h2>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Lo que está corriendo en tu cuenta de Meta Ads, lo que llevas gastado y cuánto te
              cuesta cada lead.
            </p>
          </div>
          <MetaAds projectId={id} />
        </section>
      )}

      {/*
        Los anuncios de Google son de la CUENTA de Google Ads, no de Goossip: se
        leen de allá y se prenden y apagan allá. Van abajo y separados a
        propósito — mezclarlos con las campañas de arriba haría creer que
        borrarlas aquí las apaga en Google, que no es así.
      */}
      {googleListo && (
        <section className="space-y-3 border-t border-[var(--color-border)] pt-6">
          <div>
            <h2 className="text-lg font-semibold">Anuncios de Google</h2>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Lo que ya está corriendo en tu cuenta de Google Ads.
            </p>
          </div>
          <AdsCampaigns />
        </section>
      )}
    </div>
  );
}
