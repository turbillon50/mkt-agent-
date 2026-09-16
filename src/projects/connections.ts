/**
 * Conexiones DEL PROYECTO.
 *
 * La conexión cuelga del proyecto, no de quien apretó el botón: si fuera del
 * usuario, el día que se va el community manager se va la página de Facebook
 * del cliente. Se registra QUIÉN la enganchó, nada más.
 *
 * Corrida 5: las cuentas las lleva COMPOSIO con su app administrada. Goossip no
 * registra apps de developer en Meta, Google ni LinkedIn — un usuario que nace
 * hoy entra, aprieta "Conectar", autoriza en la pantalla del proveedor y ya.
 * El catálogo entero vive en `catalog.ts`.
 *
 * Regla que no se negocia: **cero notas internas al usuario**. Un conector está
 * `conectado`, `sin_conectar`, `reconectar` o `proximamente`. Nada de "falta
 * registrar el auth config" ni "requiere app de developer".
 *
 * Y la otra, del issue #33: **nada se pinta de verde sin una verificación de
 * menos de 24 h**. Una bandera "ya conectó" se queda mintiendo el día que el
 * cliente revoca el permiso desde Facebook.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import {
  composioAuthConfigs,
  orgMemberships,
  socialAccounts,
  users,
  type Project,
  type SocialAccount,
} from '../db/schema';
import { hasProjectSecret, projectSecret } from '../../lib/project-secrets';
import { open } from '../../lib/secret-box';
import { metaAdsHabilitado } from '../banderas';
import { composioReady } from '../composio/client';
import { resolveRules, type McpSource, type ProjectChannels } from '../sales/types';
import {
  activeConnectors,
  connectorMode,
  connectorOrThrow,
  connectorShareable,
  defaultLogo,
  metaOwnAppEnabled,
  type ConnectionMode,
  type Connector,
  type ConnectorGroup,
} from './catalog';
import type { ConnectionChannel, ConnectionState } from './types';

export type { SocialAccount };

// ---------------------------------------------------------------------------
// ¿Qué se puede conectar de verdad hoy?
// ---------------------------------------------------------------------------

function env(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() && !v.trim().startsWith('[') ? v.trim() : null;
}

/**
 * Disponible no es "¿existe el código?": es "¿hay con qué?".
 *
 * Para todo lo de Composio son dos condiciones y las dos están medidas:
 *   · el toolkit tiene auth ADMINISTRADA por Composio (`managed` en el
 *     catálogo, comprobado contra `GET /api/v3/toolkits/{slug}`), y
 *   · este entorno tiene una `COMPOSIO_API_KEY` de verdad.
 * Lo que no cumple sale "Próximamente" y punto: conectarlo pediría registrar
 * una app de developer propia, que es exactamente lo que esta corrida quita.
 */
export function channelAvailable(id: string): boolean {
  const c = connectorOrThrow(id);
  if (c.via === 'composio') {
    // Con app propia dada de alta en Composio (auth config custom) el conector
    // también se puede conectar: se declara por env, separado por comas.
    const propias = (env('COMPOSIO_CUSTOM_AUTH_TOOLKITS') ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    return (c.managed || propias.includes(c.slug)) && composioReady();
  }
  // Meta Ads con la app propia (corrida 11). NO depende de `META_OWN_APP`: esa
  // bandera apaga el camino de PÁGINAS de la corrida 3, que es otro conector y
  // otra decisión. Lo que decide aquí es lo único que importa — si hay app con
  // qué conectar — más un interruptor propio para poder apagarlo sin deploy.
  if (c.via === 'meta_own_app') {
    return metaAdsHabilitado() && Boolean(env('META_APP_ID') && env('META_APP_SECRET'));
  }
  switch (id) {
    case 'meta':
      return metaOwnAppEnabled() && Boolean(env('META_APP_ID') && env('META_APP_SECRET'));
    default:
      // El formulario del sitio, el catálogo y el número de WhatsApp no
      // dependen de terceros: siempre se pueden dar de alta.
      return true;
  }
}

/** Google Ads vive en Campañas, pero se decide igual que cualquier otro. */
export function googleAdsAvailable(): boolean {
  return channelAvailable('googleads');
}

// ---------------------------------------------------------------------------
// Frescura de la verificación
// ---------------------------------------------------------------------------

export const VERIFICACION_MAX_MS = 24 * 60 * 60 * 1000;

export function verificacionFresca(verifiedAt: Date | null | undefined, ahora = new Date()): boolean {
  if (!verifiedAt) return false;
  return ahora.getTime() - verifiedAt.getTime() < VERIFICACION_MAX_MS;
}

// ---------------------------------------------------------------------------
// Estado de un conector dentro de un proyecto
// ---------------------------------------------------------------------------

export interface ChannelCard extends Connector {
  /** Alias del slug: las pantallas y las rutas ya llamaban `id` al canal. */
  id: ConnectionChannel;
  mode: ConnectionMode;
  shareable: boolean;
  logo: string;
  state: ConnectionState;
  /** Lo que se ve bajo el título cuando hay algo conectado: la cuenta, la página. */
  detail: string | null;
  /** Quién lo conectó (correo) y cuándo. */
  connectedBy: string | null;
  connectedAt: string | null;
  verifiedAt: string | null;
  /** Falta un paso del usuario, dicho en español de a pie. Nunca jerga interna. */
  pending: string | null;
  /** Datos públicos que la pantalla necesita (páginas elegidas, formularios…). */
  data: Record<string, unknown>;
}

export interface ProjectConnections {
  cards: ChannelCard[];
  /** Cuántos conectores de verdad conectables tiene el proyecto hoy. */
  conectables: number;
  conectados: number;
  /** Todos los del catálogo, conectables o no. Es la M del "N de M". */
  total: number;
  grupos: ConnectorGroup[];
  /**
   * Qué dijo Composio cuando se reconcilió, si se reconcilió. Sirve para que la
   * pantalla pueda decir "no pudimos preguntarle a Composio" en vez de pintar
   * un "sin conectar" que no es verdad.
   */
  reconciliado?: { enComposio: number; encendidos: string[]; apagados: string[]; error?: string };
}

/** Estados de la fila en la base. `connecting` = abrió el permiso y no volvió. */
export type AccountStatus = 'connected' | 'disconnected' | 'connecting' | 'needs_reconnect';

interface CardOptions {
  logos?: Map<string, string>;
  ahora?: Date;
}

function baseCard(c: Connector, account: SocialAccount | null, opts: CardOptions): ChannelCard {
  return {
    ...c,
    id: c.slug as ConnectionChannel,
    mode: connectorMode(c.slug),
    shareable: connectorShareable(c.slug),
    logo: opts.logos?.get(c.slug) ?? defaultLogo(c.slug),
    state: 'sin_conectar',
    detail: null,
    connectedBy: account?.connectedBy ?? null,
    connectedAt: account?.connectedAt?.toISOString() ?? null,
    verifiedAt: account?.verifiedAt?.toISOString() ?? null,
    pending: null,
    data: {},
  };
}

/**
 * La tarjeta de un conector de Composio. La verdad de si sigue viva NO está
 * aquí: está en `verified_at`, que escribe el verificador tras preguntarle a
 * Composio. Esta función solo traduce esa verdad a algo que se lee.
 */
function composioCard(c: Connector, account: SocialAccount | null, opts: CardOptions): ChannelCard {
  const base = baseCard(c, account, opts);
  const meta = (account?.metadata ?? {}) as {
    motivo?: string;
    connected_account_id?: string;
    public_identity?: Record<string, unknown>;
    publish_capability?: { ready?: boolean; reason?: string | null; text?: boolean; image?: boolean; video?: boolean; checkedAt?: string };
  };
  const status = (account?.status ?? 'disconnected') as AccountStatus;

  if (status === 'connected') {
    if (verificacionFresca(account?.verifiedAt, opts.ahora)) {
      if (meta.publish_capability?.ready === false) {
        return {
          ...base,
          state: 'reconectar',
          detail: account?.externalHandle ?? account?.label ?? null,
          pending: meta.publish_capability.reason ?? 'La cuenta está conectada, pero no puede publicar.',
          data: {
            identity: meta.public_identity ?? null,
            capability: meta.publish_capability,
          },
        };
      }
      return {
        ...base,
        state: 'conectado',
        detail: account?.externalHandle ?? account?.label ?? null,
        data: {
          identity: meta.public_identity ?? null,
          capability: meta.publish_capability ?? null,
        },
      };
    }
    // Hubo conexión pero hace más de un día que nadie la confirma. No se pinta
    // de verde: verde es una promesa, y esta no tiene con qué respaldarse.
    return {
      ...base,
      state: 'reconectar',
      detail: account?.label ?? account?.externalHandle ?? null,
      pending: 'Hace más de un día que no confirmamos esta cuenta. Vuelve a conectarla.',
    };
  }

  if (status === 'needs_reconnect') {
    return {
      ...base,
      state: 'reconectar',
      detail: account?.label ?? account?.externalHandle ?? null,
      pending: meta.motivo ?? 'La cuenta dejó de responder. Vuelve a conectarla.',
    };
  }

  if (status === 'connecting') {
    return {
      ...base,
      pending: 'Te quedaste a medias en la pantalla de permisos. Inténtalo otra vez.',
    };
  }

  return base;
}

/** Lo que guarda la fila de `metaads` en `metadata`. Nada de esto es un secreto. */
export interface MetaAdsMeta {
  motivo?: string;
  business?: string | null;
  business_id?: string | null;
  currency?: string | null;
  account_status?: number | null;
  /** Las cuentas entre las que el usuario todavía tiene que elegir. */
  candidates?: Array<{
    id: string;
    accountId: string;
    name: string;
    business: string | null;
    currency: string | null;
    status: number | null;
  }>;
  /** El token de usuario de larga duración, CIFRADO. Nunca sale por una API. */
  user_token?: string;
}

/**
 * La tarjeta de Meta Ads.
 *
 * Tres diferencias con la de Composio y las tres son de negocio:
 *   · la conexión no termina al volver de Facebook — falta elegir CUÁL de las
 *     cuentas publicitarias es la de este proyecto, y adivinar con un cliente
 *     que tiene tres cuentas es reportarle el gasto de otro negocio;
 *   · el verde también caduca a las 24 h, porque el token de usuario de Meta se
 *     puede revocar desde Facebook sin avisarnos, y
 *   · el motivo de "Reconectar" viene de Graph traducido (`motivoDeMeta`), no
 *     del código crudo: "(#200) Ad account owner has NOT grant ads_management"
 *     no le dice a nadie que tiene que ir a Business Manager.
 */
function metaAdsCard(c: Connector, account: SocialAccount | null, opts: CardOptions): ChannelCard {
  const base = baseCard(c, account, opts);
  const meta = (account?.metadata ?? {}) as MetaAdsMeta;
  const status = (account?.status ?? 'disconnected') as AccountStatus;
  const detail = account?.label ?? account?.externalHandle ?? null;
  const data = {
    account_id: account?.externalId ?? null,
    business: meta.business ?? null,
    currency: meta.currency ?? null,
    account_status: meta.account_status ?? null,
  };

  if (status === 'connected' && account?.externalId) {
    if (verificacionFresca(account.verifiedAt, opts.ahora)) {
      return { ...base, state: 'conectado', detail, data };
    }
    return {
      ...base,
      state: 'reconectar',
      detail,
      pending: 'Hace más de un día que no confirmamos esta cuenta publicitaria. Vuelve a conectarla.',
      data,
    };
  }

  if (status === 'needs_reconnect') {
    return {
      ...base,
      state: 'reconectar',
      detail,
      pending: meta.motivo ?? 'Tu cuenta publicitaria dejó de responder. Vuelve a conectarla.',
      data,
    };
  }

  // Volvió de Facebook y falta el último paso. La tarjeta NO se pinta de verde:
  // sin cuenta elegida no hay un solo número que enseñar.
  const candidatas = meta.candidates ?? [];
  if (candidatas.length > 0) {
    return {
      ...base,
      pending: 'Elige qué cuenta publicitaria usa este proyecto.',
      data: { candidates: candidatas },
    };
  }

  if (status === 'connecting') {
    return { ...base, pending: 'Te quedaste a medias en la pantalla de permisos. Inténtalo otra vez.' };
  }

  return base;
}

/**
 * Arma las tarjetas del proyecto. Es la ÚNICA fuente del estado: la pantalla no
 * vuelve a decidir nada, solo pinta.
 */
export function buildChannelCards(
  project: Project,
  accounts: SocialAccount[],
  opts: CardOptions = {},
): ProjectConnections {
  const byPlatform = new Map(accounts.map((a) => [a.platform, a]));
  const channels = (project.channels ?? {}) as ProjectChannels;
  const mcpSources = (project.mcpSources ?? []) as McpSource[];

  const cards = activeConnectors().map((c): ChannelCard => {
    const account = byPlatform.get(c.slug) ?? null;
    const base = baseCard(c, account, opts);

    if (!channelAvailable(c.slug as ConnectionChannel)) return { ...base, state: 'proximamente' };
    if (c.via === 'composio') return composioCard(c, account, opts);
    if (c.via === 'meta_own_app') return metaAdsCard(c, account, opts);

    switch (c.slug) {
      case 'meta': {
        const meta = (account?.metadata ?? {}) as {
          page_name?: string;
          page_id?: string;
          forms?: Array<{ id: string; name: string }>;
          available_forms?: Array<{ id: string; name: string; status: string; leadsCount: number }>;
          candidates?: Array<{ id: string; name: string }>;
          suscrita?: boolean;
        };
        const pageId = meta.page_id ?? channels.meta_page_id ?? null;
        const forms = meta.forms ?? (channels.meta_form_ids ?? []).map((id) => ({ id, name: id }));
        if (account?.status === 'connected' && pageId) {
          return {
            ...base,
            state: 'conectado',
            detail: meta.page_name ?? account.label ?? `Página ${pageId}`,
            pending:
              forms.length === 0 ? 'Elige de qué formulario quieres recibir a la gente.' : null,
            data: {
              page_id: pageId,
              page_name: meta.page_name ?? account.label ?? null,
              forms,
              available_forms: meta.available_forms ?? [],
              suscrita: meta.suscrita ?? false,
            },
          };
        }
        if ((meta.candidates ?? []).length > 0) {
          return {
            ...base,
            pending: 'Elige a cuál de tus páginas se conecta este proyecto.',
            data: { candidates: meta.candidates },
          };
        }
        return base;
      }

      case 'whatsapp': {
        const phoneId = channels.waba_phone_id ?? null;
        const conCredencial = hasProjectSecret(project.slug, 'WHATSAPP_TOKEN');
        if (phoneId && conCredencial) {
          return {
            ...base,
            state: 'conectado',
            detail: account?.label ?? `Número ${phoneId}`,
            data: { waba_phone_id: phoneId },
          };
        }
        if (phoneId) {
          return {
            ...base,
            pending: 'Guardamos tu número. Falta autorizar a Goossip para escribir desde él.',
            data: { waba_phone_id: phoneId },
          };
        }
        return base;
      }

      case 'sitio': {
        if (account?.status === 'connected' && account.externalId) {
          return {
            ...base,
            state: 'conectado',
            detail: 'Recibiendo formularios',
            data: { token: account.externalId },
          };
        }
        return base;
      }

      case 'mcp': {
        if (mcpSources.length > 0) {
          return {
            ...base,
            state: 'conectado',
            detail:
              mcpSources.length === 1
                ? mcpSources[0].label
                : `${mcpSources.length} fuentes de catálogo`,
            data: { sources: mcpSources },
          };
        }
        return base;
      }

      default:
        return base;
    }
  });

  return {
    cards,
    conectables: cards.filter((c) => c.state !== 'proximamente').length,
    conectados: cards.filter((c) => c.state === 'conectado').length,
    total: cards.length,
    grupos: [...new Set(cards.map((c) => c.group))],
  };
}

/**
 * ¿Este proyecto tiene Facebook o Instagram de verdad?
 *
 * Existe como función y no como un `find('meta')` suelto porque ESE era el bug
 * que reportó Luis: la lista de arranque preguntaba por el conector `meta` —el
 * de la app propia, apagado desde la corrida 5— y contestaba "no conectado" con
 * las cuentas de Facebook e Instagram de Composio vivas y verificadas. Una sola
 * función, y todo lo que pregunte por Meta pregunta lo mismo.
 */
export function metaConectado(cards: ChannelCard[]): {
  conectado: boolean;
  cuales: ChannelCard[];
  formularios: number;
} {
  const cuales = cards.filter(
    (c) => (c.id === 'facebook' || c.id === 'instagram' || c.id === 'meta') && c.state === 'conectado',
  );
  // Los formularios de lead ads solo existen del lado de la página: viven en la
  // tarjeta de `meta` (app propia) o en la de `facebook` cuando el proyecto ya
  // eligió de cuál recibir.
  let formularios = 0;
  for (const c of cuales) {
    const forms = (c.data as { forms?: unknown[] })?.forms;
    if (Array.isArray(forms)) formularios += forms.length;
  }
  return { conectado: cuales.length > 0, cuales, formularios };
}

// ---------------------------------------------------------------------------
// Lectura y escritura
// ---------------------------------------------------------------------------

export async function listProjectAccounts(
  orgId: string,
  projectId: string,
): Promise<SocialAccount[]> {
  return db
    .select()
    .from(socialAccounts)
    .where(and(eq(socialAccounts.orgId, orgId), eq(socialAccounts.campaignId, projectId)));
}

/**
 * El identificador del proyecto ante Composio.
 *
 * **El `user_id` de Composio es el PROYECTO de Goossip**, no el usuario de
 * Clerk. Dos razones, las dos de negocio:
 *   · el equipo del proyecto comparte las conexiones — dos personas del mismo
 *     cliente ven y usan la misma cuenta de Facebook, y
 *   · un cliente no arrastra las conexiones de otro: cada proyecto es su propio
 *     inquilino ante Composio.
 * El prefijo `project:` es para que un id suelto en un log de Composio se lea
 * solo; abajo siempre es el uuid del proyecto, 1 a 1.
 */
export function composioUserId(projectId: string): string {
  return `project:${projectId}`;
}

export function projectIdFromComposioUser(userId: string): string {
  return userId.startsWith('project:') ? userId.slice('project:'.length) : userId;
}

/** Los logos que dejó el bootstrap, con el nombre real del toolkit. */
export async function toolkitLogos(): Promise<Map<string, string>> {
  const rows = await db
    .select({ toolkit: composioAuthConfigs.toolkit, logo: composioAuthConfigs.logo })
    .from(composioAuthConfigs);
  const out = new Map<string, string>();
  for (const r of rows) if (r.logo) out.set(r.toolkit, r.logo);
  return out;
}

/**
 * Quién conectó cada canal, en legible.
 *
 * En la fila vive el `clerk_id` — es lo único estable — pero enseñarle
 * "user_3FrR4yZeBozjOU493NgWN10Digk" a Luis no responde la pregunta que hace,
 * que es "¿quién movió esto?". Se traduce a correo con lo que ya hay espejado.
 */
async function nombresDe(orgId: string, clerkIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(clerkIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const [porMembresia, porUsuario] = await Promise.all([
    db
      .select({ id: orgMemberships.clerkUserId, email: orgMemberships.email })
      .from(orgMemberships)
      .where(and(eq(orgMemberships.orgId, orgId), inArray(orgMemberships.clerkUserId, ids))),
    db.select({ id: users.clerkId, email: users.email }).from(users).where(inArray(users.clerkId, ids)),
  ]);
  const out = new Map<string, string>();
  for (const r of [...porUsuario, ...porMembresia]) {
    if (r.email) out.set(r.id, r.email);
  }
  return out;
}

/**
 * El estado de las conexiones del proyecto, listo para pintar.
 *
 * `verificar` RECONCILIA contra Composio antes de contestar: se listan las
 * cuentas del proyecto allá y la base se acomoda a eso. Se hace al abrir la
 * pantalla porque es el único momento en que alguien va a creerle al color
 * verde — y porque preguntar solo por las filas que ya teníamos es como se
 * quedó MOMENTUM diciendo "sin conectar" con seis cuentas vivas.
 *
 * Es UNA llamada a Composio (`user_ids=project:<uuid>`), no una por canal.
 */
export async function projectConnections(
  project: Project,
  opts: { verificar?: boolean } = {},
): Promise<ProjectConnections> {
  // Meta Ads no pasa por Composio, así que su verdad hay que ir a buscarla
  // aparte: una llamada a Graph con la cuenta del proyecto que refresca
  // `verified_at` o la marca para reconectar con el motivo en español. Sin
  // esto la tarjeta se pondría en "Reconectar" sola a las 24 h con la cuenta
  // perfectamente viva — que es exactamente el bug que la regla del verde
  // caduco vino a evitar, al revés.
  if (opts.verificar && channelAvailable('metaads')) {
    const { verificarMetaAds } = await import('../channels/metaads');
    await verificarMetaAds(project).catch(() => undefined);
  }

  let reconciliado: ProjectConnections['reconciliado'];
  if (opts.verificar && composioReady()) {
    const { reconciliarConComposio } = await import('./composio-connections');
    const r = await reconciliarConComposio(project).catch((e) => ({
      enComposio: 0,
      encendidos: [] as string[],
      apagados: [] as string[],
      error: e instanceof Error ? e.message : 'Composio no contestó.',
    }));
    reconciliado = {
      enComposio: r.enComposio,
      encendidos: r.encendidos,
      apagados: r.apagados,
      ...(r.error ? { error: r.error } : {}),
    };

    // OAuth ACTIVE no alcanza: se comprueba identidad y capacidad de publicar.
    const { refreshPublishingCapabilities } = await import('./publishing-capabilities');
    await refreshPublishingCapabilities(project).catch(() => undefined);
  }

  const [accounts, logos] = await Promise.all([
    listProjectAccounts(project.orgId, project.id),
    toolkitLogos().catch(() => new Map<string, string>()),
  ]);
  const built = buildChannelCards(project, accounts, { logos });
  if (reconciliado) built.reconciliado = reconciliado;

  const nombres = await nombresDe(
    project.orgId,
    built.cards.map((c) => c.connectedBy ?? '').filter(Boolean),
  ).catch(() => new Map<string, string>());
  for (const card of built.cards) {
    if (card.connectedBy) card.connectedBy = nombres.get(card.connectedBy) ?? card.connectedBy;
  }

  return built;
}

export interface SaveConnectionInput {
  orgId: string;
  projectId: string;
  channel: ConnectionChannel;
  connectedBy: string;
  label?: string | null;
  externalHandle?: string | null;
  externalId?: string | null;
  metadata?: Record<string, unknown>;
  /** El usuario de la app que la conectó, si lo hay. Un invitado por enlace no lo tiene. */
  userId?: string | null;
  /** Cuándo lo confirmó el proveedor. Sin esto no hay verde. */
  verifiedAt?: Date | null;
}

/** Alta o actualización de la conexión de un canal dentro de un proyecto. */
export async function saveConnection(input: SaveConnectionInput): Promise<SocialAccount> {
  connectorOrThrow(input.channel); // valida que el conector exista
  const now = new Date();
  const existing = await db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.orgId, input.orgId),
        eq(socialAccounts.campaignId, input.projectId),
        eq(socialAccounts.platform, input.channel),
      ),
    )
    .limit(1);

  if (existing[0]) {
    const [row] = await db
      .update(socialAccounts)
      .set({
        status: 'connected',
        label: input.label ?? existing[0].label,
        externalHandle: input.externalHandle ?? existing[0].externalHandle,
        externalId: input.externalId ?? existing[0].externalId,
        metadata: { ...(existing[0].metadata ?? {}), ...(input.metadata ?? {}) },
        connectedBy: input.connectedBy,
        connectedAt: now,
        verifiedAt: input.verifiedAt ?? existing[0].verifiedAt,
        userId: input.userId ?? existing[0].userId,
        updatedAt: now,
      })
      .where(eq(socialAccounts.id, existing[0].id))
      .returning();
    return row;
  }

  const [row] = await db
    .insert(socialAccounts)
    .values({
      orgId: input.orgId,
      campaignId: input.projectId,
      userId: input.userId ?? null,
      platform: input.channel,
      status: 'connected',
      label: input.label ?? null,
      externalHandle: input.externalHandle ?? null,
      externalId: input.externalId ?? null,
      metadata: input.metadata ?? {},
      connectedBy: input.connectedBy,
      connectedAt: now,
      verifiedAt: input.verifiedAt ?? null,
    })
    .returning();
  if (!row) throw new Error('No se pudo guardar la conexión.');
  return row;
}

/**
 * Guarda a medias: el permiso todavía no está dado (o falta que el usuario elija
 * su página). La fila NO queda `connected` a propósito — una conexión a medias
 * no recibe un solo lead, y pintarla de verde sería mentir.
 */
export async function stageConnection(input: {
  orgId: string;
  projectId: string;
  channel: ConnectionChannel;
  connectedBy: string;
  userId?: string | null;
  metadata: Record<string, unknown>;
  status?: AccountStatus;
  /** Al cambiar de cuenta, no heredar identidad ni tokens de la anterior. */
  resetIdentity?: boolean;
}): Promise<void> {
  const now = new Date();
  const status = input.status ?? 'disconnected';
  const existing = await db
    .select({ id: socialAccounts.id, metadata: socialAccounts.metadata })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.orgId, input.orgId),
        eq(socialAccounts.campaignId, input.projectId),
        eq(socialAccounts.platform, input.channel),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(socialAccounts)
      .set({
        status,
        metadata: input.resetIdentity
          ? input.metadata
          : { ...(existing[0].metadata ?? {}), ...input.metadata },
        ...(input.resetIdentity
          ? { label: null, externalHandle: null, externalId: null, verifiedAt: null }
          : {}),
        connectedBy: input.connectedBy,
        updatedAt: now,
      })
      .where(eq(socialAccounts.id, existing[0].id));
    return;
  }
  await db.insert(socialAccounts).values({
    orgId: input.orgId,
    campaignId: input.projectId,
    userId: input.userId ?? null,
    platform: input.channel,
    status,
    metadata: input.metadata,
    connectedBy: input.connectedBy,
  });
}

/** Marca una conexión como "hay que reconectarla", con el motivo en español. */
export async function markNeedsReconnect(
  orgId: string,
  projectId: string,
  channel: ConnectionChannel,
  motivo: string,
): Promise<void> {
  const rows = await db
    .select({ id: socialAccounts.id, metadata: socialAccounts.metadata })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.orgId, orgId),
        eq(socialAccounts.campaignId, projectId),
        eq(socialAccounts.platform, channel),
      ),
    )
    .limit(1);
  if (!rows[0]) return;
  await db
    .update(socialAccounts)
    .set({
      status: 'needs_reconnect',
      metadata: { ...(rows[0].metadata ?? {}), motivo },
      updatedAt: new Date(),
    })
    .where(eq(socialAccounts.id, rows[0].id));
}

/** La verificación salió bien: se sella la hora. Es lo único que enciende el verde. */
export async function markVerified(
  orgId: string,
  projectId: string,
  channel: ConnectionChannel,
  cuando = new Date(),
): Promise<void> {
  await db
    .update(socialAccounts)
    .set({ status: 'connected', verifiedAt: cuando, updatedAt: cuando })
    .where(
      and(
        eq(socialAccounts.orgId, orgId),
        eq(socialAccounts.campaignId, projectId),
        eq(socialAccounts.platform, channel),
      ),
    );
}

/** Lo que dejó a medias el OAuth propio de Meta: las páginas entre las que elegir. */
export async function pendingMeta(
  orgId: string,
  projectId: string,
): Promise<{ candidates: Array<{ id: string; name: string }>; userToken: string | null }> {
  const rows = await db
    .select({ metadata: socialAccounts.metadata })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.orgId, orgId),
        eq(socialAccounts.campaignId, projectId),
        eq(socialAccounts.platform, 'meta'),
      ),
    )
    .limit(1);
  const meta = (rows[0]?.metadata ?? {}) as {
    candidates?: Array<{ id: string; name: string }>;
    user_token?: string;
  };
  return { candidates: meta.candidates ?? [], userToken: open(meta.user_token ?? null) };
}

/** Lo que dejó a medias el OAuth de Meta Ads: las cuentas entre las que elegir. */
export async function pendingMetaAds(
  orgId: string,
  projectId: string,
): Promise<{ candidates: NonNullable<MetaAdsMeta['candidates']>; userToken: string | null }> {
  const rows = await db
    .select({ metadata: socialAccounts.metadata })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.orgId, orgId),
        eq(socialAccounts.campaignId, projectId),
        eq(socialAccounts.platform, 'metaads'),
      ),
    )
    .limit(1);
  const meta = (rows[0]?.metadata ?? {}) as MetaAdsMeta;
  return { candidates: meta.candidates ?? [], userToken: open(meta.user_token ?? null) };
}

/** La cuenta publicitaria conectada de un proyecto, con su token EN CLARO. */
export interface CuentaMetaAds {
  accountId: string;
  nombre: string;
  business: string | null;
  currency: string | null;
  token: string;
  verifiedAt: Date | null;
}

/**
 * La cuenta de Meta Ads de este proyecto, lista para leer Graph.
 *
 * Devuelve el token DESCIFRADO, así que vive aquí y no en una ruta: lo llaman
 * `src/channels/metaads.ts` y nada más. Ninguna respuesta HTTP lo cruza.
 *
 * `null` cuando no hay cuenta, cuando la fila quedó a medias (sin `external_id`
 * el usuario nunca eligió) o cuando el sobre no abre — un token cifrado con
 * otra llave es exactamente lo mismo que no tener token, nunca un "úsalo igual".
 */
export async function metaAdsCuenta(project: Project): Promise<CuentaMetaAds | null> {
  const rows = await db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.orgId, project.orgId),
        eq(socialAccounts.campaignId, project.id),
        eq(socialAccounts.platform, 'metaads'),
        eq(socialAccounts.status, 'connected'),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row?.externalId) return null;
  const meta = (row.metadata ?? {}) as MetaAdsMeta;
  const token = open(meta.user_token ?? null);
  if (!token) return null;
  return {
    accountId: row.externalId,
    nombre: row.label ?? row.externalHandle ?? row.externalId,
    business: meta.business ?? null,
    currency: meta.currency ?? null,
    token,
    verifiedAt: row.verifiedAt ?? null,
  };
}

/**
 * Borra el permiso de Meta Ads de nuestra base.
 *
 * `revokeConnection` apaga el estado y quita el `external_id`, pero el token
 * cifrado vive en `metadata` y ahí se quedaría. Un permiso de 60 días del
 * cliente guardado después de que el cliente lo quitó no es una conexión: es un
 * secreto que ya no tenemos por qué tener. La bitácora de quién conectó y
 * cuándo sí se queda — esa es la parte que sirve.
 */
export async function olvidarTokenMetaAds(orgId: string, projectId: string): Promise<void> {
  const rows = await db
    .select({ id: socialAccounts.id, metadata: socialAccounts.metadata })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.orgId, orgId),
        eq(socialAccounts.campaignId, projectId),
        eq(socialAccounts.platform, 'metaads'),
      ),
    )
    .limit(1);
  if (!rows[0]) return;
  const { user_token: _olvidado, candidates: _tampoco, ...resto } = (rows[0].metadata ??
    {}) as MetaAdsMeta;
  await db
    .update(socialAccounts)
    .set({ metadata: { ...resto, candidates: [] }, updatedAt: new Date() })
    .where(eq(socialAccounts.id, rows[0].id));
}

/**
 * Revoca la conexión. NO se borra la fila: quién la conectó y cuándo es parte
 * de la bitácora del proyecto, y borrarla sería perder la respuesta a "¿quién
 * había enganchado esto?".
 */
export async function revokeConnection(
  orgId: string,
  projectId: string,
  channel: ConnectionChannel,
): Promise<SocialAccount | null> {
  const [row] = await db
    .update(socialAccounts)
    .set({ status: 'disconnected', externalId: null, verifiedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(socialAccounts.orgId, orgId),
        eq(socialAccounts.campaignId, projectId),
        eq(socialAccounts.platform, channel),
      ),
    )
    .returning();
  return row ?? null;
}

/** Resuelve el proyecto de un webhook de sitio por su token de ingreso. */
export async function projectBySiteToken(token: string): Promise<{
  orgId: string;
  projectId: string;
} | null> {
  if (!token || token.length < 20) return null;
  const rows = await db
    .select({ orgId: socialAccounts.orgId, projectId: socialAccounts.campaignId })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.platform, 'sitio'),
        eq(socialAccounts.status, 'connected'),
        eq(socialAccounts.externalId, token),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row?.projectId) return null;
  return { orgId: row.orgId, projectId: row.projectId };
}

/** Conteo de canales conectados por proyecto — para la lista de proyectos. */
export async function connectedCounts(projectIds: string[]): Promise<Map<string, number>> {
  if (projectIds.length === 0) return new Map();
  const rows = await db
    .select({ projectId: socialAccounts.campaignId, platform: socialAccounts.platform })
    .from(socialAccounts)
    .where(
      and(
        inArray(socialAccounts.campaignId, projectIds),
        eq(socialAccounts.status, 'connected'),
      ),
    );
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!r.projectId) continue;
    out.set(r.projectId, (out.get(r.projectId) ?? 0) + 1);
  }
  return out;
}

/** Twilio no es un canal que el usuario conecte: es cómo salen los SMS. */
export function smsMode(project: Project): 'trial' | 'paid' {
  return resolveRules(project.rules).twilio_mode;
}

/**
 * Token de la página de Facebook del proyecto, para el camino de app propia.
 *
 * Con `META_OWN_APP=false` (lo normal desde la corrida 5) ya nadie lo emite:
 * los leads entran por Composio. Se queda porque los proyectos que conectaron
 * con la app propia en la corrida 3 siguen teniendo su token guardado y su
 * webhook vivo, y apagarles la entrada de leads no es una decisión de código.
 *
 * Devuelve el token EN CLARO. Solo lo llaman el webhook de leads y el listado
 * de formularios; ninguna ruta lo devuelve al navegador.
 */
export async function metaPageToken(project: Project): Promise<string | null> {
  const rows = await db
    .select({ metadata: socialAccounts.metadata })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.orgId, project.orgId),
        eq(socialAccounts.campaignId, project.id),
        eq(socialAccounts.platform, 'meta'),
        eq(socialAccounts.status, 'connected'),
      ),
    )
    .limit(1);
  const sealed = (rows[0]?.metadata as { page_token?: string } | null)?.page_token ?? null;
  const fromOauth = open(sealed);
  if (fromOauth) return fromOauth;
  return projectSecret(project.slug, 'META_PAGE_TOKEN');
}
