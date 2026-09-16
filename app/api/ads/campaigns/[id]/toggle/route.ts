import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';
import { logProjectEvent } from '@/src/projects/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Prender o apagar una campaña de Google Ads.
 *
 * Igual que el GET de al lado: iba llaveada por el usuario de Clerk y por eso
 * contestaba "No tienes Google Ads conectado" a quien lo tenía conectado. Ahora
 * sale por el adaptador del PROYECTO.
 *
 * Esto mueve dinero en la cuenta del cliente, así que pide `operar`, no `ver`, y
 * queda en la bitácora del proyecto con quién lo hizo.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const projectId = String(body?.projectId ?? '');
  const estado = body?.status;

  if (!projectId) return NextResponse.json({ error: 'Falta el proyecto.' }, { status: 400 });
  if (estado !== 'ENABLED' && estado !== 'PAUSED') {
    return NextResponse.json({ error: 'status inválido' }, { status: 400 });
  }

  const gate = await apiProject(projectId, { section: 'campanas', capability: 'operar' });
  if (!gate.ok) return gate.res;

  const { cambiarEstadoDeCampana, clienteDeGoogleAdsDelProyecto } = await import(
    '@/src/channels/pauta'
  );

  try {
    const { customerId } = await clienteDeGoogleAdsDelProyecto(gate.ctx.project);
    if (!customerId) {
      return NextResponse.json(
        { error: 'Este proyecto todavía no tiene una cuenta de Google Ads elegida.' },
        { status: 400 },
      );
    }

    await cambiarEstadoDeCampana(gate.ctx.project, { customerId, campaignId: id, estado });

    await logProjectEvent({
      orgId: gate.ctx.orgId,
      projectId,
      type: 'campana_google_cambiada',
      actor: gate.ctx.clerkUserId,
      actorEmail: gate.ctx.user.email,
      payload: { campana: id, estado, customerId },
    }).catch(() => undefined);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo cambiar el estado.' },
      { status: 400 },
    );
  }
}
