import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Bajar y medir 30 imágenes tarda. No cabe en 60 s.
export const maxDuration = 300;

/**
 * Auditoría de marca: cuánto se parece lo que sale a lo que el cliente aprobó.
 *
 * Es `POST` y no `GET` porque MIDE: baja las últimas 30 piezas y les cuenta los
 * píxeles. Un `GET` que se dispara con cada render estaría bajando 30 imágenes
 * cada vez que alguien abre la pantalla.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await apiProject(id, { section: 'marca', capability: 'ver' });
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const { getBrandKit } = await import('@/src/creative/brand-kit');
  const { auditarMarca } = await import('@/src/creative/auditoria');

  const kit = await getBrandKit(gate.ctx.orgId, id).catch(() => null);
  const auditoria = await auditarMarca({
    project: gate.ctx.project,
    kit,
    cuantas: Number(body?.cuantas) || 30,
  });

  return NextResponse.json(auditoria);
}
