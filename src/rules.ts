/**
 * Reglas por proyecto. Barren los leads y ENCOLAN; no mandan nada. Quien manda
 * es el runner (src/sales/runner.ts), que respeta rate limit y ventana de 24 h.
 *
 * Reglas de la corrida 1 (los timers son configurables en `campaigns.rules`):
 *   - sin contacto a 2 h            → send_template
 *   - sin respuesta a 72 h          → send_sms  (en trial se queda esperando)
 *   - sin respuesta a 7 d           → retarget  (propuesto: no hay Ads API aún)
 *   - lead nuevo de grado A         → notify_owner inmediato
 */
import { and, eq, notInArray } from 'drizzle-orm';
import { db } from './db/client';
import { conversations, salesLeads, type Project, type SalesLead } from './db/schema';
import { enqueue, hasActionForLead } from './sales/queue';
import { resolveRules } from './sales/types';

const HOUR_MS = 3_600_000;
const MAX_LEADS_PER_SWEEP = 500;

export interface RuleHit {
  rule: string;
  leadId: string;
  kind: string;
  reason: string;
}

interface LeadRow {
  lead: SalesLead;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
}

async function activeLeads(campaignId: string): Promise<LeadRow[]> {
  const rows = await db
    .select({
      lead: salesLeads,
      lastInboundAt: conversations.lastInboundAt,
      lastOutboundAt: conversations.lastOutboundAt,
    })
    .from(salesLeads)
    .leftJoin(
      conversations,
      and(eq(conversations.leadId, salesLeads.id), eq(conversations.channel, 'whatsapp')),
    )
    .where(
      and(
        eq(salesLeads.campaignId, campaignId),
        notInArray(salesLeads.stage, ['cerrado', 'perdido']),
      ),
    )
    .limit(MAX_LEADS_PER_SWEEP);
  return rows;
}

/** Corre las reglas de UN proyecto y devuelve lo que encoló. */
export async function evaluateProject(project: Project, now = new Date()): Promise<RuleHit[]> {
  const rules = resolveRules(project.rules);
  const hits: RuleHit[] = [];
  const rows = await activeLeads(project.id);

  for (const { lead, lastInboundAt, lastOutboundAt } of rows) {
    const ageH = (now.getTime() - lead.createdAt.getTime()) / HOUR_MS;

    // --- lead NUEVO de grado A → avisarle al dueño ya -----------------------
    // Ojo con el `stage === 'nuevo'`: sin él, la primera corrida después de una
    // importación le dispara un SMS al dueño por cada lead histórico grado A.
    if (
      lead.stage === 'nuevo' &&
      lead.grade === rules.notify_owner_grade &&
      !(await hasActionForLead(lead.id, 'notify_owner'))
    ) {
      const reason = `lead grado ${lead.grade} (${lead.score}) sin avisar al dueño`;
      const a = await enqueue({
        campaignId: project.id,
        leadId: lead.id,
        kind: 'notify_owner',
        priority: 1,
        status: 'auto',
        reason,
        payload: {
          text: `Goossip · ${project.name}: lead ${lead.grade} (${lead.score}) ${lead.fullName ?? 's/n'} ${lead.phone ?? ''}`,
        },
        createdBy: 'rule:nuevo_lead_grado_a',
      });
      if (a) hits.push({ rule: 'nuevo_lead_grado_a', leadId: lead.id, kind: 'notify_owner', reason });
    }

    // --- sin contacto a N horas → plantilla de primer contacto --------------
    if (
      lead.stage === 'nuevo' &&
      !lastOutboundAt &&
      ageH >= rules.no_contact_hours &&
      lead.phone &&
      !(await hasActionForLead(lead.id, 'send_template'))
    ) {
      const reason = `sin contacto ${Math.floor(ageH)} h (umbral ${rules.no_contact_hours} h)`;
      const a = await enqueue({
        campaignId: project.id,
        leadId: lead.id,
        kind: 'send_template',
        priority: 3,
        status: rules.auto_first_contact ? 'auto' : 'pending',
        reason,
        payload: { template: rules.first_contact_template ?? null, to: lead.phone },
        createdBy: 'rule:sin_contacto',
      });
      if (a) hits.push({ rule: 'sin_contacto', leadId: lead.id, kind: 'send_template', reason });
    }

    if (!lastOutboundAt || lastInboundAt) continue;
    const silenceH = (now.getTime() - lastOutboundAt.getTime()) / HOUR_MS;

    // --- sin respuesta a 72 h → SMS ----------------------------------------
    if (
      silenceH >= rules.no_reply_sms_hours &&
      lead.phone &&
      !(await hasActionForLead(lead.id, 'send_sms'))
    ) {
      const trial = rules.twilio_mode === 'trial';
      const reason = trial
        ? `twilio_trial · sin respuesta ${Math.floor(silenceH)} h — esperando a que se abra la llave`
        : `sin respuesta ${Math.floor(silenceH)} h (umbral ${rules.no_reply_sms_hours} h)`;
      const a = await enqueue({
        campaignId: project.id,
        leadId: lead.id,
        kind: 'send_sms',
        priority: 4,
        // En trial el SMS a un lead NO sale: se queda esperando, no falla.
        status: 'pending',
        reason,
        payload: { to: lead.phone, twilio_mode: rules.twilio_mode },
        createdBy: 'rule:sin_respuesta_sms',
      });
      if (a) hits.push({ rule: 'sin_respuesta_sms', leadId: lead.id, kind: 'send_sms', reason });
    }

    // --- sin respuesta a 7 d → retarget (propuesto) -------------------------
    if (
      silenceH >= rules.no_reply_retarget_hours &&
      !(await hasActionForLead(lead.id, 'retarget'))
    ) {
      const reason = `sin respuesta ${Math.floor(silenceH / 24)} d — propuesta de retargeting (falta Ads API)`;
      const a = await enqueue({
        campaignId: project.id,
        leadId: lead.id,
        kind: 'retarget',
        priority: 8,
        status: 'pending',
        reason,
        payload: { ad_account: (project.channels ?? {}).meta_ad_account ?? null },
        createdBy: 'rule:sin_respuesta_retarget',
      });
      if (a) hits.push({ rule: 'sin_respuesta_retarget', leadId: lead.id, kind: 'retarget', reason });
    }
  }

  return hits;
}

/** Cuántas reglas están activas en un proyecto (para el reporte y el panel). */
export function activeRuleCount(project: Project): number {
  const r = resolveRules(project.rules);
  let n = 0;
  if (r.no_contact_hours > 0) n++;
  if (r.no_reply_sms_hours > 0) n++;
  if (r.no_reply_retarget_hours > 0) n++;
  if (r.notify_owner_grade) n++;
  return n;
}
