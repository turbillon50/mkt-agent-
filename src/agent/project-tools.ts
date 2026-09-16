/**
 * Las herramientas del Asistente, ATADAS a un proyecto.
 *
 * No es un registro global de tools como hasta la corrida 5: es una FÁBRICA.
 * `toolsParaProyecto(ctx)` devuelve el juego de herramientas con el proyecto
 * ya cerrado dentro de cada una. El modelo nunca escribe un `projectId`, así
 * que nunca puede escribir el del cliente de al lado.
 *
 * La otra regla que se cumple sola por construcción: toda identidad de canal
 * es `composioUserId(project.id)`. Ninguna tool de aquí llama a la API de un
 * proveedor con un token del entorno — todas salen por `src/channels`, que es
 * la única puerta y que ya usa la cuenta del proyecto.
 *
 * Y una tercera, del issue: `generarTextoDePost` SIEMPRE ofrece la pieza. No es
 * cortesía — un post sin imagen rinde la mitad, y el usuario no siempre sabe
 * que se la podemos hacer.
 */
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { knowledge, posts } from '../db/schema';
import { remember, recall } from '../memory/index';
import { buscarDiseno } from '../design/knowledge';
import {
  CANALES_DE_PUBLICACION,
  publishTo,
} from '../channels/index';
import { activeAccountFor } from '../projects/composio-connections';
import { generarPiezas, generarConHiggsfield } from '../creative/engine';
import { guardarLote, guardarUna, marcarPublicada, piezaAprobadaDe } from '../creative/repo';
import { elegirFormato, esRed, formatosDe, RED_LABEL, REDES, specEnPalabras } from '../creative/specs';
import { palabrasProhibidasEn } from '../creative/brand-kit';
import { generatePost } from '../generator';
import { readUrl, search } from '../jina';
import { sendViaBridge } from '../whatsapp/bridge';
import { insertMessage } from '../whatsapp/repo';
import { whatsappHabilitado, WHATSAPP_APAGADO } from '../banderas';
import type { AgentContext } from './project-context';

/** El canal por el que se publica en cada red que Goossip sabe publicar. */
const TOOLKIT_DE_RED: Record<string, string> = {
  facebook: 'facebook',
  instagram: 'instagram',
  linkedin: 'linkedin',
  twitter: 'twitter',
  tiktok: 'tiktok',
  youtube: 'youtube',
};

const REDES_PUBLICABLES = z.enum([
  'facebook',
  'instagram',
  'linkedin',
  'twitter',
  'tiktok',
  'youtube',
]);

function soloOperadores(ctx: AgentContext, que: string): void {
  if (!ctx.puedeOperar) {
    throw new Error(
      `Quien te está hablando no tiene permiso para ${que} en ${ctx.project.name}. Díselo y ofrécele avisarle a quien manda en el proyecto.`,
    );
  }
}

export function toolsParaProyecto(ctx: AgentContext) {
  const { project, orgId } = ctx;

  // -------------------------------------------------------------- contenido
  const generarTextoDePost = createTool({
    id: 'generar-texto-de-post',
    /**
     * Esta descripción decía "ofrécesela al usuario con esas palabras ANTES de
     * publicar nada". Eso convertía cada publicación en tres turnos —la QA lo
     * midió: 8.8 s pidiendo permiso, 16.7 s enseñando piezas, 6.3 s
     * publicando— aunque el usuario hubiera escrito "hazlo ya, sin preguntarme
     * nada más".
     *
     * La oferta sigue existiendo porque un post sin imagen rinde la mitad. Lo
     * que se va es la ORDEN de esperar: quien ya dijo que no quiere que le
     * pregunten, no quiere que le pregunten.
     */
    description:
      'Escribe el texto de UNA publicación para una red, con la voz de la marca de este proyecto. Devuelve el texto y, aparte, una oferta de hacerle la imagen. Ofrécela cuando el usuario no haya dicho ya que quiere publicar de una vez; si pidió publicar ya, publica y menciona la imagen después.',
    inputSchema: z.object({
      red: REDES_PUBLICABLES,
      tema: z.string().min(3).describe('De qué va la publicación.'),
      angulo: z.string().optional().describe('El enfoque o el gancho, si el usuario lo dijo.'),
    }),
    outputSchema: z.object({
      texto: z.string(),
      ofreceImagen: z.string(),
      medidas: z.string(),
    }),
    execute: async (input) => {
      const plataforma =
        input.red === 'facebook' ? 'meta' : input.red === 'instagram' ? 'instagram' : input.red === 'linkedin' ? 'linkedin' : 'twitter';
      const texto = await generatePost({
        platform: plataforma as never,
        topic: input.tema,
        angle: input.angulo,
      });

      const prohibidas = palabrasProhibidasEn(ctx.kit, texto);
      const formato = elegirFormato(input.red as never);

      return {
        texto: prohibidas.length
          ? `${texto}\n\n(Ojo: aquí se me colaron palabras que la marca tiene prohibidas — ${prohibidas.join(', ')}. Dime y lo reescribo.)`
          : texto,
        ofreceImagen:
          input.red === 'instagram'
            ? '¿Le hago la imagen? Instagram no deja publicar sin una.'
            : '¿Le hago la imagen? Te doy tres opciones con los colores de tu marca.',
        medidas: `${formato.label}: ${formato.ancho} × ${formato.alto} px.`,
      };
    },
  });

  const hacerPieza = createTool({
    id: 'hacer-pieza',
    description:
      'Hace la PIEZA GRÁFICA de una publicación: elige el formato que pide la red, genera la imagen con los colores y el logo del proyecto, y devuelve 3 opciones para que el usuario elija. Úsala cuando el usuario diga que sí a la imagen, o cuando pida "hazme la pieza para Instagram de este post".',
    inputSchema: z.object({
      red: z.enum(REDES as unknown as [string, ...string[]]),
      brief: z.string().min(4).describe('De qué va la pieza, con las palabras del usuario.'),
      formato: z
        .string()
        .optional()
        .describe('Pista del formato: "historia", "reel", "cuadrado", "carrusel", "miniatura".'),
      titular: z.string().optional().describe('El texto grande que va encima de la imagen.'),
      cta: z.string().optional().describe('El botón: "Agenda tu visita", "Pide informes".'),
    }),
    outputSchema: z.object({
      formato: z.string(),
      medidas: z.string(),
      opciones: z.array(z.object({ id: z.string(), angulo: z.string(), url: z.string() })),
      comoSeArmo: z.string(),
    }),
    execute: async (input) => {
      soloOperadores(ctx, 'hacer piezas');
      if (!esRed(input.red)) throw new Error('Esa red no está en el catálogo.');

      const prohibidas = palabrasProhibidasEn(
        ctx.kit,
        [input.brief, input.titular, input.cta].filter(Boolean).join(' '),
      );
      if (prohibidas.length) {
        throw new Error(
          `La marca de ${project.name} tiene prohibidas estas palabras: ${prohibidas.join(', ')}. Propón otras y lo volvemos a intentar.`,
        );
      }

      const resultado = await generarPiezas({
        project,
        kit: ctx.kit,
        red: input.red,
        formatoPista: input.formato ?? null,
        brief: input.brief,
        titular: input.titular ?? null,
        cta: input.cta ?? null,
      });
      const filas = await guardarLote({
        project,
        kit: ctx.kit,
        red: input.red,
        brief: input.brief,
        resultado,
      });

      return {
        formato: resultado.formato.label,
        medidas: `${resultado.formato.ancho} × ${resultado.formato.alto} px (${resultado.formato.ratio})`,
        opciones: filas.map((f) => ({
          id: f.id,
          angulo: String((f.metadata as any)?.angulo ?? 'opción'),
          url: f.url ?? '',
        })),
        comoSeArmo: resultado.notaCompositor,
      };
    },
  });

  const fotoDeProducto = createTool({
    id: 'foto-de-producto',
    description:
      'Hace una foto de producto, una toma con una persona usando el producto (UGC) o un video corto. Es otro motor, especializado en eso — úsalo cuando pidan "una foto de producto", "un video", "alguien usándolo" o "un anuncio con actor".',
    inputSchema: z.object({
      encargo: z.enum(['producto', 'ugc', 'anuncio', 'video']),
      red: z.enum(REDES as unknown as [string, ...string[]]),
      brief: z.string().min(4),
      formato: z.string().optional(),
    }),
    outputSchema: z.object({ url: z.string(), nota: z.string() }),
    execute: async (input) => {
      soloOperadores(ctx, 'hacer piezas');
      if (!esRed(input.red)) throw new Error('Esa red no está en el catálogo.');
      const r = await generarConHiggsfield({
        project,
        kit: ctx.kit,
        encargo: input.encargo,
        red: input.red,
        formatoPista: input.formato ?? null,
        brief: input.brief,
      });
      if ('error' in r) throw new Error(r.error);
      const fila = await guardarUna({
        project,
        kit: ctx.kit,
        red: input.red,
        formatoId: r.formato.id,
        brief: input.brief,
        pieza: r.pieza,
        motor: 'higgsfield',
      });
      return { url: fila.url ?? r.pieza.url, nota: r.pieza.nota ?? 'Lista.' };
    },
  });

  // ------------------------------------------------------------- publicar
  const publicarPost = createTool({
    id: 'publicar-post',
    description:
      'Publica de verdad en la red que el usuario aprobó, CON LA CUENTA DE ESTE PROYECTO. Úsala solo cuando el usuario ya dijo que sí al texto. Si hay una pieza aprobada para esa red, se adjunta sola.',
    inputSchema: z.object({
      red: REDES_PUBLICABLES,
      texto: z.string().min(1),
      tema: z.string().optional(),
      piezaId: z.string().optional().describe('Id de la pieza que el usuario eligió, si eligió una.'),
    }),
    /**
     * `publicado` y `externalUrl` son la REGLA DURA del issue #47.
     *
     * La QA midió al Asistente publicando de verdad
     * (`urn:li:share:7505967549709213696`, fila `9ec7abe3` en `posts`) y
     * contestándole al usuario que había fallado por contenido duplicado. Quien
     * lee esa respuesta vuelve a publicar y sale doble.
     *
     * Con estos dos campos el resultado de la tool ya no se puede interpretar:
     * `publicado:true` significa que hay un post allá afuera, y
     * `src/agent/project-agent.ts` reescribe la respuesta final si el modelo se
     * atreve a decir lo contrario.
     */
    outputSchema: z.object({
      publicado: z.boolean(),
      externalUrl: z.string().nullable(),
      url: z.string().nullable(),
      cuenta: z.string(),
      conImagen: z.boolean(),
    }),
    execute: async (input) => {
      soloOperadores(ctx, 'publicar');
      const toolkit = TOOLKIT_DE_RED[input.red];
      if (!toolkit) throw new Error(`Por ${input.red} todavía no se publica.`);

      const cuenta = await activeAccountFor(project, toolkit).catch(() => null);
      if (!cuenta) {
        throw new Error(
          `${project.name} no tiene ${RED_LABEL[input.red as never] ?? input.red} conectado. Dile al usuario que entre a Conexiones del proyecto y lo conecte — sin eso no se puede publicar con la cuenta de este cliente.`,
        );
      }

      // La pieza: la que eligió, o la última aprobada de esa red.
      const { getPieza } = await import('../creative/repo');
      const pieza = input.piezaId
        ? await getPieza(orgId, project.id, input.piezaId)
        : await piezaAprobadaDe(orgId, project.id, input.red as never);

      if (input.red === 'instagram' && !pieza?.url) {
        throw new Error(
          'Instagram no deja publicar sin imagen. Hazle la pieza primero con hacer-pieza y que el usuario elija una.',
        );
      }

      const out = await publishTo(project, toolkit, {
        texto: input.texto,
        media: pieza?.url ?? null,
      });

      const [fila] = await db
        .insert(posts)
        .values({
          orgId,
          projectId: project.id,
          platform: input.red,
          text: input.texto,
          topic: input.tema ?? null,
          externalId: out.id,
          externalUrl: out.url,
          publishedAt: new Date(),
          metadata: { publicadoPor: ctx.quien, piezaId: pieza?.id ?? null },
        })
        .returning({ id: posts.id });

      if (pieza) await marcarPublicada(pieza.id, fila?.id ?? null);

      await remember({
        refType: 'post',
        refId: fila!.id,
        content: `${input.tema ?? project.name} | ${input.texto}`,
        metadata: { red: input.red, projectId: project.id, conImagen: Boolean(pieza?.url) },
      }).catch(() => undefined);

      return {
        // Si llegamos aquí, `publishTo` no lanzó y la fila ya está en `posts`:
        // el post EXISTE. Cualquier otra lectura de este turno es una mentira.
        publicado: true,
        externalUrl: out.url,
        url: out.url,
        cuenta: `la cuenta de ${RED_LABEL[input.red as never] ?? input.red} de ${project.name}`,
        conImagen: Boolean(pieza?.url),
      };
    },
  });

  // ----------------------------------------------------------- saber cosas
  const medidasDeRed = createTool({
    id: 'medidas-de-red',
    description:
      'Contesta cuánto mide una pieza en una red: píxeles, proporción, peso máximo, duración, límites de texto y zona segura. SIEMPRE cita la fuente oficial y la fecha que devuelve. Úsala en cuanto pregunten "¿qué medidas lleva…?".',
    inputSchema: z.object({
      red: z.enum(REDES as unknown as [string, ...string[]]),
      formato: z
        .string()
        .optional()
        .describe('"reel", "historia", "carrusel", "miniatura", "cuadrado", "video"…'),
    }),
    outputSchema: z.object({
      respuesta: z.string(),
      fuente: z.string(),
      leidoEl: z.string(),
      otrosFormatos: z.array(z.string()),
    }),
    execute: async (input) => {
      if (!esRed(input.red)) throw new Error('Esa red no está en el catálogo.');
      const f = elegirFormato(input.red, input.formato ?? null);
      return {
        respuesta: specEnPalabras(f),
        fuente: f.fuente,
        leidoEl: f.leidoEl,
        otrosFormatos: formatosDe(input.red)
          .filter((o) => o.id !== f.id)
          .map((o) => o.label),
      };
    },
  });

  const buscarEnDiseno = createTool({
    id: 'buscar-en-diseno',
    description:
      'Busca en la memoria de diseño de Goossip: cómo se diseña para cada red, cómo se usa Higgsfield, el protocolo de diseño de la casa y los manuales de marca. Úsala antes de opinar de diseño.',
    inputSchema: z.object({
      pregunta: z.string().min(4),
      tema: z.enum(['higgsfield', 'diseno', 'marca', 'spec-red', 'playbook', 'brain']).optional(),
    }),
    outputSchema: z.object({
      hallazgos: z.array(z.object({ titulo: z.string(), texto: z.string(), fuente: z.string() })),
    }),
    execute: async (input) => {
      const hits = await buscarDiseno(input.pregunta, { k: 4, category: input.tema });
      return {
        hallazgos: hits.map((h) => ({
          titulo: h.title ?? 'sin título',
          texto: h.content.slice(0, 1200),
          fuente: h.sourcePath,
        })),
      };
    },
  });

  const recordar = createTool({
    id: 'recordar',
    description:
      'Busca en lo que este proyecto ya sabe: publicaciones anteriores, su base de conocimiento y sus conversaciones. Úsala para no repetirte y para contestar con sus precios y sus reglas.',
    inputSchema: z.object({ pregunta: z.string().min(3), cuantos: z.number().int().min(1).max(10).optional() }),
    outputSchema: z.object({
      hallazgos: z.array(z.object({ tipo: z.string(), texto: z.string() })),
    }),
    execute: async (input) => {
      const hits = await recall(input.pregunta, { k: input.cuantos ?? 5 });
      return { hallazgos: hits.map((h) => ({ tipo: h.refType, texto: h.content })) };
    },
  });

  const guardarConocimiento = createTool({
    id: 'guardar-conocimiento',
    description:
      'Guarda algo que el usuario le enseñó a Goossip sobre ESTE proyecto: precios, formas de pago, preguntas frecuentes, cómo hablan con sus clientes.',
    inputSchema: z.object({
      contenido: z.string().min(20),
      titulo: z.string().optional(),
      fuente: z.string().optional(),
    }),
    outputSchema: z.object({ ok: z.boolean() }),
    execute: async (input) => {
      soloOperadores(ctx, 'guardar conocimiento');
      const [fila] = await db
        .insert(knowledge)
        .values({
          orgId,
          campaignId: project.id,
          content: input.contenido,
          title: input.titulo ?? null,
          source: input.fuente ?? null,
        })
        .returning({ id: knowledge.id });
      if (fila) {
        await remember({
          refType: 'knowledge',
          refId: fila.id,
          content: input.contenido,
          metadata: { projectId: project.id, titulo: input.titulo },
        }).catch(() => undefined);
      }
      return { ok: Boolean(fila) };
    },
  });

  const postsRecientes = createTool({
    id: 'posts-recientes',
    description: 'Lo último que se publicó EN ESTE PROYECTO. Úsalo antes de escribir para no repetir.',
    inputSchema: z.object({ cuantos: z.number().int().min(1).max(20).optional() }),
    outputSchema: z.object({
      posts: z.array(z.object({ red: z.string(), texto: z.string(), cuando: z.string().nullable() })),
    }),
    execute: async (input) => {
      const filas = await db
        .select()
        .from(posts)
        .where(and(eq(posts.orgId, orgId), eq(posts.projectId, project.id)))
        .orderBy(desc(posts.createdAt))
        .limit(input.cuantos ?? 8);
      return {
        posts: filas.map((r) => ({
          red: r.platform,
          texto: r.text,
          cuando: r.publishedAt?.toISOString() ?? null,
        })),
      };
    },
  });

  const estadoDelProyecto = createTool({
    id: 'estado-del-proyecto',
    description:
      'Cómo está este proyecto ahora: qué canales tiene conectados, si ya cargó su marca, cuántos leads trae sin contactar y cómo va la pauta de Meta (gasto y costo por lead). Úsalo cuando pregunten "¿cómo vamos?", "¿cuánto llevo gastado?" o antes de prometer algo que necesite una conexión.',
    inputSchema: z.object({}),
    outputSchema: z.object({ resumen: z.string() }),
    execute: async () => {
      const { pendientesDelProyecto } = await import('../assistant/guia');
      const g = await pendientesDelProyecto({ orgId, project, kit: ctx.kit });

      // Corrida 11. El gasto de la pauta es la pregunta que Luis hace cada
      // mañana, y hasta hoy el Asistente no la podía contestar: leía canales y
      // leads, nunca dinero. Va aquí y no en una herramienta aparte porque
      // "¿cómo vamos?" y "¿cuánto llevo gastado?" son la misma pregunta.
      //
      // Si Meta Ads no está conectado o Facebook no contesta, esto NO rompe el
      // resumen: se calla esa línea y las demás salen igual.
      let pauta = '';
      try {
        const { resumenAnunciosMeta, resumenEnUnaLinea } = await import('../channels/metaads');
        const r = await resumenAnunciosMeta(project);
        if (r.conectado) pauta = resumenEnUnaLinea(r);
      } catch {
        pauta = '';
      }

      return {
        resumen: [
          `Canales conectados: ${g.conectados.length ? g.conectados.join(', ') : 'ninguno todavía'}.`,
          g.kitCompleto ? 'La marca ya está cargada.' : 'Todavía no hay kit de marca.',
          `Leads sin contactar: ${g.leadsSinContactar}.`,
          pauta,
          g.sugerencias.length
            ? `Lo que yo haría ahora: ${g.sugerencias.map((s) => s.texto).join(' · ')}`
            : 'No hay nada urgente.',
        ]
          .filter(Boolean)
          .join(' '),
      };
    },
  });

  // ----------------------------------------------------------- operación
  const mandarWhatsapp = createTool({
    id: 'mandar-whatsapp',
    description:
      'Manda un WhatsApp desde el número de ESTE proyecto. Solo con un número que el usuario haya dicho y después de que apruebe el texto.',
    inputSchema: z.object({
      a: z.string().min(8).describe('Teléfono en dígitos, sin +.'),
      mensaje: z.string().min(1),
    }),
    outputSchema: z.object({ ok: z.boolean() }),
    execute: async (input) => {
      soloOperadores(ctx, 'mandar mensajes');
      // La compuerta dura del issue #40: WhatsApp no sale hasta que Luis lo
      // abra, y el Asistente es justo el camino por el que se colaría sin que
      // nadie apretara un botón.
      if (!whatsappHabilitado()) throw new Error(WHATSAPP_APAGADO);
      const enviado = await sendViaBridge(input.a, input.mensaje);
      const fila = await insertMessage({
        externalId: enviado.id ?? null,
        fromNumber: input.a,
        toNumber: input.a,
        body: input.mensaje,
        direction: 'outbound',
        respondedBy: 'agente',
        messageTimestamp: new Date(),
      });
      await remember({
        refType: 'whatsapp',
        refId: fila.id,
        content: input.mensaje,
        metadata: { a: input.a, projectId: project.id, quien: ctx.quien },
      }).catch(() => undefined);
      return { ok: true };
    },
  });

  const leerUrl = createTool({
    id: 'leer-url',
    description: 'Lee una página web y devuelve su texto limpio. Para revisar la competencia o una página que el usuario pegó.',
    inputSchema: z.object({ url: z.string().url(), maxChars: z.number().int().max(40000).optional() }),
    outputSchema: z.object({ titulo: z.string().nullable(), contenido: z.string() }),
    execute: async (input) => {
      const r = await readUrl(input.url, { maxChars: input.maxChars });
      return { titulo: r.title, contenido: r.content };
    },
  });

  const buscarEnWeb = createTool({
    id: 'buscar-en-web',
    description: 'Busca en internet. Para datos frescos que Goossip no puede saber de memoria.',
    inputSchema: z.object({ consulta: z.string().min(3) }),
    outputSchema: z.object({
      resultados: z.array(z.object({ titulo: z.string(), url: z.string(), resumen: z.string() })),
    }),
    execute: async (input) => {
      const r = await search(input.consulta);
      return {
        resultados: (r.results ?? []).slice(0, 5).map((x) => ({
          titulo: x.title ?? '',
          url: x.url ?? '',
          resumen: (x.snippet ?? x.content ?? '').slice(0, 400),
        })),
      };
    },
  });

  // ------------------------------------------------------------- correo
  /**
   * Gmail existía por Composio desde la corrida 5 y **la app no lo usaba**: la
   * QA mandó un correo real por abajo (`1a0aa34f567ccf84`) mientras Goossip
   * contestaba `{"configured":false}`. Esta es la mitad que faltaba del lado
   * del Asistente.
   */
  const mandarCorreo = createTool({
    id: 'mandar-correo',
    description:
      'Manda un correo DESDE la cuenta de Gmail de este proyecto: seguimiento a un lead, confirmar una cita, mandar la información que pidieron. Úsala cuando el usuario diga "mándale un correo", "escríbele", "hazle seguimiento por mail". El texto se lo enseñas antes si el usuario no dijo que lo mandes ya.',
    inputSchema: z.object({
      a: z.string().email().describe('El correo de destino.'),
      asunto: z.string().min(3).max(140),
      mensaje: z.string().min(10),
    }),
    outputSchema: z.object({
      enviado: z.boolean(),
      a: z.string(),
      cuenta: z.string(),
    }),
    execute: async (input) => {
      soloOperadores(ctx, 'mandar correos');
      const { gmail } = await import('../channels/operacion');
      await gmail.sendEmail!(project, {
        to: input.a,
        subject: input.asunto,
        body: input.mensaje,
      });
      return {
        // Igual que `publicar-post`: si no lanzó, salió. No se narra otra cosa.
        enviado: true,
        a: input.a,
        cuenta: `el Gmail de ${project.name}`,
      };
    },
  });

  // ------------------------------------------------------------ YouTube
  const videosDelCanal = createTool({
    id: 'videos-del-canal',
    description:
      'Los videos del canal de YouTube de este proyecto, con sus vistas, likes y comentarios. Úsala cuando pregunten "¿cómo van mis videos?", "qué he subido a YouTube" o "cuál video jaló más".',
    inputSchema: z.object({ cuantos: z.number().int().min(1).max(25).optional() }),
    outputSchema: z.object({
      canal: z.string().nullable(),
      videos: z.array(
        z.object({
          titulo: z.string(),
          url: z.string(),
          vistas: z.number().nullable(),
          likes: z.number().nullable(),
          publicado: z.string().nullable(),
        }),
      ),
    }),
    execute: async (input) => {
      const { videosDeYoutube } = await import('../channels/publicacion');
      const r = await videosDeYoutube(project, input.cuantos ?? 10);
      return {
        canal: r.canal?.nombre ?? null,
        videos: r.videos.map((v) => ({
          titulo: v.titulo,
          url: v.url,
          vistas: v.vistas,
          likes: v.likes,
          publicado: v.publicado,
        })),
      };
    },
  });

  // ---------------------------------------------------- bandeja social
  const conversacionesPendientes = createTool({
    id: 'conversaciones-pendientes',
    description:
      'Los hilos de Messenger, DMs de Instagram y WhatsApp de este proyecto: quién escribió, qué dijo y cuáles están sin leer. Úsala cuando pregunten "¿quién me escribió?", "¿tengo mensajes?", "qué hay en el Instagram".',
    inputSchema: z.object({ soloSinLeer: z.boolean().optional() }),
    outputSchema: z.object({
      hilos: z.array(
        z.object({
          id: z.string(),
          canal: z.string(),
          quien: z.string(),
          ultimoTexto: z.string().nullable(),
          sinLeer: z.number(),
          tePuedeContestar: z.boolean(),
        }),
      ),
    }),
    execute: async (input) => {
      const { hilosDelProyecto } = await import('../projects/bandeja-social');
      const todos = await hilosDelProyecto(orgId, project.id, 40);
      const hilos = input.soloSinLeer ? todos.filter((h) => h.sinLeer > 0) : todos;
      return {
        hilos: hilos.map((h) => ({
          id: h.id,
          canal: h.canal,
          quien: h.quien,
          ultimoTexto: h.ultimoTexto,
          sinLeer: h.sinLeer,
          tePuedeContestar: h.respondible,
        })),
      };
    },
  });

  const contestarConversacion = createTool({
    id: 'contestar-conversacion',
    description:
      'Contesta un hilo de Messenger o de un DM de Instagram, con la cuenta de este proyecto. Úsala solo cuando el usuario ya aprobó el texto. El id del hilo sale de conversaciones-pendientes.',
    inputSchema: z.object({
      hiloId: z.string().min(8),
      mensaje: z.string().min(1),
    }),
    outputSchema: z.object({ enviado: z.boolean(), canal: z.string() }),
    execute: async (input) => {
      soloOperadores(ctx, 'contestar mensajes');
      const { hilosDelProyecto, responderEnHilo } = await import('../projects/bandeja-social');
      const hilo = (await hilosDelProyecto(orgId, project.id, 200)).find(
        (h) => h.id === input.hiloId,
      );
      if (!hilo) throw new Error('Ese hilo no es de este proyecto.');

      const r = await responderEnHilo({
        project,
        conversacionId: input.hiloId,
        texto: input.mensaje,
        // Quién contestó queda en el mensaje guardado. Sin nombre, "Goossip":
        // el hilo tiene que decir quién habló, aunque haya sido el agente.
        quien: ctx.quien ?? 'Goossip',
      });
      if (!r.ok) throw new Error(r.motivo ?? 'No se pudo mandar.');
      return { enviado: true, canal: String(hilo.canal) };
    },
  });

  // -------------------------------------------------------- prospección
  const buscarNegocios = createTool({
    id: 'buscar-negocios',
    description:
      'Busca NEGOCIOS reales por giro y zona en Google Maps y los deja en la lista de Prospección del proyecto: nombre, dirección, teléfono, sitio y rating. Úsala cuando pidan "encuéntrame restaurantes en Tulum", "quiénes hay de este giro en tal colonia", "sácame prospectos". Solo negocios: nunca busques personas.',
    inputSchema: z.object({
      consulta: z
        .string()
        .min(4)
        .describe('El giro y la zona con las palabras del usuario: "restaurantes en Tulum".'),
      cuantos: z.number().int().min(1).max(20).optional(),
    }),
    outputSchema: z.object({
      encontrados: z.number(),
      nuevos: z.number(),
      via: z.string(),
      busquedasDelMes: z.number(),
      tope: z.number(),
      negocios: z.array(
        z.object({
          nombre: z.string(),
          telefono: z.string().nullable(),
          sitio: z.string().nullable(),
          rating: z.string().nullable(),
          direccion: z.string().nullable(),
        }),
      ),
    }),
    execute: async (input) => {
      soloOperadores(ctx, 'prospectar');
      const { buscarNegocios: buscar } = await import('../prospeccion/maps');
      const r = await buscar({
        project,
        consulta: input.consulta,
        limite: input.cuantos ?? 20,
        quien: ctx.quien,
      });
      return {
        encontrados: r.encontrados,
        nuevos: r.nuevos,
        via: r.via === 'composio' ? 'la cuenta de Google del proyecto' : 'la cuenta de Goossip',
        busquedasDelMes: r.costo.mes,
        tope: r.costo.tope,
        negocios: r.prospectos.slice(0, 20).map((p) => ({
          nombre: p.name,
          telefono: p.phone,
          sitio: p.website,
          rating: p.rating,
          direccion: p.address,
        })),
      };
    },
  });

  // -------------------------------------------------------- competencia
  const leerCompetencia = createTool({
    id: 'leer-competencia',
    description:
      'Contesta "¿qué hace la competencia?" con lo ÚLTIMO que se leyó de los rivales de este proyecto y de sus propias redes: cada cuánto publican, qué formatos usan y de dónde salió cada número. Si no hay rivales dados de alta, dilo y manda a la sección Competencia del proyecto.',
    inputSchema: z.object({ releer: z.boolean().optional().describe('Volver a leer ahora mismo.') }),
    outputSchema: z.object({
      veredicto: z.array(z.string()),
      filas: z.array(
        z.object({
          quien: z.string(),
          red: z.string(),
          porSemana: z.number().nullable(),
          fuente: z.string(),
          motivo: z.string().nullable(),
        }),
      ),
    }),
    execute: async (input) => {
      const { comparativo, leerPropio, leerRival, listarRivales } = await import(
        '../competencia/lectura'
      );
      if (input.releer && ctx.puedeOperar) {
        await leerPropio(project).catch(() => undefined);
        for (const rival of await listarRivales(orgId, project.id)) {
          await leerRival(project, rival).catch(() => undefined);
        }
      }
      const c = await comparativo(orgId, project.id);
      return {
        veredicto: c.veredicto,
        filas: c.filas.map((f) => ({
          quien: f.quien,
          red: f.red,
          porSemana: f.porSemana,
          fuente: f.fuente,
          motivo: f.motivo,
        })),
      };
    },
  });

  return {
    generarTextoDePost,
    hacerPieza,
    fotoDeProducto,
    publicarPost,
    medidasDeRed,
    buscarEnDiseno,
    recordar,
    guardarConocimiento,
    postsRecientes,
    estadoDelProyecto,
    mandarCorreo,
    videosDelCanal,
    conversacionesPendientes,
    contestarConversacion,
    // Con la bandera abajo, WhatsApp ni siquiera entra al menú del modelo. Una
    // herramienta que va a tronar en cuanto se llame no es una salvaguarda: es
    // una promesa que el Asistente le hace al usuario y después rompe.
    ...(whatsappHabilitado() ? { mandarWhatsapp } : {}),
    leerUrl,
    buscarEnWeb,
    buscarNegocios,
    leerCompetencia,
  };
}

export { CANALES_DE_PUBLICACION };
