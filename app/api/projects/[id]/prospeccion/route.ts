import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';
import { paraElNavegador as fuera } from '@/src/prospeccion/maps';

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
    convertirALead,
    enriquecerProspecto,
    MapsNoDisponible,
    proponerContacto,
    TopeDeBusquedas,
  } = await import('@/src/prospeccion/maps');

  try {
    /**
     * El lote del final del recorrido.
     *
     * Existe porque el botón que cierra la demo es "mándalos a la cola", en
     * plural: después de recorrer Tulum hay 35 negocios sin sitio web y nadie
     * va a dar 35 clics delante del cliente. El tope de 50 y el `for` en serie
     * no son timidez — cada conversión escribe en `sales_leads` y encola una
     * acción, y mandar 79 en paralelo desde el navegador es una forma elegante
     * de tumbarse la propia base.
     */
    if (body?.accion === 'convertir-lote' || body?.accion === 'encolar-lote') {
      const ids = Array.isArray(body?.ids)
        ? [...new Set((body.ids as unknown[]).map(String))].slice(0, 50)
        : [];
      if (ids.length === 0) {
        return NextResponse.json({ error: 'No me diste a quiénes.' }, { status: 400 });
      }
      const encolar = body.accion === 'encolar-lote';
      let hechos = 0;
      const fallaron: string[] = [];
      for (const prospectId of ids) {
        try {
          if (encolar) {
            const r = await proponerContacto({
              project: gate.ctx.project,
              prospectId,
              canal: 'correo',
              mensaje: `Hola, los vi en Google Maps y quería contarles cómo trabajamos con negocios como el suyo.`,
              quien,
            });
            if (r.ok) hechos += 1;
            else fallaron.push(r.motivo ?? 'no se pudo');
          } else {
            const r = await convertirALead({ project: gate.ctx.project, prospectId, quien });
            if (r) hechos += 1;
            else fallaron.push('ya no existe');
          }
        } catch (e) {
          fallaron.push(e instanceof Error ? e.message : 'no se pudo');
        }
      }
      const { logProjectEvent } = await import('@/src/projects/events');
      await logProjectEvent({
        orgId: gate.ctx.orgId,
        projectId: id,
        type: 'prospecto_convertido',
        actor: gate.ctx.clerkUserId,
        actorEmail: gate.ctx.user.email,
        payload: { lote: ids.length, hechos, encolados: encolar },
      }).catch(() => undefined);
      return NextResponse.json({ ok: true, pedidos: ids.length, hechos, fallaron: fallaron.length });
    }

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

/*
 * Lo que sale al navegador —sin la llave, sin el `search_id` interno, sin el
 * `org_id`— lo decide `paraElNavegador` en `src/prospeccion/maps.ts`, una sola
 * vez para las tres rutas que devuelven prospectos.
 */
