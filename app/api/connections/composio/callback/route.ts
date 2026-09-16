import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';
import { currentUserOrNull } from '@/lib/users';
import { connectorBySlug } from '@/src/projects/catalog';
import { finishComposioConnection } from '@/src/projects/composio-connections';
import { logProjectEvent } from '@/src/projects/events';
import { redeemConnectionLink, resolveConnectionLink } from '@/src/projects/links';
import { appOrigin } from '../../meta/start/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * La vuelta del permiso de Composio.
 *
 * Lo que decide si la tarjeta se pinta de verde NO es haber vuelto aquí: es lo
 * que conteste Composio cuando se le pregunta por la cuenta. Volver del
 * navegador solo significa que el usuario cerró la ventana.
 *
 * Quién puede cerrar la conexión: alguien del proyecto con permiso de conectar,
 * o alguien de fuera con un enlace de un solo uso válido. Sin una de las dos,
 * no se toca la fila — si no, cualquiera con la URL podría reescribir quién
 * conectó el canal de un cliente.
 */
export async function GET(req: NextRequest) {
  const origin = appOrigin(req);
  const projectId = req.nextUrl.searchParams.get('project') ?? '';
  const toolkit = req.nextUrl.searchParams.get('toolkit') ?? '';
  const linkToken = req.nextUrl.searchParams.get('link');

  const connector = connectorBySlug(toolkit);
  if (!projectId || !connector || connector.via !== 'composio') {
    return NextResponse.redirect(new URL('/projects', origin));
  }

  const volverAlProyecto = (params: Record<string, string>) => {
    const url = new URL(`/projects/${projectId}/conexiones`, origin);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return NextResponse.redirect(url);
  };

  // --- Camino 1: alguien de fuera con enlace de un solo uso ----------------
  if (linkToken) {
    const resolution = await resolveConnectionLink(linkToken);
    if (!resolution.ok || resolution.project.id !== projectId) {
      return NextResponse.redirect(new URL(`/conectar/${linkToken}`, origin));
    }
    const user = await currentUserOrNull();
    if (!user) return NextResponse.redirect(new URL(`/conectar/${linkToken}`, origin));

    const r = await finishComposioConnection({
      project: resolution.project,
      toolkit,
      connectedBy: user.clerkId,
      userId: user.id,
    });
    if (!r.ok) {
      // El enlace NO se quema si el permiso no quedó: sería dejar al cliente
      // sin enlace y sin conexión.
      return NextResponse.redirect(new URL(`/conectar/${linkToken}`, origin));
    }

    const redeemed = await redeemConnectionLink(linkToken, user.clerkId);
    await logProjectEvent({
      orgId: resolution.project.orgId,
      projectId,
      type: redeemed.ok ? 'link_used' : 'channel_connected',
      actor: user.clerkId,
      actorEmail: user.email,
      payload: { canal: toolkit, cuenta: r.connectedAccountId, handle: r.handle ?? null },
    });
    return NextResponse.redirect(new URL(`/conectar/${linkToken}/listo`, origin));
  }

  // --- Camino 2: alguien del proyecto -------------------------------------
  const gate = await apiProject(projectId, { section: 'conexiones', capability: 'conectar' });
  if (!gate.ok) return NextResponse.redirect(new URL('/projects', origin));

  const r = await finishComposioConnection({
    project: gate.ctx.project,
    toolkit,
    connectedBy: gate.ctx.clerkUserId,
    userId: gate.ctx.user.id,
  }).catch((e) => ({
    ok: false as const,
    status: 'ERROR',
    motivo: e instanceof Error ? e.message : 'No se pudo confirmar la conexión.',
  }));

  await logProjectEvent({
    orgId: gate.ctx.orgId,
    projectId,
    type: r.ok ? 'channel_connected' : 'channel_revoked',
    actor: gate.ctx.clerkUserId,
    actorEmail: gate.ctx.user.email,
    payload: {
      canal: toolkit,
      resultado: r.ok ? 'conectado' : 'no quedó',
      estado: r.status,
    },
  });

  return r.ok
    ? volverAlProyecto({ conectado: toolkit })
    : volverAlProyecto({ error: `${connector.label}: ${r.motivo ?? 'no se pudo conectar.'}` });
}
