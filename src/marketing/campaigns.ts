/**
 * Las campañas de un proyecto: alta, lista, detalle y atribución de leads.
 *
 * Todo lo que sale de aquí lleva `org_id` Y `project_id` en el `where`. Con uno
 * solo bastaría para que la consulta funcione; con los dos, un id de campaña
 * filtrado por error no sirve para leer el proyecto de otro cliente.
 */
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  marketingCampaigns,
  salesLeads,
  type MarketingCampaign,
  type SalesLead,
} from '../db/schema';
import type { ConnectionChannel } from '../projects/types';
import { isConnectionChannel } from '../projects/types';
import {
  isCampaignObjective,
  isCampaignStatus,
  type CampaignMetaRefs,
  type CampaignSummary,
  type MarketingCampaignInput,
} from './types';

// ---------------------------------------------------------------------------
// Saneado de la entrada
// ---------------------------------------------------------------------------

export class CampaignError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/**
 * `numeric` de Postgres viaja como string por el driver — es lo correcto, un
 * float de JavaScript no puede con centavos. Se convierte en el borde, una sola
 * vez, y de ahí para adentro es número.
 */
function money(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cleanChannels(value: unknown): ConnectionChannel[] {
  if (!Array.isArray(value)) return [];
  const out = value.filter(isConnectionChannel);
  return [...new Set(out)];
}

function cleanBudget(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n) || n < 0) {
    throw new CampaignError('El presupuesto tiene que ser un número mayor o igual a cero.');
  }
  return n.toFixed(2);
}

function cleanDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) throw new CampaignError('Esa fecha no se entiende.');
  return d;
}

function cleanName(value: unknown): string {
  const name = String(value ?? '').trim();
  if (name.length < 2) throw new CampaignError('Ponle un nombre a la campaña.');
  if (name.length > 120) throw new CampaignError('El nombre de la campaña es muy largo.');
  return name;
}

function cleanMetaRefs(value: unknown): CampaignMetaRefs {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const out: CampaignMetaRefs = {};
  if (typeof raw.page_id === 'string') out.page_id = raw.page_id;
  if (typeof raw.campaign_id === 'string') out.campaign_id = raw.campaign_id;
  if (typeof raw.adset_id === 'string') out.adset_id = raw.adset_id;
  if (Array.isArray(raw.form_ids)) {
    out.form_ids = [...new Set(raw.form_ids.filter((f): f is string => typeof f === 'string'))];
  }
  return out;
}

/** Las fechas al revés no son un caso de uso: es un dedo mal puesto. */
function checkWindow(startsAt: Date | null, endsAt: Date | null): void {
  if (startsAt && endsAt && endsAt.getTime() < startsAt.getTime()) {
    throw new CampaignError('La campaña no puede terminar antes de empezar.');
  }
}

// ---------------------------------------------------------------------------
// Alta y edición
// ---------------------------------------------------------------------------

export async function createCampaign(
  orgId: string,
  projectId: string,
  input: MarketingCampaignInput & Record<string, unknown>,
  createdBy: string | null,
): Promise<MarketingCampaign> {
  const name = cleanName(input.name);
  const startsAt = cleanDate(input.startsAt);
  const endsAt = cleanDate(input.endsAt);
  checkWindow(startsAt, endsAt);

  // El índice único es `(project_id, lower(name))`; se pregunta antes para
  // contestar en español en vez de dejar salir el error crudo del driver.
  const repetida = await byName(orgId, projectId, name);
  if (repetida) throw new CampaignError('Ya tienes una campaña con ese nombre en este proyecto.');

  const [row] = await db
    .insert(marketingCampaigns)
    .values({
      orgId,
      projectId,
      name,
      objective: isCampaignObjective(input.objective) ? input.objective : 'leads',
      status: isCampaignStatus(input.status) ? input.status : 'borrador',
      channels: cleanChannels(input.channels),
      budget: cleanBudget(input.budget),
      metaRefs: cleanMetaRefs(input.metaRefs),
      startsAt,
      endsAt,
      createdBy,
    })
    .returning();
  return row;
}

export async function updateCampaign(
  orgId: string,
  projectId: string,
  campaignId: string,
  input: Partial<MarketingCampaignInput> & Record<string, unknown>,
): Promise<MarketingCampaign | null> {
  const actual = await getCampaign(orgId, projectId, campaignId);
  if (!actual) return null;

  const patch: Partial<typeof marketingCampaigns.$inferInsert> = { updatedAt: new Date() };

  if (input.name !== undefined) {
    const name = cleanName(input.name);
    const otra = await byName(orgId, projectId, name);
    if (otra && otra.id !== campaignId) {
      throw new CampaignError('Ya tienes una campaña con ese nombre en este proyecto.');
    }
    patch.name = name;
  }
  if (input.objective !== undefined) {
    if (!isCampaignObjective(input.objective)) throw new CampaignError('Objetivo desconocido.');
    patch.objective = input.objective;
  }
  if (input.status !== undefined) {
    if (!isCampaignStatus(input.status)) throw new CampaignError('Estado desconocido.');
    patch.status = input.status;
  }
  if (input.channels !== undefined) patch.channels = cleanChannels(input.channels);
  if (input.budget !== undefined) patch.budget = cleanBudget(input.budget);
  if (input.metaRefs !== undefined) patch.metaRefs = cleanMetaRefs(input.metaRefs);
  if (input.startsAt !== undefined) patch.startsAt = cleanDate(input.startsAt);
  if (input.endsAt !== undefined) patch.endsAt = cleanDate(input.endsAt);

  checkWindow(
    patch.startsAt !== undefined ? patch.startsAt : actual.startsAt,
    patch.endsAt !== undefined ? patch.endsAt : actual.endsAt,
  );

  const [row] = await db
    .update(marketingCampaigns)
    .set(patch)
    .where(
      and(
        eq(marketingCampaigns.orgId, orgId),
        eq(marketingCampaigns.projectId, projectId),
        eq(marketingCampaigns.id, campaignId),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Borrar la campaña NO se lleva sus leads: la llave foránea es
 * `ON DELETE SET NULL`. Los leads se quedan en el proyecto, sin campaña.
 */
export async function deleteCampaign(
  orgId: string,
  projectId: string,
  campaignId: string,
): Promise<boolean> {
  const rows = await db
    .delete(marketingCampaigns)
    .where(
      and(
        eq(marketingCampaigns.orgId, orgId),
        eq(marketingCampaigns.projectId, projectId),
        eq(marketingCampaigns.id, campaignId),
      ),
    )
    .returning({ id: marketingCampaigns.id });
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export async function getCampaign(
  orgId: string,
  projectId: string,
  campaignId: string,
): Promise<MarketingCampaign | null> {
  // Un id que no es un uuid revienta el `where` del driver. Se contesta "no
  // existe", que es la verdad, en vez de un 500.
  if (!/^[0-9a-f-]{36}$/i.test(campaignId)) return null;
  const rows = await db
    .select()
    .from(marketingCampaigns)
    .where(
      and(
        eq(marketingCampaigns.orgId, orgId),
        eq(marketingCampaigns.projectId, projectId),
        eq(marketingCampaigns.id, campaignId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function byName(
  orgId: string,
  projectId: string,
  name: string,
): Promise<MarketingCampaign | null> {
  const rows = await db
    .select()
    .from(marketingCampaigns)
    .where(
      and(
        eq(marketingCampaigns.orgId, orgId),
        eq(marketingCampaigns.projectId, projectId),
        sql`lower(${marketingCampaigns.name}) = lower(${name})`,
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Las campañas del proyecto con sus números.
 *
 * Los conteos salen de UNA consulta agrupada y no de un `count` por campaña:
 * con veinte campañas serían veintiuna idas a la base para pintar una lista.
 */
export async function listCampaigns(
  orgId: string,
  projectId: string,
): Promise<CampaignSummary[]> {
  const [rows, conteos] = await Promise.all([
    db
      .select()
      .from(marketingCampaigns)
      .where(
        and(eq(marketingCampaigns.orgId, orgId), eq(marketingCampaigns.projectId, projectId)),
      )
      .orderBy(desc(marketingCampaigns.createdAt)),
    db
      .select({
        id: salesLeads.marketingCampaignId,
        total: sql<number>`count(*)::int`,
        nuevos: sql<number>`count(*) FILTER (WHERE ${salesLeads.stage} = 'nuevo')::int`,
      })
      .from(salesLeads)
      .where(and(eq(salesLeads.orgId, orgId), eq(salesLeads.campaignId, projectId)))
      .groupBy(salesLeads.marketingCampaignId),
  ]);

  const porCampana = new Map(conteos.filter((c) => c.id).map((c) => [c.id!, c]));
  return rows.map((row) => toSummary(row, porCampana.get(row.id)));
}

export function toSummary(
  row: MarketingCampaign,
  conteo?: { total: number; nuevos: number },
): CampaignSummary {
  return {
    id: row.id,
    name: row.name,
    objective: row.objective,
    status: row.status,
    channels: row.channels ?? [],
    budget: money(row.budget),
    metaRefs: row.metaRefs ?? {},
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    leads: conteo?.total ?? 0,
    sinContactar: conteo?.nuevos ?? 0,
  };
}

/** Los números de UNA campaña, para su detalle. */
export async function campaignCounts(
  orgId: string,
  projectId: string,
  campaignId: string,
): Promise<{ total: number; nuevos: number }> {
  const rows = await db
    .select({
      total: sql<number>`count(*)::int`,
      nuevos: sql<number>`count(*) FILTER (WHERE ${salesLeads.stage} = 'nuevo')::int`,
    })
    .from(salesLeads)
    .where(
      and(
        eq(salesLeads.orgId, orgId),
        eq(salesLeads.campaignId, projectId),
        eq(salesLeads.marketingCampaignId, campaignId),
      ),
    );
  return { total: rows[0]?.total ?? 0, nuevos: rows[0]?.nuevos ?? 0 };
}

/** Cuántas campañas tiene el proyecto, para el badge del menú. */
export async function campaignCount(orgId: string, projectId: string): Promise<number> {
  const rows = await db
    .select({ c: count() })
    .from(marketingCampaigns)
    .where(and(eq(marketingCampaigns.orgId, orgId), eq(marketingCampaigns.projectId, projectId)));
  return Number(rows[0]?.c ?? 0);
}

/** Los leads que trajo esta campaña. */
export async function campaignLeads(
  orgId: string,
  projectId: string,
  campaignId: string,
  limit = 50,
): Promise<SalesLead[]> {
  return db
    .select()
    .from(salesLeads)
    .where(
      and(
        eq(salesLeads.orgId, orgId),
        eq(salesLeads.campaignId, projectId),
        eq(salesLeads.marketingCampaignId, campaignId),
      ),
    )
    .orderBy(desc(salesLeads.createdAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Atribución
// ---------------------------------------------------------------------------

/**
 * De qué campaña vino un lead de Meta.
 *
 * Meta manda el `form_id` en el aviso de lead ads; la campaña que tenga ese
 * formulario en sus `meta_refs` es la que lo trajo. Si dos campañas se pelean
 * el mismo formulario gana la más nueva — es la que se acaba de dar de alta con
 * ese formulario, y cambiar la vieja a mano sería castigar al usuario por
 * reciclar un formulario que Meta sí deja reciclar.
 *
 * Devuelve `null` cuando ninguna campaña lo reclama: el lead se queda en el
 * proyecto sin campaña, que es la verdad, y no colgado de una inventada.
 */
export async function campaignForForm(
  orgId: string,
  projectId: string,
  formId: string | null | undefined,
): Promise<string | null> {
  if (!formId) return null;
  const rows = await db
    .select({ id: marketingCampaigns.id })
    .from(marketingCampaigns)
    .where(
      and(
        eq(marketingCampaigns.orgId, orgId),
        eq(marketingCampaigns.projectId, projectId),
        sql`${marketingCampaigns.metaRefs} -> 'form_ids' @> ${JSON.stringify([formId])}::jsonb`,
      ),
    )
    .orderBy(desc(marketingCampaigns.createdAt))
    .limit(1);
  return rows[0]?.id ?? null;
}

/** Amarra un lead ya existente a una campaña (o lo suelta con `null`). */
export async function attributeLead(
  orgId: string,
  projectId: string,
  leadId: string,
  campaignId: string | null,
): Promise<boolean> {
  if (campaignId) {
    const campana = await getCampaign(orgId, projectId, campaignId);
    if (!campana) throw new CampaignError('Esa campaña no es de este proyecto.', 404);
  }
  const rows = await db
    .update(salesLeads)
    .set({ marketingCampaignId: campaignId, updatedAt: new Date() })
    .where(
      and(
        eq(salesLeads.orgId, orgId),
        eq(salesLeads.campaignId, projectId),
        eq(salesLeads.id, leadId),
      ),
    )
    .returning({ id: salesLeads.id });
  return rows.length > 0;
}
