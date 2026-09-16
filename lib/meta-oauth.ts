import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { GRAPH } from './meta-graph';

/**
 * Conexión de Facebook e Instagram con la app de Goossip.
 *
 * Es OAuth directo de Meta, no Composio: `META_APP_ID` y `META_APP_SECRET` ya
 * viven en el entorno y están vivos (medido el 16-sep-2026: `GET /v21.0/app`
 * → 200, app "V&Living MCP"). Meter un intermediario para lo que la app ya
 * puede hacer sola sería una dependencia de más en el camino crítico por el que
 * entran los leads.
 */

export const META_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'leads_retrieval',
  'business_management',
  'instagram_basic',
] as const;

export function metaOAuthConfigured(): boolean {
  return Boolean(appId() && appSecret());
}

function appId(): string | null {
  const v = process.env.META_APP_ID?.trim();
  return v && !v.startsWith('[') ? v : null;
}

function appSecret(): string | null {
  const v = process.env.META_APP_SECRET?.trim();
  return v && !v.startsWith('[') ? v : null;
}

/** La URL pública de esta instalación. Meta exige que coincida exacta. */
export function callbackUrl(origin: string): string {
  return new URL('/api/connections/meta/callback', origin).toString();
}

// ---------------------------------------------------------------------------
// `state`: quién pidió la conexión, firmado
// ---------------------------------------------------------------------------

export interface MetaState {
  /** Proyecto al que se va a enganchar la página. */
  projectId: string;
  /** Token del enlace de conexión, cuando viene de alguien de fuera. */
  link?: string;
  /** A dónde volver al terminar. */
  back: string;
  exp: number;
}

/**
 * El `state` viaja por el navegador del usuario, así que va FIRMADO: sin firma,
 * cualquiera podría cambiar `projectId` y enganchar la página de un cliente al
 * proyecto de otro.
 */
export function signState(state: Omit<MetaState, 'exp'>, ttlMs = 15 * 60_000): string {
  const secret = appSecret();
  if (!secret) throw new Error('Meta no está configurado.');
  const payload = Buffer.from(
    JSON.stringify({ ...state, exp: Date.now() + ttlMs } satisfies MetaState),
  ).toString('base64url');
  const mac = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${mac}`;
}

export function readState(raw: string | null): MetaState | null {
  const secret = appSecret();
  if (!secret || !raw) return null;
  const [payload, mac] = raw.split('.');
  if (!payload || !mac) return null;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(expected);
  const b = Buffer.from(mac);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as MetaState;
    if (!parsed.projectId || typeof parsed.exp !== 'number') return null;
    if (parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// El baile de OAuth
// ---------------------------------------------------------------------------

export function authorizeUrl(origin: string, state: string): string {
  const url = new URL('https://www.facebook.com/v21.0/dialog/oauth');
  url.searchParams.set('client_id', appId()!);
  url.searchParams.set('redirect_uri', callbackUrl(origin));
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', META_SCOPES.join(','));
  return url.toString();
}

async function graph<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok || data.error) {
    // El mensaje de Graph no trae el token: es seguro enseñarlo.
    throw new Error(data.error?.message ?? `Facebook respondió ${res.status}`);
  }
  return data;
}

/** Código → token de usuario de corta vida. */
export async function exchangeCode(origin: string, code: string): Promise<string> {
  const data = await graph<{ access_token?: string }>('oauth/access_token', {
    client_id: appId()!,
    client_secret: appSecret()!,
    redirect_uri: callbackUrl(origin),
    code,
  });
  if (!data.access_token) throw new Error('Facebook no devolvió el permiso.');
  return data.access_token;
}

/**
 * Corta vida → 60 días. Sin este paso la conexión se cae en dos horas y el
 * cliente pensaría que Goossip la perdió sola.
 */
export async function longLivedToken(shortToken: string): Promise<string> {
  const data = await graph<{ access_token?: string }>('oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: appId()!,
    client_secret: appSecret()!,
    fb_exchange_token: shortToken,
  });
  return data.access_token ?? shortToken;
}

export interface MetaPage {
  id: string;
  name: string;
  /** Token de la página: es lo que lee los leads. Nunca sale por una API. */
  accessToken: string;
  instagram: { id: string; username: string | null } | null;
}

export async function listPages(userToken: string): Promise<MetaPage[]> {
  const data = await graph<{
    data?: Array<{
      id?: string;
      name?: string;
      access_token?: string;
      instagram_business_account?: { id?: string; username?: string };
    }>;
  }>('me/accounts', {
    fields: 'id,name,access_token,instagram_business_account{id,username}',
    limit: '50',
    access_token: userToken,
  });
  return (data.data ?? [])
    .filter((p) => p.id && p.access_token)
    .map((p) => ({
      id: p.id!,
      name: p.name ?? `Página ${p.id}`,
      accessToken: p.access_token!,
      instagram: p.instagram_business_account?.id
        ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username ?? null }
        : null,
    }));
}

export interface LeadForm {
  id: string;
  name: string;
  status: string;
  leadsCount: number;
}

/** Formularios de lead ads de una página. Con el token de la página, no el del usuario. */
export async function listLeadForms(pageId: string, pageToken: string): Promise<LeadForm[]> {
  const data = await graph<{
    data?: Array<{ id?: string; name?: string; status?: string; leads_count?: number }>;
  }>(`${encodeURIComponent(pageId)}/leadgen_forms`, {
    fields: 'id,name,status,leads_count',
    limit: '50',
    access_token: pageToken,
  });
  return (data.data ?? [])
    .filter((f) => f.id)
    .map((f) => ({
      id: f.id!,
      name: f.name ?? `Formulario ${f.id}`,
      status: f.status ?? 'DESCONOCIDO',
      leadsCount: Number(f.leads_count ?? 0),
    }));
}

/**
 * Suscribe la página al webhook de leads. Sin esto la conexión se ve linda y no
 * entra un solo lead: Meta solo avisa a las páginas suscritas.
 *
 * No lanza: si falla, la conexión sigue siendo válida para leer formularios y
 * la pantalla lo dice. Reventar aquí tiraría todo el flujo por el último paso.
 */
export async function subscribePageToLeads(
  pageId: string,
  pageToken: string,
): Promise<{ ok: boolean; detail: string }> {
  try {
    const url = new URL(`${GRAPH}/${encodeURIComponent(pageId)}/subscribed_apps`);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscribed_fields: 'leadgen', access_token: pageToken }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    if (!res.ok || data.error) return { ok: false, detail: data.error?.message ?? `HTTP ${res.status}` };
    return { ok: Boolean(data.success), detail: data.success ? 'suscrita' : 'sin confirmación' };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : 'error' };
  }
}
