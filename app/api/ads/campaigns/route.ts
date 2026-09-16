import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Las campañas de Google Ads DEL PROYECTO.
 *
 * Esta ruta llaveaba por el `userId` de Clerk (`getGoogleAdsConnection(userId)`).
 * Desde la corrida que movió todo a `project:<uuid>` eso **no podía encontrar
 * nada nunca**: contestaba `{"connected":false,"campaigns":[]}` con la cara seria
 * mientras Google Ads estaba conectado y el adaptador de `src/channels/pauta.ts`
 * devolvía 200 con el cliente `3715754231`. Es el hallazgo G de la QA y es lo que
 * veía el usuario en *Campañas*.
 *
 * Ahora entra por el adaptador del proyecto, igual que todo lo demás, y el ID de
 * cliente **se descubre** en vez de pedírselo tecleado al usuario.
 */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('project') ?? '';
  if (!projectId) {
    return NextResponse.json({ error: 'Falta el proyecto.', connected: false, campaigns: [] }, { status: 400 });
  }

  const gate = await apiProject(projectId, { section: 'campanas', capability: 'ver' });
  if (!gate.ok) return gate.res;

  const { clienteDeGoogleAdsDelProyecto, googleads } = await import('@/src/channels/pauta');

  try {
    const { customerId, disponibles } = await clienteDeGoogleAdsDelProyecto(gate.ctx.project);
    if (!customerId) {
      return NextResponse.json({
        connected: false,
        campaigns: [],
        disponibles,
        motivo:
          disponibles.length === 0
            ? 'La cuenta de Google conectada no administra ninguna cuenta de Google Ads.'
            : null,
      });
    }

    const campaigns = await googleads.readCampaigns!(gate.ctx.project, { customerId });
    return NextResponse.json({ connected: true, customerId, disponibles, campaigns });
  } catch (e) {
    const detalle = e instanceof Error ? e.message : 'error';
    // `CanalNoConectado` ya viene en español y dice a dónde ir: se deja pasar.
    return NextResponse.json({ connected: false, campaigns: [], error: detalle }, { status: 200 });
  }
}

/** Elegir con qué cuenta de Google Ads trabaja este proyecto. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const projectId = String(body?.projectId ?? '');
  const customerId = String(body?.customerId ?? '').replace(/[^0-9]/g, '');
  if (!projectId) return NextResponse.json({ error: 'Falta el proyecto.' }, { status: 400 });
  if (customerId.length !== 10) {
    return NextResponse.json(
      { error: 'El ID de cliente de Google Ads lleva 10 dígitos (123-456-7890).' },
      { status: 400 },
    );
  }

  const gate = await apiProject(projectId, { section: 'campanas', capability: 'operar' });
  if (!gate.ok) return gate.res;

  const { and, eq } = await import('drizzle-orm');
  const { db } = await import('@/src/db/client');
  const { socialAccounts } = await import('@/src/db/schema');

  const filas = await db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.orgId, gate.ctx.orgId),
        eq(socialAccounts.campaignId, projectId),
        eq(socialAccounts.platform, 'googleads'),
      ),
    )
    .limit(1);
  if (!filas[0]) {
    return NextResponse.json(
      { error: 'Conecta Google Ads en Conexiones antes de elegir la cuenta.' },
      { status: 400 },
    );
  }

  await db
    .update(socialAccounts)
    .set({
      metadata: { ...(filas[0].metadata ?? {}), customer_id: customerId },
      updatedAt: new Date(),
    })
    .where(eq(socialAccounts.id, filas[0].id));

  return NextResponse.json({ ok: true, customerId });
}
