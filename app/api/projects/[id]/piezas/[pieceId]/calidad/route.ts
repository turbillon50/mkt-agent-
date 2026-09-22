import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';

export const runtime = 'nodejs';
// Bajar una imagen, medirla, recortarla y subirla no cabe en 10 s; un video
// recodificándose en el servidor, menos.
export const maxDuration = 300;

/**
 * La calidad de una pieza, y el botón "Adaptar".
 *
 * GET  → la mide y dice si es publicable, con el motivo.
 * POST → la adapta a la medida de la red y devuelve la pieza nueva.
 *
 * La adaptación GUARDA la URL nueva en la pieza. No se crea una pieza aparte a
 * propósito: lo que se aprobó y lo que se publica tienen que ser el mismo
 * registro, o el camino de aprobación deja de significar nada.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string; pieceId: string }> }) {
  const { id, pieceId } = await ctx.params;
  const gate = await apiProject(id, { section: 'contenido', capability: 'ver' });
  if (!gate.ok) return gate.res;

  const { getPieza } = await import('@/src/creative/repo');
  const pieza = await getPieza(gate.ctx.orgId, id, pieceId);
  if (!pieza) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!pieza.url) {
    return NextResponse.json({ error: 'Esta pieza todavía no tiene archivo.' }, { status: 400 });
  }

  const { medirPieza, revisarCalidad } = await import('@/src/creative/calidad');
  try {
    const medida = await medirPieza(pieza.url, pieza.formato);
    const dictamen = revisarCalidad(pieza.formato, medida);
    return NextResponse.json({ dictamen: paraLaPantalla(dictamen) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo medir la pieza.' },
      { status: 400 },
    );
  }
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string; pieceId: string }> }) {
  const { id, pieceId } = await ctx.params;
  const gate = await apiProject(id, { section: 'contenido', capability: 'operar' });
  if (!gate.ok) return gate.res;

  const { getPieza } = await import('@/src/creative/repo');
  const pieza = await getPieza(gate.ctx.orgId, id, pieceId);
  if (!pieza) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!pieza.url) {
    return NextResponse.json({ error: 'Esta pieza todavía no tiene archivo.' }, { status: 400 });
  }
  if (pieza.estado === 'publicada') {
    return NextResponse.json(
      { error: 'Esta pieza ya se publicó: adaptarla ahora cambiaría lo que la gente ya vio.' },
      { status: 409 },
    );
  }

  const { adaptarPieza } = await import('@/src/creative/calidad');
  try {
    const r = await adaptarPieza({ url: pieza.url, formatoId: pieza.formato });

    const { db } = await import('@/src/db/client');
    const { creativePieces } = await import('@/src/db/schema');
    const { eq } = await import('drizzle-orm');
    await db
      .update(creativePieces)
      .set({
        url: r.url,
        ancho: r.medida.ancho ?? pieza.ancho,
        alto: r.medida.alto ?? pieza.alto,
        metadata: {
          ...((pieza.metadata as Record<string, unknown>) ?? {}),
          adaptadaDe: pieza.url,
          adaptadaEl: new Date().toISOString(),
          queSeHizo: r.queSeHizo,
        },
      })
      .where(eq(creativePieces.id, pieceId));

    const { logProjectEvent } = await import('@/src/projects/events');
    await logProjectEvent({
      orgId: gate.ctx.orgId,
      projectId: id,
      type: 'pieza_adaptada',
      actor: gate.ctx.clerkUserId,
      actorEmail: gate.ctx.user.email,
      payload: {
        piezaId: pieceId,
        red: pieza.red,
        formato: pieza.formato,
        de: pieza.url,
        a: r.url,
        queSeHizo: r.queSeHizo,
        quedaPublicable: r.dictamen.publicable,
      },
    });

    return NextResponse.json({
      ok: true,
      url: r.url,
      ancho: r.medida.ancho,
      alto: r.medida.alto,
      queSeHizo: r.queSeHizo,
      dictamen: paraLaPantalla(r.dictamen),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo adaptar la pieza.' },
      { status: 400 },
    );
  }
}

type Dictamen = Awaited<ReturnType<typeof import('@/src/creative/calidad').revisarCalidad>>;

/** Lo que la pantalla necesita, sin la spec entera dentro. */
function paraLaPantalla(d: Dictamen) {
  return {
    publicable: d.publicable,
    adaptable: d.adaptable,
    fallas: d.fallas,
    sinMedir: d.sinMedir,
    medida: d.medida,
    formato: {
      id: d.formato.id,
      label: d.formato.label,
      ancho: d.formato.ancho,
      alto: d.formato.alto,
      ratio: d.formato.ratio,
    },
    fuente: d.fuente,
    leidoEl: d.leidoEl,
  };
}
