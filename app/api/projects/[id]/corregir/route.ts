import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';

export const runtime = 'nodejs';
// Reescribir con el modelo no cabe en 10 s.
export const maxDuration = 120;

/**
 * "Corregir con Goossip": reescribe el texto para que pase la compuerta.
 *
 * Devuelve el texto nuevo; la pantalla lo pone en el editor y vuelve a pasar la
 * compuerta ella misma. Aquí NO se aprueba nada: corregir y aprobar son dos
 * decisiones y las toma quien mira el resultado.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  // Reescribir el texto es operar sobre la pieza, igual que "Adaptar": pide el
  // mismo permiso, no solo el de ver.
  const gate = await apiProject(id, { section: 'contenido', capability: 'operar' });
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const { esRed } = await import('@/src/creative/specs');
  if (!esRed(body?.red)) {
    return NextResponse.json({ error: 'Dime para qué red.' }, { status: 400 });
  }

  const texto = typeof body?.texto === 'string' ? body.texto : '';
  if (!texto.trim()) {
    return NextResponse.json({ error: 'No hay texto que corregir.' }, { status: 400 });
  }
  const piezaId = typeof body?.piezaId === 'string' ? body.piezaId : null;
  const formatoId = typeof body?.formatoId === 'string' ? body.formatoId : null;

  const { corregir } = await import('@/src/creative/compliance');
  try {
    const r = await corregir({
      orgId: gate.ctx.orgId,
      project: gate.ctx.project,
      red: body.red,
      formatoId,
      texto,
      piezaId,
    });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo corregir.' },
      { status: 400 },
    );
  }
}
