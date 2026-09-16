/**
 * Ingesta de leads de venta. Un solo camino para todas las fuentes
 * (meta_leadgen, site, manual, import): calificar → validar teléfono →
 * insertar → bitácora → encolar el primer movimiento.
 */
import type { Project } from '../db/schema';
import { lookupPhone } from '../../lib/twilio';
import { enqueue } from './queue';
import { recordEvent, setPhoneValidation, upsertLead, type UpsertLeadResult } from './repo';
import { normalizePhone, scoreLead } from './scoring';
import { resolveRules, type LeadSource, type LeadStage } from './types';

export interface IngestInput {
  project: Project;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  source: LeadSource;
  sourceRef: string | null;
  /** Fecha original del lead (Meta), no la de importación. */
  createdAt: Date;
  raw?: Record<string, unknown>;
  /** Solo para el import one-shot: respeta el estado que ya traía el lead. */
  stageOverride?: LeadStage;
  /** El import no gasta llamadas de Twilio para 26 filas históricas. */
  skipLookup?: boolean;
  /**
   * Solo para el import: conserva el puntaje tal como quedó cuando el lead
   * entró. Recalcularlo hoy daría otro número (se pierde el "acaba de entrar")
   * y borraría el histórico que Luis ya vio en el panel.
   */
  scoreOverride?: { score: number; grade: 'A' | 'B' | 'C'; signals: string[]; zone?: string };
  /** El import no encola nada: son leads viejos, no hay que perseguirlos hoy. */
  skipQueue?: boolean;
}

export interface IngestResult extends UpsertLeadResult {
  enqueued: string[];
  lookup: 'ok' | 'no_se_pudo' | 'omitido';
}

export async function ingestLead(input: IngestInput): Promise<IngestResult> {
  const { project } = input;
  const rules = resolveRules(project.rules);
  const { e164 } = normalizePhone(input.phone);
  const phone = e164 ? `+${e164}` : null;

  const computed = scoreLead({
    fullName: input.fullName,
    phone: input.phone,
    createdAt: input.createdAt,
  });
  const scored = input.scoreOverride
    ? {
        ...computed,
        score: input.scoreOverride.score,
        grade: input.scoreOverride.grade,
        signals: input.scoreOverride.signals,
        zone: input.scoreOverride.zone ?? computed.zone,
      }
    : computed;

  const { lead, created } = await upsertLead({
    orgId: project.orgId,
    userId: project.userId,
    campaignId: project.id,
    phone,
    email: input.email,
    fullName: input.fullName,
    source: input.source,
    sourceRef: input.sourceRef,
    score: scored.score,
    grade: scored.grade,
    scoreBreakdown: {
      base: 40,
      signals: scored.signals,
      zone: scored.zone,
      lada: scored.lada,
      country: scored.country,
    },
    stage: input.stageOverride ?? 'nuevo',
    raw: input.raw ?? null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  });

  if (!created) return { lead, created: false, enqueued: [], lookup: 'omitido' };

  // --- validación del teléfono (nunca bloquea la ingesta) -------------------
  let lookup: IngestResult['lookup'] = 'omitido';
  if (phone && !input.skipLookup) {
    const result = await lookupPhone(project.slug, phone, rules.twilio_mode);
    await setPhoneValidation(lead.id, {
      checked_at: result.checked_at,
      valid: result.valid,
      line_type: result.line_type,
      carrier: result.carrier,
      detail: result.detail,
    });
    lookup = result.detail.startsWith('no_se_pudo') ? 'no_se_pudo' : 'ok';
  }

  // --- primer movimiento ----------------------------------------------------
  const enqueued: string[] = [];
  if (input.skipQueue) return { lead, created: true, enqueued, lookup };

  if (scored.grade === rules.notify_owner_grade) {
    const action = await enqueue({
      orgId: project.orgId,
      campaignId: project.id,
      leadId: lead.id,
      kind: 'notify_owner',
      priority: 1,
      status: 'auto',
      reason: `lead grado ${scored.grade} (${scored.score}) recién entrado — ${scored.zone}`,
      payload: {
        text: `Goossip · ${project.name}: lead ${scored.grade} (${scored.score}) ${input.fullName ?? 's/n'} ${phone ?? ''} — ${scored.zone}`,
      },
      createdBy: 'rule:nuevo_lead_grado_a',
    });
    if (action) enqueued.push('notify_owner');
  }

  if (rules.auto_first_contact && phone) {
    const action = await enqueue({
      orgId: project.orgId,
      campaignId: project.id,
      leadId: lead.id,
      kind: 'send_template',
      priority: 2,
      status: 'auto',
      reason: 'primer contacto automático (rules.auto_first_contact)',
      payload: { template: rules.first_contact_template ?? null, to: phone },
      createdBy: 'rule:auto_first_contact',
    });
    if (action) enqueued.push('send_template');
  }

  if (enqueued.length > 0) {
    await recordEvent({
      orgId: project.orgId,
      leadId: lead.id,
      type: 'note',
      actor: 'goossip',
      payload: { encolado: enqueued },
    });
  }

  return { lead, created: true, enqueued, lookup };
}
