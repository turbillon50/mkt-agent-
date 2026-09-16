import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';

export const runtime = 'nodejs';

/** Borrar un hilo. Sus mensajes se van con él; sus archivos NO (ver 0019). */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; cid: string }> },
) {
  const { id, cid } = await ctx.params;
  const gate = await apiProject(id, { capability: 'ver' });
  if (!gate.ok) return gate.res;

  try {
    const { borrarHilo } = await import('@/src/assistant/hilos');
    const fue = await borrarHilo(
      { orgId: gate.ctx.orgId, projectId: id, userId: gate.ctx.user.id },
      cid,
    );
    // 404 y no 403 cuando no es suyo: decirle "no puedes" a alguien confirma
    // que el hilo existe. Es la misma regla de la puerta del proyecto.
    if (!fue) return NextResponse.json({ error: 'No existe.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No pude borrarla.' },
      { status: 500 },
    );
  }
}
