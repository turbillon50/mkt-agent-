import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';
import { logProjectEvent } from '@/src/projects/events';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** El hilo con sus mensajes. */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; threadId: string }> },
) {
  const { id, threadId } = await ctx.params;
  const gate = await apiProject(id, { section: 'conversaciones', capability: 'ver' });
  if (!gate.ok) return gate.res;

  const { hiloConMensajes } = await import('@/src/projects/bandeja-social');
  const { hilo, mensajes } = await hiloConMensajes(gate.ctx.orgId, id, threadId);
  if (!hilo) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return NextResponse.json({
    hilo: { ...hilo, ultimoAt: hilo.ultimoAt?.toISOString() ?? null },
    mensajes: mensajes.map((m) => ({ ...m, cuando: m.cuando.toISOString() })),
    puedeResponder: gate.ctx.can('operar'),
  });
}

/**
 * Contestar.
 *
 * `accion: "proponer"` NO manda nada: le pide al vendedor del proyecto que
 * redacte y devuelve el borrador para que un humano lo lea antes. Es el mismo
 * vendedor de `/api/sales/seller`, con la conversación real de contexto.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; threadId: string }> },
) {
  const { id, threadId } = await ctx.params;
  const gate = await apiProject(id, { section: 'conversaciones', capability: 'operar' });
  if (!gate.ok) return gate.res;
  const { orgId, project, clerkUserId, user } = gate.ctx;

  const body = await req.json().catch(() => ({}));
  const accion = String(body?.accion ?? 'responder');

  const { hiloConMensajes, responderEnHilo } = await import('@/src/projects/bandeja-social');
  const { hilo, mensajes } = await hiloConMensajes(orgId, id, threadId);
  if (!hilo) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // ---- proponer: el vendedor redacta, nadie manda nada -----------------------
  if (accion === 'proponer') {
    const { draftReply, sellerMode } = await import('@/src/agent/seller');
    const entrantes = mensajes.filter((m) => m.entrante);
    const ultimo = entrantes[entrantes.length - 1];
    if (!ultimo) {
      return NextResponse.json(
        { error: 'En este hilo todavía no te ha escrito nadie: no hay a qué contestarle.' },
        { status: 400 },
      );
    }
    const draft = await draftReply({
      project,
      lead: null,
      inbound: ultimo.texto,
      history: mensajes.map((m) => ({
        direction: m.entrante ? ('inbound' as const) : ('outbound' as const),
        body: m.texto,
      })),
    });
    return NextResponse.json({
      propuesta: draft.reply,
      modo: sellerMode(project),
      intencion: draft.intent,
      escala: draft.escalate,
      motivo_escalacion: draft.escalationReason,
      del_modelo: draft.fromModel,
    });
  }

  // ---- responder de verdad ---------------------------------------------------
  const texto = String(body?.texto ?? '').trim();
  if (!texto) return NextResponse.json({ error: 'Escribe algo para mandar.' }, { status: 400 });

  const r = await responderEnHilo({
    project,
    conversacionId: threadId,
    texto,
    quien: user.email ?? clerkUserId,
  });
  if (!r.ok) return NextResponse.json({ error: r.motivo ?? 'No se pudo mandar.' }, { status: 400 });

  await logProjectEvent({
    orgId,
    projectId: id,
    type: 'conversacion_respondida',
    actor: clerkUserId,
    actorEmail: user.email,
    payload: { canal: hilo.canal, hilo: threadId, externalId: r.externalId },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, externalId: r.externalId });
}

/** Marcar como leído sin contestar. */
export async function PATCH(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; threadId: string }> },
) {
  const { id, threadId } = await ctx.params;
  const gate = await apiProject(id, { section: 'conversaciones', capability: 'operar' });
  if (!gate.ok) return gate.res;

  const { and, eq } = await import('drizzle-orm');
  const { db } = await import('@/src/db/client');
  const { conversations } = await import('@/src/db/schema');
  const { marcarLeido } = await import('@/src/projects/bandeja-social');

  const filas = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, threadId), eq(conversations.campaignId, id)))
    .limit(1);
  if (!filas[0]) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await marcarLeido(gate.ctx.project, filas[0]);
  return NextResponse.json({ ok: true });
}
