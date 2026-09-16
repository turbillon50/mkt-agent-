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
    description:
      'Escribe el texto de UNA publicación para una red, con la voz de la marca de este proyecto. Devuelve el texto y, SIEMPRE, la oferta de hacerle la imagen: ofrécesela al usuario con esas palabras antes de publicar nada.',
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
    outputSchema: z.object({
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
      'Cómo está este proyecto ahora: qué canales tiene conectados, si ya cargó su marca y cuántos leads trae sin contactar. Úsalo cuando pregunten "¿cómo vamos?" o antes de prometer algo que necesite una conexión.',
    inputSchema: z.object({}),
    outputSchema: z.object({ resumen: z.string() }),
    execute: async () => {
      const { pendientesDelProyecto } = await import('../assistant/guia');
      const g = await pendientesDelProyecto({ orgId, project, kit: ctx.kit });
      return {
        resumen: [
          `Canales conectados: ${g.conectados.length ? g.conectados.join(', ') : 'ninguno todavía'}.`,
          g.kitCompleto ? 'La marca ya está cargada.' : 'Todavía no hay kit de marca.',
          `Leads sin contactar: ${g.leadsSinContactar}.`,
          g.sugerencias.length
            ? `Lo que yo haría ahora: ${g.sugerencias.map((s) => s.texto).join(' · ')}`
            : 'No hay nada urgente.',
        ].join(' '),
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
    mandarWhatsapp,
    leerUrl,
    buscarEnWeb,
  };
}

export { CANALES_DE_PUBLICACION };
