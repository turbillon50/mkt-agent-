import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';

export const runtime = 'nodejs';

/**
 * El panel de la Sala: "cómo se postea aquí" y cuánto te queda hoy.
 *
 * Va aparte de la pieza a propósito: la guía y la cuota son de la RED y del
 * PROYECTO, no de la pieza que se esté mirando. Meterlas en la respuesta de
 * `/piezas` obligaría a recalcularlas cada vez que alguien cambia de lienzo.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await apiProject(id, { section: 'contenido', capability: 'ver' });
  if (!gate.ok) return gate.res;

  const { esRed } = await import('@/src/creative/specs');
  const redParam = req.nextUrl.searchParams.get('red');
  if (!esRed(redParam)) {
    return NextResponse.json({ error: 'Dime de qué red quieres la guía.' }, { status: 400 });
  }

  const { guiaDeRed } = await import('@/src/creative/como-se-postea');
  const { usoDeHoy } = await import('@/src/creative/frecuencia');

  const [guia, uso] = await Promise.all([
    guiaDeRed({ orgId: gate.ctx.orgId, projectId: id, red: redParam }),
    usoDeHoy({ orgId: gate.ctx.orgId, projectId: id, red: redParam }).catch(() => null),
  ]);

  return NextResponse.json({
    guia,
    uso: uso
      ? {
          hoy: uso.hoy,
          semana: uso.semana,
          tope: uso.tope,
          quedan: uso.quedan,
          agotado: uso.agotado,
          muySeguido: uso.muySeguido,
          minutosDesdeLaUltima: uso.minutosDesdeLaUltima,
          espaciadoSugeridoMin: uso.espaciadoSugeridoMin,
          aviso: uso.aviso,
          nota: uso.limite.nota,
        }
      : null,
  });
}
