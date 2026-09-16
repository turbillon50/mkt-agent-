/**
 * Competencia DEL PROYECTO: qué publican tus rivales y cada cuánto, contra lo
 * que publicas tú.
 *
 * Dos reglas que no se negocian:
 *
 *   1. **Solo negocios y cuentas públicas de marca.** Nunca un perfil personal.
 *      No es delicadeza: es lo que evita bans y demandas, y es la misma regla
 *      que separa esto de PhantomBuster.
 *   2. **Cada número trae su FUENTE pegada.** Un "publican 5 por semana" sin
 *      decir de dónde salió no se puede defender delante del cliente, y lo
 *      primero que va a preguntar es justo eso.
 *
 * Y lo que se midió el 16-sep-2026, que cambia el diseño entero:
 *
 *   · Leer TU PROPIA página funciona. `FACEBOOK_GET_PAGE_POSTS` falla con
 *     `190 / 2069032` ("en la nueva experiencia para páginas se necesita un
 *     token de acceso a la página"), así que se va por el proxy con el token de
 *     página que devuelve `FACEBOOK_GET_USER_PAGES` — la misma conexión del
 *     proyecto. `INSTAGRAM_GET_USER_MEDIA` sí funciona directo.
 *   · Leer la página de OTRO **Meta no lo permite** sin "Page Public Content
 *     Access", que es una revisión de app del lado de Composio y no nuestra:
 *     `GET /inmuebles24` contesta `100 / 33` "does not exist, cannot be loaded
 *     due to missing permissions". `business_discovery` tampoco existe en esta
 *     conexión de Instagram (`IGApiException 100`).
 *
 * Por eso el rival se lee por su WEB PÚBLICA y se dice, con el código del
 * proveedor, cuándo Meta se negó. Inventarle una frecuencia al rival para que
 * la pantalla se vea llena sería exactamente el tipo de dato que hace que nadie
 * vuelva a creerle a un panel.
 */
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  competitorSnapshots,
  projectCompetitors,
  type CompetitorHandles,
  type CompetitorSnapshot,
  type NewProjectCompetitor,
  type Project,
  type ProjectCompetitor,
  type SnapshotFuente,
} from '../db/schema';
import { activeAccountFor } from '../projects/composio-connections';
import { executeTool, proxyExecute } from '../composio/client';
import { cuerpo } from '../channels/base';
import { GRAPH_VERSION } from '../channels/publicacion';
import { RED_LABEL, type RedSlug } from '../creative/specs';

export type RedDeCompetencia = 'facebook' | 'instagram' | 'linkedin' | 'tiktok' | 'youtube' | 'twitter';

export const REDES_DE_COMPETENCIA: RedDeCompetencia[] = [
  'facebook',
  'instagram',
  'linkedin',
  'tiktok',
  'youtube',
  'twitter',
];

/**
 * El sitio del rival se guarda como su propio "canal" y no colgado de Facebook.
 *
 * La primera versión lo metía con `red: 'facebook'` porque la columna pedía una
 * red, y el resultado era un renglón de Facebook cuyo motivo era el título del
 * sitio web: se leía como si Facebook hubiera contestado eso. Un canal que no
 * es una red social necesita su propio nombre.
 */
export const CANAL_SITIO = 'sitio';

/** Una publicación leída, sea de quien sea y venga de donde venga. */
export interface PublicacionLeida {
  id: string;
  texto: string | null;
  cuando: Date | null;
  formato: string;
  url: string | null;
  reacciones?: number | null;
}

export interface Lectura {
  red: RedDeCompetencia;
  fuente: SnapshotFuente;
  motivo: string | null;
  posts: PublicacionLeida[];
  seguidores: number | null;
}

// ---------------------------------------------------------------------------
// Tu lado: lo que SÍ se puede leer de verdad
// ---------------------------------------------------------------------------

/**
 * La página de Facebook del proyecto y su token.
 *
 * El token no se guarda ni se devuelve al navegador: vive lo que dura la
 * lectura. Viene de `FACEBOOK_GET_USER_PAGES` por la conexión del proyecto, que
 * es el único camino por el que Meta lo entrega.
 */
async function paginaConToken(
  project: Project,
): Promise<{ id: string; name: string; token: string } | null> {
  const cuenta = await activeAccountFor(project, 'facebook').catch(() => null);
  if (!cuenta) return null;
  const res = await executeTool('FACEBOOK_GET_USER_PAGES', {
    userId: cuenta.userId,
    connectedAccountId: cuenta.connectedAccountId,
    arguments: {},
  }).catch(() => null);
  if (!res) return null;
  const data: any = cuerpo(res.data ?? res);
  const p = (data?.data ?? data?.pages ?? [])[0];
  if (!p?.id || !p?.access_token) return null;
  return { id: String(p.id), name: p.name ?? String(p.id), token: String(p.access_token) };
}

function formatoDeAdjunto(post: any): string {
  const a = post?.attachments?.data?.[0];
  const tipo = String(a?.media_type ?? a?.type ?? '').toLowerCase();
  if (tipo.includes('video')) return 'video';
  if (tipo.includes('album')) return 'carrusel';
  if (tipo.includes('photo') || tipo.includes('image')) return 'imagen';
  return post?.message ? 'texto' : 'otro';
}

/** Lo que el PROYECTO publicó en su página de Facebook. */
export async function leerFacebookPropio(project: Project, limite = 25): Promise<Lectura> {
  const base: Lectura = { red: 'facebook', fuente: 'ninguna', motivo: null, posts: [], seguidores: null };
  const cuenta = await activeAccountFor(project, 'facebook').catch(() => null);
  if (!cuenta) {
    return { ...base, motivo: 'Este proyecto no tiene Facebook conectado.' };
  }
  const pagina = await paginaConToken(project);
  if (!pagina) {
    return { ...base, motivo: 'La cuenta conectada no administra ninguna página de Facebook.' };
  }

  try {
    const [posts, ficha] = await Promise.all([
      proxyExecute({
        connectedAccountId: cuenta.connectedAccountId,
        endpoint: `https://graph.facebook.com/${GRAPH_VERSION}/${pagina.id}/posts`,
        method: 'GET',
        parameters: [
          {
            name: 'fields',
            value: 'id,message,created_time,permalink_url,attachments{media_type,type}',
            type: 'query',
          },
          { name: 'limit', value: String(limite), type: 'query' },
          { name: 'access_token', value: pagina.token, type: 'query' },
        ],
      }),
      proxyExecute({
        connectedAccountId: cuenta.connectedAccountId,
        endpoint: `https://graph.facebook.com/${GRAPH_VERSION}/${pagina.id}`,
        method: 'GET',
        parameters: [
          { name: 'fields', value: 'fan_count,followers_count,name', type: 'query' },
          { name: 'access_token', value: pagina.token, type: 'query' },
        ],
      }).catch(() => null),
    ]);

    return {
      red: 'facebook',
      fuente: 'composio',
      motivo: null,
      seguidores: ficha?.followers_count ?? ficha?.fan_count ?? null,
      posts: (posts?.data ?? []).map((p: any) => ({
        id: String(p.id),
        texto: p.message ?? null,
        cuando: p.created_time ? new Date(p.created_time) : null,
        formato: formatoDeAdjunto(p),
        url: p.permalink_url ?? null,
      })),
    };
  } catch (e) {
    return { ...base, motivo: e instanceof Error ? e.message : 'Facebook no contestó.' };
  }
}

/** Lo que el PROYECTO publicó en su Instagram. */
export async function leerInstagramPropio(project: Project, limite = 25): Promise<Lectura> {
  const base: Lectura = { red: 'instagram', fuente: 'ninguna', motivo: null, posts: [], seguidores: null };
  const cuenta = await activeAccountFor(project, 'instagram').catch(() => null);
  if (!cuenta) return { ...base, motivo: 'Este proyecto no tiene Instagram conectado.' };

  try {
    const [media, info] = await Promise.all([
      executeTool('INSTAGRAM_GET_USER_MEDIA', {
        userId: cuenta.userId,
        connectedAccountId: cuenta.connectedAccountId,
        arguments: { limit: limite },
      }),
      executeTool('INSTAGRAM_GET_USER_INFO', {
        userId: cuenta.userId,
        connectedAccountId: cuenta.connectedAccountId,
        arguments: {},
      }).catch(() => null),
    ]);
    const d: any = cuerpo(media.data ?? media);
    const perfil: any = info ? cuerpo(info.data ?? info) : null;

    return {
      red: 'instagram',
      fuente: 'composio',
      motivo: null,
      seguidores: typeof perfil?.followers_count === 'number' ? perfil.followers_count : null,
      posts: (d?.data ?? []).map((m: any) => ({
        id: String(m.id),
        texto: m.caption ?? null,
        cuando: m.timestamp ? new Date(m.timestamp) : null,
        formato: String(m.media_product_type ?? m.media_type ?? 'imagen').toLowerCase(),
        url: m.permalink ?? null,
        reacciones: typeof m.like_count === 'number' ? m.like_count : null,
      })),
    };
  } catch (e) {
    return { ...base, motivo: e instanceof Error ? e.message : 'Instagram no contestó.' };
  }
}

// ---------------------------------------------------------------------------
// El rival: Composio primero, su web después, y se dice cuál contestó
// ---------------------------------------------------------------------------

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

function meta(html: string, prop: string): string | null {
  const patrones = [
    new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i'),
  ];
  for (const re of patrones) {
    const m = html.match(re);
    if (m?.[1]) return m[1].replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"');
  }
  return null;
}

export interface LecturaWeb {
  url: string;
  status: number;
  titulo: string | null;
  descripcion: string | null;
  /** Lo que el sitio declara de sí mismo en JSON-LD (Organization/LocalBusiness). */
  ficha: Record<string, unknown> | null;
  error: string | null;
}

/** Lee UNA página pública y saca lo que el sitio declara de sí mismo. */
export async function leerWebPublica(url: string, timeoutMs = 12000): Promise<LecturaWeb> {
  const out: LecturaWeb = { url, status: 0, titulo: null, descripcion: null, ficha: null, error: null };
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'es-MX,es;q=0.9' },
      redirect: 'follow',
      signal: control.signal,
      cache: 'no-store',
    });
    out.status = res.status;
    if (!res.ok) {
      // El código del proveedor va TAL CUAL. 403 de Cloudflare y 404 no son lo
      // mismo y confundirlos manda a reconectar algo que no está roto.
      out.error = `El sitio contestó ${res.status}.`;
      return out;
    }
    const html = (await res.text()).slice(0, 500_000);
    out.titulo = meta(html, 'og:title') ?? html.match(/<title[^>]*>([^<]*)/i)?.[1]?.trim() ?? null;
    out.descripcion = meta(html, 'og:description') ?? meta(html, 'description');

    for (const m of html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    )) {
      try {
        const json = JSON.parse(m[1].trim());
        const nodos = Array.isArray(json) ? json : [json, ...(json['@graph'] ?? [])];
        const ficha = nodos.find((n: any) =>
          /Organization|LocalBusiness|Corporation|Store/i.test(String(n?.['@type'] ?? '')),
        );
        if (ficha) {
          out.ficha = ficha;
          break;
        }
      } catch {
        // Un JSON-LD roto es de ellos, no nuestro. Se pasa al siguiente.
      }
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : 'No se pudo leer el sitio.';
  } finally {
    clearTimeout(reloj);
  }
  return out;
}

const URL_DE_RED: Record<RedDeCompetencia, (h: string) => string> = {
  facebook: (h) => (h.startsWith('http') ? h : `https://www.facebook.com/${h}`),
  instagram: (h) => (h.startsWith('http') ? h : `https://www.instagram.com/${h}/`),
  linkedin: (h) => (h.startsWith('http') ? h : `https://www.linkedin.com/company/${h}/`),
  tiktok: (h) => (h.startsWith('http') ? h : `https://www.tiktok.com/@${h.replace(/^@/, '')}`),
  youtube: (h) => (h.startsWith('http') ? h : `https://www.youtube.com/@${h.replace(/^@/, '')}`),
  twitter: (h) => (h.startsWith('http') ? h : `https://x.com/${h.replace(/^@/, '')}`),
};

/**
 * Lee la red de un rival.
 *
 * Primero por Composio con la cuenta del proyecto — funciona cuando el cliente
 * SÍ administra esa página (una agencia con varias marcas, un grupo con varias
 * sucursales), que no es raro. Cuando Meta se niega, la negativa se guarda con
 * su código y se cae a la web pública del rival.
 */
export async function leerRedDeRival(
  project: Project,
  red: RedDeCompetencia,
  handle: string,
): Promise<Lectura> {
  const base: Lectura = { red, fuente: 'ninguna', motivo: null, posts: [], seguidores: null };

  if (red === 'facebook') {
    const cuenta = await activeAccountFor(project, 'facebook').catch(() => null);
    if (cuenta) {
      const id = handle.replace(/^https?:\/\/(www\.)?facebook\.com\//, '').replace(/\/$/, '');
      try {
        const posts = await proxyExecute({
          connectedAccountId: cuenta.connectedAccountId,
          endpoint: `https://graph.facebook.com/${GRAPH_VERSION}/${id}/posts`,
          method: 'GET',
          parameters: [
            { name: 'fields', value: 'id,message,created_time,permalink_url,attachments{media_type,type}', type: 'query' },
            { name: 'limit', value: '25', type: 'query' },
          ],
        });
        if (posts?.data?.length) {
          return {
            red,
            fuente: 'composio',
            motivo: null,
            seguidores: null,
            posts: posts.data.map((p: any) => ({
              id: String(p.id),
              texto: p.message ?? null,
              cuando: p.created_time ? new Date(p.created_time) : null,
              formato: formatoDeAdjunto(p),
              url: p.permalink_url ?? null,
            })),
          };
        }
      } catch (e) {
        base.motivo = `Meta no deja leer la página de otro con esta conexión (${
          e instanceof Error ? e.message.slice(0, 120) : 'sin detalle'
        }). Se leyó su web pública.`;
      }
    }
  }

  // La web pública del rival. Devuelve quién es y qué dice de sí mismo, que es
  // lo que hay sin pedirle permiso a nadie — pero NO devuelve fechas de posts,
  // así que `por_semana` se queda en null y la pantalla lo dice.
  const url = URL_DE_RED[red](handle);
  const web = await leerWebPublica(url);
  if (web.error) {
    return {
      ...base,
      motivo: [base.motivo, `${url}: ${web.error}`].filter(Boolean).join(' '),
    };
  }

  /**
   * HTTP 200 NO es lo mismo que "se leyó".
   *
   * Instagram y Facebook contestan 200 con un muro de sesión: la página existe,
   * el HTML pesa medio mega y adentro no viene ni el nombre de la cuenta.
   * Marcar eso como `fuente: 'web'` con 0 posts y sin motivo se lee en pantalla
   * como una lectura exitosa que dio cero — y es al revés: no hubo lectura.
   * Si no vino ni título ni descripción, se dice.
   */
  const algo = [web.titulo, web.descripcion].filter((x) => x && x.trim().length > 2);
  // "Redirecting…" es lo que contesta `facebook.com/<pagina>` a un programa:
  // 200, 987 bytes y ni el nombre de la página. Medido el 16-sep-2026.
  const generico =
    /^(instagram|facebook|linkedin|tiktok|youtube|x)\.?$|redirecting|^log ?in|iniciar sesi[oó]n|inicia sesi[oó]n/i;
  const util = algo.filter((t) => !generico.test(t!.trim()));
  if (util.length === 0) {
    return {
      ...base,
      motivo: [
        base.motivo,
        `${url} contestó 200 pero detrás de un muro de sesión: no publica nada legible para un programa.`,
      ]
        .filter(Boolean)
        .join(' '),
    };
  }

  return {
    red,
    fuente: 'web',
    motivo: [base.motivo, util.join(' — ').slice(0, 300)].filter(Boolean).join(' '),
    seguidores: null,
    posts: [],
  };
}

// ---------------------------------------------------------------------------
// Contar: cada cuánto publican
// ---------------------------------------------------------------------------

export interface Ritmo {
  posts: number;
  porSemana: number | null;
  ultimo: Date | null;
  formatos: Record<string, number>;
}

/**
 * El ritmo de publicación a partir de las fechas REALES.
 *
 * Dos decisiones, y la segunda la encontró una prueba:
 *
 *   1. **Se divide entre los días que abarca la muestra**, no entre 7 ni entre
 *      30. Si de una cuenta se leyeron 10 posts y abarcan 90 días, su ritmo es
 *      0.78 por semana, no 10. Dividir entre una ventana fija es como se
 *      fabrican los números que impresionan y no significan nada.
 *
 *   2. **Se cuentan los INTERVALOS, no los posts.** Entre el primero y el
 *      último de N publicaciones hay N−1 huecos, no N. Con 25 posts la
 *      diferencia es del 4 % y da igual; con DOS posts publicados con una
 *      semana de diferencia, `N/días` contesta "2 por semana" cuando la verdad
 *      es 1. Y dos posts es justo lo que se logra leer de una cuenta chica, que
 *      es donde el número se iba a usar para decidir.
 */
export function ritmoDe(posts: PublicacionLeida[]): Ritmo {
  const formatos: Record<string, number> = {};
  for (const p of posts) formatos[p.formato] = (formatos[p.formato] ?? 0) + 1;

  const fechas = posts
    .map((p) => p.cuando)
    .filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  if (fechas.length < 2) {
    return { posts: posts.length, porSemana: null, ultimo: fechas[0] ?? null, formatos };
  }
  const dias = (fechas[fechas.length - 1].getTime() - fechas[0].getTime()) / 86_400_000;
  // Menos de un día de muestra no es un ritmo: son varios posts del mismo rato.
  const porSemana = dias < 1 ? null : Number((((fechas.length - 1) / dias) * 7).toFixed(2));
  return { posts: posts.length, porSemana, ultimo: fechas[fechas.length - 1], formatos };
}

// ---------------------------------------------------------------------------
// Guardar y comparar
// ---------------------------------------------------------------------------

async function guardarSnapshot(
  project: Project,
  competitorId: string | null,
  lectura: Lectura,
): Promise<CompetitorSnapshot> {
  const r = ritmoDe(lectura.posts);
  const [fila] = await db
    .insert(competitorSnapshots)
    .values({
      orgId: project.orgId,
      projectId: project.id,
      competitorId,
      red: lectura.red,
      fuente: lectura.fuente,
      motivo: lectura.motivo,
      postsLeidos: r.posts,
      porSemana: r.porSemana !== null ? String(r.porSemana) : null,
      ultimoPost: r.ultimo,
      formatos: r.formatos,
      seguidores: lectura.seguidores,
      // Tres ejemplos y no los 25: el snapshot es para comparar ritmos, no para
      // guardarle a nadie una copia de su muro.
      muestra: lectura.posts.slice(0, 3).map((p) => ({
        texto: (p.texto ?? '').slice(0, 280),
        cuando: p.cuando?.toISOString() ?? null,
        formato: p.formato,
        url: p.url,
      })),
    })
    .returning();
  return fila!;
}

/** Lee TODO lo del proyecto y lo guarda como la línea base del comparativo. */
export async function leerPropio(project: Project): Promise<CompetitorSnapshot[]> {
  const lecturas = await Promise.all([leerFacebookPropio(project), leerInstagramPropio(project)]);
  const out: CompetitorSnapshot[] = [];
  for (const l of lecturas) out.push(await guardarSnapshot(project, null, l));
  return out;
}

/** Lee todas las redes declaradas de un rival y las guarda. */
export async function leerRival(
  project: Project,
  rival: ProjectCompetitor,
): Promise<CompetitorSnapshot[]> {
  const handles = (rival.handles ?? {}) as CompetitorHandles;
  const out: CompetitorSnapshot[] = [];

  for (const red of REDES_DE_COMPETENCIA) {
    const handle = handles[red];
    if (!handle) continue;
    const lectura = await leerRedDeRival(project, red, handle);
    out.push(await guardarSnapshot(project, rival.id, lectura));
  }

  // Su sitio web cuenta como una lectura más: es la fuente que casi siempre
  // contesta y de donde sale qué venden y con qué palabras.
  if (rival.website) {
    const web = await leerWebPublica(rival.website);
    out.push(
      await guardarSnapshot(project, rival.id, {
        red: CANAL_SITIO as RedDeCompetencia,
        fuente: web.error ? 'ninguna' : 'web',
        motivo: web.error
          ? `${rival.website}: ${web.error}`
          : [web.titulo, web.descripcion?.slice(0, 200)].filter(Boolean).join(' — ') || rival.website,
        posts: [],
        seguidores: null,
      }),
    );
  }

  return out;
}

// ---------------------------------------------------------------------------
// El alta de rivales
// ---------------------------------------------------------------------------

export async function listarRivales(
  orgId: string,
  projectId: string,
): Promise<ProjectCompetitor[]> {
  return db
    .select()
    .from(projectCompetitors)
    .where(and(eq(projectCompetitors.orgId, orgId), eq(projectCompetitors.projectId, projectId)))
    .orderBy(desc(projectCompetitors.createdAt));
}

export async function agregarRival(input: {
  project: Project;
  name: string;
  website?: string | null;
  handles?: CompetitorHandles;
  notes?: string | null;
  quien?: string | null;
}): Promise<ProjectCompetitor> {
  const valores: NewProjectCompetitor = {
    orgId: input.project.orgId,
    projectId: input.project.id,
    name: input.name.trim(),
    website: input.website?.trim() || null,
    handles: limpiarHandles(input.handles ?? {}),
    notes: input.notes?.trim() || null,
    createdBy: input.quien ?? null,
  };
  const [fila] = await db.insert(projectCompetitors).values(valores).returning();
  if (!fila) throw new Error('No se pudo guardar el rival.');
  return fila;
}

/**
 * Los handles, filtrados.
 *
 * Un `facebook.com/profile.php?id=…` o un `linkedin.com/in/…` es un PERFIL
 * PERSONAL, y aquí no entra. Se rechaza en la puerta y no en la lectura: si
 * entra a la tabla, tarde o temprano alguien lo lee.
 */
export function limpiarHandles(h: CompetitorHandles): CompetitorHandles {
  const out: CompetitorHandles = {};
  for (const red of REDES_DE_COMPETENCIA) {
    const v = (h as Record<string, string | undefined>)[red]?.trim();
    if (!v) continue;
    if (esPerfilPersonal(red, v)) continue;
    out[red] = v;
  }
  return out;
}

export function esPerfilPersonal(red: RedDeCompetencia, handle: string): boolean {
  const v = handle.toLowerCase();
  if (red === 'linkedin') return v.includes('/in/') || (!v.includes('company') && v.startsWith('http'));
  if (red === 'facebook') return v.includes('profile.php') || v.includes('/people/');
  return false;
}

export async function borrarRival(orgId: string, projectId: string, id: string): Promise<void> {
  await db
    .delete(projectCompetitors)
    .where(
      and(
        eq(projectCompetitors.id, id),
        eq(projectCompetitors.orgId, orgId),
        eq(projectCompetitors.projectId, projectId),
      ),
    );
}

// ---------------------------------------------------------------------------
// El comparativo
// ---------------------------------------------------------------------------

export interface FilaComparativa {
  quien: string;
  esTuyo: boolean;
  red: string;
  fuente: SnapshotFuente;
  motivo: string | null;
  posts: number;
  porSemana: number | null;
  ultimo: string | null;
  formatos: Record<string, number>;
  seguidores: number | null;
  leidoEn: string;
}

export interface Comparativo {
  filas: FilaComparativa[];
  /** La frase que el issue pide: "publican 5 por semana, tú 1". */
  veredicto: string[];
}

/** El último snapshot de cada (rival, red). Lo viejo no se borra, se ignora. */
export async function comparativo(
  orgId: string,
  projectId: string,
): Promise<Comparativo> {
  const [rivales, snaps] = await Promise.all([
    listarRivales(orgId, projectId),
    db
      .select()
      .from(competitorSnapshots)
      .where(
        and(
          eq(competitorSnapshots.orgId, orgId),
          eq(competitorSnapshots.projectId, projectId),
        ),
      )
      .orderBy(desc(competitorSnapshots.leidoEn))
      .limit(400),
  ]);

  const nombre = new Map(rivales.map((r) => [r.id, r.name]));
  const ultimo = new Map<string, CompetitorSnapshot>();
  for (const s of snaps) {
    const clave = `${s.competitorId ?? 'propio'}|${s.red}`;
    if (!ultimo.has(clave)) ultimo.set(clave, s);
  }

  const filas: FilaComparativa[] = [...ultimo.values()].map((s) => ({
    quien: s.competitorId ? nombre.get(s.competitorId) ?? 'rival' : 'Tú',
    esTuyo: s.competitorId === null,
    red: s.red,
    fuente: s.fuente,
    motivo: s.motivo,
    posts: s.postsLeidos,
    porSemana: s.porSemana !== null ? Number(s.porSemana) : null,
    ultimo: s.ultimoPost?.toISOString() ?? null,
    formatos: s.formatos,
    seguidores: s.seguidores,
    leidoEn: s.leidoEn.toISOString(),
  }));

  return { filas, veredicto: veredictos(filas) };
}

/**
 * La frase del issue. Solo se dice cuando HAY los dos números: comparar tu 1.2
 * por semana contra un rival del que no se pudo leer nada es inventar la mitad
 * de la comparación.
 */
export function veredictos(filas: FilaComparativa[]): string[] {
  const out: string[] = [];
  const mios = filas.filter((f) => f.esTuyo);
  // El nombre de la red como lo escribe la red, no como está el slug en la
  // base: "En instagram publicas…" se lee como un error de dedo.
  const nombre = (red: string) => RED_LABEL[red as RedSlug] ?? red;

  for (const mio of mios) {
    const rivalesDeEsaRed = filas.filter(
      (f) => !f.esTuyo && f.red === mio.red && f.porSemana !== null,
    );
    if (mio.porSemana === null) {
      out.push(
        `En ${nombre(mio.red)} todavía no hay suficientes publicaciones tuyas para medir un ritmo${
          mio.motivo ? ` (${mio.motivo})` : ''
        }.`,
      );
      continue;
    }
    if (rivalesDeEsaRed.length === 0) {
      out.push(
        `En ${nombre(mio.red)} publicas ${mio.porSemana} por semana. De tus rivales no se pudo leer el ritmo: Meta no deja leer la página de otro sin revisión de app, y su web pública no publica fechas.`,
      );
      continue;
    }
    for (const r of rivalesDeEsaRed) {
      const diferencia = r.porSemana! - mio.porSemana;
      out.push(
        diferencia > 0
          ? `En ${nombre(mio.red)}, ${r.quien} publica ${r.porSemana} por semana y tú ${mio.porSemana}. Te lleva ${diferencia.toFixed(1)}.`
          : `En ${nombre(mio.red)} publicas ${mio.porSemana} por semana y ${r.quien} ${r.porSemana}. Vas arriba.`,
      );
    }
  }

  return out;
}

/** Cuántas lecturas hay ya, para que la pantalla sepa si enseñar el vacío. */
export async function hayLecturas(orgId: string, projectId: string): Promise<boolean> {
  const [fila] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(competitorSnapshots)
    .where(
      and(eq(competitorSnapshots.orgId, orgId), eq(competitorSnapshots.projectId, projectId)),
    );
  return Number(fila?.n ?? 0) > 0;
}

/** El último snapshot propio de una red. Lo usa la auditoría de marca. */
export async function ultimoPropio(
  orgId: string,
  projectId: string,
  red: string,
): Promise<CompetitorSnapshot | null> {
  const [fila] = await db
    .select()
    .from(competitorSnapshots)
    .where(
      and(
        eq(competitorSnapshots.orgId, orgId),
        eq(competitorSnapshots.projectId, projectId),
        isNull(competitorSnapshots.competitorId),
        eq(competitorSnapshots.red, red),
      ),
    )
    .orderBy(desc(competitorSnapshots.leidoEn))
    .limit(1);
  return fila ?? null;
}
