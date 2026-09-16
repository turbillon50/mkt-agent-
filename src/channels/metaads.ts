/**
 * Los DATOS de Meta Ads que Goossip enseña y que el Asistente usa.
 *
 * Es el otro metaads. El de `pauta.ts` es el adaptador de Composio y se queda
 * escrito para el día que Composio habilite auth administrada; este es el que
 * de verdad contesta hoy, con la app propia de Goossip y el token del cliente
 * (`lib/meta-ads.ts`). Están separados a propósito: mezclarlos haría que un
 * cambio en el camino que funciona pudiera romper el que espera, y al revés.
 *
 * Todo lo de aquí es SOLO LECTURA. En esta corrida no se crea ni una campaña ni
 * se mueve un peso de presupuesto — y no por falta de tiempo: mover el gasto de
 * un cliente desde una automatización es una decisión de Luis, no de un commit.
 *
 * La regla de los errores: si Meta contesta mal, esto NO lanza el mensaje crudo
 * de Graph hacia arriba. Lanza `MetaAdsError` y quien pinta usa `motivoDeMeta`,
 * que habla español y dice qué hacer.
 */
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { salesLeads, type Project } from '../db/schema';
import {
  estadoDeCuenta,
  gastoDe,
  leadsDeMeta,
  listCampaigns,
  motivoDeMeta,
  readAdAccount,
  readInsights,
  sumaDe,
  type DatePreset,
  type MetaCampaign,
} from '../../lib/meta-ads';
import { markNeedsReconnect, markVerified, metaAdsCuenta } from '../projects/connections';

export class MetaAdsNoConectado extends Error {
  constructor() {
    super('Conecta Meta Ads en Conexiones para poder ver tus anuncios.');
    this.name = 'MetaAdsNoConectado';
  }
}

async function cuenta(project: Project) {
  const c = await metaAdsCuenta(project);
  if (!c) throw new MetaAdsNoConectado();
  return c;
}

// ---------------------------------------------------------------------------
// Lecturas
// ---------------------------------------------------------------------------

export interface CampañaMeta {
  id: string;
  nombre: string;
  /** "activa" | "pausada" | lo que diga Meta, en minúsculas. */
  estado: string;
  activa: boolean;
  objetivo: string | null;
  /** Ya en pesos (o la moneda de la cuenta): Meta lo manda en centavos. */
  presupuestoDiario: number | null;
}

/** Los centavos que manda Meta → dinero de verdad. `null` se queda `null`. */
export function aDinero(centavos: string | null | undefined): number | null {
  if (centavos === null || centavos === undefined || centavos === '') return null;
  const n = Number(centavos);
  if (!Number.isFinite(n)) return null;
  return Math.round(n) / 100;
}

/** Cómo se lee un estado de campaña de Meta en la pantalla de un cliente. */
export function estadoEnEspañol(effectiveStatus: string): string {
  switch (effectiveStatus) {
    case 'ACTIVE':
      return 'activa';
    case 'PAUSED':
    case 'ADSET_PAUSED':
    case 'CAMPAIGN_PAUSED':
      return 'pausada';
    case 'DELETED':
    case 'ARCHIVED':
      return 'archivada';
    case 'IN_PROCESS':
      return 'en revisión';
    case 'WITH_ISSUES':
      return 'con problemas';
    case 'DISAPPROVED':
      return 'rechazada';
    default:
      return effectiveStatus.toLowerCase().replaceAll('_', ' ');
  }
}

export function mapCampaña(c: MetaCampaign): CampañaMeta {
  return {
    id: c.id,
    nombre: c.name,
    estado: estadoEnEspañol(c.effectiveStatus),
    activa: c.effectiveStatus === 'ACTIVE',
    objetivo: c.objective,
    presupuestoDiario: aDinero(c.dailyBudget),
  };
}

/** Las campañas de la cuenta del proyecto. Una lista vacía es una respuesta. */
export async function leerCampañas(project: Project): Promise<CampañaMeta[]> {
  const c = await cuenta(project);
  const campañas = await listCampaigns(c.accountId, c.token);
  return campañas.map(mapCampaña);
}

export interface InsightsMeta {
  periodo: DatePreset;
  gasto: number;
  impresiones: number;
  clics: number;
  /** Los leads que Meta se apunta. NO es lo mismo que los que entraron a Goossip. */
  leadsSegunMeta: number;
  moneda: string | null;
  desde: string | null;
  hasta: string | null;
}

export async function leerInsights(
  project: Project,
  datePreset: DatePreset = 'last_7d',
): Promise<InsightsMeta> {
  const c = await cuenta(project);
  const filas = await readInsights(c.accountId, c.token, datePreset);
  return {
    periodo: datePreset,
    gasto: gastoDe(filas),
    impresiones: sumaDe(filas, 'impressions'),
    clics: sumaDe(filas, 'clicks'),
    leadsSegunMeta: leadsDeMeta(filas),
    moneda: c.currency,
    desde: filas[0]?.dateStart ?? null,
    hasta: filas[0]?.dateStop ?? null,
  };
}

// ---------------------------------------------------------------------------
// Costo por lead
// ---------------------------------------------------------------------------

export interface CostoPorLead {
  dias: number;
  gasto: number;
  /** Los que ENTRARON a Goossip por un formulario de anuncio de Meta. */
  leads: number;
  leadsSegunMeta: number;
  /** `null` cuando no hubo leads: dividir entre cero no es "cuesta infinito". */
  cpl: number | null;
  moneda: string | null;
}

/** El cálculo, aparte de la red, para poder probarlo con números a mano. */
export function calcularCpl(gasto: number, leads: number): number | null {
  if (!Number.isFinite(gasto) || gasto <= 0) return null;
  if (!Number.isFinite(leads) || leads <= 0) return null;
  return Math.round((gasto / leads) * 100) / 100;
}

/** El `date_preset` de Meta que corresponde a una ventana de días. */
export function presetDeDias(dias: number): DatePreset {
  if (dias <= 1) return 'today';
  if (dias <= 7) return 'last_7d';
  if (dias <= 30) return 'last_30d';
  return 'last_90d';
}

/**
 * Cuánto cuesta cada lead de verdad.
 *
 * El divisor NO son los leads que reporta Meta: son los de `sales_leads` con
 * `source = 'meta_leadgen'` de este proyecto en el periodo. Y es a propósito —
 * Meta cuenta lo que pasó en su plataforma; Goossip cuenta lo que llegó al
 * pipeline del cliente. Cuando los dos números no cuadran (formularios sin
 * suscribir, leads que Meta agrupa), el que le importa a quien paga la pauta es
 * el segundo. Los dos se devuelven para que la diferencia se vea, no se tape.
 */
export async function costoPorLead(project: Project, dias = 30): Promise<CostoPorLead> {
  const preset = presetDeDias(dias);
  const insights = await leerInsights(project, preset);
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

  const [fila] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(salesLeads)
    .where(
      and(
        eq(salesLeads.orgId, project.orgId),
        eq(salesLeads.campaignId, project.id),
        eq(salesLeads.source, 'meta_leadgen'),
        gte(salesLeads.createdAt, desde),
      ),
    );
  const leads = Number(fila?.n ?? 0);

  return {
    dias,
    gasto: insights.gasto,
    leads,
    leadsSegunMeta: insights.leadsSegunMeta,
    cpl: calcularCpl(insights.gasto, leads),
    moneda: insights.moneda,
  };
}

// ---------------------------------------------------------------------------
// Verificación
// ---------------------------------------------------------------------------

export interface EstadoMetaAds {
  conectado: boolean;
  cuenta: string | null;
  nombre: string | null;
  estadoCuenta: string | null;
  motivo?: string;
}

/**
 * ¿Sigue viva la cuenta publicitaria?
 *
 * Le pregunta a META, no a nuestra tabla: preguntarle a la base contesta lo que
 * nosotros escribimos la última vez, no si el cliente revocó el permiso anoche.
 * Y escribe la respuesta — `verified_at` cuando sí, `needs_reconnect` con motivo
 * en español cuando no. Es lo único que enciende (y apaga) el verde.
 */
export async function verificarMetaAds(project: Project): Promise<EstadoMetaAds> {
  const c = await metaAdsCuenta(project);
  if (!c) return { conectado: false, cuenta: null, nombre: null, estadoCuenta: null };

  try {
    const acc = await readAdAccount(c.accountId, c.token);
    await markVerified(project.orgId, project.id, 'metaads');
    return {
      conectado: true,
      cuenta: acc.id,
      nombre: acc.name,
      estadoCuenta: estadoDeCuenta(acc.status),
    };
  } catch (e) {
    const motivo = motivoDeMeta(e);
    await markNeedsReconnect(project.orgId, project.id, 'metaads', motivo).catch(() => undefined);
    return { conectado: false, cuenta: c.accountId, nombre: c.nombre, estadoCuenta: null, motivo };
  }
}

// ---------------------------------------------------------------------------
// El resumen que pinta la pantalla y lee el Asistente
// ---------------------------------------------------------------------------

export interface ResumenAnunciosMeta {
  conectado: boolean;
  /** En español, cuando NO está conectado o cuando Meta contestó mal. */
  motivo?: string;
  cuenta: { id: string; nombre: string; business: string | null; moneda: string | null } | null;
  gasto7d: number;
  gasto30d: number;
  cpl: CostoPorLead | null;
  campañas: CampañaMeta[];
  campañasActivas: number;
}

export const RESUMEN_VACIO: ResumenAnunciosMeta = {
  conectado: false,
  cuenta: null,
  gasto7d: 0,
  gasto30d: 0,
  cpl: null,
  campañas: [],
  campañasActivas: 0,
};

/**
 * Todo lo de Meta Ads de un proyecto en una llamada.
 *
 * Nunca lanza: una pantalla de Campañas que revienta entera porque Facebook
 * está lento es peor que una sección que dice qué pasó. Lo que falle vuelve
 * como `motivo` en español.
 */
export async function resumenAnunciosMeta(project: Project): Promise<ResumenAnunciosMeta> {
  const c = await metaAdsCuenta(project);
  if (!c) return { ...RESUMEN_VACIO, motivo: 'Meta Ads no está conectado en este proyecto.' };

  const base = {
    conectado: true,
    cuenta: { id: c.accountId, nombre: c.nombre, business: c.business, moneda: c.currency },
  };

  try {
    const [siete, treinta, campañas] = await Promise.all([
      leerInsights(project, 'last_7d'),
      costoPorLead(project, 30),
      leerCampañas(project),
    ]);
    return {
      ...RESUMEN_VACIO,
      ...base,
      gasto7d: siete.gasto,
      gasto30d: treinta.gasto,
      cpl: treinta,
      campañas,
      campañasActivas: campañas.filter((x) => x.activa).length,
    };
  } catch (e) {
    if (e instanceof MetaAdsNoConectado) {
      return { ...RESUMEN_VACIO, motivo: e.message };
    }
    return { ...RESUMEN_VACIO, ...base, conectado: false, motivo: motivoDeMeta(e) };
  }
}

/** Una línea para el Asistente. Sin números inventados: si no hay, lo dice. */
export function resumenEnUnaLinea(r: ResumenAnunciosMeta, moneda = 'MXN'): string {
  if (!r.conectado) return `Meta Ads: ${r.motivo ?? 'sin conectar'}.`;
  const m = r.cuenta?.moneda ?? moneda;
  const dinero = (n: number) => `$${n.toLocaleString('es-MX', { maximumFractionDigits: 2 })} ${m}`;
  const cpl =
    r.cpl?.cpl !== null && r.cpl?.cpl !== undefined
      ? `costo por lead ${dinero(r.cpl.cpl)} (${r.cpl.leads} leads en 30 días)`
      : 'todavía sin leads para calcular el costo por lead';
  return [
    `Meta Ads (${r.cuenta?.nombre ?? 'cuenta conectada'}):`,
    `${r.campañasActivas} campañas activas de ${r.campañas.length},`,
    `gasto ${dinero(r.gasto7d)} en 7 días y ${dinero(r.gasto30d)} en 30,`,
    `${cpl}.`,
  ].join(' ');
}
