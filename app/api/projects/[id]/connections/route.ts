import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';
import { projectConnections } from '@/src/projects/connections';
import { listProjectEvents } from '@/src/projects/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Estado real de los canales del proyecto.
 *
 * Nunca devuelve un token: lo que sale son ids públicos, nombres y booleanos.
 * El `page_token` cifrado vive en la fila y no cruza esta frontera.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await apiProject(id, { section: 'conexiones' });
  if (!gate.ok) return gate.res;

  // `verificar` pregunta a Composio por cada cuenta ANTES de contestar: abrir
  // la pantalla es el único momento en que alguien va a creerle al verde, así
  // que es el momento de merecerlo. Regla del issue #33.
  const [connections, eventos] = await Promise.all([
    projectConnections(gate.ctx.project, { verificar: true }),
    listProjectEvents(gate.ctx.orgId, id, 12),
  ]);

  return NextResponse.json({
    ...connections,
    puedeConectar: gate.ctx.can('conectar'),
    eventos: eventos.map((e) => ({
      tipo: e.type,
      quien: e.actorEmail ?? e.actor,
      cuando: e.createdAt.toISOString(),
      detalle: e.payload,
    })),
  });
}
