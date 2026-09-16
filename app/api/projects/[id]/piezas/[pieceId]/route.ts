import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';
import type { PieceState } from '@/src/db/schema';

export const runtime = 'nodejs';

const ESTADOS: PieceState[] = [
  'propuesta',
  'en_revision',
  'cambios',
  'aprobada',
  'programada',
  'descartada',
  'publicada',
];

/**
 * Mover una pieza por el camino de aprobación.
 *
 *   borrador → en revisión → aprobada → programada → publicada
 *                   ↘ cambios (con comentario) ↗
 *                   ↘ rechazada
 *
 * Dos cosas que pasan aquí y no en la pantalla:
 *
 *   1. **La transición se valida.** Un botón mal pintado no puede mandar una
 *      pieza publicada de vuelta a borrador.
 *   2. **La corrección se guarda como LECCIÓN.** Rechazar una pieza o pedirle
 *      cambios es exactamente el momento en que el cliente le está enseñando
 *      algo a Goossip, y es el único momento en que se guarda: los aciertos no
 *      se apuntan solos.
 *
 * `accion: 'aprobar' | 'descartar'` sigue funcionando: es lo que manda la
 * galería de la corrida 6 y romperlo no le arregla nada a nadie.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; pieceId: string }> }) {
  const { id, pieceId } = await ctx.params;
  const gate = await apiProject(id, { section: 'contenido', capability: 'operar' });
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const quien = gate.ctx.user.email ?? gate.ctx.clerkUserId;

  // El camino viejo, intacto.
  const destino: PieceState | null =
    body?.accion === 'descartar'
      ? 'descartada'
      : body?.accion === 'aprobar'
        ? 'aprobada'
        : ESTADOS.includes(body?.estado)
          ? (body.estado as PieceState)
          : null;

  if (!destino) {
    return NextResponse.json({ error: 'Dime a qué estado la muevo.' }, { status: 400 });
  }

  const { getPieza, moverPieza, TransicionInvalida, ESTADO_LABEL } = await import('@/src/creative/repo');
  const previa = await getPieza(gate.ctx.orgId, id, pieceId);
  if (!previa) return NextResponse.json({ error: 'not found' }, { status: 404 });

  try {
    const r = await moverPieza({
      orgId: gate.ctx.orgId,
      projectId: id,
      id: pieceId,
      a: destino,
      quien,
      comentario: typeof body?.comentario === 'string' ? body.comentario : null,
      programadaPara: body?.programadaPara ? new Date(body.programadaPara) : null,
    });
    if (!r) return NextResponse.json({ error: 'not found' }, { status: 404 });

    // --- la bitácora ---------------------------------------------------------
    const { logProjectEvent } = await import('@/src/projects/events');
    await logProjectEvent({
      orgId: gate.ctx.orgId,
      projectId: id,
      type: 'pieza_movida',
      actor: gate.ctx.clerkUserId,
      actorEmail: gate.ctx.user.email,
      payload: {
        piezaId: pieceId,
        de: r.antes,
        a: r.pieza.estado,
        red: r.pieza.red,
        comentario: r.pieza.comentario ?? null,
        programadaPara: r.pieza.programadaPara?.toISOString() ?? null,
      },
    });

    // --- la lección, solo cuando hubo corrección de verdad --------------------
    if (destino === 'cambios' || destino === 'descartada') {
      const { guardarLeccion } = await import('@/src/autonomia/lecciones');
      await guardarLeccion({
        project: gate.ctx.project,
        kind: destino === 'cambios' ? 'cambios_pedidos' : 'pieza_rechazada',
        queHizo: `${r.pieza.red} · ${r.pieza.brief}`.slice(0, 500),
        queCorrigio:
          (typeof body?.comentario === 'string' && body.comentario.trim()) ||
          'la rechazaron sin decir por qué',
        refType: 'creative_piece',
        refId: pieceId,
        actor: quien,
      }).catch(() => undefined);
    }

    return NextResponse.json({
      ok: true,
      estado: r.pieza.estado,
      etiqueta: ESTADO_LABEL[r.pieza.estado],
      url: r.pieza.url,
      comentario: r.pieza.comentario,
      programadaPara: r.pieza.programadaPara?.toISOString() ?? null,
    });
  } catch (e) {
    const status = e instanceof TransicionInvalida ? 409 : 400;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo mover la pieza.' },
      { status },
    );
  }
}
