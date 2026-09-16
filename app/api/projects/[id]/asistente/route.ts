import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';

export const runtime = 'nodejs';
// Una pieza tarda; el Asistente que la pide, también.
export const maxDuration = 300;

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/**
 * El Asistente del proyecto.
 *
 * Sustituye a `/api/chat`, que era global y por eso publicaba con la cuenta de
 * la casa. Aquí el proyecto sale de la URL y pasa por la puerta de permisos
 * ANTES de armar el agente: el modelo nunca decide en qué proyecto trabaja.
 *
 * GET  → el hilo anterior de esta persona en ESTE proyecto.
 * POST → hablar.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await apiProject(id, { capability: 'ver' });
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const mensaje = typeof body?.mensaje === 'string' ? body.mensaje.trim() : '';
  const imagen = typeof body?.imagen === 'string' ? body.imagen : null;

  if (!mensaje && !imagen) {
    return NextResponse.json({ error: 'Escribe algo.' }, { status: 400 });
  }
  if (imagen) {
    if (!imagen.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Eso no es una imagen.' }, { status: 400 });
    }
    const b64 = imagen.slice(imagen.indexOf(',') + 1);
    if (Math.floor(b64.length * 0.75) > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'La imagen pesa demasiado.' }, { status: 400 });
    }
  }

  try {
    const { getBrandKit } = await import('@/src/creative/brand-kit');
    const { preguntarAlAsistente } = await import('@/src/agent/project-agent');
    const { getRecentMessages, saveMessage } = await import('@/lib/conversations');

    const kit = await getBrandKit(gate.ctx.orgId, id).catch(() => null);

    // El hilo es por (usuario, proyecto). Sin el filtro, el historial del
    // cliente A se le metía al Asistente del cliente B como contexto.
    const previos = await getRecentMessages(gate.ctx.user.id).catch(() => []);
    const historia = previos
      .filter((m: any) => (m.metadata as any)?.projectId === id)
      .slice(-12)
      .map((m: any) => ({
        role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: m.content,
      }));

    const r = await preguntarAlAsistente({
      ctx: {
        project: gate.ctx.project,
        orgId: gate.ctx.orgId,
        quien: gate.ctx.user.email ?? gate.ctx.clerkUserId,
        puedeOperar: gate.ctx.can('operar'),
        kit,
      },
      historia,
      mensaje: mensaje || 'Mira esta imagen y dime qué ves.',
      imagenDataUrl: imagen,
      userId: gate.ctx.user.id,
    });

    await saveMessage({
      userId: gate.ctx.user.id,
      role: 'user',
      content: mensaje || '(imagen)',
      metadata: { projectId: id },
    }).catch(() => undefined);
    await saveMessage({
      userId: gate.ctx.user.id,
      role: 'assistant',
      content: r.texto,
      metadata: { projectId: id, piezas: r.piezas, publicado: r.publicado },
    }).catch(() => undefined);

    return NextResponse.json({
      respuesta: r.texto,
      piezas: r.piezas,
      publicado: r.publicado,
      proyecto: gate.ctx.project.name,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No pude contestar.' },
      { status: 500 },
    );
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await apiProject(id, { capability: 'ver' });
  if (!gate.ok) return gate.res;

  try {
    const { getRecentMessages } = await import('@/lib/conversations');
    const mensajes = await getRecentMessages(gate.ctx.user.id);
    return NextResponse.json({
      mensajes: mensajes
        .filter((m: any) => (m.metadata as any)?.projectId === id)
        .map((m) => ({
          role: m.role,
          content: m.content,
          piezas: (m.metadata as any)?.piezas ?? [],
          publicado: (m.metadata as any)?.publicado ?? null,
        })),
    });
  } catch {
    return NextResponse.json({ mensajes: [] });
  }
}
