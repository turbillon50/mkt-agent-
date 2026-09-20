import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';

export const runtime = 'nodejs';
// La revisión con el modelo, más medir el archivo, no cabe en 10 s.
export const maxDuration = 120;

/**
 * La compuerta anti-baneo, a petición de la pantalla.
 *
 * Es la MISMA función que corre el servidor antes de aprobar o publicar
 * (`compliance.revisar`). No hay una versión "de pantalla" más blanda: un
 * semáforo que dice verde aquí y rojo allá no sirve para decidir nada.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await apiProject(id, { section: 'contenido', capability: 'ver' });
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const { esRed } = await import('@/src/creative/specs');
  if (!esRed(body?.red)) {
    return NextResponse.json({ error: 'Dime para qué red.' }, { status: 400 });
  }

  const texto = typeof body?.texto === 'string' ? body.texto : '';
  const piezaId = typeof body?.piezaId === 'string' ? body.piezaId : null;
  const formatoId = typeof body?.formatoId === 'string' ? body.formatoId : null;

  // La medida del archivo se toma de la pieza, si hay. Medirla cuesta bajarla,
  // así que solo se hace cuando de verdad hay una pieza que revisar.
  let medida = null;
  if (piezaId) {
    const { getPieza } = await import('@/src/creative/repo');
    const pieza = await getPieza(gate.ctx.orgId, id, piezaId);
    if (pieza?.url) {
      const { medirPieza } = await import('@/src/creative/calidad');
      medida = await medirPieza(pieza.url, formatoId ?? pieza.formato).catch(() => null);
    }
  }

  const { revisar } = await import('@/src/creative/compliance');
  try {
    const veredicto = await revisar({
      orgId: gate.ctx.orgId,
      project: gate.ctx.project,
      red: body.red,
      formatoId,
      texto,
      piezaId,
      medida,
    });

    return NextResponse.json({
      semaforo: veredicto.semaforo,
      resumen: veredicto.resumen,
      reglasEvaluadas: veredicto.reglasEvaluadas,
      avisoDeRevision: veredicto.avisoDeRevision,
      hallazgos: veredicto.hallazgos,
      cuota: veredicto.uso
        ? { hoy: veredicto.uso.hoy, tope: veredicto.uso.tope, quedan: veredicto.uso.quedan }
        : null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo revisar la pieza.' },
      { status: 400 },
    );
  }
}
