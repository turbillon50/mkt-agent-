import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';

export const runtime = 'nodejs';
// Bajar hilos y mensajes de dos canales por el proxy de Meta no cabe en 10 s.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * La bandeja del proyecto: Messenger, DMs de Instagram, WhatsApp, SMS y correo
 * en UNA sola lista.
 *
 * GET  → los hilos. Con `?sync=1` sincroniza antes de devolver, para que el
 *        botón "Actualizar" de la pantalla no dependa de que el cron ya pasó.
 * POST → sincroniza a la fuerza y dice qué trajo.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await apiProject(id, { section: 'conversaciones', capability: 'ver' });
  if (!gate.ok) return gate.res;

  const { hilosDelProyecto, sincronizarBandeja } = await import('@/src/projects/bandeja-social');

  let sincronizacion = null;
  if (req.nextUrl.searchParams.get('sync') === '1') {
    // Una sincronización que falla NO deja al usuario sin ver lo que ya había:
    // se devuelve lo guardado y el motivo de por qué no se pudo refrescar.
    sincronizacion = await sincronizarBandeja(gate.ctx.project).catch(() => null);
  }

  const hilos = await hilosDelProyecto(gate.ctx.orgId, id);

  return NextResponse.json({
    hilos: hilos.map((h) => ({
      id: h.id,
      canal: h.canal,
      estado: h.estado,
      quien: h.quien,
      lead: h.lead,
      ultimoTexto: h.ultimoTexto,
      ultimoAt: h.ultimoAt?.toISOString() ?? null,
      ultimoEntrante: h.ultimoEntrante,
      sinLeer: h.sinLeer,
      respondible: h.respondible,
      ventanaAbierta: h.ventanaAbierta,
    })),
    sincronizacion,
    puedeResponder: gate.ctx.can('operar'),
  });
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await apiProject(id, { section: 'conversaciones', capability: 'operar' });
  if (!gate.ok) return gate.res;

  const { sincronizarBandeja } = await import('@/src/projects/bandeja-social');
  const t0 = Date.now();
  const resumen = await sincronizarBandeja(gate.ctx.project);
  return NextResponse.json({
    ok: resumen.every((r) => !r.error),
    canales: resumen,
    hilos: resumen.reduce((n, r) => n + r.hilos, 0),
    mensajesNuevos: resumen.reduce((n, r) => n + r.mensajesNuevos, 0),
    ms: Date.now() - t0,
  });
}
