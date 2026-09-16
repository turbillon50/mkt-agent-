import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';
import { lunesDe } from '@/src/creative/visor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * La vista "Semana": las piezas con FECHA, por día y por red.
 *
 * Solo entran las que tienen `programada_para`. Una pieza aprobada sin fecha no
 * está "en el lunes": está esperando que alguien decida cuándo sale, y ponerla
 * en el calendario de hoy sería inventarle un plan al cliente.
 *
 * La semana empieza en LUNES, que es como se planea el contenido en México.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await apiProject(id, { section: 'contenido', capability: 'ver' });
  if (!gate.ok) return gate.res;

  const desdeParam = req.nextUrl.searchParams.get('desde');
  const desde = lunesDe(desdeParam ? new Date(desdeParam) : new Date());

  const { semanaDe, ESTADO_LABEL } = await import('@/src/creative/repo');
  const dias = await semanaDe(gate.ctx.orgId, id, desde);

  return NextResponse.json({
    desde: desde.toISOString(),
    dias: dias.map((d) => ({
      dia: d.dia,
      piezas: d.piezas.map((p) => ({
        id: p.id,
        red: p.red,
        formato: p.formato,
        url: p.url,
        brief: p.brief,
        estado: p.estado,
        etiqueta: ESTADO_LABEL[p.estado],
        programadaPara: p.programadaPara?.toISOString() ?? null,
      })),
    })),
  });
}
