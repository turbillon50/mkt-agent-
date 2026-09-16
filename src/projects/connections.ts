/**
 * Conexiones DEL PROYECTO.
 *
 * Reemplaza a `/integrations`, que guardaba las conexiones por usuario. El
 * cambio no es cosmético: si el canal es del usuario, el día que se va el
 * community manager se va la página de Facebook del cliente. Ahora la conexión
 * cuelga del proyecto y solo se registra QUIÉN la enganchó.
 *
 * Regla de la corrida 3, sin excepciones: **cero notas internas al usuario**.
 * Un canal está `conectado`, `sin_conectar` o `proximamente`. Nada de "falta
 * registrar el auth config", "bridge interno" ni "requiere app de developer".
 * Por eso `channelAvailable()` mira el entorno REAL: lo que no puede funcionar
 * dice "Próximamente" y punto; lo que sí, funciona de verdad.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { orgMemberships, socialAccounts, users, type Project, type SocialAccount } from '../db/schema';
import { hasProjectSecret, projectSecret } from '../../lib/project-secrets';
import { open } from '../../lib/secret-box';
import { resolveRules, type McpSource, type ProjectChannels } from '../sales/types';
import {
  CHANNEL_SPECS,
  channelSpec,
  type ChannelSpec,
  type ConnectionChannel,
  type ConnectionState,
} from './types';

export type { SocialAccount };

// ---------------------------------------------------------------------------
// ¿Qué canales pueden funcionar de verdad hoy?
// ---------------------------------------------------------------------------

function env(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() && !v.trim().startsWith('[') ? v.trim() : null;
}

/**
 * Un canal está disponible cuando Goossip puede llevarlo hasta el final. No es
 * "¿existe el código?": es "¿hay con qué?".
 *
 * Medido el 16-sep-2026:
 *   meta      → `META_APP_ID` + `META_APP_SECRET` vivos (app "V&Living MCP",
 *               `GET /v21.0/app` → 200), `me/accounts` y `leadgen_forms` sí
 *               contestan. Disponible.
 *   linkedin  → depende de `COMPOSIO_API_KEY`. En producción está; en este
 *               entorno no, así que aquí sale "Próximamente" y allá conecta.
 *   google, x, tiktok → no hay con qué. "Próximamente" y nada más.
 *   whatsapp, sitio, mcp → no dependen de terceros: siempre disponibles.
 */
/**
 * Google Ads no es una tarjeta de Conexiones — vive en Campañas — pero se
 * decide igual: con una llave de Composio de verdad. `env()` tira los valores
 * marcadores (`[SENSITIVE]` y compañía), que es justo lo que hacía que la
 * pantalla ofreciera conectar y luego escupiera el 401 crudo de la API.
 */
export function googleAdsAvailable(): boolean {
  return Boolean(env('COMPOSIO_API_KEY'));
}

export function channelAvailable(id: ConnectionChannel): boolean {
  switch (id) {
    case 'meta':
      return Boolean(env('META_APP_ID') && env('META_APP_SECRET'));
    case 'linkedin':
      return Boolean(env('COMPOSIO_API_KEY'));
    case 'google':
      return Boolean(env('COMPOSIO_API_KEY') && env('COMPOSIO_GMAIL_AUTH_CONFIG_ID'));
    case 'x':
      return Boolean(env('COMPOSIO_API_KEY') && env('COMPOSIO_TWITTER_AUTH_CONFIG_ID'));
    case 'tiktok':
      return Boolean(env('COMPOSIO_API_KEY') && env('COMPOSIO_TIKTOK_AUTH_CONFIG_ID'));
    case 'whatsapp':
    case 'sitio':
    case 'mcp':
      return true;
  }
}

// ---------------------------------------------------------------------------
// Estado de un canal dentro de un proyecto
// ---------------------------------------------------------------------------

export interface ChannelCard extends ChannelSpec {
  state: ConnectionState;
  /** Lo que se ve bajo el título cuando hay algo conectado: la página, el número. */
  detail: string | null;
  /** Quién lo conectó (correo o nombre) y cuándo. */
  connectedBy: string | null;
  connectedAt: string | null;
  /** Falta un paso del usuario, dicho en español de a pie. Nunca jerga interna. */
  pending: string | null;
  /** Datos públicos que la pantalla necesita (páginas elegidas, formularios…). */
  data: Record<string, unknown>;
}

export interface ProjectConnections {
  cards: ChannelCard[];
  /** Cuántos canales de verdad conectables tiene el proyecto hoy. */
  conectables: number;
  conectados: number;
}

/**
 * Arma las tarjetas del proyecto. Es la ÚNICA fuente del estado de canales: la
 * pantalla no vuelve a decidir nada, solo pinta.
 */
export function buildChannelCards(
  project: Project,
  accounts: SocialAccount[],
): ProjectConnections {
  const byPlatform = new Map(accounts.map((a) => [a.platform, a]));
  const channels = (project.channels ?? {}) as ProjectChannels;
  const mcpSources = (project.mcpSources ?? []) as McpSource[];

  const cards = CHANNEL_SPECS.map((spec): ChannelCard => {
    const account = byPlatform.get(spec.id) ?? null;
    const base: ChannelCard = {
      ...spec,
      state: 'sin_conectar',
      detail: null,
      connectedBy: account?.connectedBy ?? null,
      connectedAt: account?.connectedAt?.toISOString() ?? null,
      pending: null,
      data: {},
    };

    if (!channelAvailable(spec.id)) return { ...base, state: 'proximamente' };

    switch (spec.id) {
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
        // Dio el permiso pero todavía no eligió página: la conexión existe a
        // medias y se dice así, sin pintarla de verde.
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
          // Se guardó el número pero Goossip todavía no puede escribir desde él.
          // Se dice así, en español, no "falta la variable de entorno".
          return {
            ...base,
            pending: 'Guardamos tu número. Falta autorizar a Goossip para escribir desde él.',
            data: { waba_phone_id: phoneId },
          };
        }
        return base;
      }

      case 'linkedin':
      case 'google':
      case 'x':
      case 'tiktok': {
        if (account?.status === 'connected') {
          return {
            ...base,
            state: 'conectado',
            detail: account.label ?? account.externalHandle ?? null,
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
    }
  });

  return {
    cards,
    conectables: cards.filter((c) => c.state !== 'proximamente').length,
    conectados: cards.filter((c) => c.state === 'conectado').length,
  };
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
 * El identificador del proyecto ante Composio. La conexión es del PROYECTO, no
 * de quien apretó el botón: si fuera del usuario, el LinkedIn del cliente se
 * iría con el community manager el día que lo cambien.
 */
export function composioUserId(projectId: string): string {
  return `project:${projectId}`;
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

export async function projectConnections(project: Project): Promise<ProjectConnections> {
  const accounts = await listProjectAccounts(project.orgId, project.id);
  const built = buildChannelCards(project, accounts);

  const nombres = await nombresDe(
    project.orgId,
    built.cards.map((c) => c.connectedBy ?? '').filter(Boolean),
  ).catch(() => new Map<string, string>());
  for (const card of built.cards) {
    if (card.connectedBy) card.connectedBy = nombres.get(card.connectedBy) ?? card.connectedBy;
  }

  // LinkedIn lo lleva Composio y la verdad de si sigue conectado vive allá: se
  // pregunta en el momento en vez de confiar en una fila que puede haberse
  // quedado vieja si el usuario revocó el permiso desde LinkedIn.
  if (channelAvailable('linkedin')) {
    const vivo = await import('../../lib/composio')
      .then((m) => m.isConnected(composioUserId(project.id), 'linkedin'))
      .catch(() => null);
    if (vivo !== null) {
      const card = built.cards.find((c) => c.id === 'linkedin');
      if (card && vivo !== (card.state === 'conectado')) {
        card.state = vivo ? 'conectado' : 'sin_conectar';
        if (!vivo) card.detail = null;
        built.conectados = built.cards.filter((c) => c.state === 'conectado').length;
      }
    }
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
}

/** Alta o actualización de la conexión de un canal dentro de un proyecto. */
export async function saveConnection(input: SaveConnectionInput): Promise<SocialAccount> {
  channelSpec(input.channel); // valida que el canal exista
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
    })
    .returning();
  if (!row) throw new Error('No se pudo guardar la conexión.');
  return row;
}

/**
 * Guarda a medias: el permiso ya está dado pero falta que el usuario elija a
 * cuál de sus páginas se engancha el proyecto. La fila queda `disconnected`
 * a propósito — una conexión sin página elegida no recibe un solo lead, y
 * pintarla de verde sería mentir.
 */
export async function stageConnection(input: {
  orgId: string;
  projectId: string;
  channel: ConnectionChannel;
  connectedBy: string;
  userId?: string | null;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const now = new Date();
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
        status: 'disconnected',
        metadata: { ...(existing[0].metadata ?? {}), ...input.metadata },
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
    status: 'disconnected',
    metadata: input.metadata,
    connectedBy: input.connectedBy,
  });
}

/** Lo que dejó a medias el OAuth: las páginas entre las que hay que elegir. */
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
    .set({ status: 'disconnected', externalId: null, updatedAt: new Date() })
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
 * Token de la página de Facebook del proyecto.
 *
 * Primero el que dejó el OAuth (cifrado en la fila de la conexión), y si no,
 * el de env — que es como funcionaba antes de esta corrida y sigue funcionando.
 * En ese orden: el que el cliente autorizó hace un rato gana sobre uno que
 * alguien pegó en Vercel hace meses.
 *
 * Devuelve el token EN CLARO. Solo lo llaman el webhook de leads y el
 * listado de formularios; ninguna ruta lo devuelve al navegador.
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
