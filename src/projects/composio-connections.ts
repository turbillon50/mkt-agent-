/**
 * El baile completo de una conexión por Composio, del botón al verde.
 *
 *   1. CONECTAR  — se pide un Connect Link con el auth config administrado del
 *      toolkit y el `user_id` del PROYECTO, y se guarda la fila en
 *      `connecting` con el `connected_account_id` que Composio acaba de emitir.
 *      Guardarlo ANTES de mandar al usuario es lo que hace que la vuelta no
 *      dependa de qué parámetros quiera ponerle Composio a la URL de regreso.
 *   2. VOLVER    — el callback consulta esa cuenta por id. `ACTIVE` y solo
 *      `ACTIVE` la deja conectada, con `verified_at` puesto en ese instante.
 *   3. VERIFICAR — al abrir la pantalla y una vez al día por cron. Nunca verde
 *      con una verificación de más de 24 h (issue #33).
 *   4. REVOCAR   — se borra la cuenta EN COMPOSIO y la fila queda
 *      `disconnected`. Borrarla solo aquí dejaría al cliente con un permiso
 *      vivo en Facebook que Goossip ya no enseña: lo peor de los dos mundos.
 */
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '../db/client';
import { campaigns, socialAccounts, type Project, type SocialAccount } from '../db/schema';
import { ensureAuthConfig } from '../composio/auth-configs';
import {
  composioReady,
  createConnectLink,
  deleteConnectedAccount,
  executeTool,
  getConnectedAccount,
  listConnectedAccounts,
  type ConnectedAccount,
} from '../composio/client';
import { TWITTER_TOOL_VERSION, twitterIdentityArguments } from '../channels/twitter-contract';
import { normalizeXHandle, xHandlesMatch } from './account-selection';
import { connectorBySlug, connectorOrThrow, type Connector } from './catalog';
import {
  channelAvailable,
  composioUserId,
  listProjectAccounts,
  markNeedsReconnect,
  saveConnection,
  stageConnection,
  revokeConnection,
  verificacionFresca,
} from './connections';
import type { ConnectionChannel } from './types';

// ---------------------------------------------------------------------------
// Lo que se le dice al usuario cuando algo sale mal
// ---------------------------------------------------------------------------

/**
 * El estado crudo de Composio, en español y sin jerga. `status_reason` se
 * queda FUERA a propósito: trae textos de la API del proveedor ("invalid
 * grant", "token revoked") que no le dicen nada a quien vende departamentos.
 * El motivo técnico va a la bitácora, no a la tarjeta.
 */
export function motivoEnEspanol(status: string): string {
  switch (status.toUpperCase()) {
    case 'EXPIRED':
      return 'El permiso venció. Vuelve a conectarla.';
    case 'FAILED':
      return 'No se pudo completar el permiso. Inténtalo otra vez.';
    case 'INACTIVE':
    case 'DISABLED':
      return 'La cuenta está apagada del lado del proveedor.';
    case 'INITIALIZING':
    case 'INITIATED':
      return 'Te quedaste a medias en la pantalla de permisos. Inténtalo otra vez.';
    default:
      return 'La cuenta dejó de responder. Vuelve a conectarla.';
  }
}

/**
 * Un nombre reconocible de la cuenta que acaba de conectarse.
 *
 * Composio devuelve el perfil crudo del proveedor y cada uno lo llama distinto.
 * Se buscan los nombres comunes y, si ninguno está, se devuelve null — "Cuenta
 * conectada" a secas es mejor que inventarle un nombre a la cuenta del cliente.
 */
export function handleDeCuenta(account: ConnectedAccount): string | null {
  const data = (account.data ?? {}) as Record<string, any>;
  const posibles = [
    data.email,
    data.user_email,
    data.name,
    data.user_name,
    data.username,
    data.display_name,
    data.team?.name,
    data.authed_user?.name,
    data.profile?.name,
    data.account_name,
  ];
  for (const v of posibles) {
    if (typeof v === 'string' && v.trim() && v.trim().length < 80) return v.trim();
  }
  return null;
}

function cuerpoDeTool(input: any): any {
  const data = input?.data ?? input;
  return data?.response_data ?? data?.response_dict ?? data;
}

/**
 * Pregunta a X quién autorizó, usando la cuenta recién creada de forma
 * explícita. No depende de la sesión del navegador ni del nombre genérico que
 * Composio pueda traer en `account.data`.
 */
async function twitterHandleDeCuenta(project: Project, accountId: string): Promise<string> {
  const result = await executeTool<any>('TWITTER_USER_LOOKUP_ME', {
    userId: composioUserId(project.id),
    connectedAccountId: accountId,
    arguments: twitterIdentityArguments(),
    version: TWITTER_TOOL_VERSION,
  });
  if (result.successful === false) throw new Error('X no confirmó la identidad autorizada.');
  const body = cuerpoDeTool(result);
  const data = body?.data ?? body?.user ?? body;
  const handle = normalizeXHandle(data?.username);
  if (!handle) throw new Error('X no devolvió el @usuario de la cuenta autorizada.');
  return handle;
}

function expectedTwitterHandle(account: SocialAccount | null): string | null {
  const meta = (account?.metadata ?? {}) as { expected_handle?: unknown };
  return normalizeXHandle(meta.expected_handle);
}

async function rechazarCuentaTwitter(input: {
  project: Project;
  account: ConnectedAccount;
  expected: string;
  actual?: string | null;
  connectedBy: string;
  userId?: string | null;
}): Promise<string> {
  await deleteConnectedAccount(input.account.id);
  const motivo = input.actual
    ? `X abrió ${input.actual}, no ${input.expected}. La cuenta equivocada fue retirada; cambia la sesión de X e inténtalo otra vez.`
    : `No pudimos confirmar que X abrió ${input.expected}. No dejamos ninguna cuenta conectada; inténtalo otra vez.`;
  await stageConnection({
    orgId: input.project.orgId,
    projectId: input.project.id,
    channel: 'twitter',
    connectedBy: input.connectedBy,
    userId: input.userId ?? null,
    status: 'needs_reconnect',
    resetIdentity: true,
    metadata: {
      expected_handle: input.expected,
      via: 'composio',
      motivo,
    },
  });
  return motivo;
}

function connectorComposio(slug: string): Connector {
  const c = connectorOrThrow(slug);
  if (c.via !== 'composio') throw new Error(`${c.label} no se conecta por Composio.`);
  // Sin app administrada también se puede conectar si Luis dio de alta la app
  // propia en Composio (channelAvailable lo decide por COMPOSIO_CUSTOM_AUTH_TOOLKITS).
  if (!c.managed && !channelAvailable(c.slug as ConnectionChannel)) {
    throw new Error(`${c.label} todavía no se puede conectar.`);
  }
  return c;
}

// ---------------------------------------------------------------------------
// 1. Conectar
// ---------------------------------------------------------------------------

export interface StartInput {
  project: Project;
  toolkit: string;
  /** Clerk id de quien apretó el botón. Va a la bitácora, no a la cuenta. */
  connectedBy: string;
  userId?: string | null;
  /** Origen público de esta instalación, para armar el callback. */
  baseUrl: string;
  /** Token del enlace de un solo uso, cuando la conexión la hace alguien de fuera. */
  linkToken?: string | null;
  /** Revoca la cuenta actual y abre OAuth para elegir otra. Solo tras confirmación explícita. */
  replace?: boolean;
  /** En X, la cuenta exacta que debe regresar del permiso. Nunca se acepta otra. */
  expectedHandle?: string | null;
}

export interface StartResult {
  redirectUrl: string;
  connectedAccountId: string;
  authConfigId: string;
  alreadyConnected?: boolean;
}

export function callbackUrlFor(
  baseUrl: string,
  projectId: string,
  toolkit: string,
  linkToken?: string | null,
): string {
  const url = new URL('/api/connections/composio/callback', baseUrl.replace(/\/+$/, ''));
  url.searchParams.set('project', projectId);
  url.searchParams.set('toolkit', toolkit);
  if (linkToken) url.searchParams.set('link', linkToken);
  return url.toString();
}

export async function startComposioConnection(input: StartInput): Promise<StartResult> {
  const c = connectorComposio(input.toolkit);
  const expectedHandle = c.slug === 'twitter' ? normalizeXHandle(input.expectedHandle) : null;
  if (!channelAvailable(c.slug as ConnectionChannel)) {
    throw new Error(`${c.label} no está disponible por ahora.`);
  }

  const auth = await ensureAuthConfig(c.slug);
  if (!auth.authConfigId) {
    throw new Error(`${c.label} no está disponible por ahora.`);
  }

  // Limpieza antes de conectar: cada clic que no terminó deja una cuenta a
  // medias en Composio y con basura acumulada se niega a crear otra ("Multiple
  // connected accounts found"). Si ya hay una ACTIVE, se registra y no se abre
  // nada; las demás se borran.
  const previas = await listConnectedAccounts({
    userId: composioUserId(input.project.id),
    toolkitSlug: c.slug,
  });
  const activa = previas.find((a) => a.status === 'ACTIVE');
  if (activa && !input.replace) {
    await saveConnection({
      orgId: input.project.orgId,
      projectId: input.project.id,
      channel: c.slug as ConnectionChannel,
      connectedBy: input.connectedBy,
      userId: input.userId ?? null,
      label: handleDeCuenta(activa) ?? c.label,
      externalHandle: handleDeCuenta(activa),
      verifiedAt: new Date(),
      metadata: {
        connected_account_id: activa.id,
        auth_config_id: auth.authConfigId,
        via: 'composio',
        motivo: null,
        motivo_tecnico: null,
        ...(expectedHandle ? { expected_handle: expectedHandle } : {}),
      },
    });
    return { redirectUrl: '', connectedAccountId: activa.id, authConfigId: auth.authConfigId, alreadyConnected: true };
  }
  for (const acc of previas) {
    await deleteConnectedAccount(acc.id);
  }

  const link = await createConnectLink({
    authConfigId: auth.authConfigId,
    userId: composioUserId(input.project.id),
    callbackUrl: callbackUrlFor(input.baseUrl, input.project.id, c.slug, input.linkToken),
  });
  if (!link.redirect_url) throw new Error(`No se pudo abrir la pantalla de ${c.label}.`);

  await stageConnection({
    orgId: input.project.orgId,
    projectId: input.project.id,
    channel: c.slug as ConnectionChannel,
    connectedBy: input.connectedBy,
    userId: input.userId ?? null,
    status: 'connecting',
    resetIdentity: input.replace === true || Boolean(expectedHandle),
    metadata: {
      connected_account_id: link.connected_account_id,
      auth_config_id: auth.authConfigId,
      via: 'composio',
      ...(expectedHandle ? { expected_handle: expectedHandle } : {}),
    },
  });

  return {
    redirectUrl: link.redirect_url,
    connectedAccountId: link.connected_account_id,
    authConfigId: auth.authConfigId,
  };
}

// ---------------------------------------------------------------------------
// 2. Volver del permiso
// ---------------------------------------------------------------------------

export interface FinishResult {
  ok: boolean;
  status: string;
  /** Lo que se le enseña al usuario si no salió bien. */
  motivo?: string;
  handle?: string | null;
  connectedAccountId?: string;
}

async function filaDe(
  orgId: string,
  projectId: string,
  toolkit: string,
): Promise<SocialAccount | null> {
  const rows = await db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.orgId, orgId),
        eq(socialAccounts.campaignId, projectId),
        eq(socialAccounts.platform, toolkit),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export function connectedAccountIdDe(account: SocialAccount | null): string | null {
  const meta = (account?.metadata ?? {}) as { connected_account_id?: string };
  return meta.connected_account_id ?? null;
}

/**
 * Cierra la conexión cuando el usuario vuelve del permiso.
 *
 * Si la fila no trajo id de cuenta —porque el usuario abrió el enlace en otro
 * navegador, o porque la fila se perdió— se pregunta por `user_id`, que es el
 * proyecto: la cuenta que Composio acabe de activar para ese proyecto y ese
 * toolkit es esta. No se adivina nada, se consulta.
 */
export async function finishComposioConnection(input: {
  project: Project;
  toolkit: string;
  connectedBy: string;
  userId?: string | null;
}): Promise<FinishResult> {
  const c = connectorComposio(input.toolkit);
  const fila = await filaDe(input.project.orgId, input.project.id, c.slug);
  const id = connectedAccountIdDe(fila);

  let account: ConnectedAccount | null = id ? await getConnectedAccount(id) : null;
  if (!account) {
    const lista = await listConnectedAccounts({
      userId: composioUserId(input.project.id),
      toolkitSlug: c.slug,
    });
    account =
      lista.find((a) => a.status === 'ACTIVE') ??
      lista.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0] ??
      null;
  }

  if (!account) {
    await markNeedsReconnect(
      input.project.orgId,
      input.project.id,
      c.slug as ConnectionChannel,
      'No se completó el permiso. Inténtalo otra vez.',
    );
    return { ok: false, status: 'NO_ENCONTRADA', motivo: 'No se completó el permiso. Inténtalo otra vez.' };
  }

  if (account.status !== 'ACTIVE') {
    const motivo = motivoEnEspanol(account.status);
    await stageConnection({
      orgId: input.project.orgId,
      projectId: input.project.id,
      channel: c.slug as ConnectionChannel,
      connectedBy: input.connectedBy,
      userId: input.userId ?? null,
      status: 'needs_reconnect',
      metadata: {
        connected_account_id: account.id,
        auth_config_id: account.auth_config?.id ?? null,
        via: 'composio',
        motivo,
        // El texto crudo del proveedor va a la fila (sirve para diagnosticar),
        // nunca a la pantalla.
        motivo_tecnico: account.status_reason ?? account.status,
      },
    });
    return { ok: false, status: account.status, motivo, connectedAccountId: account.id };
  }

  const expectedHandle = c.slug === 'twitter' ? expectedTwitterHandle(fila) : null;
  let providerHandle: string | null = null;
  if (expectedHandle) {
    try {
      providerHandle = await twitterHandleDeCuenta(input.project, account.id);
    } catch {
      const motivo = await rechazarCuentaTwitter({
        project: input.project,
        account,
        expected: expectedHandle,
        connectedBy: input.connectedBy,
        userId: input.userId,
      });
      return {
        ok: false,
        status: 'IDENTIDAD_NO_CONFIRMADA',
        motivo,
        connectedAccountId: account.id,
      };
    }
    if (!xHandlesMatch(expectedHandle, providerHandle)) {
      const motivo = await rechazarCuentaTwitter({
        project: input.project,
        account,
        expected: expectedHandle,
        actual: providerHandle,
        connectedBy: input.connectedBy,
        userId: input.userId,
      });
      return {
        ok: false,
        status: 'CUENTA_EQUIVOCADA',
        motivo,
        handle: providerHandle,
        connectedAccountId: account.id,
      };
    }
  }

  const handle = providerHandle ?? handleDeCuenta(account);
  await saveConnection({
    orgId: input.project.orgId,
    projectId: input.project.id,
    channel: c.slug as ConnectionChannel,
    connectedBy: input.connectedBy,
    userId: input.userId ?? null,
    label: handleDeCuenta(account) ?? handle ?? c.label,
    externalHandle: handle,
    verifiedAt: new Date(),
    metadata: {
      connected_account_id: account.id,
      auth_config_id: account.auth_config?.id ?? null,
      via: 'composio',
      motivo: null,
      motivo_tecnico: null,
      ...(expectedHandle ? { expected_handle: expectedHandle } : {}),
    },
  });

  await resolverPaginaSiEsFacebook(input.project, c.slug);

  return { ok: true, status: account.status, handle, connectedAccountId: account.id };
}

/**
 * Al conectar Facebook, resolver la PÁGINA y guardar su token.
 *
 * Aquí y no en la primera publicación a propósito: es el único momento en el que
 * el usuario está mirando la pantalla. Si la cuenta no administra ninguna página
 * —o no tiene permiso para publicar en ella— se entera ahora, no el día que
 * programó un post para las 9 de la mañana.
 *
 * Nunca lanza: una página que no se pudo resolver deja la conexión conectada
 * igual (leer sí se puede) y el token se vuelve a intentar en la publicación.
 * El import es dinámico para no cerrar el círculo con `src/channels/base.ts`,
 * que entra por aquí.
 */
async function resolverPaginaSiEsFacebook(project: Project, toolkit: string): Promise<void> {
  if (toolkit !== 'facebook') return;
  try {
    const { fijarPaginaDeFacebook } = await import('../channels/facebook');
    await fijarPaginaDeFacebook(project, null);
  } catch {
    // Se dirá en la tarjeta de Conexiones cuando se intente publicar. Tumbar el
    // callback por esto dejaría al usuario creyendo que no conectó nada.
  }
}

// ---------------------------------------------------------------------------
// 3. Verificar
// ---------------------------------------------------------------------------

export interface VerifyOutcome {
  toolkit: string;
  status: string;
  ok: boolean;
  motivo?: string;
}

/**
 * `verify()` de una conexión: GET de la cuenta en Composio y su `status`.
 * No hay atajo local — preguntar a la base "¿está conectado?" contesta lo que
 * nosotros escribimos la última vez, no lo que pasa en la cuenta del cliente.
 */
export async function verifyAccount(
  project: Project,
  account: SocialAccount,
): Promise<VerifyOutcome> {
  const toolkit = account.platform;
  const id = connectedAccountIdDe(account);
  const remoto = id
    ? await getConnectedAccount(id)
    : (
        await listConnectedAccounts({
          userId: composioUserId(project.id),
          toolkitSlug: toolkit,
        })
      ).find((a) => a.status === 'ACTIVE') ?? null;

  if (!remoto) {
    const motivo = 'Ya no existe el permiso. Vuelve a conectarla.';
    await markNeedsReconnect(project.orgId, project.id, toolkit as ConnectionChannel, motivo);
    return { toolkit, status: 'NO_ENCONTRADA', ok: false, motivo };
  }

  if (remoto.status === 'ACTIVE') {
    await db
      .update(socialAccounts)
      .set({
        status: 'connected',
        verifiedAt: new Date(),
        metadata: {
          ...(account.metadata ?? {}),
          connected_account_id: remoto.id,
          via: 'composio',
          motivo: null,
        },
        updatedAt: new Date(),
      })
      .where(eq(socialAccounts.id, account.id));
    return { toolkit, status: remoto.status, ok: true };
  }

  const motivo = motivoEnEspanol(remoto.status);
  await markNeedsReconnect(project.orgId, project.id, toolkit as ConnectionChannel, motivo);
  return { toolkit, status: remoto.status, ok: false, motivo };
}

/** Las filas de este proyecto que lleva Composio. */
export async function composioAccountsOf(project: Project): Promise<SocialAccount[]> {
  const rows = await db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.orgId, project.orgId),
        eq(socialAccounts.campaignId, project.id),
        inArray(socialAccounts.status, ['connected', 'needs_reconnect']),
      ),
    );
  return rows.filter((r) => ((r.metadata ?? {}) as { via?: string }).via === 'composio');
}

export async function verifyProjectAccounts(project: Project): Promise<VerifyOutcome[]> {
  const cuentas = await composioAccountsOf(project);
  const out: VerifyOutcome[] = [];
  for (const cuenta of cuentas) {
    try {
      out.push(await verifyAccount(project, cuenta));
    } catch (e) {
      // Que Composio esté caído no puede tumbar la pantalla del cliente: la
      // fila se queda como estaba y su `verified_at` envejece solo, que es
      // justo lo que hace que deje de pintarse de verde.
      out.push({
        toolkit: cuenta.platform,
        status: 'ERROR',
        ok: false,
        motivo: e instanceof Error ? e.message : 'no se pudo verificar',
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3 bis. Reconciliar: Composio manda
// ---------------------------------------------------------------------------

export interface Reconciliacion {
  /** Cuántas cuentas ACTIVE tiene el proyecto en Composio ahora mismo. */
  enComposio: number;
  /** Toolkits que Composio tenía vivos y a nosotros nos faltaban (o estaban apagados). */
  encendidos: string[];
  /** Toolkits que nosotros dábamos por conectados y allá ya no existen. */
  apagados: string[];
  /** Cuentas de Composio cuyo toolkit no está en el catálogo de Goossip. */
  fuera: string[];
  /** Si Composio no contestó, se dice — y no se toca ni una fila. */
  error?: string;
}

/**
 * Reconciliar el proyecto contra Composio ANTES de pintar nada.
 *
 * `verifyProjectAccounts` recorre las filas que YA tenemos: si una conexión
 * existe allá y aquí no hay fila —o la fila quedó `disconnected` porque el
 * usuario volvió del permiso por otro navegador y el callback nunca corrió—,
 * verificar no la encuentra y la pantalla dice "sin conectar" de algo que está
 * perfectamente conectado. Eso es exactamente el bug que reportó Luis: MOMENTUM
 * tiene seis cuentas vivas y el Inicio decía que no.
 *
 * Aquí se pregunta al revés: **se listan las cuentas del proyecto en Composio y
 * la base se acomoda a eso.** Composio es el dueño de la verdad; nuestra tabla
 * es una copia y una copia que discute con el original no sirve de nada.
 *
 * Es UNA sola llamada (`user_ids=project:<uuid>`, sin filtro de toolkit), así
 * que se puede hacer en cada apertura de pantalla sin castigar a nadie.
 *
 * Lo que NO hace: borrar filas. Una cuenta que ya no está allá queda
 * `needs_reconnect` con su motivo, porque quién la conectó y cuándo es parte de
 * la bitácora del proyecto.
 */
export async function reconciliarConComposio(project: Project): Promise<Reconciliacion> {
  const out: Reconciliacion = { enComposio: 0, encendidos: [], apagados: [], fuera: [] };
  if (!composioReady()) return { ...out, error: 'Falta la llave de Composio en este entorno.' };

  let remotas: ConnectedAccount[];
  try {
    remotas = await listConnectedAccounts({ userId: composioUserId(project.id) });
  } catch (e) {
    // Composio caído no puede tumbar la pantalla NI borrar el estado local: se
    // devuelve el motivo y las filas se quedan como estaban, envejeciendo su
    // `verified_at` — que es lo que las despinta de verde solas.
    return { ...out, error: e instanceof Error ? e.message : 'Composio no contestó.' };
  }

  /**
   * Las cuentas CAÍDAS que Composio sí conoce, por toolkit y con la más
   * reciente ganando.
   *
   * Existe por los dos detalles menores del hallazgo D:
   *   · la tarjeta de X decía *"El permiso venció"* mientras el API fresco decía
   *     *"Te quedaste a medias en la pantalla de permisos"* — la pantalla pintaba
   *     el `motivo` VIEJO guardado en la base y nadie lo refrescaba nunca,
   *     porque el paso 2 de abajo se salta las filas que ya están caídas;
   *   · la fila de `twitter` seguía apuntando a `ca_VtoO9hoJPxIC` cuando la
   *     cuenta viva en Composio ya era `ca_wn_Qu-r40_Jd`. Con el id viejo,
   *     verificar consulta una cuenta que ya no existe y el motivo nunca
   *     mejora: se queda mintiendo para siempre.
   */
  const caidas = new Map<string, ConnectedAccount>();
  const activas = new Map<string, ConnectedAccount>();
  for (const cuenta of remotas) {
    const slug = cuenta.toolkit?.slug;
    if (!slug) continue;
    if (cuenta.status !== 'ACTIVE') {
      const previa = caidas.get(slug);
      if (!previa || (cuenta.created_at ?? '') > (previa.created_at ?? '')) caidas.set(slug, cuenta);
      continue;
    }
    if (!connectorBySlug(slug)) {
      // Una cuenta de un toolkit que Goossip no ofrece. No se inventa una
      // tarjeta para ella: se cuenta y se dice, que es distinto de esconderla.
      if (!out.fuera.includes(slug)) out.fuera.push(slug);
      continue;
    }
    // Con dos cuentas vivas del mismo toolkit gana la más reciente: es la que
    // el usuario acaba de autorizar.
    const previa = activas.get(slug);
    if (!previa || (cuenta.created_at ?? '') > (previa.created_at ?? '')) activas.set(slug, cuenta);
  }
  out.enComposio = activas.size;

  const locales = await listProjectAccounts(project.orgId, project.id);
  const porToolkit = new Map(locales.map((l) => [l.platform, l]));
  const rechazadas = new Set<string>();

  // 1. Lo que está vivo allá: se enciende aquí, con la hora de AHORA. Acabamos
  //    de preguntar, así que este verde sí está respaldado.
  const ahora = new Date();
  for (const [slug, cuenta] of activas) {
    const fila = porToolkit.get(slug) ?? null;
    const expectedHandle = slug === 'twitter' ? expectedTwitterHandle(fila) : null;
    let providerHandle: string | null = null;
    if (expectedHandle) {
      try {
        providerHandle = await twitterHandleDeCuenta(project, cuenta.id);
      } catch {
        await rechazarCuentaTwitter({
          project,
          account: cuenta,
          expected: expectedHandle,
          connectedBy: fila?.connectedBy ?? 'composio',
          userId: fila?.userId ?? null,
        });
        rechazadas.add(slug);
        activas.delete(slug);
        out.enComposio = Math.max(0, out.enComposio - 1);
        if (fila?.status === 'connected') out.apagados.push(slug);
        continue;
      }
      if (!xHandlesMatch(expectedHandle, providerHandle)) {
        await rechazarCuentaTwitter({
          project,
          account: cuenta,
          expected: expectedHandle,
          actual: providerHandle,
          connectedBy: fila?.connectedBy ?? 'composio',
          userId: fila?.userId ?? null,
        });
        rechazadas.add(slug);
        activas.delete(slug);
        out.enComposio = Math.max(0, out.enComposio - 1);
        if (fila?.status === 'connected') out.apagados.push(slug);
        continue;
      }
    }
    const yaEstaba = fila?.status === 'connected' && verificacionFresca(fila.verifiedAt, ahora);
    const handle = providerHandle ?? handleDeCuenta(cuenta);
    await saveConnection({
      orgId: project.orgId,
      projectId: project.id,
      channel: slug as ConnectionChannel,
      // Reconciliar no inventa un autor: si ya había fila se respeta quién la
      // enganchó, y si no la había fue Composio quien nos lo contó.
      connectedBy: fila?.connectedBy ?? 'composio',
      userId: fila?.userId ?? null,
      label: handle ?? fila?.label ?? connectorBySlug(slug)?.label ?? slug,
      externalHandle: handle ?? fila?.externalHandle ?? null,
      verifiedAt: ahora,
      metadata: {
        connected_account_id: cuenta.id,
        auth_config_id: cuenta.auth_config?.id ?? null,
        via: 'composio',
        motivo: null,
        motivo_tecnico: null,
        ...(expectedHandle ? { expected_handle: expectedHandle } : {}),
      },
    }).catch(() => undefined);
    // Los proyectos que YA estaban conectados antes de la corrida 13 no tienen
    // token de página guardado, y no se les va a pedir que reconecten Facebook
    // para arreglar un bug nuestro. Se resuelve aquí, una sola vez: la función
    // no hace nada si el token ya está.
    if (slug === 'facebook' && !((fila?.metadata ?? {}) as { page_token?: string }).page_token) {
      await resolverPaginaSiEsFacebook(project, slug);
    }
    if (!yaEstaba) out.encendidos.push(slug);
  }

  // 2. Lo que aquí damos por conectado y allá ya no existe: se apaga con su
  //    motivo en español. Verde sin respaldo es la mentira que cuesta caro.
  //
  //    Y lo que YA estaba caído: se le refresca el motivo y el id de cuenta con
  //    lo que Composio dice AHORA. Antes esta rama se saltaba esas filas, y por
  //    eso la tarjeta de X se quedó meses diciendo "El permiso venció" cuando lo
  //    que pasaba era que el usuario no había terminado la pantalla de permisos.
  for (const fila of locales) {
    if (((fila.metadata ?? {}) as { via?: string }).via !== 'composio') continue;
    if (rechazadas.has(fila.platform)) continue;
    if (activas.has(fila.platform)) continue;

    const remota = caidas.get(fila.platform) ?? null;
    const motivo = remota
      ? motivoEnEspanol(remota.status)
      : 'Ya no existe el permiso. Vuelve a conectarla.';

    const metaVieja = (fila.metadata ?? {}) as Record<string, unknown>;
    const cambioElMotivo = metaVieja.motivo !== motivo;
    const cambioLaCuenta = Boolean(remota && metaVieja.connected_account_id !== remota.id);
    if (fila.status !== 'connected' && !cambioElMotivo && !cambioLaCuenta) continue;

    await db
      .update(socialAccounts)
      .set({
        status: 'needs_reconnect',
        metadata: {
          ...metaVieja,
          ...(remota ? { connected_account_id: remota.id } : {}),
          motivo,
          motivo_tecnico: remota?.status_reason ?? remota?.status ?? 'sin cuenta en Composio',
        },
        updatedAt: new Date(),
      })
      .where(eq(socialAccounts.id, fila.id))
      .catch(() => undefined);

    if (fila.status === 'connected') out.apagados.push(fila.platform);
  }

  return out;
}

/**
 * El barrido diario. Recorre TODOS los proyectos que tienen algo por Composio.
 * Es cron, no pantalla: aquí sí importa que sea barato, así que solo toca los
 * proyectos que de verdad tienen filas.
 */
export async function verifyAllProjects(limit = 500): Promise<{
  proyectos: number;
  cuentas: number;
  vivas: number;
  caidas: number;
  detalles: Array<{ project: string; toolkit: string; status: string; ok: boolean }>;
}> {
  const filas = await db
    .select({ projectId: socialAccounts.campaignId })
    .from(socialAccounts)
    .where(
      and(
        inArray(socialAccounts.status, ['connected', 'needs_reconnect']),
        isNotNull(socialAccounts.campaignId),
      ),
    );
  const ids = [...new Set(filas.map((f) => f.projectId).filter(Boolean) as string[])].slice(0, limit);
  if (ids.length === 0) {
    return { proyectos: 0, cuentas: 0, vivas: 0, caidas: 0, detalles: [] };
  }

  const proyectos = await db.select().from(campaigns).where(inArray(campaigns.id, ids));
  const detalles: Array<{ project: string; toolkit: string; status: string; ok: boolean }> = [];
  let vivas = 0;
  let caidas = 0;

  for (const project of proyectos) {
    const resultados = await verifyProjectAccounts(project);
    for (const r of resultados) {
      detalles.push({ project: project.id, toolkit: r.toolkit, status: r.status, ok: r.ok });
      if (r.ok) vivas += 1;
      else caidas += 1;
    }
  }

  return { proyectos: proyectos.length, cuentas: vivas + caidas, vivas, caidas, detalles };
}

// ---------------------------------------------------------------------------
// 4. Revocar
// ---------------------------------------------------------------------------

export async function revokeComposioConnection(
  project: Project,
  toolkit: string,
): Promise<{ borradaEnComposio: boolean; borradasEnComposio: number }> {
  const fila = await filaDe(project.orgId, project.id, toolkit);
  const id = connectedAccountIdDe(fila);
  // No alcanza con el id local: un intento abandonado puede haber dejado otra
  // cuenta remota del mismo toolkit. Si una sobrevive, la reconciliación la
  // volverá a encender y el botón "Quitar" parecerá roto.
  const remotas = await listConnectedAccounts({
    userId: composioUserId(project.id),
    toolkitSlug: toolkit,
  });
  const ids = new Set(remotas.map((account) => account.id));
  if (id) ids.add(id);

  let borradasEnComposio = 0;
  for (const accountId of ids) {
    await deleteConnectedAccount(accountId);
    borradasEnComposio += 1;
  }
  await revokeConnection(project.orgId, project.id, toolkit as ConnectionChannel);
  return {
    borradaEnComposio: borradasEnComposio > 0,
    borradasEnComposio,
  };
}

/**
 * La cuenta conectada que debe usar una acción de este proyecto, o null.
 * Los adaptadores de `src/channels` entran por aquí: si no hay cuenta viva,
 * la acción no se intenta y se dice por qué.
 */
export async function activeAccountFor(
  project: Project,
  toolkit: string,
): Promise<{ connectedAccountId: string; userId: string } | null> {
  const fila = await filaDe(project.orgId, project.id, toolkit);
  if (!fila || fila.status !== 'connected') return null;
  const id = connectedAccountIdDe(fila);
  if (!id) return null;
  return { connectedAccountId: id, userId: composioUserId(project.id) };
}
