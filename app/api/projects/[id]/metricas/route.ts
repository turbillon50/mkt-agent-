import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Goossip medido como empleado, más su nivel de autonomía y lo que aprendió.
 *
 * Una sola ruta para los tres porque siempre se leen juntos: el nivel sin las
 * métricas no dice si se lo ganó, y las métricas sin las correcciones no dicen
 * a costa de qué.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await apiProject(id, { capability: 'ver' });
  if (!gate.ok) return gate.res;

  const dias = Math.min(Math.max(Number(req.nextUrl.searchParams.get('dias')) || 30, 1), 365);

  const { metricasDeGoossip } = await import('@/src/autonomia/metricas');
  const { progresoDeAutonomia, NIVEL, nivelDe, topeDiario } = await import(
    '@/src/autonomia/niveles'
  );
  const { queAprendi } = await import('@/src/autonomia/lecciones');

  const [metricas, progreso, aprendi] = await Promise.all([
    metricasDeGoossip(gate.ctx.project, dias),
    progresoDeAutonomia(gate.ctx.project),
    queAprendi(id, 7),
  ]);

  const n = nivelDe(gate.ctx.project);
  return NextResponse.json({
    metricas,
    autonomia: {
      ...progreso,
      descripcion: NIVEL[n],
      niveles: Object.values(NIVEL),
      topeDiario: topeDiario(gate.ctx.project),
    },
    aprendi,
    puedeAdministrar: gate.ctx.can('administrar'),
  });
}
