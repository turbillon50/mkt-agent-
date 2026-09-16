/**
 * Meta Ads con la app propia de Goossip.
 *
 * Por qué aquí y no por Composio: `metaads` NO tiene auth administrada en
 * Composio (medido el 16-sep-2026 contra `GET /api/v3/toolkits/metaads`:
 * `composio_managed_auth_schemes: []`). Conectarlo por allá pediría dar de alta
 * una app de developer de todos modos — y Goossip ya tiene una viva, con la que
 * se leyó de verdad la cuenta `act_2629053887531679` "V&LIVING Ads" del negocio
 * `1173024692569072`. El intermediario no aportaba nada y el conector llevaba
 * seis corridas diciendo "Próximamente".
 *
 * Lo que hace esta capa: hablar con Graph y devolver datos limpios o un error en
 * español. Lo que NO hace, ni va a hacer en esta corrida: crear campañas, mover
 * presupuestos, pausar anuncios. Todo es GET.
 *
 * Sin `server-only` a propósito, igual que `meta-graph.ts` y `secret-box.ts`:
 * aquí solo hay `fetch` y env, y las pruebas de tsx necesitan poder entrar.
 */
import { GRAPH, metaAppId, metaAppSecret } from './meta-graph';

/**
 * Los permisos que se piden, y por qué cada uno:
 *   ads_read            — leer campañas, gasto e insights. Es el que trabaja.
 *   ads_management      — Meta lo exige para ver cuentas de las que el usuario
 *                         es admin y no solo analista. No se usa para escribir.
 *   business_management — sin él, `me/adaccounts` no devuelve las cuentas que
 *                         cuelgan de un Business Manager, que son todas las de
 *                         un cliente serio.
 *   pages_show_list     — para poder decir a qué página pertenece la cuenta.
 */
export const META_ADS_SCOPES = [
  'ads_read',
  'ads_management',
  'business_management',
  'pages_show_list',
] as const;

export function metaAdsCallbackUrl(origin: string): string {
  return new URL('/api/connections/metaads/callback', origin).toString();
}

export function metaAdsAuthorizeUrl(origin: string, state: string): string {
  const url = new URL('https://www.facebook.com/v21.0/dialog/oauth');
  url.searchParams.set('client_id', metaAppId()!);
  url.searchParams.set('redirect_uri', metaAdsCallbackUrl(origin));
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', META_ADS_SCOPES.join(','));
  return url.toString();
}

// ---------------------------------------------------------------------------
// Errores de Graph, en español
// ---------------------------------------------------------------------------

export class MetaAdsError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly subcode: number | null,
  ) {
    super(message);
    this.name = 'MetaAdsError';
  }
}

/**
 * El motivo que se le enseña a quien vende departamentos, no el que sirve para
 * depurar. Los códigos están MEDIDOS contra la cuenta de V&LIVING el
 * 16-sep-2026 y no salen de memoria:
 *
 *   190 — `access_token=INVALIDO` → "Invalid OAuth access token".
 *   200 — `act_1719141675826755` (fuera del negocio) → "(#200) Ad account owner
 *         has NOT grant ads_management or ads_read permission".
 *
 * El 200 NO es un bug de Goossip y por eso su texto manda al único lugar donde
 * se arregla: Business Manager.
 */
export function motivoDeMeta(e: unknown): string {
  if (e instanceof MetaAdsError) {
    switch (e.code) {
      case 190:
        return 'Facebook cerró el permiso de esta cuenta. Vuelve a conectarla.';
      case 200:
      case 10:
      case 3:
        return 'Tu usuario ya no tiene permiso de anuncios en esa cuenta. Pídelo en Business Manager y vuelve a conectarla.';
      case 100:
        return 'Esa cuenta publicitaria ya no existe o cambió de dueño.';
      case 4:
      case 17:
      case 32:
      case 613:
        return 'Facebook está limitando las consultas ahora mismo. Inténtalo en unos minutos.';
      default:
        break;
    }
  }
  return 'No pudimos hablar con Meta Ads ahora mismo. Inténtalo otra vez en un minuto.';
}

async function graph<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const data = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string; code?: number; error_subcode?: number };
  };
  if (!res.ok || data.error) {
    // El mensaje de Graph nunca trae el token: es seguro guardarlo y loggearlo.
    throw new MetaAdsError(
      data.error?.message ?? `Facebook respondió ${res.status}`,
      data.error?.code ?? null,
      data.error?.error_subcode ?? null,
    );
  }
  return data;
}

// ---------------------------------------------------------------------------
// El baile de OAuth
// ---------------------------------------------------------------------------

/** Código → token de usuario de corta vida. El `redirect_uri` debe ser idéntico. */
export async function exchangeAdsCode(origin: string, code: string): Promise<string> {
  const data = await graph<{ access_token?: string }>('oauth/access_token', {
    client_id: metaAppId()!,
    client_secret: metaAppSecret()!,
    redirect_uri: metaAdsCallbackUrl(origin),
    code,
  });
  if (!data.access_token) throw new MetaAdsError('Facebook no devolvió el permiso.', null, null);
  return data.access_token;
}

/** Corta vida → 60 días. Sin esto la conexión se cae en dos horas. */
export async function longLivedAdsToken(shortToken: string): Promise<string> {
  const data = await graph<{ access_token?: string }>('oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: metaAppId()!,
    client_secret: metaAppSecret()!,
    fb_exchange_token: shortToken,
  });
  return data.access_token ?? shortToken;
}

// ---------------------------------------------------------------------------
// Lecturas
// ---------------------------------------------------------------------------

export interface AdAccount {
  /** El `act_…`, que es lo que pide Graph en todas las rutas. */
  id: string;
  /** El número pelón, que es lo que el cliente ve en su Administrador de anuncios. */
  accountId: string;
  name: string;
  business: string | null;
  businessId: string | null;
  currency: string | null;
  /** 1 = activa. Ver `estadoDeCuenta`. */
  status: number | null;
}

/**
 * Los nombres de `account_status` según Meta. Un "2" en pantalla no le dice
 * nada a nadie; "Inhabilitada" sí, y manda a pagar.
 */
export function estadoDeCuenta(status: number | null | undefined): string {
  switch (status) {
    case 1:
      return 'Activa';
    case 2:
      return 'Inhabilitada';
    case 3:
      return 'Sin método de pago';
    case 7:
      return 'En revisión';
    case 8:
      return 'Pendiente de cerrar';
    case 9:
      return 'En periodo de gracia';
    case 101:
      return 'Cerrada';
    default:
      return 'Desconocido';
  }
}

function mapAccount(a: {
  id?: string;
  account_id?: string;
  name?: string;
  business?: { id?: string; name?: string };
  currency?: string;
  account_status?: number;
}): AdAccount {
  const id = a.id ?? (a.account_id ? `act_${a.account_id}` : '');
  return {
    id,
    accountId: a.account_id ?? id.replace(/^act_/, ''),
    name: a.name ?? `Cuenta ${id}`,
    business: a.business?.name ?? null,
    businessId: a.business?.id ?? null,
    currency: a.currency ?? null,
    status: typeof a.account_status === 'number' ? a.account_status : null,
  };
}

/**
 * Las cuentas publicitarias del usuario que acaba de dar el permiso.
 *
 * Medido con el token de Luis el 16-sep-2026: devuelve UNA, "V&LIVING Ads".
 * La `act_1719141675826755` no sale aquí porque está fuera del negocio — y ese
 * es justo el punto de dejar elegir en vez de adivinar.
 */
export async function listAdAccounts(userToken: string): Promise<AdAccount[]> {
  const data = await graph<{ data?: Parameters<typeof mapAccount>[0][] }>('me/adaccounts', {
    fields: 'name,account_id,business,currency,account_status',
    limit: '100',
    access_token: userToken,
  });
  return (data.data ?? []).filter((a) => a.id || a.account_id).map(mapAccount);
}

/** La cuenta elegida, tal como está HOY. Es el `verify()` del conector. */
export async function readAdAccount(accountId: string, token: string): Promise<AdAccount> {
  const data = await graph<Parameters<typeof mapAccount>[0]>(encodeURIComponent(accountId), {
    fields: 'name,account_id,business,currency,account_status',
    access_token: token,
  });
  return mapAccount(data);
}

export interface MetaCampaign {
  id: string;
  name: string;
  /** Lo que el usuario puso. */
  status: string;
  /** Lo que de verdad está pasando (puede decir PAUSED por la cuenta, no por la campaña). */
  effectiveStatus: string;
  objective: string | null;
  /** En centavos de la moneda de la cuenta, como los manda Meta. */
  dailyBudget: string | null;
  lifetimeBudget: string | null;
}

export async function listCampaigns(
  accountId: string,
  token: string,
  limit = 50,
): Promise<MetaCampaign[]> {
  const data = await graph<{
    data?: Array<{
      id?: string;
      name?: string;
      status?: string;
      effective_status?: string;
      objective?: string;
      daily_budget?: string;
      lifetime_budget?: string;
    }>;
  }>(`${encodeURIComponent(accountId)}/campaigns`, {
    fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget',
    limit: String(limit),
    access_token: token,
  });
  return (data.data ?? [])
    .filter((c) => c.id)
    .map((c) => ({
      id: c.id!,
      name: c.name ?? `Campaña ${c.id}`,
      status: c.status ?? 'UNKNOWN',
      effectiveStatus: c.effective_status ?? c.status ?? 'UNKNOWN',
      objective: c.objective ?? null,
      dailyBudget: c.daily_budget ?? null,
      lifetimeBudget: c.lifetime_budget ?? null,
    }));
}

/** Una fila de `insights` cruda, antes de sumarla. */
export interface MetaInsightRow {
  campaignId: string | null;
  campaignName: string | null;
  spend: string | null;
  impressions: string | null;
  clicks: string | null;
  actions: Array<{ action_type?: string; value?: string }>;
  dateStart: string | null;
  dateStop: string | null;
}

/** Los periodos que Meta acepta y que Goossip enseña. */
export const DATE_PRESETS = ['today', 'yesterday', 'last_7d', 'last_30d', 'last_90d'] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export function esDatePreset(v: unknown): v is DatePreset {
  return typeof v === 'string' && (DATE_PRESETS as readonly string[]).includes(v);
}

/**
 * Gasto y resultados del periodo.
 *
 * Medido con la cuenta de V&LIVING el 16-sep-2026: devuelve `{"data":[]}` — la
 * cuenta existe y responde, pero no tiene pauta corriendo. Una lista vacía es
 * una respuesta VÁLIDA, no un error, y así la trata todo lo que hay arriba.
 */
export async function readInsights(
  accountId: string,
  token: string,
  datePreset: DatePreset = 'last_7d',
  level: 'account' | 'campaign' = 'account',
): Promise<MetaInsightRow[]> {
  const data = await graph<{
    data?: Array<{
      campaign_id?: string;
      campaign_name?: string;
      spend?: string;
      impressions?: string;
      clicks?: string;
      actions?: Array<{ action_type?: string; value?: string }>;
      date_start?: string;
      date_stop?: string;
    }>;
  }>(`${encodeURIComponent(accountId)}/insights`, {
    fields: 'campaign_id,campaign_name,spend,impressions,clicks,actions',
    date_preset: datePreset,
    level,
    limit: '100',
    access_token: token,
  });
  return (data.data ?? []).map((r) => ({
    campaignId: r.campaign_id ?? null,
    campaignName: r.campaign_name ?? null,
    spend: r.spend ?? null,
    impressions: r.impressions ?? null,
    clicks: r.clicks ?? null,
    actions: r.actions ?? [],
    dateStart: r.date_start ?? null,
    dateStop: r.date_stop ?? null,
  }));
}

/**
 * Los leads que Meta se apunta en el periodo.
 *
 * Meta los reporta con DOS nombres distintos según de dónde venga el formulario
 * y no siempre manda los dos: `lead` (el genérico) y
 * `onsite_conversion.lead_grouped` (el de Lead Ads nativo). Sumar los dos
 * contaría doble, así que se toma el mayor — y por eso esto es una función con
 * nombre y no un `.find()` suelto en media app.
 */
export function leadsDeMeta(rows: MetaInsightRow[]): number {
  let generico = 0;
  let nativo = 0;
  for (const r of rows) {
    for (const a of r.actions ?? []) {
      const n = Number(a.value ?? 0);
      if (!Number.isFinite(n)) continue;
      if (a.action_type === 'lead') generico += n;
      if (a.action_type === 'onsite_conversion.lead_grouped') nativo += n;
    }
  }
  return Math.max(generico, nativo);
}

/** Suma el gasto de las filas. Meta lo manda como texto ("123.45"). */
export function gastoDe(rows: MetaInsightRow[]): number {
  let total = 0;
  for (const r of rows) {
    const n = Number(r.spend ?? 0);
    if (Number.isFinite(n)) total += n;
  }
  return Math.round(total * 100) / 100;
}

export function sumaDe(rows: MetaInsightRow[], campo: 'impressions' | 'clicks'): number {
  let total = 0;
  for (const r of rows) {
    const n = Number(r[campo] ?? 0);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}
