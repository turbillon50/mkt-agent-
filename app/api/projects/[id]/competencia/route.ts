import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Leer dos rivales son varias llamadas a Meta y varios sitios web. 60 s no dan.
export const maxDuration = 300;

/**
 * La competencia DEL PROYECTO.
 *
 * GET  → los rivales, el último comparativo y el veredicto.
 * POST → da de alta un rival, o vuelve a leer (`accion: 'leer'`).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await apiProject(id, { capability: 'ver' });
  if (!gate.ok) return gate.res;

  const { comparativo, listarRivales } = await import('@/src/competencia/lectura');
  const [rivales, comp] = await Promise.all([
    listarRivales(gate.ctx.orgId, id),
    comparativo(gate.ctx.orgId, id),
  ]);

  return NextResponse.json({
    puedeOperar: gate.ctx.can('operar'),
    rivales: rivales.map((r) => ({
      id: r.id,
      name: r.name,
      website: r.website,
      handles: r.handles,
      notes: r.notes,
    })),
    ...comp,
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await apiProject(id, { capability: 'operar' });
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const quien = gate.ctx.user.email ?? gate.ctx.clerkUserId;
  const {
    agregarRival,
    comparativo,
    leerPropio,
    leerRival,
    limpiarHandles,
    listarRivales,
  } = await import('@/src/competencia/lectura');

  try {
    if (body?.accion === 'leer') {
      // Lo propio SIEMPRE: sin la línea base, el comparativo compara contra
      // nada y el "publican 5, tú 1" no se puede decir.
      const propias = await leerPropio(gate.ctx.project);
      const rivales = await listarRivales(gate.ctx.orgId, id);
      let deRivales = 0;
      for (const r of rivales) {
        const s = await leerRival(gate.ctx.project, r).catch(() => []);
        deRivales += s.length;
      }

      const { logProjectEvent } = await import('@/src/projects/events');
      await logProjectEvent({
        orgId: gate.ctx.orgId,
        projectId: id,
        type: 'competencia_leida',
        actor: gate.ctx.clerkUserId,
        actorEmail: gate.ctx.user.email,
        payload: { rivales: rivales.length, lecturas: propias.length + deRivales },
      });

      return NextResponse.json({
        ok: true,
        lecturas: propias.length + deRivales,
        ...(await comparativo(gate.ctx.orgId, id)),
      });
    }

    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (name.length < 2) {
      return NextResponse.json({ error: 'Dime cómo se llama el rival.' }, { status: 400 });
    }

    const handles = limpiarHandles(body?.handles ?? {});
    // `limpiarHandles` tira los perfiles personales. Si el usuario SOLO pegó
    // perfiles personales, se le dice por qué en vez de guardar un rival mudo.
    const pedidos = Object.values(body?.handles ?? {}).filter(Boolean).length;
    if (pedidos > 0 && Object.keys(handles).length === 0) {
      return NextResponse.json(
        {
          error:
            'Eso son perfiles personales. Aquí solo entran páginas de negocio y cuentas de marca — es la regla que evita bans y demandas.',
        },
        { status: 400 },
      );
    }

    const rival = await agregarRival({
      project: gate.ctx.project,
      name,
      website: typeof body?.website === 'string' ? body.website : null,
      handles,
      notes: typeof body?.notes === 'string' ? body.notes : null,
      quien,
    });

    return NextResponse.json({ ok: true, rival, descartados: pedidos - Object.keys(handles).length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'No se pudo.';
    const duplicado = /unique|duplicate/i.test(msg);
    return NextResponse.json(
      { error: duplicado ? 'Ese rival ya está en la lista de este proyecto.' : msg },
      { status: duplicado ? 409 : 400 },
    );
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await apiProject(id, { capability: 'operar' });
  if (!gate.ok) return gate.res;

  const rivalId = req.nextUrl.searchParams.get('rival');
  if (!rivalId) return NextResponse.json({ error: 'falta el rival' }, { status: 400 });

  const { borrarRival } = await import('@/src/competencia/lectura');
  await borrarRival(gate.ctx.orgId, id, rivalId);
  return NextResponse.json({ ok: true });
}
