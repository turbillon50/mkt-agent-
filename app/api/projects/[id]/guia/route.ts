import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';

export const runtime = 'nodejs';

/**
 * La guía activa del proyecto: qué hay que hacer hoy y con qué botón.
 *
 * Se pide desde el panel del Asistente en cada pantalla. Es `no-store` porque
 * "hay 3 leads sin contactar" deja de ser cierto en cuanto alguien los
 * contesta, y una guía que miente es peor que ninguna.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await apiProject(id, { capability: 'ver' });
  if (!gate.ok) return gate.res;

  try {
    const { getBrandKit } = await import('@/src/creative/brand-kit');
    const { pendientesDelProyecto } = await import('@/src/assistant/guia');
    const kit = await getBrandKit(gate.ctx.orgId, id).catch(() => null);
    const estado = await pendientesDelProyecto({
      orgId: gate.ctx.orgId,
      project: gate.ctx.project,
      kit,
    });

    return NextResponse.json({
      proyecto: { id: gate.ctx.project.id, nombre: gate.ctx.project.name },
      puedeOperar: gate.ctx.can('operar'),
      ...estado,
    });
  } catch (e) {
    // Que la guía falle NO puede tumbar el panel: el Asistente sigue sirviendo
    // aunque no sepa cuántos leads hay sin contactar.
    return NextResponse.json({
      proyecto: { id: gate.ctx.project.id, nombre: gate.ctx.project.name },
      puedeOperar: gate.ctx.can('operar'),
      conectados: [],
      porReconectar: [],
      kitCompleto: false,
      leadsSinContactar: 0,
      piezasSinDecidir: 0,
      sugerencias: [],
      error: e instanceof Error ? e.message : 'No se pudo leer el estado.',
    });
  }
}
