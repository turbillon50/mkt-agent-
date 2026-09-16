/**
 * Proyectos. En la base la tabla es `campaigns`; aquí y en la UI es un PROYECTO.
 *
 * Vive en src/ (no en lib/) para que los scripts de tsx — seed e importación —
 * lo puedan usar: `server-only` los rompería. lib/projects.ts lo re-exporta.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { campaigns, orgMemberships, type Project } from '../db/schema';
import {
  PROJECT_KINDS,
  resolveRules,
  type McpSource,
  type ProjectChannels,
  type ProjectKind,
  type ProjectRules,
} from './types';
import { hasProjectSecret } from '../../lib/project-secrets';

export type { Project };

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 60) || 'proyecto'
  );
}

/**
 * Slug único dentro de la ORG (antes era dentro del usuario). Lo respalda el
 * índice `campaigns_org_slug_uniq` de la migración 0013.
 */
export async function uniqueSlug(orgId: string, base: string): Promise<string> {
  let slug = slugify(base);
  let i = 2;
  for (;;) {
    const existing = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(and(eq(campaigns.orgId, orgId), eq(campaigns.slug, slug)))
      .limit(1);
    if (existing.length === 0) return slug;
    slug = `${slugify(base)}-${i++}`;
  }
}

/** El proyecto activo se guarda por (user, org), no por usuario. */
export async function setActiveProject(
  orgId: string,
  clerkUserId: string,
  projectId: string | null,
): Promise<void> {
  await db
    .update(orgMemberships)
    .set({ activeProjectId: projectId, updatedAt: new Date() })
    .where(and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.clerkUserId, clerkUserId)));
}

export interface ProjectInput {
  name: string;
  kind?: ProjectKind;
  description?: string | null;
  sellerPersona?: string | null;
  audience?: string | null;
  brandLanguage?: string | null;
  channels?: ProjectChannels;
  rules?: ProjectRules;
  mcpSources?: McpSource[];
}

function cleanKind(kind: unknown): ProjectKind {
  return PROJECT_KINDS.includes(kind as ProjectKind) ? (kind as ProjectKind) : 'servicios';
}

/** Deja solo ids públicos y tira strings vacíos: evita guardar `""` como id. */
export function sanitizeChannels(raw: unknown): ProjectChannels {
  const src = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => {
    const s = String(v ?? '').trim();
    return s.length > 0 ? s : undefined;
  };
  const list = (v: unknown) =>
    Array.isArray(v)
      ? v.map((x) => String(x ?? '').trim()).filter(Boolean)
      : String(v ?? '')
          .split(/[,\s]+/)
          .map((x) => x.trim())
          .filter(Boolean);

  const formIds = list(src.meta_form_ids);
  const out: ProjectChannels = {
    meta_page_id: str(src.meta_page_id),
    meta_ad_account: str(src.meta_ad_account),
    waba_phone_id: str(src.waba_phone_id),
    twilio_number: str(src.twilio_number),
    from_email: str(src.from_email),
  };
  if (formIds.length > 0) out.meta_form_ids = formIds;
  for (const k of Object.keys(out) as Array<keyof ProjectChannels>) {
    if (out[k] === undefined) delete out[k];
  }
  return out;
}

export function sanitizeRules(raw: unknown): ProjectRules {
  const src = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);
  const out: ProjectRules = {
    auto_reply: bool(src.auto_reply),
    auto_first_contact: bool(src.auto_first_contact),
    no_contact_hours: num(src.no_contact_hours),
    no_reply_sms_hours: num(src.no_reply_sms_hours),
    no_reply_retarget_hours: num(src.no_reply_retarget_hours),
    escalation_score: num(src.escalation_score),
    notify_owner_grade: ['A', 'B', 'C'].includes(String(src.notify_owner_grade))
      ? (String(src.notify_owner_grade) as 'A' | 'B' | 'C')
      : undefined,
    twilio_mode: src.twilio_mode === 'paid' ? 'paid' : src.twilio_mode === 'trial' ? 'trial' : undefined,
    first_contact_template: String(src.first_contact_template ?? '').trim() || undefined,
    owner_phone: String(src.owner_phone ?? '').trim() || undefined,
  };
  for (const k of Object.keys(out) as Array<keyof ProjectRules>) {
    if (out[k] === undefined) delete out[k];
  }
  return out;
}

export function sanitizeMcpSources(raw: unknown): McpSource[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      const url = String(o.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) return null;
      return { label: String(o.label ?? '').trim() || url, url };
    })
    .filter((x): x is McpSource => x !== null)
    .slice(0, 10);
}

export async function listProjects(orgId: string): Promise<Project[]> {
  return db
    .select()
    .from(campaigns)
    .where(eq(campaigns.orgId, orgId))
    .orderBy(campaigns.createdAt);
}

/**
 * El proyecto SIEMPRE se pide con su org. Sin este `and` un id adivinado de
 * otra organización devolvería datos ajenos: es el candado del aislamiento.
 */
export async function getProject(orgId: string, id: string): Promise<Project | null> {
  const rows = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.orgId, orgId), eq(campaigns.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

/** Sin scope de usuario — solo para webhooks y crons, nunca para rutas de UI. */
export async function getProjectById(id: string): Promise<Project | null> {
  const rows = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createProject(
  orgId: string,
  userId: string,
  input: ProjectInput,
): Promise<Project> {
  const name = input.name.trim();
  const slug = await uniqueSlug(orgId, name);
  const [row] = await db
    .insert(campaigns)
    .values({
      orgId,
      userId,
      name,
      slug,
      brandName: name,
      description: input.description ?? null,
      audience: input.audience ?? null,
      brandLanguage: input.brandLanguage ?? 'es',
      kind: cleanKind(input.kind),
      sellerPersona: input.sellerPersona ?? null,
      channels: sanitizeChannels(input.channels),
      rules: sanitizeRules(input.rules),
      mcpSources: sanitizeMcpSources(input.mcpSources),
    })
    .returning();
  if (!row) throw new Error('No se pudo crear el proyecto.');
  return row;
}

export async function updateProject(
  orgId: string,
  id: string,
  input: Partial<ProjectInput> & { status?: string },
): Promise<Project | null> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = String(input.name).trim();
  if (input.description !== undefined) patch.description = input.description;
  if (input.audience !== undefined) patch.audience = input.audience;
  if (input.brandLanguage !== undefined) patch.brandLanguage = input.brandLanguage;
  if (input.kind !== undefined) patch.kind = cleanKind(input.kind);
  if (input.sellerPersona !== undefined) patch.sellerPersona = input.sellerPersona;
  if (input.channels !== undefined) patch.channels = sanitizeChannels(input.channels);
  if (input.rules !== undefined) patch.rules = sanitizeRules(input.rules);
  if (input.mcpSources !== undefined) patch.mcpSources = sanitizeMcpSources(input.mcpSources);
  if (input.status !== undefined) patch.status = input.status;

  const [row] = await db
    .update(campaigns)
    .set(patch)
    .where(and(eq(campaigns.orgId, orgId), eq(campaigns.id, id)))
    .returning();
  return row ?? null;
}

/**
 * Resuelve el proyecto de un lead de Meta. Primero por form_id (más específico:
 * dos proyectos pueden colgar de la misma página), después por page_id.
 */
export async function resolveProjectByMeta(pageId: string | null, formId: string | null): Promise<Project | null> {
  if (formId) {
    const byForm = await db
      .select()
      .from(campaigns)
      .where(sql`${campaigns.channels} -> 'meta_form_ids' @> ${JSON.stringify([formId])}::jsonb`)
      .limit(1);
    if (byForm[0]) return byForm[0];
  }
  if (pageId) {
    const byPage = await db
      .select()
      .from(campaigns)
      .where(sql`${campaigns.channels} ->> 'meta_page_id' = ${pageId}`)
      .limit(1);
    if (byPage[0]) return byPage[0];
  }
  return null;
}

export async function resolveProjectByWabaPhoneId(phoneNumberId: string): Promise<Project | null> {
  const rows = await db
    .select()
    .from(campaigns)
    .where(sql`${campaigns.channels} ->> 'waba_phone_id' = ${phoneNumberId}`)
    .limit(1);
  return rows[0] ?? null;
}

export interface ChannelStatus {
  meta: boolean;
  metaToken: boolean;
  waba: boolean;
  wabaToken: boolean;
  twilio: boolean;
  twilioToken: boolean;
  twilioMode: 'trial' | 'paid';
  mcp: number;
  email: boolean;
}

/** Estado de canales para el panel. Devuelve booleanos, nunca tokens. */
export function channelStatus(project: Project): ChannelStatus {
  const ch = (project.channels ?? {}) as ProjectChannels;
  const rules = resolveRules(project.rules);
  return {
    meta: Boolean(ch.meta_page_id),
    metaToken: hasProjectSecret(project.slug, 'META_PAGE_TOKEN'),
    waba: Boolean(ch.waba_phone_id),
    wabaToken: hasProjectSecret(project.slug, 'WHATSAPP_TOKEN'),
    twilio: Boolean(ch.twilio_number),
    twilioToken:
      hasProjectSecret(project.slug, 'TWILIO_ACCOUNT_SID') &&
      hasProjectSecret(project.slug, 'TWILIO_AUTH_TOKEN'),
    twilioMode: rules.twilio_mode,
    mcp: (project.mcpSources ?? []).length,
    email: Boolean(ch.from_email),
  };
}
