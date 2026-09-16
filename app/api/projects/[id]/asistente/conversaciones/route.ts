import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';

export const runtime = 'nodejs';

/**
 * El historial del proyecto: los hilos de quien está sentado frente a la
 * pantalla, buscables.
 *
 * Por qué son de (proyecto, usuario) y no solo del proyecto: en una agencia,
 * el hilo en el que alguien le dictó a Goossip el tono de una campaña es SUYO.
 * Compartirlo con todo el equipo por omisión es publicar borradores que nadie
 * publicó. Lo que sí es del proyecto —las piezas, los posts, el conocimiento—
 * ya vive en sus propias tablas y se ve en sus propias pantallas.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await apiProject(id, { capability: 'ver' });
  if (!gate.ok) return gate.res;

  const q = req.nextUrl.searchParams.get('q');

  try {
    const { listarHilos } = await import('@/src/assistant/hilos');
    const hilos = await listarHilos(
      { orgId: gate.ctx.orgId, projectId: id, userId: gate.ctx.user.id },
      { q, limite: 40 },
    );
    return NextResponse.json({
      conversaciones: hilos.map((h) => ({
        id: h.id,
        titulo: h.title ?? 'Conversación',
        mensajes: h.mensajes,
        actualizado: h.updatedAt,
      })),
    });
  } catch {
    return NextResponse.json({ conversaciones: [] });
  }
}

/** Abrir un hilo nuevo. El botón de "conversación nueva" del panel. */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await apiProject(id, { capability: 'ver' });
  if (!gate.ok) return gate.res;

  try {
    const { crearHilo } = await import('@/src/assistant/hilos');
    const hilo = await crearHilo({
      orgId: gate.ctx.orgId,
      projectId: id,
      userId: gate.ctx.user.id,
    });
    return NextResponse.json({ id: hilo.id, titulo: hilo.title });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No pude abrir la conversación.' },
      { status: 500 },
    );
  }
}
