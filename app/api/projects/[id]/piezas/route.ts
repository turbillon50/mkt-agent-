import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';

export const runtime = 'nodejs';
// Tres imágenes de Gemini más la composición no caben en 60 s.
export const maxDuration = 300;

/**
 * Las piezas del proyecto.
 *
 * GET  → la galería, con filtro por red.
 * POST → genera un lote nuevo (2-3 opciones, nunca una).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await apiProject(id, { section: 'contenido', capability: 'ver' });
  if (!gate.ok) return gate.res;

  const { listarPiezas, contarPorRed } = await import('@/src/creative/repo');
  const { esRed } = await import('@/src/creative/specs');

  const redParam = req.nextUrl.searchParams.get('red');
  const red = esRed(redParam) ? redParam : null;

  const [piezas, porRed] = await Promise.all([
    listarPiezas(gate.ctx.orgId, id, { red }),
    contarPorRed(gate.ctx.orgId, id),
  ]);

  return NextResponse.json({
    piezas: piezas.map((p) => ({
      id: p.id,
      red: p.red,
      formato: p.formato,
      tipo: p.tipo,
      url: p.url,
      ancho: p.ancho,
      alto: p.alto,
      brief: p.brief,
      motor: p.motor,
      modelo: p.modelo,
      estado: p.estado,
      angulo: (p.metadata as any)?.angulo ?? null,
      nota: (p.metadata as any)?.nota ?? null,
      loteId: p.loteId,
      createdAt: p.createdAt.toISOString(),
    })),
    porRed,
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await apiProject(id, { section: 'contenido', capability: 'operar' });
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const brief = typeof body?.brief === 'string' ? body.brief.trim() : '';
  if (brief.length < 4) {
    return NextResponse.json({ error: 'Dime de qué va la pieza.' }, { status: 400 });
  }

  const { esRed } = await import('@/src/creative/specs');
  if (!esRed(body?.red)) {
    return NextResponse.json({ error: 'Elige una red.' }, { status: 400 });
  }

  const { getBrandKit, palabrasProhibidasEn } = await import('@/src/creative/brand-kit');
  const kit = await getBrandKit(gate.ctx.orgId, id);

  // El kit no es decoración: si el cliente escribió que no quiere leer
  // "barato", no se le manda "barato" al modelo y luego se le enseña impreso.
  const prohibidas = palabrasProhibidasEn(
    kit,
    [brief, body?.titular, body?.cta].filter(Boolean).join(' '),
  );
  if (prohibidas.length) {
    return NextResponse.json(
      {
        error: `Tu kit de marca tiene prohibidas estas palabras: ${prohibidas.join(', ')}. Cámbialas y lo intentamos otra vez.`,
      },
      { status: 400 },
    );
  }

  try {
    const { generarPiezas } = await import('@/src/creative/engine');
    const { guardarLote } = await import('@/src/creative/repo');

    const resultado = await generarPiezas({
      project: gate.ctx.project,
      kit,
      red: body.red,
      formatoPista: typeof body?.formato === 'string' ? body.formato : null,
      brief,
      titular: typeof body?.titular === 'string' ? body.titular : null,
      cta: typeof body?.cta === 'string' ? body.cta : null,
      opciones: Number(body?.opciones) || 3,
    });

    const filas = await guardarLote({
      project: gate.ctx.project,
      kit,
      red: body.red,
      brief,
      resultado,
    });

    return NextResponse.json({
      ok: true,
      loteId: resultado.loteId,
      formato: {
        id: resultado.formato.id,
        label: resultado.formato.label,
        ancho: resultado.formato.ancho,
        alto: resultado.formato.alto,
        fuente: resultado.formato.fuente,
      },
      compositor: resultado.compositor,
      nota: resultado.notaCompositor,
      fallos: resultado.fallos,
      piezas: filas.map((p) => ({
        id: p.id,
        url: p.url,
        ancho: p.ancho,
        alto: p.alto,
        estado: p.estado,
        angulo: (p.metadata as any)?.angulo ?? null,
        nota: (p.metadata as any)?.nota ?? null,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo hacer la pieza.' },
      { status: 400 },
    );
  }
}
