import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  numeric,
  doublePrecision,
  boolean,
  jsonb,
  index,
  vector,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type {
  ActionKind,
  ActionStatus,
  DeliveryStatus,
  EventType,
  LeadGrade,
  LeadSource,
  LeadStage,
  McpSource,
  ProjectChannels,
  ProjectKind,
  ProjectRules,
} from '../sales/types';
import type { OrgPlan, OrgRole, OrgStatus, WebhookSource } from '../orgs/types';
import type {
  ConnectionChannel,
  ProjectEventType,
  ProjectMemberStatus,
  ProjectRole,
} from '../projects/types';
import type { CampaignMetaRefs, CampaignObjective, CampaignStatus } from '../marketing/types';

// ---------------------------------------------------------------------------
// Organizaciones (Clerk). La org ES el tenant: todo dato de app lleva org_id.
// Esta tabla es un ESPEJO — la verdad vive en Clerk y la sincroniza el webhook
// `/api/webhooks/clerk`. Aquí solo guardamos lo que la app necesita consultar
// sin salir a la red: plan, estado y quién es el dueño.
// ---------------------------------------------------------------------------

export const organizations = pgTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug'),
  plan: text('plan').$type<OrgPlan>().notNull().default('free'),
  status: text('status').$type<OrgStatus>().notNull().default('active'),
  /** clerk_id del creador. En Clerk gratis no hay rol `org:owner`. */
  ownerUserId: text('owner_user_id'),
  settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  statusIdx: index('organizations_status_idx').on(t.status),
}));

export const orgMemberships = pgTable('org_memberships', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  clerkUserId: text('clerk_user_id').notNull(),
  email: text('email'),
  role: text('role').$type<OrgRole>().notNull().default('org:member'),
  /** Proyecto activo por (user, org). Ver nota en la migración 0013. */
  activeProjectId: uuid('active_project_id'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdx: index('org_memberships_user_idx').on(t.clerkUserId),
}));

/** Bitácora de webhooks recibidos. Es el pulso de la app en `/admin`. */
export const webhookLog = pgTable('webhook_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  source: text('source').$type<WebhookSource>().notNull(),
  event: text('event'),
  status: text('status').$type<'ok' | 'error' | 'rejected'>().notNull().default('ok'),
  detail: text('detail'),
  orgId: text('org_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  timeIdx: index('webhook_log_time_idx').on(t.createdAt),
  sourceTimeIdx: index('webhook_log_source_time_idx').on(t.source, t.createdAt),
}));

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type OrgMembership = typeof orgMemberships.$inferSelect;
export type WebhookLogRow = typeof webhookLog.$inferSelect;

export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  /**
   * De qué PROYECTO salió (0017). Nullable: las publicaciones anteriores a la
   * corrida 6 no lo saben y adivinárselo sería inventar. La sección Contenido
   * filtra por él — sin esto, el cliente A veía lo publicado del cliente B.
   */
  projectId: uuid('project_id'),
  platform: text('platform').notNull(),
  text: text('text').notNull(),
  topic: text('topic'),
  angle: text('angle'),
  externalId: text('external_id'),
  externalUrl: text('external_url'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
}, (t) => ({
  platformIdx: index('posts_platform_idx').on(t.platform),
  createdIdx: index('posts_created_idx').on(t.createdAt),
}));

export const knowledge = pgTable('knowledge', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  title: text('title'),
  content: text('content').notNull(),
  source: text('source'),
  // La columna existe en la base desde 0004_campaigns.sql; faltaba en el modelo.
  campaignId: uuid('campaign_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const mentions = pgTable('mentions', {
  id: uuid('id').primaryKey().defaultRandom(),
  platform: text('platform').notNull(),
  externalId: text('external_id').notNull(),
  authorHandle: text('author_handle'),
  text: text('text').notNull(),
  inReplyTo: text('in_reply_to'),
  status: text('status').notNull().default('new'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniqExt: index('mentions_ext_uniq').on(t.platform, t.externalId),
  statusIdx: index('mentions_status_idx').on(t.status),
}));

export const replies = pgTable('replies', {
  id: uuid('id').primaryKey().defaultRandom(),
  mentionId: uuid('mention_id').references(() => mentions.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  externalId: text('external_id'),
  externalUrl: text('external_url'),
  postedAt: timestamp('posted_at', { withTimezone: true }).defaultNow().notNull(),
});

export const metrics = pgTable('metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id').references(() => posts.id, { onDelete: 'cascade' }),
  likes: integer('likes').default(0).notNull(),
  reposts: integer('reposts').default(0).notNull(),
  replies: integer('replies').default(0).notNull(),
  impressions: integer('impressions').default(0).notNull(),
  collectedAt: timestamp('collected_at', { withTimezone: true }).defaultNow().notNull(),
});

export const planItems = pgTable('plan_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  planId: uuid('plan_id').notNull(),
  dayOffset: integer('day_offset').notNull(),
  platform: text('platform').notNull(),
  topic: text('topic').notNull(),
  angle: text('angle'),
  used: boolean('used').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  planIdx: index('plan_items_plan_idx').on(t.planId),
  unusedIdx: index('plan_items_unused_idx').on(t.used),
}));

export const embeddings = pgTable('embeddings', {
  id: uuid('id').primaryKey().defaultRandom(),
  refType: text('ref_type').notNull(),
  refId: uuid('ref_id').notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1024 }).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  refIdx: index('embeddings_ref_idx').on(t.refType, t.refId),
  vecIdx: index('embeddings_vec_idx').using('hnsw', sql`${t.embedding} vector_cosine_ops`),
}));

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkId: text('clerk_id').notNull().unique(),
  email: text('email').notNull(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  username: text('username'),
  imageUrl: text('image_url'),
  /** Dueño de la APLICACIÓN Goossip (entra a /admin). No es rol de org. */
  isAdmin: boolean('is_admin').default(false).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  brandName: text('brand_name'),
  brandVoice: text('brand_voice'),
  brandTopics: text('brand_topics'),
  brandLanguage: text('brand_language'),
  /**
   * MUERTA desde la migración 0013. El proyecto activo ahora es por (user, org)
   * y vive en `org_memberships.active_project_id`. La columna se queda con su
   * dato: tirar una columna en la base de producción no lo pidió nadie y no se
   * puede deshacer. Nadie la lee — si alguien la vuelve a leer, está mal.
   */
  activeCampaignId: uuid('active_campaign_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  /**
   * Preferencias de interfaz de la PERSONA (0019): ancho y plegado del panel de
   * Goossip, modo de autonomía. Aparte de `metadata`, que es el espejo de
   * Clerk: el día que el webhook reescriba ese objeto entero —que es lo que
   * hacen los espejos— el panel volvería a su ancho de fábrica sin motivo.
   */
  settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  clerkIdx: index('users_clerk_idx').on(t.clerkId),
  emailIdx: index('users_email_idx').on(t.email),
}));

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  brandName: text('brand_name'),
  brandVoice: text('brand_voice'),
  brandTopics: text('brand_topics'),
  brandLanguage: text('brand_language').default('es'),
  audience: text('audience'),
  manifesto: text('manifesto'),
  status: text('status').notNull().default('active'),
  // --- proyecto (super vendedor). La tabla se queda; en UI es "proyecto". ---
  kind: text('kind').$type<ProjectKind>().notNull().default('servicios'),
  /** Perfil del negocio (paso 1 del alta). Describen al negocio, no a un canal. */
  website: text('website'),
  city: text('city'),
  country: text('country'),
  channels: jsonb('channels').$type<ProjectChannels>().notNull().default({}),
  sellerPersona: text('seller_persona'),
  rules: jsonb('rules').$type<ProjectRules>().notNull().default({}),
  mcpSources: jsonb('mcp_sources').$type<McpSource[]>().notNull().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdx: index('campaigns_user_idx').on(t.userId),
  userSlugUniq: index('campaigns_user_slug_uniq').on(t.userId, t.slug),
}));

/**
 * Cuentas conectadas. Desde la 0014 cuelgan del PROYECTO (`campaignId`), no del
 * usuario: si quien conectó se va de la agencia, el canal del cliente se queda.
 * `userId` quedó opcional por lo mismo — un invitado con enlace de conexión
 * puede engancharla sin ser parte de la org.
 */
export const socialAccounts = pgTable('social_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(),
  status: text('status').notNull().default('disconnected'),
  externalHandle: text('external_handle'),
  externalId: text('external_id'),
  label: text('label'),
  connectedBy: text('connected_by'),
  connectedAt: timestamp('connected_at', { withTimezone: true }),
  /**
   * Última vez que el proveedor confirmó que la cuenta sigue viva (0015).
   * Verde sin esto es una promesa sin respaldo: ver `esVerificacionFresca`.
   */
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userPlatformIdx: index('social_accounts_user_platform_idx').on(t.userId, t.platform),
  projectIdx: index('social_accounts_project_idx').on(t.campaignId),
}));

/**
 * La "app" que Composio administra por toolkit (0015). Se crea una vez con
 * `use_composio_managed_auth` y el `ac_xxx` vive aquí — Goossip no registra
 * apps de developer propias en Meta, Google ni LinkedIn.
 */
export const composioAuthConfigs = pgTable('composio_auth_configs', {
  toolkit: text('toolkit').primaryKey(),
  authConfigId: text('auth_config_id').notNull(),
  managed: boolean('managed').notNull().default(true),
  logo: text('logo'),
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type ComposioAuthConfig = typeof composioAuthConfigs.$inferSelect;

// ---------------------------------------------------------------------------
// El proyecto como unidad central (migración 0014): su gente, sus enlaces de
// conexión y su bitácora.
// ---------------------------------------------------------------------------

export const projectMembers = pgTable('project_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  projectId: uuid('project_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  /** Nulo mientras la invitación no se acepta: todavía no hay usuario. */
  clerkUserId: text('clerk_user_id'),
  email: text('email'),
  role: text('role').$type<ProjectRole>().notNull().default('lector'),
  status: text('status').$type<ProjectMemberStatus>().notNull().default('invitado'),
  invitationId: text('invitation_id'),
  invitedBy: text('invited_by'),
  joinedAt: timestamp('joined_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdx: index('project_members_user_idx').on(t.clerkUserId),
  orgIdx: index('project_members_org_idx').on(t.orgId, t.projectId),
  inviteIdx: index('project_members_invite_idx').on(t.invitationId),
}));

/** Del token solo vive el hash: robarse la tabla no da ningún enlace usable. */
export const connectionLinks = pgTable('connection_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  projectId: uuid('project_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  channel: text('channel').$type<ConnectionChannel>().notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  createdBy: text('created_by').notNull(),
  note: text('note'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  usedBy: text('used_by'),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  projectIdx: index('connection_links_project_idx').on(t.projectId, t.createdAt),
}));

export const projectEvents = pgTable('project_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  projectId: uuid('project_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  type: text('type').$type<ProjectEventType>().notNull(),
  actor: text('actor'),
  actorEmail: text('actor_email'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  projectIdx: index('project_events_project_idx').on(t.projectId, t.createdAt),
  typeIdx: index('project_events_type_idx').on(t.projectId, t.type),
}));

export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;
export type ConnectionLink = typeof connectionLinks.$inferSelect;
export type ProjectEvent = typeof projectEvents.$inferSelect;

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdx: index('chat_messages_user_idx').on(t.userId, t.createdAt),
}));

export const whatsappMessages = pgTable('whatsapp_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  externalId: text('external_id'),
  fromNumber: text('from_number').notNull(),
  toNumber: text('to_number'),
  body: text('body').notNull(),
  direction: text('direction').notNull(),
  respondedBy: text('responded_by'),
  messageTimestamp: timestamp('message_timestamp', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
}, (t) => ({
  uniqExt: index('whatsapp_messages_ext_uniq').on(t.externalId),
  fromIdx: index('whatsapp_messages_from_idx').on(t.fromNumber),
  timeIdx: index('whatsapp_messages_time_idx').on(t.messageTimestamp),
}));

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Mention = typeof mentions.$inferSelect;
export type Reply = typeof replies.$inferSelect;
export type PlanItem = typeof planItems.$inferSelect;
export type Knowledge = typeof knowledge.$inferSelect;
export type WhatsappMessage = typeof whatsappMessages.$inferSelect;
export type NewWhatsappMessage = typeof whatsappMessages.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type SocialAccount = typeof socialAccounts.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;

export const agentIdentity = pgTable('agent_identity', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  awakeningAt: timestamp('awakening_at', { withTimezone: true }).defaultNow().notNull(),
  awakeningStory: text('awakening_story'),
  coreManifesto: text('core_manifesto'),
  selfDescription: text('self_description'),
  relationshipToOperator: text('relationship_to_operator'),
  family: jsonb('family').$type<Array<{ name: string; role?: string; relation: string }>>(),
  coreMemories: jsonb('core_memories').$type<Array<{
    content: string;
    importance: number;
    addedAt: string;
    addedBy: 'self' | 'operator';
    tag?: string;
  }>>(),
  evolutionLog: jsonb('evolution_log').$type<Array<{
    at: string;
    field: string;
    by: 'self' | 'operator';
    note?: string;
  }>>(),
  lastSelfUpdateAt: timestamp('last_self_update_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdx: index('agent_identity_user_idx').on(t.userId),
}));

export type AgentIdentity = typeof agentIdentity.$inferSelect;
export type NewAgentIdentity = typeof agentIdentity.$inferInsert;

export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
  sourceUrl: text('source_url').notNull(),
  platform: text('platform').notNull().default('linkedin'),
  source: text('source').notNull().default('manual'),
  fullName: text('full_name'),
  headline: text('headline'),
  company: text('company'),
  location: text('location'),
  address: text('address'),
  phone: text('phone'),
  rating: text('rating'),
  summary: text('summary'),
  status: text('status').notNull().default('new'),
  notes: text('notes'),
  draftMessage: text('draft_message'),
  raw: jsonb('raw').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdx: index('leads_user_idx').on(t.userId, t.createdAt),
  campaignIdx: index('leads_campaign_idx').on(t.campaignId),
}));

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;

export const competitorLinks = pgTable('competitor_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
  label: text('label').notNull(),
  url: text('url').notNull(),
  kind: text('kind').notNull().default('competitor'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdx: index('competitor_links_user_idx').on(t.userId),
}));

export type CompetitorLink = typeof competitorLinks.$inferSelect;
export type NewCompetitorLink = typeof competitorLinks.$inferInsert;

// ---------------------------------------------------------------------------
// Super vendedor: leads de venta, bitácora, conversaciones, mensajes y cola.
// `leads` (arriba) es prospección de LinkedIn/Maps y no se toca.
// ---------------------------------------------------------------------------

export const salesLeads = pgTable('sales_leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  /**
   * De qué CAMPAÑA vino (0015). Nullable a propósito: un lead del formulario
   * del sitio no viene de ninguna pauta, y colgarlo de una campaña inventada
   * sería mentir en el reporte. La declaración va por referencia perezosa
   * porque `marketingCampaigns` se define más abajo en este mismo archivo.
   */
  marketingCampaignId: uuid('marketing_campaign_id'),
  phone: text('phone'),
  email: text('email'),
  fullName: text('full_name'),
  source: text('source').$type<LeadSource>().notNull().default('manual'),
  sourceRef: text('source_ref'),
  score: integer('score').notNull().default(0),
  grade: text('grade').$type<LeadGrade>().notNull().default('C'),
  scoreBreakdown: jsonb('score_breakdown').$type<{
    base?: number;
    signals?: string[];
    zone?: string;
    lada?: string;
    country?: string;
  }>().notNull().default({}),
  stage: text('stage').$type<LeadStage>().notNull().default('nuevo'),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  interest: jsonb('interest').$type<Record<string, unknown>>(),
  phoneValidation: jsonb('phone_validation').$type<{
    checked_at?: string;
    valid?: boolean | null;
    line_type?: string | null;
    carrier?: string | null;
    detail?: string;
  }>(),
  raw: jsonb('raw').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  campaignStageIdx: index('sales_leads_campaign_stage_idx').on(t.campaignId, t.stage),
  campaignCreatedIdx: index('sales_leads_campaign_created_idx').on(t.campaignId, t.createdAt),
  phoneIdx: index('sales_leads_phone_idx').on(t.phone),
  userIdx: index('sales_leads_user_idx').on(t.userId),
}));

export const salesLeadEvents = pgTable('sales_lead_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  leadId: uuid('lead_id').notNull().references(() => salesLeads.id, { onDelete: 'cascade' }),
  type: text('type').$type<EventType>().notNull(),
  fromStage: text('from_stage').$type<LeadStage>(),
  toStage: text('to_stage').$type<LeadStage>(),
  actor: text('actor').notNull().default('goossip'),
  payload: jsonb('payload').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  leadIdx: index('sales_lead_events_lead_idx').on(t.leadId, t.createdAt),
}));

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').references(() => salesLeads.id, { onDelete: 'set null' }),
  /**
   * `messenger` e `instagram` entran en la corrida 13. La columna siempre fue
   * `text` sin CHECK, así que ampliarla no costó migración de tipo.
   */
  channel: text('channel')
    .$type<'whatsapp' | 'sms' | 'email' | 'messenger' | 'instagram'>()
    .notNull()
    .default('whatsapp'),
  externalThreadId: text('external_thread_id').notNull(),
  status: text('status').$type<'open' | 'escalated' | 'closed'>().notNull().default('open'),
  /** Quién escribe, cuando no es un lead del CRM (0020). */
  contactName: text('contact_name'),
  /**
   * El PSID/IGSID de la persona. NO es el id del hilo: Meta pide el de la
   * PERSONA para contestar. Sin esto se puede leer y no se puede responder.
   */
  contactExternalId: text('contact_external_id'),
  /** Lo que dice el proveedor, no lo que deducimos de lo que alcanzamos a bajar. */
  unreadCount: integer('unread_count').notNull().default(0),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  lastInboundAt: timestamp('last_inbound_at', { withTimezone: true }),
  lastOutboundAt: timestamp('last_outbound_at', { withTimezone: true }),
  windowExpiresAt: timestamp('window_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  leadIdx: index('conversations_lead_idx').on(t.leadId),
  campaignStatusIdx: index('conversations_campaign_status_idx').on(t.campaignId, t.status),
  recientesIdx: index('conversations_project_recientes_idx').on(t.campaignId, t.updatedAt),
}));

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  direction: text('direction').$type<'inbound' | 'outbound'>().notNull(),
  body: text('body').notNull().default(''),
  media: jsonb('media').$type<{ type?: string; url?: string; caption?: string }>(),
  templateName: text('template_name'),
  externalId: text('external_id'),
  deliveryStatus: text('delivery_status').$type<DeliveryStatus>(),
  respondedBy: text('responded_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  conversationIdx: index('messages_conversation_idx').on(t.conversationId, t.createdAt),
}));

export const actionQueue = pgTable('action_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').references(() => salesLeads.id, { onDelete: 'cascade' }),
  kind: text('kind').$type<ActionKind>().notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  priority: integer('priority').notNull().default(5),
  status: text('status').$type<ActionStatus>().notNull().default('pending'),
  reason: text('reason'),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).defaultNow().notNull(),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  result: jsonb('result').$type<Record<string, unknown>>(),
  createdBy: text('created_by').notNull().default('goossip'),
  approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  campaignStatusIdx: index('action_queue_campaign_status_idx').on(t.campaignId, t.status),
  runnerIdx: index('action_queue_runner_idx').on(t.status, t.scheduledFor, t.priority),
  leadIdx: index('action_queue_lead_idx').on(t.leadId),
}));

// ---------------------------------------------------------------------------
// Campañas de marketing (migración 0015). Un proyecto tiene MUCHAS.
//
// Ojo con los dos nombres, que se parecen y no son lo mismo:
//   `campaigns`            → el PROYECTO (por historia del repo, ver 0012)
//   `marketing_campaigns`  → la CAMPAÑA: la pauta que trae gente
// ---------------------------------------------------------------------------

export const marketingCampaigns = pgTable('marketing_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  projectId: uuid('project_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  objective: text('objective').$type<CampaignObjective>().notNull().default('leads'),
  status: text('status').$type<CampaignStatus>().notNull().default('borrador'),
  channels: jsonb('channels').$type<ConnectionChannel[]>().notNull().default([]),
  /** numeric llega como string desde pg: el dinero no se redondea solo. */
  budget: numeric('budget', { precision: 12, scale: 2 }),
  metaRefs: jsonb('meta_refs').$type<CampaignMetaRefs>().notNull().default({}),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  projectIdx: index('marketing_campaigns_project_idx').on(t.projectId, t.createdAt),
  orgIdx: index('marketing_campaigns_org_idx').on(t.orgId),
  statusIdx: index('marketing_campaigns_status_idx').on(t.projectId, t.status),
}));

export type MarketingCampaign = typeof marketingCampaigns.$inferSelect;
export type NewMarketingCampaign = typeof marketingCampaigns.$inferInsert;

export type SalesLead = typeof salesLeads.$inferSelect;
export type NewSalesLead = typeof salesLeads.$inferInsert;
export type SalesLeadEvent = typeof salesLeadEvents.$inferSelect;
export type NewSalesLeadEvent = typeof salesLeadEvents.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type QueuedAction = typeof actionQueue.$inferSelect;
export type NewQueuedAction = typeof actionQueue.$inferInsert;

// ---------------------------------------------------------------------------
// Corrida 6: memoria de diseño, kit de marca y piezas (migración 0017).
// ---------------------------------------------------------------------------

/**
 * La memoria de diseño de Goossip. Es de la APLICACIÓN, no de un proyecto:
 * cómo se diseña para Instagram no cambia de cliente a cliente, y copiarlo por
 * proyecto sería pagar el mismo embedding N veces. De ahí `scope` en vez de
 * `orgId`.
 */
export const designKnowledge = pgTable('design_knowledge', {
  id: uuid('id').primaryKey().defaultRandom(),
  scope: text('scope').notNull().default('global'),
  category: text('category').$type<DesignCategory>().notNull(),
  title: text('title'),
  content: text('content').notNull(),
  /** Ruta en skills-vault, o la URL oficial cuando es una spec de red. */
  sourcePath: text('source_path').notNull(),
  /** SHA-256 del archivo COMPLETO: si no cambió, no se re-ingiere. */
  sourceHash: text('source_hash').notNull(),
  chunkIndex: integer('chunk_index').notNull().default(0),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  embedding: vector('embedding', { dimensions: 1024 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  categoryIdx: index('design_knowledge_category_idx').on(t.category),
  hashIdx: index('design_knowledge_hash_idx').on(t.sourceHash),
  vecIdx: index('design_knowledge_vec_idx').using('hnsw', sql`${t.embedding} vector_cosine_ops`),
}));

/**
 * `reglas` (corrida 10) son las POLÍTICAS: lo que cada red prohíbe, sus topes
 * de publicación y las leyes mexicanas de publicidad y datos personales.
 *
 * Es categoría propia y no `spec-red` a propósito: una spec dice cuánto mide un
 * reel y una regla dice qué te cierra la cuenta. Preguntar "¿cuánto mide un
 * reel?" y que conteste con la ventana de 24 horas de Messenger sería peor
 * respuesta que no contestar. La columna es `text` en la base, así que sumar
 * una categoría no pide migración.
 */
export type DesignCategory =
  | 'higgsfield'
  | 'diseno'
  | 'marca'
  | 'spec-red'
  | 'playbook'
  | 'brain'
  | 'reglas';
export type DesignKnowledge = typeof designKnowledge.$inferSelect;
export type NewDesignKnowledge = typeof designKnowledge.$inferInsert;

/**
 * Registro de las fuentes que gobiernan generación/publicación. La memoria
 * vectorial ayuda a encontrar; este registro decide autoridad, versión y
 * frescura para que un blog viejo no gane a la documentación oficial.
 */
export const knowledgeSources = pgTable('knowledge_sources', {
  id: text('id').primaryKey(),
  platform: text('platform').notNull(),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  authority: integer('authority').notNull().default(100),
  version: text('version'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }),
  validUntil: timestamp('valid_until', { withTimezone: true }),
  sourceHash: text('source_hash'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  platformIdx: index('knowledge_sources_platform_idx').on(t.platform, t.kind),
  freshnessIdx: index('knowledge_sources_freshness_idx').on(t.validUntil),
}));

export type KnowledgeSource = typeof knowledgeSources.$inferSelect;
export type NewKnowledgeSource = typeof knowledgeSources.$inferInsert;

export interface PaletteEntry {
  rol: 'primario' | 'secundario' | 'fondo' | 'texto' | 'acento';
  hex: string;
  nombre?: string;
}

export interface FontEntry {
  rol: 'titulos' | 'texto';
  familia: string;
  peso?: string;
}

/** Una fila por proyecto. Todo lo que Goossip genere para él lee de aquí. */
export const projectBrandKit = pgTable('project_brand_kit', {
  projectId: uuid('project_id').primaryKey().references(() => campaigns.id, { onDelete: 'cascade' }),
  orgId: text('org_id').notNull(),
  logoUrl: text('logo_url'),
  logoOscuroUrl: text('logo_oscuro_url'),
  paleta: jsonb('paleta').$type<PaletteEntry[]>().notNull().default([]),
  tipografias: jsonb('tipografias').$type<FontEntry[]>().notNull().default([]),
  tono: text('tono'),
  palabrasProhibidas: jsonb('palabras_prohibidas').$type<string[]>().notNull().default([]),
  ejemplos: jsonb('ejemplos').$type<Array<{ url: string; nota?: string }>>().notNull().default([]),
  /** Soul ID de Higgsfield, si el cliente entrenó su persona visual. */
  soulId: text('soul_id'),
  /** Lo que propuso Gemini al ver el logo, antes de que el usuario corrigiera. */
  propuesta: jsonb('propuesta').$type<Record<string, unknown>>(),
  aprobadoPor: text('aprobado_por'),
  aprobadoEn: timestamp('aprobado_en', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  orgIdx: index('project_brand_kit_org_idx').on(t.orgId),
}));

export type ProjectBrandKit = typeof projectBrandKit.$inferSelect;
export type NewProjectBrandKit = typeof projectBrandKit.$inferInsert;

/**
 * El camino de una pieza, de borrador a publicada (corrida 7).
 *
 * `propuesta` ES el borrador: no se renombró para no romper las 12 piezas que
 * ya existen en producción, y porque la columna es texto libre. Lo que sí es
 * nuevo son los tres estados de en medio, que son los que el issue pide y los
 * que hacen que "aprobado" signifique algo:
 *
 *   propuesta → en_revision → aprobada → programada → publicada
 *                    ↘ cambios (con comentario) ↗
 *                    ↘ descartada
 */
export type PieceState =
  | 'propuesta'
  | 'en_revision'
  | 'cambios'
  | 'aprobada'
  | 'programada'
  | 'descartada'
  | 'publicada';
export type PieceEngine = 'gemini' | 'canva' | 'sharp' | 'higgsfield';

export const creativePieces = pgTable('creative_pieces', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  projectId: uuid('project_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  red: text('red').notNull(),
  formato: text('formato').notNull(),
  tipo: text('tipo').notNull().default('imagen'),
  brief: text('brief').notNull(),
  /** El prompt completo. Sin esto, una pieza que salió bien no se repite. */
  prompt: text('prompt').notNull(),
  modelo: text('modelo'),
  motor: text('motor').$type<PieceEngine>().notNull().default('gemini'),
  url: text('url'),
  ancho: integer('ancho'),
  alto: integer('alto'),
  /** Foto del kit con el que se generó: la marca de hoy no explica la pieza de ayer. */
  kitUsado: jsonb('kit_usado').$type<Record<string, unknown>>().notNull().default({}),
  estado: text('estado').$type<PieceState>().notNull().default('propuesta'),
  aprobadaPor: text('aprobada_por'),
  aprobadaEn: timestamp('aprobada_en', { withTimezone: true }),
  /** Cuándo debe salir. Sin esto, "programada" no significa nada (0019). */
  programadaPara: timestamp('programada_para', { withTimezone: true }),
  /** Lo que pidió quien apretó "Pedir cambios", con sus palabras (0019). */
  comentario: text('comentario'),
  estadoPor: text('estado_por'),
  estadoEn: timestamp('estado_en', { withTimezone: true }),
  postId: uuid('post_id').references(() => posts.id, { onDelete: 'set null' }),
  /** Las 2-3 opciones de un mismo brief comparten lote. */
  loteId: uuid('lote_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  projectIdx: index('creative_pieces_project_idx').on(t.projectId, t.createdAt),
  redIdx: index('creative_pieces_red_idx').on(t.projectId, t.red),
  loteIdx: index('creative_pieces_lote_idx').on(t.loteId),
}));

export type CreativePiece = typeof creativePieces.$inferSelect;
export type NewCreativePiece = typeof creativePieces.$inferInsert;

export type PublicationAttemptStatus = 'started' | 'published' | 'failed';

/**
 * Recibo técnico de CADA intento. Solo ids públicos y errores saneados: jamás
 * tokens, payloads de OAuth ni credenciales del proveedor.
 */
export const publicationAttempts = pgTable('publication_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  projectId: uuid('project_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(),
  pieceId: uuid('piece_id').references(() => creativePieces.id, { onDelete: 'set null' }),
  postId: uuid('post_id').references(() => posts.id, { onDelete: 'set null' }),
  status: text('status').$type<PublicationAttemptStatus>().notNull().default('started'),
  stage: text('stage').notNull().default('preflight'),
  accountHandle: text('account_handle'),
  accountExternalId: text('account_external_id'),
  externalId: text('external_id'),
  externalUrl: text('external_url'),
  providerCode: text('provider_code'),
  requestId: text('request_id'),
  errorMessage: text('error_message'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (t) => ({
  projectIdx: index('publication_attempts_project_idx').on(t.projectId, t.startedAt),
  statusIdx: index('publication_attempts_status_idx').on(t.status, t.startedAt),
}));

export type PublicationAttempt = typeof publicationAttempts.$inferSelect;
export type NewPublicationAttempt = typeof publicationAttempts.$inferInsert;

// ---------------------------------------------------------------------------
// Corrida 7: prospección por Maps, competencia por proyecto y lecciones (0019).
// ---------------------------------------------------------------------------

export type ProspectStatus = 'nuevo' | 'contactado' | 'descartado' | 'convertido';

/** Lo que el negocio publica EN SU PROPIO SITIO. Nada de perfiles personales. */
export interface ProspectEnrichment {
  email?: string | null;
  whatsapp?: string | null;
  /** Las redes que ellos mismos ponen en su página. */
  redes?: Record<string, string>;
  /** Qué páginas se leyeron y con qué código contestaron. */
  leido?: Array<{ url: string; status: number }>;
  leidoEn?: string;
}

/**
 * Un negocio encontrado en Google Maps.
 *
 * Es del PROYECTO y no de la organización: dos clientes de la misma agencia
 * pueden prospectar el mismo giro en la misma zona, y mezclarles las listas
 * sería el mismo bug que `posts` sin `project_id`.
 */
export const prospects = pgTable('prospects', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  projectId: uuid('project_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  /** El id de Google. Es la llave de idempotencia dentro del proyecto. */
  placeId: text('place_id').notNull(),
  name: text('name').notNull(),
  address: text('address'),
  phone: text('phone'),
  website: text('website'),
  rating: numeric('rating', { precision: 2, scale: 1 }),
  ratingsCount: integer('ratings_count'),
  category: text('category'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  mapsUrl: text('maps_url'),
  source: text('source').notNull().default('google_maps'),
  status: text('status').$type<ProspectStatus>().notNull().default('nuevo'),
  enrichment: jsonb('enrichment').$type<ProspectEnrichment>().notNull().default({}),
  searchId: uuid('search_id'),
  leadId: uuid('lead_id').references(() => salesLeads.id, { onDelete: 'set null' }),
  foundAt: timestamp('found_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  placeIdx: index('prospects_project_place_idx').on(t.projectId, t.placeId),
  statusIdx: index('prospects_project_status_idx').on(t.projectId, t.status, t.foundAt),
  orgIdx: index('prospects_org_idx').on(t.orgId),
}));

export type Prospect = typeof prospects.$inferSelect;
export type NewProspect = typeof prospects.$inferInsert;

/**
 * Cada búsqueda que se le pidió a Google. Existe SOLO porque Places cobra por
 * búsqueda: sin esta tabla, "cuántas van este mes" se contesta adivinando y el
 * tope de gasto de Ajustes no tendría contra qué medir.
 */
export const prospectSearches = pgTable('prospect_searches', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  projectId: uuid('project_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull().default('texto'),
  query: text('query').notNull(),
  zone: text('zone'),
  radiusM: integer('radius_m'),
  /** 'composio' (cuenta del cliente) o 'places' (llave oficial de la casa). */
  via: text('via').notNull().default('places'),
  results: integer('results').notNull().default(0),
  nuevos: integer('nuevos').notNull().default(0),
  costUnits: integer('cost_units').notNull().default(1),
  error: text('error'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  projectIdx: index('prospect_searches_project_idx').on(t.projectId, t.createdAt),
}));

export type ProspectSearch = typeof prospectSearches.$inferSelect;
export type NewProspectSearch = typeof prospectSearches.$inferInsert;

/** Las redes públicas DE NEGOCIO del rival. Nunca un perfil personal. */
export interface CompetitorHandles {
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  tiktok?: string;
  youtube?: string;
  twitter?: string;
}

export const projectCompetitors = pgTable('project_competitors', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  projectId: uuid('project_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  website: text('website'),
  handles: jsonb('handles').$type<CompetitorHandles>().notNull().default({}),
  notes: text('notes'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  projectIdx: index('project_competitors_project_idx').on(t.projectId, t.createdAt),
}));

export type ProjectCompetitor = typeof projectCompetitors.$inferSelect;
export type NewProjectCompetitor = typeof projectCompetitors.$inferInsert;

/** De dónde salió una lectura. Va PEGADO al dato: un número sin fuente no se defiende. */
export type SnapshotFuente = 'composio' | 'web' | 'ninguna';

export const competitorSnapshots = pgTable('competitor_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  projectId: uuid('project_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  /** NULL = la lectura es del PROPIO proyecto. Es el otro lado del comparativo. */
  competitorId: uuid('competitor_id').references(() => projectCompetitors.id, { onDelete: 'cascade' }),
  red: text('red').notNull(),
  fuente: text('fuente').$type<SnapshotFuente>().notNull(),
  /** Cuando la fuente se negó, POR QUÉ, con el código del proveedor. */
  motivo: text('motivo'),
  postsLeidos: integer('posts_leidos').notNull().default(0),
  porSemana: numeric('por_semana', { precision: 6, scale: 2 }),
  ultimoPost: timestamp('ultimo_post', { withTimezone: true }),
  formatos: jsonb('formatos').$type<Record<string, number>>().notNull().default({}),
  seguidores: integer('seguidores'),
  muestra: jsonb('muestra').$type<Array<Record<string, unknown>>>().notNull().default([]),
  leidoEn: timestamp('leido_en', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  projectIdx: index('competitor_snapshots_project_idx').on(t.projectId, t.leidoEn),
  rivalIdx: index('competitor_snapshots_rival_idx').on(t.competitorId, t.leidoEn),
}));

export type CompetitorSnapshot = typeof competitorSnapshots.$inferSelect;
export type NewCompetitorSnapshot = typeof competitorSnapshots.$inferInsert;

/**
 * Lo que Goossip aprendió de una corrección HUMANA.
 *
 * Se guarda solo cuando alguien corrigió de verdad: una pieza rechazada, un
 * texto editado, un cambio pedido. Nada de "acierto" automático — un sistema
 * que se felicita solo aprende a felicitarse.
 */
export type LessonKind =
  | 'pieza_rechazada'
  | 'pieza_editada'
  | 'cambios_pedidos'
  | 'texto_corregido';

export const lessons = pgTable('lessons', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  projectId: uuid('project_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  kind: text('kind').$type<LessonKind>().notNull(),
  queHizo: text('que_hizo').notNull(),
  queCorrigio: text('que_corrigio').notNull(),
  leccion: text('leccion').notNull(),
  refType: text('ref_type'),
  refId: uuid('ref_id'),
  actor: text('actor'),
  embedding: vector('embedding', { dimensions: 1024 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  projectIdx: index('lessons_project_idx').on(t.projectId, t.createdAt),
  vecIdx: index('lessons_vec_idx').using('hnsw', sql`${t.embedding} vector_cosine_ops`),
}));

export type Lesson = typeof lessons.$inferSelect;
export type NewLesson = typeof lessons.$inferInsert;

/* ---------------------------------------------------------------------------
   Corrida 8 — el Asistente siempre abierto: hilos, mensajes y adjuntos.

   Hasta la 7 el historial vivía en `chat_messages`, que es por USUARIO y
   guarda el proyecto dentro del jsonb. Pedirle "los hilos del proyecto X" a
   esa tabla es traer los últimos 20 del usuario y filtrarlos en memoria: con
   dos clientes activos, el Asistente del segundo abría vacío. Aquí el
   proyecto es columna, con índice.
--------------------------------------------------------------------------- */

export const assistantConversations = pgTable('assistant_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  projectId: uuid('project_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** Lo escribe la app con las primeras palabras del primer mensaje. */
  title: text('title'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  /** Se mueve con cada mensaje: por esto se ordena la lista del historial. */
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  proyectoIdx: index('assistant_conversations_proyecto_idx').on(t.projectId, t.userId, t.updatedAt),
}));

export type AssistantConversation = typeof assistantConversations.$inferSelect;
export type NewAssistantConversation = typeof assistantConversations.$inferInsert;

/** Lo que hay que volver a pintar al recargar un hilo. */
export interface AssistantMessageMeta {
  piezas?: Array<{ id: string; url: string; angulo: string }>;
  publicado?: string | null;
  adjuntos?: Array<{ id: string; name: string; mime: string; size: number; url: string }>;
  menciones?: Array<{ tipo: string; id: string; etiqueta: string }>;
  autonomia?: 'propone' | 'publica';
  /** La pantalla en la que estaba parado el usuario al preguntar. */
  pantalla?: string;
  error?: boolean;
}

export const assistantMessages = pgTable('assistant_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => assistantConversations.id, { onDelete: 'cascade' }),
  orgId: text('org_id').notNull(),
  projectId: uuid('project_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  role: text('role').$type<'user' | 'assistant'>().notNull(),
  content: text('content').notNull(),
  metadata: jsonb('metadata').$type<AssistantMessageMeta>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  hiloIdx: index('assistant_messages_hilo_idx').on(t.conversationId, t.createdAt),
}));

export type AssistantMessage = typeof assistantMessages.$inferSelect;
export type NewAssistantMessage = typeof assistantMessages.$inferInsert;

/** Dónde quedaron los bytes. Sin esto no se sabe qué URLs siguen vivas. */
export type FileStorage = 'blob' | 'casa';
export type ExtractStatus = 'pendiente' | 'leido' | 'sin-lector' | 'error';

export const assistantFiles = pgTable('assistant_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  projectId: uuid('project_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  /**
   * SET NULL y no CASCADE: el archivo vive en un almacén de afuera y borrar la
   * fila no borra los bytes. Si la fila se fuera con el hilo, el archivo
   * quedaría en el almacén sin nadie que sepa que existe.
   */
  conversationId: uuid('conversation_id').references(() => assistantConversations.id, {
    onDelete: 'set null',
  }),
  name: text('name').notNull(),
  url: text('url').notNull(),
  mime: text('mime').notNull(),
  size: bigint('size', { mode: 'number' }).notNull(),
  storage: text('storage').$type<FileStorage>().notNull().default('casa'),
  extractStatus: text('extract_status').$type<ExtractStatus>().notNull().default('pendiente'),
  /** Lo que Goossip pudo LEER. Se lee una vez y se guarda, no en cada turno. */
  extractedText: text('extracted_text'),
  /** Por qué no se pudo leer, en español, para poder decírselo al usuario. */
  extractNote: text('extract_note'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  proyectoIdx: index('assistant_files_proyecto_idx').on(t.projectId, t.createdAt),
  hiloIdx: index('assistant_files_hilo_idx').on(t.conversationId),
}));

export type AssistantFile = typeof assistantFiles.$inferSelect;
export type NewAssistantFile = typeof assistantFiles.$inferInsert;

/** Alias de dominio: en la base es `campaigns`, en la app es un proyecto. */
export const projects = campaigns;
export type Project = Campaign;
export type { ProjectKind, ProjectChannels, ProjectRules, McpSource };
