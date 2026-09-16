/**
 * Instagram: publicar de verdad (los DOS pasos) y los DMs.
 *
 * La QA del 16-sep dejó la fila 2 a medias: `INSTAGRAM_CREATE_MEDIA_CONTAINER`
 * devolvió el contenedor `18088714910389460` y ahí se paró. El paso que faltaba
 * no es un detalle: **un contenedor sin publicar no es un post**. Meta lo caduca
 * solo a las 24 h y nadie lo ve nunca.
 *
 * Publicar en Instagram por la API son tres tiempos, no dos:
 *
 *   1. CONTENEDOR — se sube la imagen o el video y Meta devuelve un `creation_id`.
 *   2. ESPERAR     — el contenedor pasa por `IN_PROGRESS` antes de `FINISHED`.
 *      Llamar a publicar antes de tiempo falla con un error que parece de
 *      permisos y no lo es. Con foto tarda un par de segundos; con **reel**,
 *      decenas, porque Meta transcodifica el video.
 *   3. PUBLICAR    — `INSTAGRAM_CREATE_POST` con ese `creation_id`.
 *
 * Saltarse el 2 es lo que hace que "a veces sí y a veces no". Aquí se espera
 * con reintentos y un techo, y si se acaba el tiempo se dice en español qué
 * pasó en vez de contestar un error crudo de Meta.
 *
 * Lo que Instagram NO deja hacer, y se dice sin adornos: **no hay forma de
 * borrar un post por la API.** No existe el endpoint. Lo que se publica aquí se
 * queda hasta que alguien lo borre desde la app.
 */
import type { Project } from '../db/schema';
import { cuerpo, run } from './base';

/** Cuánto se espera a que Meta termine de procesar, por tipo de contenido. */
const ESPERA = {
  foto: { intentos: 12, pausaMs: 1_500 },
  video: { intentos: 40, pausaMs: 3_000 },
};

export type TipoDePieza = 'foto' | 'reel' | 'carrusel';

export interface HiloDeInstagram {
  id: string;
  contacto: { id: string | null; nombre: string | null };
  ultimoTexto: string | null;
  ultimoAt: Date | null;
  sinLeer: number;
}

export interface MensajeDeInstagram {
  id: string;
  texto: string;
  de: { id: string | null; nombre: string | null };
  entrante: boolean;
  cuando: Date | null;
}

function fecha(v: unknown): Date | null {
  if (typeof v !== 'string' || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * La cuenta de Instagram del proyecto.
 *
 * Tiene que ser Business o Creator y estar ligada a una página de Facebook; con
 * una cuenta personal la API no publica y el mensaje de Meta no lo explica.
 */
export async function cuentaDeInstagram(project: Project): Promise<string | null> {
  const data: any = cuerpo(
    await run(project, 'instagram', 'INSTAGRAM_GET_USER_INFO', {}).catch(() => null),
  );
  const id = data?.id ?? data?.ig_user_id ?? data?.user?.id ?? null;
  return id ? String(id) : null;
}

/** El handle (@…) de la cuenta conectada, para poder decir en qué cuenta se va a publicar. */
export async function handleDeInstagram(project: Project): Promise<string | null> {
  const data: any = cuerpo(
    await run(project, 'instagram', 'INSTAGRAM_GET_USER_INFO', {}).catch(() => null),
  );
  const h = data?.username ?? data?.user?.username ?? null;
  return h ? String(h) : null;
}

// ---------------------------------------------------------------------------
// Paso 2: esperar a que el contenedor esté FINISHED
// ---------------------------------------------------------------------------

export interface EsperaDeContenedor {
  listo: boolean;
  estado: string;
  intentos: number;
  /** En español, por si no llegó a FINISHED. */
  motivo?: string;
}

/**
 * Espera a que Meta termine de procesar el contenedor.
 *
 * `FINISHED` es el único estado que deja publicar. `ERROR` y `EXPIRED` son
 * finales: reintentar ahí es perder el tiempo del usuario, así que se corta.
 */
export async function esperarContenedor(
  project: Project,
  creationId: string,
  tipo: TipoDePieza = 'foto',
): Promise<EsperaDeContenedor> {
  const plan = tipo === 'reel' ? ESPERA.video : ESPERA.foto;
  let estado = 'DESCONOCIDO';

  for (let i = 1; i <= plan.intentos; i += 1) {
    const data: any = cuerpo(
      await run(project, 'instagram', 'INSTAGRAM_GET_POST_STATUS', {
        creation_id: String(creationId),
      }).catch(() => null),
    );
    estado = String(data?.status_code ?? data?.status ?? 'DESCONOCIDO').toUpperCase();

    if (estado === 'FINISHED') return { listo: true, estado, intentos: i };
    if (estado === 'ERROR' || estado === 'EXPIRED') {
      return {
        listo: false,
        estado,
        intentos: i,
        motivo:
          estado === 'EXPIRED'
            ? 'Instagram dejó caducar la subida. Vuelve a intentarlo.'
            : `Instagram rechazó el archivo${data?.status ? ` (${String(data.status).slice(0, 120)})` : ''}.`,
      };
    }
    await dormir(plan.pausaMs);
  }

  return {
    listo: false,
    estado,
    intentos: plan.intentos,
    motivo:
      tipo === 'reel'
        ? 'Instagram sigue procesando el video. Es normal con reels largos: vuelve a intentarlo en un minuto.'
        : 'Instagram tardó más de lo normal en procesar la imagen. Vuelve a intentarlo.',
  };
}

// ---------------------------------------------------------------------------
// Publicar
// ---------------------------------------------------------------------------

export interface PublicacionDeInstagram {
  id: string | null;
  url: string | null;
  /** El contenedor, para poder diagnosticar si algo se atoró. */
  creationId: string | null;
  tipo: TipoDePieza;
  /** Cuántas vueltas costó que Meta dijera FINISHED. Va a la entrega. */
  esperas: number;
}

/**
 * Publica UNA foto o UN reel. Los tres tiempos completos.
 *
 * `media_type` importa: sin `REELS` un mp4 entra como video de feed, que Meta
 * ya casi no distribuye.
 */
export async function publicarEnInstagram(
  project: Project,
  input: { texto: string; media: string; tipo?: TipoDePieza; coverUrl?: string | null },
): Promise<PublicacionDeInstagram> {
  const igUserId = await cuentaDeInstagram(project);
  if (!igUserId) {
    throw new Error(
      'No encontramos tu cuenta de Instagram. Necesita ser Business o Creator y estar ligada a una página de Facebook.',
    );
  }

  const tipo: TipoDePieza = input.tipo ?? (esVideo(input.media) ? 'reel' : 'foto');

  const contenedor: any = cuerpo(
    await run(project, 'instagram', 'INSTAGRAM_CREATE_MEDIA_CONTAINER', {
      ig_user_id: igUserId,
      caption: input.texto,
      ...(tipo === 'reel'
        ? {
            video_url: input.media,
            media_type: 'REELS',
            ...(input.coverUrl ? { cover_url: input.coverUrl } : {}),
          }
        : { image_url: input.media }),
    }),
  );
  const creationId = contenedor?.id ?? contenedor?.creation_id ?? null;
  if (!creationId) throw new Error('Instagram no aceptó el archivo.');

  const espera = await esperarContenedor(project, String(creationId), tipo);
  if (!espera.listo) throw new Error(espera.motivo ?? 'Instagram no terminó de procesar el archivo.');

  return {
    ...(await publicarContenedor(project, igUserId, String(creationId))),
    creationId: String(creationId),
    tipo,
    esperas: espera.intentos,
  };
}

/**
 * Publica un CARRUSEL: cada imagen es su propio contenedor hijo y después uno
 * padre que los amarra. Meta admite de 2 a 10.
 */
export async function publicarCarruselEnInstagram(
  project: Project,
  input: { texto: string; medias: string[] },
): Promise<PublicacionDeInstagram> {
  if (input.medias.length < 2 || input.medias.length > 10) {
    throw new Error('Un carrusel de Instagram lleva entre 2 y 10 imágenes.');
  }
  const igUserId = await cuentaDeInstagram(project);
  if (!igUserId) throw new Error('No encontramos tu cuenta de Instagram.');

  const hijos: string[] = [];
  for (const media of input.medias) {
    const c: any = cuerpo(
      await run(project, 'instagram', 'INSTAGRAM_CREATE_MEDIA_CONTAINER', {
        ig_user_id: igUserId,
        image_url: media,
        is_carousel_item: true,
      }),
    );
    const id = c?.id ?? c?.creation_id;
    if (!id) throw new Error('Instagram no aceptó una de las imágenes del carrusel.');
    const espera = await esperarContenedor(project, String(id), 'foto');
    if (!espera.listo) throw new Error(espera.motivo ?? 'Una imagen del carrusel no terminó de subir.');
    hijos.push(String(id));
  }

  const padre: any = cuerpo(
    await run(project, 'instagram', 'INSTAGRAM_CREATE_CAROUSEL_CONTAINER', {
      ig_user_id: igUserId,
      children: hijos,
      caption: input.texto,
    }),
  );
  const creationId = padre?.id ?? padre?.creation_id ?? null;
  if (!creationId) throw new Error('Instagram no armó el carrusel.');

  const espera = await esperarContenedor(project, String(creationId), 'foto');
  if (!espera.listo) throw new Error(espera.motivo ?? 'El carrusel no terminó de procesarse.');

  return {
    ...(await publicarContenedor(project, igUserId, String(creationId))),
    creationId: String(creationId),
    tipo: 'carrusel',
    esperas: espera.intentos + hijos.length,
  };
}

async function publicarContenedor(
  project: Project,
  igUserId: string,
  creationId: string,
): Promise<{ id: string | null; url: string | null }> {
  const data: any = cuerpo(
    await run(project, 'instagram', 'INSTAGRAM_CREATE_POST', {
      ig_user_id: igUserId,
      creation_id: creationId,
    }),
  );
  const id = data?.id ?? data?.media_id ?? null;
  if (!id) throw new Error('Instagram aceptó el archivo pero no devolvió el post.');
  return { id: String(id), url: await permalinkDe(project, String(id)) };
}

/**
 * El enlace REAL del post.
 *
 * Hasta la corrida 12 se armaba `instagram.com/p/<id>` con el id numérico del
 * media, y esa URL **no existe**: el shortcode de la barra de direcciones es
 * otra cosa. Se le pregunta a Meta por el `permalink` y, si no contesta, se
 * devuelve null — un enlace roto es peor que ninguno.
 */
async function permalinkDe(project: Project, mediaId: string): Promise<string | null> {
  const data: any = cuerpo(
    await run(project, 'instagram', 'INSTAGRAM_GET_USER_MEDIA', { limit: 5 }).catch(() => null),
  );
  const hit = (data?.data ?? []).find((m: any) => String(m.id) === mediaId);
  return typeof hit?.permalink === 'string' ? hit.permalink : null;
}

function esVideo(url: string): boolean {
  return /\.(mp4|mov|m4v)(\?|$)/i.test(url);
}

// ---------------------------------------------------------------------------
// DMs
// ---------------------------------------------------------------------------

/**
 * Los DMs de la cuenta. La QA midió **8 conversaciones reales** por aquí; lo que
 * faltaba era el cable dentro de Goossip, no el permiso.
 */
export async function conversacionesDeInstagram(
  project: Project,
  input: { limite?: number } = {},
): Promise<HiloDeInstagram[]> {
  const igUserId = await cuentaDeInstagram(project);
  const data: any = cuerpo(
    await run(project, 'instagram', 'INSTAGRAM_LIST_ALL_CONVERSATIONS', {
      limit: input.limite ?? 25,
      ...(igUserId ? { ig_user_id: igUserId } : {}),
    }),
  );

  return (data?.data ?? []).map((h: any) => {
    const otros = (h.participants?.data ?? []).filter(
      (p: any) => !igUserId || String(p.id) !== igUserId,
    );
    const contacto = otros[0] ?? null;
    return {
      id: String(h.id),
      contacto: {
        id: contacto ? String(contacto.id) : null,
        nombre: contacto?.username ?? contacto?.name ?? null,
      },
      ultimoTexto: typeof h.snippet === 'string' ? h.snippet : null,
      ultimoAt: fecha(h.updated_time),
      sinLeer: Number(h.unread_count ?? 0),
    };
  });
}

export async function mensajesDeInstagram(
  project: Project,
  conversationId: string,
  limite = 25,
): Promise<MensajeDeInstagram[]> {
  const igUserId = await cuentaDeInstagram(project);
  const data: any = cuerpo(
    await run(project, 'instagram', 'INSTAGRAM_LIST_ALL_MESSAGES', {
      conversation_id: conversationId,
      limit: limite,
    }),
  );
  return (data?.data ?? []).map((m: any) => ({
    id: String(m.id),
    texto: typeof m.message === 'string' ? m.message : '',
    de: { id: m.from?.id ? String(m.from.id) : null, nombre: m.from?.username ?? m.from?.name ?? null },
    entrante: !igUserId || String(m.from?.id ?? '') !== igUserId,
    cuando: fecha(m.created_time),
  }));
}

export async function responderEnInstagram(
  project: Project,
  input: { destinatarioId: string; texto: string },
): Promise<{ id: string | null }> {
  const igUserId = await cuentaDeInstagram(project);
  const data: any = cuerpo(
    await run(project, 'instagram', 'INSTAGRAM_SEND_TEXT_MESSAGE', {
      recipient_id: input.destinatarioId,
      text: input.texto,
      ...(igUserId ? { ig_user_id: igUserId } : {}),
    }),
  );
  return { id: data?.message_id ?? data?.id ?? null };
}

export async function marcarLeidoEnInstagram(
  project: Project,
  destinatarioId: string,
): Promise<boolean> {
  await run(project, 'instagram', 'INSTAGRAM_MARK_SEEN', { recipient_id: destinatarioId });
  return true;
}

// ---------------------------------------------------------------------------
// Comentarios
// ---------------------------------------------------------------------------

export async function comentariosDeInstagram(
  project: Project,
  postId: string,
  limite = 25,
): Promise<Array<{ id: string; texto: string; de: string | null; cuando: Date | null }>> {
  const data: any = cuerpo(
    await run(project, 'instagram', 'INSTAGRAM_GET_POST_COMMENTS', {
      ig_post_id: postId,
      limit: limite,
    }),
  );
  return (data?.data ?? []).map((c: any) => ({
    id: String(c.id),
    texto: typeof c.text === 'string' ? c.text : (c.message ?? ''),
    de: c.username ?? c.from?.username ?? null,
    cuando: fecha(c.timestamp ?? c.created_time),
  }));
}

export async function responderComentarioDeInstagram(
  project: Project,
  comentarioId: string,
  texto: string,
): Promise<{ id: string | null }> {
  const data: any = cuerpo(
    await run(project, 'instagram', 'INSTAGRAM_REPLY_TO_COMMENT', {
      ig_comment_id: comentarioId,
      message: texto,
    }),
  );
  return { id: data?.id ?? null };
}
