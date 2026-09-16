import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';
import type { Prospect } from '@/src/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Buscar y después leer los sitios de veinte negocios no cabe en 60 s.
export const maxDuration = 300;

/**
 * Prospección por Google Maps.
 *
 * GET  → la lista del proyecto, el contador de búsquedas del mes y por dónde
 *        se puede buscar hoy. `?csv=1` devuelve el CSV.
 * POST → busca (`accion: 'buscar'`) o enriquece desde el sitio del negocio.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await apiProject(id, { section: 'leads', capability: 'ver' });
  if (!gate.ok) return gate.res;

  const {
    busquedasDelMes,
    comoCsv,
    contarProspectos,
    listarProspectos,
    topeDeBusquedas,
    viaDisponible,
  } = await import('@/src/prospeccion/maps');

  const sp = req.nextUrl.searchParams;
  const filtro = {
    status: (sp.get('status') as never) ?? null,
    conSitio: sp.get('conSitio') === '1',
    conTelefono: sp.get('conTelefono') === '1',
    ratingMin: sp.get('ratingMin') ? Number(sp.get('ratingMin')) : null,
  };

  const filas = await listarProspectos(gate.ctx.orgId, id, filtro);

  if (sp.get('csv') === '1') {
    return new NextResponse(comoCsv(filas), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="prospectos-${gate.ctx.project.slug}.csv"`,
      },
    });
  }

  const [conteo, mes, via] = await Promise.all([
    contarProspectos(gate.ctx.orgId, id),
    busquedasDelMes(id),
    viaDisponible(gate.ctx.project),
  ]);

  return NextResponse.json({
    puedeOperar: gate.ctx.can('operar'),
    via,
    costo: { mes, tope: topeDeBusquedas(gate.ctx.project) },
    conteo,
    prospectos: filas.map(fuera),
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await apiProject(id, { section: 'leads', capability: 'operar' });
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const quien = gate.ctx.user.email ?? gate.ctx.clerkUserId;

  const {
    buscarNegocios,
    enriquecerProspecto,
    MapsNoDisponible,
    TopeDeBusquedas,
  } = await import('@/src/prospeccion/maps');

  try {
    if (body?.accion === 'enriquecer') {
      const fila = await enriquecerProspecto(gate.ctx.orgId, id, String(body?.prospectId ?? ''));
      if (!fila) return NextResponse.json({ error: 'not found' }, { status: 404 });
      return NextResponse.json({ ok: true, prospecto: fuera(fila) });
    }

    const consulta = typeof body?.consulta === 'string' ? body.consulta.trim() : '';
    if (consulta.length < 4) {
      return NextResponse.json(
        { error: 'Dime qué buscar y dónde: "restaurantes en Tulum".' },
        { status: 400 },
      );
    }

    const r = await buscarNegocios({
      project: gate.ctx.project,
      consulta,
      limite: Number(body?.cuantos) || 20,
      quien,
    });

    const { logProjectEvent } = await import('@/src/projects/events');
    await logProjectEvent({
      orgId: gate.ctx.orgId,
      projectId: id,
      type: 'prospeccion_busqueda',
      actor: gate.ctx.clerkUserId,
      actorEmail: gate.ctx.user.email,
      payload: { consulta, encontrados: r.encontrados, nuevos: r.nuevos, via: r.via },
    });

    return NextResponse.json({
      ok: true,
      via: r.via,
      encontrados: r.encontrados,
      nuevos: r.nuevos,
      repetidos: r.repetidos,
      costo: r.costo,
      prospectos: r.prospectos.map(fuera),
    });
  } catch (e) {
    const status =
      e instanceof TopeDeBusquedas ? 429 : e instanceof MapsNoDisponible ? 409 : 400;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo buscar.' },
      { status },
    );
  }
}

/** Lo que sale al navegador. Nunca la llave, nunca el `search_id` interno. */
function fuera(p: Prospect) {
  return {
    id: p.id,
    name: p.name,
    address: p.address,
    phone: p.phone,
    website: p.website,
    rating: p.rating !== null ? Number(p.rating) : null,
    ratingsCount: p.ratingsCount,
    category: p.category,
    lat: p.lat,
    lng: p.lng,
    mapsUrl: p.mapsUrl,
    status: p.status,
    enrichment: p.enrichment,
    leadId: p.leadId,
    foundAt: p.foundAt.toISOString(),
  };
}
