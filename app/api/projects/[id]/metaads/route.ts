import { NextRequest, NextResponse } from 'next/server';
import { motivoDeMeta, readAdAccount } from '@/lib/meta-ads';
import { apiProject } from '@/lib/project-access';
import { seal } from '@/lib/secret-box';
import { resumenAnunciosMeta } from '@/src/channels/metaads';
import { pendingMetaAds, projectConnections, saveConnection } from '@/src/projects/connections';
import { logProjectEvent } from '@/src/projects/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Los anuncios de Meta de un proyecto.
 *
 * GET  → el resumen que pinta Campañas y que lee el Asistente: gasto de 7 y 30
 *        días, costo por lead y campañas. Todo de LECTURA.
 * POST → el paso que queda después del permiso: `{ accion: 'cuenta', accountId }`,
 *        cuál de las cuentas publicitarias es la de este proyecto.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await apiProject(id, { section: 'campanas' });
  if (!gate.ok) return gate.res;

  // `resumenAnunciosMeta` no lanza: lo que falle vuelve como `motivo` en
  // español. Una sección de Campañas que revienta entera porque Facebook está
  // lento es peor que una que dice qué pasó.
  const resumen = await resumenAnunciosMeta(gate.ctx.project);
  return NextResponse.json(resumen);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await apiProject(id, { section: 'conexiones', capability: 'conectar' });
  if (!gate.ok) return gate.res;
  const { orgId, project, clerkUserId, user } = gate.ctx;

  const body = await req.json().catch(() => ({}));
  if (String(body?.accion ?? '') !== 'cuenta') {
    return NextResponse.json({ error: 'No sabemos qué quieres hacer.' }, { status: 400 });
  }

  const accountId = String(body?.accountId ?? '').trim();
  if (!accountId) {
    return NextResponse.json({ error: 'Elige una cuenta publicitaria.' }, { status: 400 });
  }

  const { candidates, userToken } = await pendingMetaAds(orgId, id);
  const elegida = candidates.find((c) => c.id === accountId || c.accountId === accountId);
  if (!elegida || !userToken) {
    return NextResponse.json(
      { error: 'La conexión caducó. Vuelve a conectar Meta Ads.' },
      { status: 400 },
    );
  }

  try {
    // Se COMPRUEBA contra Meta antes de guardar. Es la diferencia entre "el
    // usuario eligió esta" y "esta cuenta contesta": la segunda es la única que
    // merece pintarse de verde, y el `verified_at` de abajo sale de aquí.
    const acc = await readAdAccount(elegida.id, userToken);

    await saveConnection({
      orgId,
      projectId: id,
      channel: 'metaads',
      connectedBy: clerkUserId,
      userId: user.id,
      label: acc.name,
      externalHandle: acc.name,
      externalId: acc.id,
      metadata: {
        // El token se vuelve a sellar aquí a propósito: el de `candidates` es
        // el mismo permiso, pero dejarlo colgando en la fila a medias y en la
        // conectada serían dos copias del mismo secreto.
        user_token: seal(userToken),
        business: acc.business,
        business_id: acc.businessId,
        currency: acc.currency,
        account_status: acc.status,
        // Las candidatas se van: ya se eligió, y guardar la lista de todas las
        // cuentas publicitarias del cliente para siempre no le sirve a nadie.
        candidates: [],
        motivo: null,
      },
      verifiedAt: new Date(),
    });

    await logProjectEvent({
      orgId,
      projectId: id,
      type: 'channel_connected',
      actor: clerkUserId,
      actorEmail: user.email,
      payload: { canal: 'metaads', cuenta: acc.id, negocio: acc.business },
    });

    const connections = await projectConnections(project);
    return NextResponse.json({ ok: true, cuenta: acc.id, nombre: acc.name, ...connections });
  } catch (e) {
    return NextResponse.json({ error: motivoDeMeta(e) }, { status: 400 });
  }
}
