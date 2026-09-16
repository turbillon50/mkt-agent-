/**
 * Tipos del super vendedor multi-proyecto.
 *
 * En la base la tabla sigue llamándose `campaigns`; en UI y en tipos se llama
 * PROYECTO. Un tenant (usuario Clerk) tiene N proyectos; cada proyecto trae sus
 * canales, sus reglas, su vendedor y sus leads.
 */

export const PROJECT_KINDS = ['real_estate', 'mlm', 'marketplace', 'servicios', 'otro'] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

/** Un solo diccionario de etiquetas: antes cada pantalla traía el suyo. */
export const PROJECT_KIND_LABEL: Record<ProjectKind, string> = {
  real_estate: 'Inmobiliario',
  mlm: 'Redes / MLM',
  marketplace: 'Marketplace',
  servicios: 'Servicios',
  otro: 'Otro',
};

export const LEAD_STAGES = [
  'nuevo',
  'contactado',
  'interesado',
  'cita_agendada',
  'visita_hecha',
  'apartado',
  'cerrado',
  'perdido',
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/**
 * Un solo diccionario para las etapas. Vivía dentro del pipeline; en cuanto una
 * segunda pantalla (el detalle de campaña) necesitó las mismas palabras, se
 * subió aquí — dos listas de etiquetas para lo mismo es como empiezan a decir
 * cosas distintas.
 */
export const LEAD_STAGE_LABEL: Record<LeadStage, string> = {
  nuevo: 'Nuevos',
  contactado: 'Contactados',
  interesado: 'Interesados',
  cita_agendada: 'Cita agendada',
  visita_hecha: 'Visita hecha',
  apartado: 'Apartado',
  cerrado: 'Cerrado',
  perdido: 'Perdido',
};

/**
 * El mismo estado, hablando de UNA persona. El de arriba titula la columna del
 * pipeline ("Nuevos", 12); este etiqueta a Ana Ramírez, y decirle "Nuevos" a
 * una sola persona se lee como un error de la app.
 */
export const LEAD_STAGE_LABEL_ONE: Record<LeadStage, string> = {
  ...LEAD_STAGE_LABEL,
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  interesado: 'Interesado',
};

/**
 * `maps` entra en la corrida 7: un lead que salió de Prospección por Google
 * Maps. Es su propia fuente y no `manual` porque la diferencia importa al
 * medir — un lead que levantó la mano en un formulario y uno al que salimos a
 * buscar no cierran igual, y mezclarlos hace que la tasa de conversión del
 * proyecto deje de significar nada.
 *
 * La columna es `text` sin CHECK (0012), así que sumar una fuente no pide
 * migración.
 */
export const LEAD_SOURCES = ['meta_leadgen', 'site', 'manual', 'import', 'maps'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  meta_leadgen: 'Formulario de anuncio',
  site: 'Formulario del sitio',
  manual: 'Alta a mano',
  import: 'Importado',
  maps: 'Prospección en Maps',
};

export type LeadGrade = 'A' | 'B' | 'C';

/**
 * `propose_outreach` entra en la corrida 7 y la palabra que importa es
 * *propose*: deja el primer mensaje REDACTADO y en la cola, para correo,
 * Messenger o llamada, y ahí se queda hasta que una persona lo apruebe. El
 * runner no lo ejecuta solo en ningún nivel de autonomía.
 *
 * La columna `kind` es `text` sin CHECK (0012): sumar una acción no pide
 * migración.
 */
export const ACTION_KINDS = [
  'send_template',
  'send_sms',
  'notify_owner',
  'propose_reply',
  'propose_campaign',
  'propose_outreach',
  'retarget',
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export const ACTION_STATUSES = ['pending', 'approved', 'auto', 'executed', 'rejected', 'failed'] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export type EventType =
  | 'created'
  | 'stage_change'
  | 'message_out'
  | 'message_in'
  | 'call'
  | 'note'
  | 'assigned';

export type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed' | 'no_whatsapp';

/** Twilio arranca en `trial`: solo salen SMS a números verificados. */
export type TwilioMode = 'trial' | 'paid';

/**
 * Canales del proyecto. Aquí van IDS PÚBLICOS, nunca tokens: los tokens viven
 * en env de Vercel (ver `envKeyFor` en lib/project-secrets.ts).
 */
export interface ProjectChannels {
  meta_page_id?: string;
  meta_form_ids?: string[];
  meta_ad_account?: string;
  waba_phone_id?: string;
  twilio_number?: string;
  from_email?: string;
}

/** Reglas del proyecto. Los timers van en horas. */
export interface ProjectRules {
  auto_reply?: boolean;
  auto_first_contact?: boolean;
  /** Sin contacto a N horas → send_template. */
  no_contact_hours?: number;
  /** Sin respuesta a N horas → send_sms. */
  no_reply_sms_hours?: number;
  /** Sin respuesta a N horas → retarget (propuesto). */
  no_reply_retarget_hours?: number;
  /** Grado mínimo que dispara notify_owner inmediato. */
  notify_owner_grade?: LeadGrade;
  /** Puntaje a partir del cual el vendedor escala a humano. */
  escalation_score?: number;
  twilio_mode?: TwilioMode;
  /** Plantilla de WhatsApp para el primer contacto. */
  first_contact_template?: string;
  /** Teléfono E.164 del dueño para notify_owner. */
  owner_phone?: string;
  // --- cómo vende (paso 2 del alta, corrida 3) ------------------------------
  /** Tono del vendedor: "cercano y directo", "formal". */
  seller_tone?: string;
  /** Lo que NO promete. Va al system del agente como prohibición dura. */
  never_promises?: string;
  /** Horario de atención en palabras: "lunes a viernes 9 a 19, sábado 10 a 14". */
  business_hours?: string;
  /** A quién le pasa la bola cuando escala: nombre y teléfono o correo. */
  escalate_to?: string;
  // --- corrida 7 -----------------------------------------------------------
  /**
   * Cuánto puede hacer Goossip solo en ESTE proyecto: 1 a 4. Ver
   * `src/autonomia/niveles.ts`. Vive en `rules` (jsonb) y no en una columna
   * porque un nivel es una regla del proyecto, igual que `auto_reply`.
   */
  autonomy_level?: 1 | 2 | 3 | 4;
  /** Tope de presupuesto diario cuando el nivel 4 opera campañas, en la moneda del proyecto. */
  autonomy_daily_budget?: number;
  /** Tope mensual de búsquedas en Google Maps. Places cobra por búsqueda. */
  maps_search_cap?: number;
  /** Redes donde lo aprobado sale solo, sin que nadie apriete "publicar". */
  auto_publish?: string[];
}

export interface McpSource {
  label: string;
  url: string;
}

export const DEFAULT_RULES: Required<
  Pick<
    ProjectRules,
    | 'auto_reply'
    | 'auto_first_contact'
    | 'no_contact_hours'
    | 'no_reply_sms_hours'
    | 'no_reply_retarget_hours'
    | 'notify_owner_grade'
    | 'escalation_score'
    | 'twilio_mode'
  >
> = {
  auto_reply: false,
  auto_first_contact: false,
  no_contact_hours: 2,
  no_reply_sms_hours: 72,
  no_reply_retarget_hours: 24 * 7,
  notify_owner_grade: 'A',
  escalation_score: 70,
  twilio_mode: 'trial',
};

export function resolveRules(raw: ProjectRules | null | undefined): ProjectRules & typeof DEFAULT_RULES {
  return { ...DEFAULT_RULES, ...(raw ?? {}) };
}

export const STAGE_ORDER: Record<LeadStage, number> = {
  nuevo: 0,
  contactado: 1,
  interesado: 2,
  cita_agendada: 3,
  visita_hecha: 4,
  apartado: 5,
  cerrado: 6,
  perdido: 99,
};

/** Solo avanza; nunca retrocede un stage que el humano ya movió. */
export function isForwardStage(from: LeadStage, to: LeadStage): boolean {
  if (to === 'perdido') return from !== 'cerrado';
  if (from === 'perdido') return false;
  return STAGE_ORDER[to] > STAGE_ORDER[from];
}
