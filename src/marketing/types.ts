/**
 * Campañas de marketing: la pauta que trae gente.
 *
 * El diccionario de la app, sin ambigüedad:
 *   PROYECTO  — el negocio del cliente. En la base es `campaigns` por historia
 *               del repo (ver 0012 y 0014). En la UI, siempre "proyecto".
 *   CAMPAÑA   — una pauta concreta dentro de un proyecto. En la base es
 *               `marketing_campaigns`. Un proyecto tiene MUCHAS.
 *
 * Vive en src/ (no en lib/) por lo mismo que el resto: las pruebas y los
 * scripts de tsx lo usan fuera de Next, y `server-only` los revienta.
 */

import type { ConnectionChannel } from '../projects/types';

// ---------------------------------------------------------------------------
// Objetivo
// ---------------------------------------------------------------------------

/**
 * Para qué se prende la campaña. Son los cinco objetivos que de verdad
 * distingue quien pauta; no es el catálogo entero de Meta, que tiene once y
 * nueve de ellos no cambian nada de lo que hace Goossip con el lead.
 */
export const CAMPAIGN_OBJECTIVES = ['leads', 'mensajes', 'trafico', 'alcance', 'ventas'] as const;
export type CampaignObjective = (typeof CAMPAIGN_OBJECTIVES)[number];

export const CAMPAIGN_OBJECTIVE_LABEL: Record<CampaignObjective, string> = {
  leads: 'Traer leads',
  mensajes: 'Abrir conversaciones',
  trafico: 'Llevar gente al sitio',
  alcance: 'Que me conozcan',
  ventas: 'Vender',
};

export const CAMPAIGN_OBJECTIVE_HELP: Record<CampaignObjective, string> = {
  leads: 'La gente deja sus datos en un formulario y entra al pipeline.',
  mensajes: 'La gente te escribe por WhatsApp o Messenger.',
  trafico: 'La gente entra a tu página.',
  alcance: 'Que te vea la mayor cantidad de gente posible.',
  ventas: 'Compra directa, con catálogo o tienda.',
};

export function isCampaignObjective(value: unknown): value is CampaignObjective {
  return CAMPAIGN_OBJECTIVES.includes(value as CampaignObjective);
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

/**
 * Cuatro estados y nada más, igual que con las conexiones: cada etiqueta nueva
 * que se inventa es una pregunta más que le hace el panel a quien lo mira.
 */
export const CAMPAIGN_STATUSES = ['borrador', 'activa', 'pausada', 'terminada'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  borrador: 'Borrador',
  activa: 'Activa',
  pausada: 'En pausa',
  terminada: 'Terminada',
};

export function isCampaignStatus(value: unknown): value is CampaignStatus {
  return CAMPAIGN_STATUSES.includes(value as CampaignStatus);
}

// ---------------------------------------------------------------------------
// Lo que amarra la campaña con Meta
// ---------------------------------------------------------------------------

/**
 * Referencias del proveedor. Hoy solo Meta trae identificadores que sirvan para
 * amarrar un lead a una campaña; el día que Google Ads conecte, su id entra
 * aquí sin migrar la tabla.
 */
export interface CampaignMetaRefs {
  /** Página de Facebook desde la que corre. */
  page_id?: string;
  /** Formularios de lead ads de esta campaña. De aquí sale la atribución. */
  form_ids?: string[];
  /** Campaña / conjunto de anuncios de Meta, cuando el usuario lo sabe. */
  campaign_id?: string;
  adset_id?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// La campaña
// ---------------------------------------------------------------------------

export interface MarketingCampaignInput {
  name: string;
  objective?: CampaignObjective;
  status?: CampaignStatus;
  channels?: ConnectionChannel[];
  /** En pesos. `null` = campaña sin presupuesto declarado, que no es cero. */
  budget?: number | null;
  metaRefs?: CampaignMetaRefs;
  /**
   * `string` además de `Date` porque por aquí entra lo que escribió un
   * `<input type="date">` y lo que llega crudo de un JSON. El saneado lo
   * convierte en el borde y revienta en español si no se entiende.
   */
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
}

/** Lo que la pantalla necesita saber de una campaña, ya con sus números. */
export interface CampaignSummary {
  id: string;
  name: string;
  objective: CampaignObjective;
  status: CampaignStatus;
  channels: ConnectionChannel[];
  budget: number | null;
  metaRefs: CampaignMetaRefs;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  /** Leads atribuidos a ESTA campaña. `count(*)`, no un estimado. */
  leads: number;
  /** De esos, los que nadie ha contactado todavía. */
  sinContactar: number;
}
