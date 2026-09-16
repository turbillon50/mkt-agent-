/**
 * Un turno del Asistente, de punta a punta.
 *
 * Existe para que la ruta no tenga dos versiones de la misma lógica. El compose
 * de escritorio pide el turno TRANSMITIDO (SSE) y el cajón de celular lo pide
 * de un golpe (JSON); si cada camino armara el contexto por su cuenta, el día
 * que se agregue algo al contexto se agregaría en uno solo y el celular
 * contestaría distinto que el escritorio sin que nadie se entere.
 *
 * Aquí se hacen, en este orden y por estas razones:
 *   1. Se resuelve el hilo (o se abre). Antes de leer nada: si el hilo no se
 *      puede abrir, no vale la pena leer un PDF de 40 páginas.
 *   2. Se leen los adjuntos que todavía no se habían leído, en paralelo.
 *   3. Se relee lo que el usuario mencionó con `@`, de la base, no de lo que
 *      mandó el navegador.
 *   4. Se expande el comando con barra, si había uno.
 *   5. Se guarda el mensaje del usuario ANTES de contestar. Si el modelo se
 *      cae, lo que el usuario escribió sigue ahí.
 */
import type { ProjectContext } from '../../lib/project-access';
import { autonomiaEfectiva, type Autonomia } from './autonomia';
import type { AdjuntoLeido, EntradaDelAsistente, Turno } from '../agent/project-agent';
import { expandirComando } from './comandos';
import {
  archivosPorId,
  guardarMensaje,
  hiloParaEscribir,
  marcarLectura,
  mensajesDelHilo,
  type AssistantConversation,
  type AssistantFile,
} from './hilos';
import { leerAdjunto } from './lectura';
import { getBrandKit } from '../creative/brand-kit';
import { contextoDeMenciones } from './menciones';

/** Cuántos turnos anteriores se le pasan al modelo. */
const HISTORIA = 12;

export interface CuerpoDelTurno {
  mensaje?: unknown;
  conversationId?: unknown;
  adjuntos?: unknown;
  menciones?: unknown;
  autonomia?: unknown;
  pantalla?: unknown;
  imagen?: unknown;
}

export interface TurnoPreparado {
  hilo: AssistantConversation;
  entrada: EntradaDelAsistente;
  /** Lo que se guarda en el mensaje del usuario para poder volver a pintarlo. */
  adjuntosMeta: Array<{ id: string; name: string; mime: string; size: number; url: string }>;
  menciones: Array<{ tipo: string; id: string; etiqueta: string }>;
  autonomia: Autonomia;
  /** Los avisos de lectura que hay que enseñar arriba de la respuesta. */
  avisos: string[];
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function ids(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 10) : [];
}

function mencionesDe(v: unknown): Array<{ tipo: string; id: string; etiqueta: string }> {
  if (!Array.isArray(v)) return [];
  return v
    .filter((m): m is Record<string, string> => Boolean(m) && typeof m === 'object')
    .map((m) => ({
      tipo: String(m.tipo ?? ''),
      id: String(m.id ?? ''),
      etiqueta: String(m.etiqueta ?? ''),
    }))
    .filter((m) => m.tipo && m.id)
    .slice(0, 10);
}

/**
 * Lee los adjuntos que hagan falta y deja la lectura guardada.
 *
 * Lo que ya se leyó no se vuelve a leer: es la diferencia entre contestar en
 * dos segundos el segundo mensaje de una conversación con un PDF adjunto, y
 * volver a pagar el PDF entero cada vez que alguien escribe.
 */
async function leerLoQueFalte(
  projectId: string,
  archivos: AssistantFile[],
): Promise<{ leidos: AdjuntoLeido[]; avisos: string[] }> {
  const leidos = await Promise.all(
    archivos.map(async (a): Promise<AdjuntoLeido> => {
      if (a.extractStatus !== 'pendiente') {
        return {
          nombre: a.name,
          mime: a.mime,
          estado: a.extractStatus,
          texto: a.extractedText,
          nota: a.extractNote,
        };
      }
      const lectura = await leerAdjunto({
        nombre: a.name,
        url: a.url,
        mime: a.mime,
        size: a.size,
      });
      await marcarLectura(a.id, projectId, lectura).catch(() => undefined);
      return {
        nombre: a.name,
        mime: a.mime,
        estado: lectura.estado,
        texto: lectura.texto,
        nota: lectura.nota,
      };
    }),
  );

  // Los avisos que el usuario TIENE que ver: lo que no se pudo leer y lo que se
  // leyó a medias. Esconderlos en las instrucciones del modelo y confiar en que
  // los repita es confiar en un modelo para dar una mala noticia.
  const avisos = leidos
    .filter((l) => l.estado !== 'leido' || (l.nota && l.texto))
    .map((l) => `**${l.nombre}** — ${l.nota ?? 'no se pudo leer'}`);

  return { leidos, avisos };
}

export async function prepararTurno(
  ctx: ProjectContext,
  cuerpo: CuerpoDelTurno,
): Promise<TurnoPreparado> {
  const ambito = { orgId: ctx.orgId, projectId: ctx.project.id, userId: ctx.user.id };

  const hilo = await hiloParaEscribir(ambito, texto(cuerpo.conversationId) || null);

  const [archivos, previos, kit] = await Promise.all([
    archivosPorId(ctx.project.id, ids(cuerpo.adjuntos)),
    mensajesDelHilo(ambito, hilo.id, HISTORIA * 2),
    getBrandKit(ctx.orgId, ctx.project.id).catch(() => null),
  ]);

  const { leidos, avisos } = await leerLoQueFalte(ctx.project.id, archivos);

  const menciones = mencionesDe(cuerpo.menciones);
  const bloqueMenciones = await contextoDeMenciones(ctx.project, ctx.orgId, menciones).catch(
    () => null,
  );

  // El selector dice lo que el usuario quiere; `puedeOperar` dice lo que se le
  // permite. Un lector con "Publica solo" en su navegador sale de aquí en
  // "Propone", y ni siquiera se entera de que se lo bajaron: las tools de
  // publicar tampoco se le arman.
  const autonomia = autonomiaEfectiva(texto(cuerpo.autonomia), ctx.can('operar'));

  const crudo = texto(cuerpo.mensaje);
  const mensaje = expandirComando(crudo);

  const historia: Turno[] = previos
    .slice(-HISTORIA)
    .map((m) => ({ role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const), content: m.content }));

  const adjuntosMeta = archivos.map((a) => ({
    id: a.id,
    name: a.name,
    mime: a.mime,
    size: a.size,
    url: a.url,
  }));

  // El mensaje del usuario se guarda ANTES de contestar. Si el modelo revienta
  // o el usuario cierra la pestaña, lo que escribió sigue en su hilo — que es
  // lo mínimo que se espera de algo que se llama historial.
  await guardarMensaje({
    ambito,
    conversationId: hilo.id,
    role: 'user',
    // Se guarda lo que el usuario ESCRIBIÓ, no el comando expandido: al
    // recargar tiene que ver "/pieza para el lanzamiento", que es lo que hizo,
    // y no el párrafo que la app le puso al modelo.
    content: crudo || '(archivo adjunto)',
    metadata: {
      adjuntos: adjuntosMeta,
      menciones,
      autonomia,
      pantalla: texto(cuerpo.pantalla) || undefined,
    },
  });

  const imagen = texto(cuerpo.imagen);

  return {
    hilo,
    adjuntosMeta,
    menciones,
    autonomia,
    avisos,
    entrada: {
      ctx: {
        project: ctx.project,
        orgId: ctx.orgId,
        quien: ctx.user.email ?? ctx.clerkUserId,
        puedeOperar: ctx.can('operar'),
        kit,
      },
      historia,
      mensaje: mensaje || 'Mira lo que te adjunté y dime qué ves.',
      adjuntos: leidos,
      menciones: bloqueMenciones,
      autonomia,
      pantalla: texto(cuerpo.pantalla) || null,
      userId: ctx.user.id,
      imagenDataUrl: imagen.startsWith('data:image/') ? imagen : null,
    },
  };
}

/** Lo que se antepone a la respuesta cuando hubo problemas de lectura. */
export function cabeceraDeAvisos(avisos: string[]): string {
  if (!avisos.length) return '';
  return `${avisos.map((a) => `> ⚠️ ${a}`).join('\n>\n')}\n\n`;
}
