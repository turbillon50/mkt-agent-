import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';

export const runtime = 'nodejs';

/**
 * Aprobar o descartar una pieza.
 *
 * Aprobar una descarta a sus hermanas del mismo lote: si las tres se quedan en
 * "propuesta", `publish-post` no sabe cuál adjuntar y acaba eligiendo la más
 * nueva, que no es lo mismo que la que el cliente quería.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; pieceId: string }> }) {
  const { id, pieceId } = await ctx.params;
  const gate = await apiProject(id, { section: 'contenido', capability: 'operar' });
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const accion = body?.accion === 'descartar' ? 'descartar' : 'aprobar';

  const { aprobarPieza, descartarPieza } = await import('@/src/creative/repo');
  const quien = gate.ctx.user.email ?? gate.ctx.clerkUserId;

  const fila =
    accion === 'aprobar'
      ? await aprobarPieza(gate.ctx.orgId, id, pieceId, quien)
      : await descartarPieza(gate.ctx.orgId, id, pieceId);

  if (!fila) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return NextResponse.json({ ok: true, estado: fila.estado, url: fila.url });
}
