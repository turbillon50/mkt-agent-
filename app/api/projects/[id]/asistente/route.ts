import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';

export const runtime = 'nodejs';
// Una pieza tarda; el Asistente que la pide, también. Y ahora además puede
// estar leyendo un video de tres minutos antes de contestar.
export const maxDuration = 300;

/**
 * El Asistente del proyecto.
 *
 * El proyecto sale de la URL y pasa por la puerta de permisos ANTES de armar el
 * agente: el modelo nunca decide en qué proyecto trabaja.
 *
 * POST contesta de DOS formas y la elige el cliente con su `Accept`:
 *   · `text/event-stream` → transmitido. Es lo que pide el compose de
 *     escritorio, y es por lo que el usuario ve la primera frase a los dos
 *     segundos en vez de un cuadro que dice "Trabajando…" durante quince.
 *   · cualquier otra cosa → un JSON al final, como siempre. Es lo que sigue
 *     pidiendo el cajón de celular, que esta corrida NO toca.
 *
 * GET trae los mensajes de un hilo (`?conversation=`) o del último si no se
 * dice cuál.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await apiProject(id, { capability: 'ver' });
  if (!gate.ok) return gate.res;

  const cuerpo = await req.json().catch(() => ({}));
  const mensaje = typeof cuerpo?.mensaje === 'string' ? cuerpo.mensaje.trim() : '';
  const adjuntos = Array.isArray(cuerpo?.adjuntos) ? cuerpo.adjuntos : [];
  if (!mensaje && !adjuntos.length && !cuerpo?.imagen) {
    return NextResponse.json({ error: 'Escribe algo.' }, { status: 400 });
  }

  const quiereEnVivo = (req.headers.get('accept') ?? '').includes('text/event-stream');

  const { prepararTurno, cabeceraDeAvisos } = await import('@/src/assistant/turno');
  const { guardarMensaje } = await import('@/src/assistant/hilos');

  let preparado;
  try {
    preparado = await prepararTurno(gate.ctx, cuerpo);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No pude preparar el turno.' },
      { status: 500 },
    );
  }

  const ambito = { orgId: gate.ctx.orgId, projectId: id, userId: gate.ctx.user.id };
  const cabecera = cabeceraDeAvisos(preparado.avisos);

  if (!quiereEnVivo) {
    try {
      const { preguntarAlAsistente } = await import('@/src/agent/project-agent');
      const r = await preguntarAlAsistente(preparado.entrada);
      const texto = cabecera + r.texto;
      await guardarMensaje({
        ambito,
        conversationId: preparado.hilo.id,
        role: 'assistant',
        content: texto,
        metadata: { piezas: r.piezas, publicado: r.publicado },
      }).catch(() => undefined);

      return NextResponse.json({
        respuesta: texto,
        piezas: r.piezas,
        publicado: r.publicado,
        conversationId: preparado.hilo.id,
        proyecto: gate.ctx.project.name,
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'No pude contestar.' },
        { status: 500 },
      );
    }
  }

  /* ---- transmitido ---- */

  const codificador = new TextEncoder();
  const flujo = new ReadableStream<Uint8Array>({
    async start(control) {
      const mandar = (tipo: string, dato: unknown) => {
        control.enqueue(codificador.encode(`event: ${tipo}\ndata: ${JSON.stringify(dato)}\n\n`));
      };

      // Lo primero que sale es el id del hilo: si el usuario cierra la pestaña
      // a media respuesta, el navegador ya sabe a qué hilo volver.
      mandar('hilo', { conversationId: preparado!.hilo.id });
      if (cabecera) mandar('texto', { delta: cabecera });
      // Los adjuntos ya se leyeron (eso pasó en `prepararTurno`); lo que sigue
      // es el modelo. Decirlo cambia "se colgó" por "está trabajando".
      mandar('estado', { texto: 'Goossip está escribiendo…' });

      let completo = cabecera;
      let piezas: unknown[] = [];
      let publicado: string | null = null;

      try {
        const { conversarEnVivo } = await import('@/src/agent/project-agent');
        for await (const evento of conversarEnVivo(preparado!.entrada)) {
          if (evento.tipo === 'texto') {
            completo += evento.delta;
            mandar('texto', { delta: evento.delta });
          } else if (evento.tipo === 'fin') {
            piezas = evento.respuesta.piezas;
            publicado = evento.respuesta.publicado;
          } else {
            mandar('error', { mensaje: evento.mensaje });
          }
        }
      } catch (e) {
        const motivo = e instanceof Error ? e.message : 'No pude contestar.';
        mandar('error', { mensaje: motivo });
        // Se guarda el fracaso también. Un hilo donde el turno del usuario
        // existe y la respuesta no deja al siguiente turno hablándole a un
        // hueco: el modelo ve la pregunta sin contestar y la contesta otra vez.
        await guardarMensaje({
          ambito,
          conversationId: preparado!.hilo.id,
          role: 'assistant',
          content: `No pude contestar: ${motivo}`,
          metadata: { error: true },
        }).catch(() => undefined);
        control.close();
        return;
      }

      await guardarMensaje({
        ambito,
        conversationId: preparado!.hilo.id,
        role: 'assistant',
        content: completo,
        metadata: { piezas: piezas as never, publicado },
      }).catch(() => undefined);

      mandar('fin', { piezas, publicado, conversationId: preparado!.hilo.id });
      control.close();
    },
  });

  return new Response(flujo, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Sin esto, el proxy de Vercel junta la respuesta y la suelta completa al
      // final: el stream "funciona" y el usuario no ve un solo token antes.
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await apiProject(id, { capability: 'ver' });
  if (!gate.ok) return gate.res;

  const pedido = req.nextUrl.searchParams.get('conversation');

  try {
    const { getHilo, listarHilos, mensajesDelHilo } = await import('@/src/assistant/hilos');
    const ambito = { orgId: gate.ctx.orgId, projectId: id, userId: gate.ctx.user.id };

    const hilo = pedido
      ? await getHilo(ambito, pedido)
      : (await listarHilos(ambito, { limite: 1 }))[0] ?? null;

    if (!hilo) return NextResponse.json({ conversationId: null, mensajes: [] });

    const filas = await mensajesDelHilo(ambito, hilo.id);
    return NextResponse.json({
      conversationId: hilo.id,
      titulo: hilo.title,
      mensajes: filas.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        piezas: m.metadata?.piezas ?? [],
        publicado: m.metadata?.publicado ?? null,
        adjuntos: m.metadata?.adjuntos ?? [],
        menciones: m.metadata?.menciones ?? [],
        createdAt: m.createdAt,
      })),
    });
  } catch {
    return NextResponse.json({ conversationId: null, mensajes: [] });
  }
}
