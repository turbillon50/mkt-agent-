import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
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
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userPlatformIdx: index('social_accounts_user_platform_idx').on(t.userId, t.platform),
  projectIdx: index('social_accounts_project_idx').on(t.campaignId),
}));

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
  channel: text('channel').$type<'whatsapp' | 'sms' | 'email'>().notNull().default('whatsapp'),
  externalThreadId: text('external_thread_id').notNull(),
  status: text('status').$type<'open' | 'escalated' | 'closed'>().notNull().default('open'),
  lastInboundAt: timestamp('last_inbound_at', { withTimezone: true }),
  lastOutboundAt: timestamp('last_outbound_at', { withTimezone: true }),
  windowExpiresAt: timestamp('window_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  leadIdx: index('conversations_lead_idx').on(t.leadId),
  campaignStatusIdx: index('conversations_campaign_status_idx').on(t.campaignId, t.status),
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

/** Alias de dominio: en la base es `campaigns`, en la app es un proyecto. */
export const projects = campaigns;
export type Project = Campaign;
export type { ProjectKind, ProjectChannels, ProjectRules, McpSource };
