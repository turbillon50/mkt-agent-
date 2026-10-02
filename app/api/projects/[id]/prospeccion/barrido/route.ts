import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/**
 * Nueve cuadrantes, más leer ocho sitios, más el ritmo de demo, no caben en 60 s.
 * 300 es el techo de Vercel en el plan que tiene Goossip; el recorrido se
 * autolimita antes con `TOPE_LLAMADAS_POR_BARRIDO`.
 */
export const maxDuration = 300;

/**
 * El recorrido, en vivo.
 *
 * **Por qué POST y no `EventSource`.** El navegador solo sabe abrir un
 * `EventSource` con GET, y eso obligaría a mandar el objetivo, los cinco
 * filtros y el centro del mapa como parámetros de la URL: una URL de 400
 * caracteres que se guarda entera en los logs de acceso de Vercel. Se hace al
 * revés — `POST` con el encargo en el cuerpo y la respuesta en
 * `text/event-stream`, que el cliente lee con el `ReadableStream` del `fetch`.
 * El formato del canal es SSE de verdad (`data:` y línea en blanco); lo único
 * que cambia es quién abre la puerta.
 *
 * **Lo que va en las cabeceras y por qué.** `no-transform` y
 * `X-Accel-Buffering: no` existen por una razón muy concreta: un proxy que
 * juntara los eventos para mandarlos de golpe convertiría el recorrido en vivo
 * en una pantalla congelada treinta segundos y después todo junto — que es
 * exactamente lo que esta pantalla NO puede hacer, porque lo que se está
 * vendiendo es el "míralo trabajar".
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await apiProject(id, { section: 'leads', capability: 'operar' });
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const { barrer } = await import('@/src/prospeccion/barrido');
  const { logProjectEvent } = await import('@/src/projects/events');

  const giros: string[] = Array.isArray(body?.giros)
    ? (body.giros as unknown[]).map((g) => String(g))
    : typeof body?.giro === 'string'
      ? [body.giro]
      : [];

  const centro =
    body?.centro &&
    typeof (body.centro as any).lat === 'number' &&
    typeof (body.centro as any).lng === 'number'
      ? { lat: (body.centro as any).lat as number, lng: (body.centro as any).lng as number }
      : null;

  const encargo = {
    project: gate.ctx.project,
    zona: String(body?.zona ?? '').slice(0, 160),
    giros,
    centro,
    filtros: (body?.filtros ?? {}) as Record<string, unknown>,
    radioAuto: body?.radioAuto === true,
    lado: Number(body?.lado) || 3,
    paginas: Number(body?.paginas) || 1,
    demo: body?.demo === true,
    enriquecer: Number(body?.enriquecer ?? 8),
    quien: gate.ctx.user.email ?? gate.ctx.clerkUserId,
    // Si el usuario cierra la pestaña, `req.signal` se dispara y el recorrido
    // deja de preguntarle a Google. Sin esto, cerrar la pantalla seguiría
    // gastando búsquedas de su tope durante cinco minutos.
    señal: req.signal,
  };

  const codificador = new TextEncoder();
  const flujo = new ReadableStream<Uint8Array>({
    async start(controlador) {
      const manda = (evento: unknown) => {
        controlador.enqueue(codificador.encode(`data: ${JSON.stringify(evento)}\n\n`));
      };
      try {
        // Un comentario SSE de arranque: obliga a que las cabeceras salgan ya y
        // el navegador tenga el canal abierto antes de la primera llamada a
        // Google, que tarda un segundo largo.
        controlador.enqueue(codificador.encode(': goossip\n\n'));

        let resumen: { total: number; nuevos: number; costo: { hechas: number } } | null = null;
        for await (const evento of barrer(encargo as never)) {
          manda(evento);
          if (evento.tipo === 'resumen') resumen = evento;
        }

        if (resumen) {
          await logProjectEvent({
            orgId: gate.ctx.orgId,
            projectId: id,
            type: 'prospeccion_barrido',
            actor: gate.ctx.clerkUserId,
            actorEmail: gate.ctx.user.email,
            payload: {
              zona: encargo.zona,
              giros,
              negocios: resumen.total,
              nuevos: resumen.nuevos,
              busquedas: resumen.costo.hechas,
              demo: encargo.demo,
            },
          }).catch(() => undefined);
        }
      } catch (e) {
        manda({ tipo: 'error', mensaje: e instanceof Error ? e.message : 'El recorrido se cayó.' });
        manda({ tipo: 'fin' });
      } finally {
        controlador.close();
      }
    },
  });

  return new NextResponse(flujo, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
