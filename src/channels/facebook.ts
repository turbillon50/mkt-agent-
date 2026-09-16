/**
 * Facebook: publicar en la PÁGINA, y Messenger.
 *
 * Todo lo de aquí existe por un hallazgo medido de la QA del 16-sep: Composio
 * firma las tools de Facebook con el token de **usuario**, y la mitad de la API
 * de páginas exige token de **página**. Medido, con la cuenta real de MOMENTUM:
 *
 *   · `FACEBOOK_CREATE_POST` → `403 (#200) OAuthException` en `/{page}/feed`,
 *     aunque `/me/permissions` diga `pages_manage_posts=granted`.
 *   · `FACEBOOK_GET_PAGE_CONVERSATIONS` → `(#190) This method must be called
 *     with a Page Access Token`.
 *
 * No son los permisos: es el token. Y el token de página **sí** lo devuelve
 * `FACEBOOK_GET_USER_PAGES` pidiéndole el campo `access_token` (medido: 198
 * caracteres, con `tasks` = MODERATE, MESSAGING, CREATE_CONTENT, MANAGE…).
 *
 * Así que el trato es: se resuelve la página UNA vez, su token se guarda
 * **cifrado** en `social_accounts.metadata.page_token` (AES-256-GCM, la misma
 * cajita de `lib/secret-box.ts` que ya usaba el camino de app propia) y todo lo
 * que exija token de página sale por la llamada CRUDA con las credenciales que
 * pone Composio, pasando ese token como parámetro.
 *
 * El token nunca sale por una API ni se escribe en un log: las rutas devuelven
 * `true`/`false`, jamás el valor.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { socialAccounts, type Project } from '../db/schema';
import { canSealSecrets, open, seal } from '../../lib/secret-box';
import { cuerpo, proxy, run } from './base';

export const GRAPH = 'v21.0';

/** Una página que administra la cuenta conectada. */
export interface PaginaDeFacebook {
  id: string;
  nombre: string;
  /** Lo que Meta deja hacer en ella. Sin `CREATE_CONTENT` no se puede publicar. */
  tareas: string[];
  /** ¿Vino el token de página? Sin él, publicar da 403. */
  conToken: boolean;
}

/** Un hilo de Messenger, ya aplanado para la pantalla de Conversaciones. */
export interface HiloDeMessenger {
  id: string;
  /** Con quién se está hablando (el que no es la página). */
  contacto: { id: string | null; nombre: string | null };
  ultimoTexto: string | null;
  ultimoAt: Date | null;
  sinLeer: number;
  mensajes: number;
}

export interface MensajeDeMessenger {
  id: string;
  texto: string;
  de: { id: string | null; nombre: string | null };
  entrante: boolean;
  cuando: Date | null;
}

// ---------------------------------------------------------------------------
// La página y su token
// ---------------------------------------------------------------------------

async function filaDeFacebook(project: Project) {
  const rows = await db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.orgId, project.orgId),
        eq(socialAccounts.campaignId, project.id),
        eq(socialAccounts.platform, 'facebook'),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Las páginas que administra la cuenta conectada, con su token.
 *
 * `fields` es explícito: sin pedir `access_token` Meta no lo manda, y sin él
 * esto no sirve para nada. `tasks` viene para poder decirle al usuario "esa
 * página no te deja publicar" en vez de dejarlo estrellarse con un 403.
 */
export async function paginasDeFacebook(
  project: Project,
): Promise<Array<PaginaDeFacebook & { token: string | null }>> {
  const data: any = cuerpo(
    await run(project, 'facebook', 'FACEBOOK_GET_USER_PAGES', {
      fields: 'id,name,access_token,category,tasks',
    }),
  );
  const lista = data?.data ?? data?.pages ?? [];
  return lista.map((p: any) => ({
    id: String(p.id),
    nombre: p.name ?? String(p.id),
    tareas: Array.isArray(p.tasks) ? p.tasks.map(String) : [],
    conToken: Boolean(p.access_token),
    token: typeof p.access_token === 'string' ? p.access_token : null,
  }));
}

/**
 * Resuelve la página del proyecto y GUARDA su token cifrado.
 *
 * Se llama al conectar Facebook y cada vez que el token guardado ya no sirve.
 * `pageId` solo hace falta cuando la cuenta administra varias páginas y el
 * usuario eligió una; con una sola, se toma esa y no se le pregunta nada.
 */
export async function fijarPaginaDeFacebook(
  project: Project,
  pageId?: string | null,
): Promise<{ pagina: PaginaDeFacebook; guardado: boolean; motivo?: string }> {
  const paginas = await paginasDeFacebook(project);
  if (paginas.length === 0) {
    throw new Error(
      'La cuenta de Facebook conectada no administra ninguna página. Goossip publica en páginas, no en perfiles personales.',
    );
  }

  const elegida = pageId ? paginas.find((p) => p.id === String(pageId)) : paginas[0];
  if (!elegida) throw new Error('Esa página no está entre las que administra la cuenta conectada.');

  const publica = elegida.tareas.length === 0 || elegida.tareas.includes('CREATE_CONTENT');
  if (!publica) {
    throw new Error(
      `En "${elegida.nombre}" tu cuenta no tiene permiso para publicar. Pídele a quien administra la página el rol de editor.`,
    );
  }

  const limpia: PaginaDeFacebook = {
    id: elegida.id,
    nombre: elegida.nombre,
    tareas: elegida.tareas,
    conToken: elegida.conToken,
  };

  const fila = await filaDeFacebook(project);
  if (!fila) return { pagina: limpia, guardado: false, motivo: 'todavía no hay fila de conexión' };

  // Sin con qué cifrar NO se guarda el token. Dejarlo en claro en la base por
  // salir del paso es exactamente lo que no se hace.
  if (!elegida.token || !canSealSecrets()) {
    await db
      .update(socialAccounts)
      .set({
        externalId: elegida.id,
        metadata: { ...(fila.metadata ?? {}), page_id: elegida.id, page_name: elegida.nombre },
        updatedAt: new Date(),
      })
      .where(eq(socialAccounts.id, fila.id));
    return {
      pagina: limpia,
      guardado: false,
      motivo: elegida.token
        ? 'falta CONNECTIONS_SECRET (o META_APP_SECRET) para poder cifrarlo'
        : 'Meta no devolvió el token de la página',
    };
  }

  await db
    .update(socialAccounts)
    .set({
      externalId: elegida.id,
      metadata: {
        ...(fila.metadata ?? {}),
        page_id: elegida.id,
        page_name: elegida.nombre,
        page_token: seal(elegida.token),
        page_token_at: new Date().toISOString(),
      },
      updatedAt: new Date(),
    })
    .where(eq(socialAccounts.id, fila.id));

  return { pagina: limpia, guardado: true };
}

/**
 * El token de página del proyecto, en claro y para uso interno.
 *
 * Primero el guardado; si no hay —o si el sobre ya no abre porque cambió la
 * llave— se resuelve contra Meta y se vuelve a guardar. Que se re-resuelva solo
 * es lo que hace que esto no se convierta en una tarea manual el día que el
 * cliente cambie de página.
 */
export async function tokenDePagina(
  project: Project,
): Promise<{ pageId: string; token: string } | null> {
  const fila = await filaDeFacebook(project);
  const meta = (fila?.metadata ?? {}) as { page_id?: string; page_token?: string };
  const guardado = open(meta.page_token);
  if (guardado && meta.page_id) return { pageId: String(meta.page_id), token: guardado };

  const r = await fijarPaginaDeFacebook(project, meta.page_id ?? null).catch(() => null);
  if (!r) return null;
  const fresca = await filaDeFacebook(project);
  const meta2 = (fresca?.metadata ?? {}) as { page_id?: string; page_token?: string };
  const abierto = open(meta2.page_token);
  if (abierto && meta2.page_id) return { pageId: String(meta2.page_id), token: abierto };

  // Se pudo resolver la página pero no guardar el token (sin llave de cifrado).
  // Se resuelve al vuelo para no dejar al cliente sin publicar por eso.
  const paginas = await paginasDeFacebook(project).catch(() => []);
  const p = paginas.find((x) => x.id === r.pagina.id) ?? paginas[0];
  return p?.token ? { pageId: p.id, token: p.token } : null;
}

/** El id de la página sin sacar el token. Para pantallas y para lead ads. */
export async function paginaDelProyecto(
  project: Project,
): Promise<{ id: string; nombre: string } | null> {
  const fila = await filaDeFacebook(project);
  const meta = (fila?.metadata ?? {}) as { page_id?: string; page_name?: string };
  if (meta.page_id) return { id: String(meta.page_id), nombre: String(meta.page_name ?? meta.page_id) };
  const paginas = await paginasDeFacebook(project).catch(() => []);
  return paginas[0] ? { id: paginas[0].id, nombre: paginas[0].nombre } : null;
}

// ---------------------------------------------------------------------------
// La llamada cruda con token de página
// ---------------------------------------------------------------------------

/**
 * Graph API con el token de PÁGINA puesto a mano.
 *
 * Sale por el proxy de Composio —la misma conexión del proyecto, el token de
 * usuario nunca toca a Goossip— y el `access_token` de query gana sobre el
 * `Authorization` que pone Composio. Eso es lo que convierte un 403 en un 200.
 */
async function conPagina(
  project: Project,
  input: {
    ruta: string;
    method: 'GET' | 'POST' | 'DELETE';
    query?: Record<string, string | number | undefined>;
    body?: Record<string, unknown>;
  },
): Promise<any> {
  const cuenta = await tokenDePagina(project);
  if (!cuenta) {
    throw new Error(
      'No pudimos leer el permiso de tu página de Facebook. Entra a Conexiones y vuelve a conectar Facebook.',
    );
  }
  const ruta = input.ruta.replace('{page}', cuenta.pageId);
  const parameters: Array<{ name: string; value: string; type: 'query' }> = [
    { name: 'access_token', value: cuenta.token, type: 'query' },
  ];
  for (const [k, v] of Object.entries(input.query ?? {})) {
    if (v !== undefined && v !== null && String(v) !== '') {
      parameters.push({ name: k, value: String(v), type: 'query' });
    }
  }
  return proxy(project, 'facebook', {
    endpoint: `https://graph.facebook.com/${GRAPH}/${ruta}`,
    method: input.method,
    parameters,
    ...(input.body ? { body: input.body } : {}),
  });
}

// ---------------------------------------------------------------------------
// Publicar
// ---------------------------------------------------------------------------

/**
 * Publica en la página. Con imagen va a `/photos`, sin ella a `/feed`.
 *
 * `/photos` y no `/feed` con `link`: un post de foto se ve como foto en el muro,
 * y un `link` a la imagen se ve como una tarjeta de enlace. No es lo mismo y el
 * cliente nota la diferencia.
 */
export async function publicarEnPagina(
  project: Project,
  input: { texto: string; media?: string | null; link?: string | null },
): Promise<{ id: string | null; url: string | null; conImagen: boolean }> {
  const conImagen = Boolean(input.media);
  const data = conImagen
    ? await conPagina(project, {
        ruta: '{page}/photos',
        method: 'POST',
        body: { url: input.media, caption: input.texto, published: true },
      })
    : await conPagina(project, {
        ruta: '{page}/feed',
        method: 'POST',
        body: { message: input.texto, ...(input.link ? { link: input.link } : {}) },
      });

  // En `/photos` Meta devuelve `post_id` (el del muro) y `id` (el de la foto).
  // El que sirve para enseñar y para borrar es `post_id`.
  const id: string | null = data?.post_id ?? data?.id ?? null;
  return { id, url: id ? `https://facebook.com/${id}` : null, conImagen };
}

/** Borra un post de la página. Lo usa la QA para no dejar basura publicada. */
export async function borrarDeLaPagina(project: Project, postId: string): Promise<boolean> {
  const data = await conPagina(project, { ruta: postId, method: 'DELETE' });
  return data?.success === true || data?.data?.success === true;
}

// ---------------------------------------------------------------------------
// Messenger
// ---------------------------------------------------------------------------

function fecha(v: unknown): Date | null {
  if (typeof v !== 'string' || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Los hilos de Messenger de la página.
 *
 * `participants` trae a la página y al humano. Se descarta a la página por id
 * —no por nombre— porque dos cuentas pueden llamarse igual y el id no miente.
 */
export async function conversacionesDeMessenger(
  project: Project,
  input: { limite?: number } = {},
): Promise<HiloDeMessenger[]> {
  const cuenta = await tokenDePagina(project);
  if (!cuenta) return [];
  const data = await conPagina(project, {
    ruta: '{page}/conversations',
    method: 'GET',
    query: {
      platform: 'messenger',
      fields: 'id,snippet,updated_time,unread_count,message_count,participants',
      limit: input.limite ?? 25,
    },
  });

  return (data?.data ?? []).map((h: any) => {
    const otros = (h.participants?.data ?? []).filter((p: any) => String(p.id) !== cuenta.pageId);
    const contacto = otros[0] ?? null;
    return {
      id: String(h.id),
      contacto: {
        id: contacto ? String(contacto.id) : null,
        nombre: contacto?.name ?? contacto?.username ?? null,
      },
      ultimoTexto: typeof h.snippet === 'string' ? h.snippet : null,
      ultimoAt: fecha(h.updated_time),
      sinLeer: Number(h.unread_count ?? 0),
      mensajes: Number(h.message_count ?? 0),
    };
  });
}

/** Los mensajes de un hilo, del más nuevo al más viejo. */
export async function mensajesDeMessenger(
  project: Project,
  conversationId: string,
  limite = 25,
): Promise<MensajeDeMessenger[]> {
  const cuenta = await tokenDePagina(project);
  if (!cuenta) return [];
  const data = await conPagina(project, {
    ruta: `${conversationId}/messages`,
    method: 'GET',
    query: { fields: 'id,message,from,to,created_time', limit: limite },
  });
  return (data?.data ?? []).map((m: any) => ({
    id: String(m.id),
    texto: typeof m.message === 'string' ? m.message : '',
    de: { id: m.from?.id ? String(m.from.id) : null, nombre: m.from?.name ?? null },
    entrante: String(m.from?.id ?? '') !== cuenta.pageId,
    cuando: fecha(m.created_time),
  }));
}

/**
 * Contesta un mensaje de Messenger.
 *
 * `messaging_type: RESPONSE` no es opcional: Meta rechaza el mensaje sin él
 * fuera de la ventana de 24 h y contesta un error que nadie relaciona con esto.
 */
export async function responderEnMessenger(
  project: Project,
  input: { destinatarioId: string; texto: string },
): Promise<{ id: string | null }> {
  const data = await conPagina(project, {
    ruta: '{page}/messages',
    method: 'POST',
    body: {
      recipient: { id: input.destinatarioId },
      message: { text: input.texto },
      messaging_type: 'RESPONSE',
    },
  });
  return { id: data?.message_id ?? data?.id ?? null };
}

/** Marca el hilo como leído, para que el contador de la pantalla no mienta. */
export async function marcarLeidoEnMessenger(
  project: Project,
  destinatarioId: string,
): Promise<boolean> {
  const data = await conPagina(project, {
    ruta: '{page}/messages',
    method: 'POST',
    body: { recipient: { id: destinatarioId }, sender_action: 'mark_seen' },
  });
  return Boolean(data?.recipient_id ?? data?.success ?? true);
}

// ---------------------------------------------------------------------------
// Comentarios
// ---------------------------------------------------------------------------

export interface ComentarioDeFacebook {
  id: string;
  texto: string;
  de: string | null;
  cuando: Date | null;
  respuestas: number;
}

/** Los comentarios de un post de la página. */
export async function comentariosDe(
  project: Project,
  objetoId: string,
  limite = 25,
): Promise<ComentarioDeFacebook[]> {
  const data = await conPagina(project, {
    ruta: `${objetoId}/comments`,
    method: 'GET',
    query: {
      fields: 'id,from,message,created_time,comment_count',
      order: 'reverse_chronological',
      limit: limite,
    },
  });
  return (data?.data ?? []).map((c: any) => ({
    id: String(c.id),
    texto: typeof c.message === 'string' ? c.message : '',
    de: c.from?.name ?? null,
    cuando: fecha(c.created_time),
    respuestas: Number(c.comment_count ?? 0),
  }));
}

/** Contesta un comentario. Es un comentario colgado del comentario. */
export async function responderComentario(
  project: Project,
  comentarioId: string,
  texto: string,
): Promise<{ id: string | null }> {
  const data = await conPagina(project, {
    ruta: `${comentarioId}/comments`,
    method: 'POST',
    body: { message: texto },
  });
  return { id: data?.id ?? null };
}

/** Los últimos posts de la página, para saber dónde hay comentarios que atender. */
export async function postsDeLaPagina(
  project: Project,
  limite = 10,
): Promise<Array<{ id: string; texto: string; cuando: Date | null; comentarios: number }>> {
  const data = await conPagina(project, {
    ruta: '{page}/posts',
    method: 'GET',
    query: { fields: 'id,message,created_time,comments.summary(true)', limit: limite },
  });
  return (data?.data ?? []).map((p: any) => ({
    id: String(p.id),
    texto: typeof p.message === 'string' ? p.message : '',
    cuando: fecha(p.created_time),
    comentarios: Number(p.comments?.summary?.total_count ?? 0),
  }));
}
