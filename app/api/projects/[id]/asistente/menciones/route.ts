import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';

export const runtime = 'nodejs';

/**
 * Lo que sugiere el `@` del compose: leads, campañas, conexiones y piezas de
 * ESTE proyecto.
 *
 * Sin `q` devuelve lo más reciente de cada tipo, que es lo correcto: quien
 * teclea `@` y se queda mirando casi siempre va por el último lead que entró.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await apiProject(id, { capability: 'ver' });
  if (!gate.ok) return gate.res;

  const q = req.nextUrl.searchParams.get('q') ?? '';

  try {
    const { buscarMenciones } = await import('@/src/assistant/menciones');
    const menciones = await buscarMenciones(gate.ctx.project, gate.ctx.orgId, q);
    return NextResponse.json({ menciones });
  } catch {
    return NextResponse.json({ menciones: [] });
  }
}
