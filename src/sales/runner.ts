/**
 * Runner de la cola. Lo llama /api/cron/queue cada minuto.
 *
 * Solo ejecuta lo que está `approved` (el dueño le dio tap) o `auto` (la regla
 * del proyecto lo permite). Respeta rate limit por corrida y por proyecto, y
 * la ventana de 24 h de WhatsApp.
 */
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { campaigns, type Project, type QueuedAction } from '../db/schema';
import { sendSms } from '../../lib/twilio';
import { sendTemplate, sendText } from '../../lib/whatsapp-cloud';
import { dueActions, setStatus } from './queue';
import {
  findConversationByLead,
  getLead,
  getOrCreateConversation,
  insertMessage,
  moveStage,
  recordEvent,
  touchOutbound,
  windowIsOpen,
} from './repo';
import { resolveRules } from './types';

/** Tope por corrida. Vercel dispara cada minuto; no se vacía la cola de golpe. */
export const RUNNER_MAX_PER_RUN = Number(process.env.QUEUE_MAX_PER_RUN ?? 20);
export const RUNNER_MAX_PER_PROJECT = Number(process.env.QUEUE_MAX_PER_PROJECT ?? 8);

export interface ExecOutcome {
  /** Se hizo y se marca `executed`. */
  ok: boolean;
  /** Se deja `pending`: no es un error, es que todavía no se puede. */
  skipped?: boolean;
  reason?: string;
  detail?: Record<string, unknown>;
}

export interface RunReport {
  considered: number;
  executed: number;
  skipped: number;
  failed: number;
  byKind: Record<string, number>;
  waiting: Array<{ id: string; kind: string; reason: string }>;
}

async function projectsById(ids: string[]): Promise<Map<string, Project>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select().from(campaigns).where(inArray(campaigns.id, ids));
  return new Map(rows.map((r) => [r.id, r]));
}

// ---------------------------------------------------------------------------
// Ejecutores por tipo de acción
// ---------------------------------------------------------------------------

/**
 * Avisarle al dueño. Ya no muere por falta de `owner_phone`.
 *
 * Toda la escalera (SMS → Gmail del proyecto → Resend de la casa) vive en
 * `./aviso-al-dueno.ts`, con el porqué de cada peldaño. Aquí solo queda la
 * traducción a `ExecOutcome`, y lo importante es la última rama: sin ningún
 * canal configurado la acción se queda **`pending`** con el motivo, no `failed`.
 * Un `failed` invita a reintentar algo que nunca va a salir; un `pending` que
 * dice "pon tu correo en Ajustes" se arregla solo en cuanto alguien lo pone.
 */
async function execNotifyOwner(project: Project, action: QueuedAction): Promise<ExecOutcome> {
  const rules = resolveRules(project.rules);
  const text = String(action.payload?.text ?? `Goossip · ${project.name}: acción pendiente.`);

  const { avisarAlDueno } = await import('./aviso-al-dueno');
  const r = await avisarAlDueno({
    project,
    texto: text,
    // En trial el SMS a un número no verificado no sale: probarlo primero solo
    // gasta el tiempo del cron.
    preferirCorreo: rules.twilio_mode === 'trial' && Boolean(rules.owner_email),
  });

  if (r.ok) return { ok: true, detail: { via: r.via, intentos: r.intentos, ...(r.detalle ?? {}) } };
  return {
    ok: false,
    skipped: true,
    reason: r.motivo ?? 'no se pudo avisar por ninguna vía',
    detail: { intentos: r.intentos },
  };
}

async function execSendTemplate(project: Project, action: QueuedAction): Promise<ExecOutcome> {
  const lead = action.leadId ? await getLead(action.leadId) : null;
  const to = String(action.payload?.to ?? lead?.phone ?? '');
  const template = String(action.payload?.template ?? resolveRules(project.rules).first_contact_template ?? '');
  if (!to) return { ok: false, reason: 'el lead no tiene teléfono' };
  if (!template) {
    return { ok: false, skipped: true, reason: 'sin plantilla aprobada configurada (rules.first_contact_template)' };
  }

  const res = await sendTemplate(project, {
    to,
    name: template,
    language: String(action.payload?.language ?? 'es_MX'),
    headerImageUrl: (action.payload?.header_image_url as string | undefined) ?? null,
    bodyParams: Array.isArray(action.payload?.body_params)
      ? (action.payload.body_params as string[])
      : lead?.fullName
        ? [lead.fullName.split(/\s+/)[0]!]
        : undefined,
  });

  if (!res.ok) {
    if (res.noWhatsapp && lead) {
      await onNoWhatsapp(project, lead.id, to);
      return { ok: false, reason: `sin WhatsApp: ${res.error}`, detail: { no_whatsapp: true } };
    }
    return { ok: false, reason: res.error };
  }

  if (lead) {
    const conv = await getOrCreateConversation({
      orgId: project.orgId,
      campaignId: project.id,
      leadId: lead.id,
      channel: 'whatsapp',
      externalThreadId: to.replace(/^\+/, ''),
    });
    await insertMessage({
      orgId: project.orgId,
      conversationId: conv.id,
      direction: 'outbound',
      body: `[plantilla ${template}]`,
      templateName: template,
      externalId: res.externalId,
      deliveryStatus: 'sent',
      respondedBy: 'goossip',
    });
    await touchOutbound(conv.id, new Date());
    await recordEvent({
      orgId: project.orgId,
      leadId: lead.id,
      type: 'message_out',
      actor: 'goossip',
      payload: { template, external_id: res.externalId },
    });
    await moveStage(lead.id, 'contactado', 'goossip');
  }
  return { ok: true, detail: { external_id: res.externalId } };
}

async function execSendSms(project: Project, action: QueuedAction): Promise<ExecOutcome> {
  const rules = resolveRules(project.rules);
  const lead = action.leadId ? await getLead(action.leadId) : null;
  const to = String(action.payload?.to ?? lead?.phone ?? '');
  const from = project.channels?.twilio_number ?? process.env.TWILIO_FROM ?? '';
  if (!to) return { ok: false, reason: 'el lead no tiene teléfono' };

  const body = String(
    action.payload?.text ??
      `Hola${lead?.fullName ? ` ${lead.fullName.split(/\s+/)[0]}` : ''}, te escribimos de ${project.name}. ¿Te late que te marquemos?`,
  );

  // En trial esto NO sale a un lead: el propio sendSms lo corta.
  const res = await sendSms({ slug: project.slug, from, to, body, mode: rules.twilio_mode });
  if (res.ok) {
    if (lead) {
      const conv = await getOrCreateConversation({
        orgId: project.orgId,
        campaignId: project.id,
        leadId: lead.id,
        channel: 'sms',
        externalThreadId: to.replace(/^\+/, ''),
      });
      await insertMessage({
        orgId: project.orgId,
        conversationId: conv.id,
        direction: 'outbound',
        body,
        externalId: res.sid || null,
        deliveryStatus: 'sent',
        respondedBy: 'goossip',
      });
      await touchOutbound(conv.id, new Date());
      await recordEvent({ orgId: project.orgId, leadId: lead.id, type: 'message_out', actor: 'goossip', payload: { channel: 'sms' } });
    }
    return { ok: true, detail: { sid: res.sid } };
  }
  if (res.skipped) return { ok: false, skipped: true, reason: 'twilio_trial' };
  return { ok: false, reason: res.error };
}

async function execProposeReply(project: Project, action: QueuedAction): Promise<ExecOutcome> {
  const lead = action.leadId ? await getLead(action.leadId) : null;
  const text = String(action.payload?.reply ?? '').trim();
  const to = String(action.payload?.to ?? lead?.phone ?? '');
  if (!text) return { ok: false, reason: 'la propuesta no trae texto' };
  if (!to) return { ok: false, reason: 'el lead no tiene teléfono' };

  const conv = lead ? await findConversationByLead(lead.id, 'whatsapp') : null;
  // Texto libre solo dentro de la ventana de 24 h. Fuera de ella toca plantilla.
  if (conv && !windowIsOpen(conv)) {
    return { ok: false, skipped: true, reason: 'ventana de 24 h cerrada — hace falta plantilla' };
  }

  const res = await sendText(project, to, text);
  if (!res.ok) {
    if (res.noWhatsapp && lead) {
      await onNoWhatsapp(project, lead.id, to);
      return { ok: false, reason: `sin WhatsApp: ${res.error}`, detail: { no_whatsapp: true } };
    }
    return { ok: false, reason: res.error };
  }

  const conversation =
    conv ??
    (lead
      ? await getOrCreateConversation({
          orgId: project.orgId,
          campaignId: project.id,
          leadId: lead.id,
          channel: 'whatsapp',
          externalThreadId: to.replace(/^\+/, ''),
        })
      : null);

  if (conversation) {
    await insertMessage({
      orgId: project.orgId,
      conversationId: conversation.id,
      direction: 'outbound',
      body: text,
      externalId: res.externalId,
      deliveryStatus: 'sent',
      respondedBy: String(action.approvedBy ?? 'goossip'),
    });
    await touchOutbound(conversation.id, new Date());
  }
  if (lead) {
    await recordEvent({
      orgId: project.orgId,
      leadId: lead.id,
      type: 'message_out',
      actor: String(action.approvedBy ?? 'goossip'),
      payload: { external_id: res.externalId, intent: action.payload?.intent ?? null },
    });
    const suggested = action.payload?.suggested_stage;
    if (typeof suggested === 'string') {
      await moveStage(lead.id, suggested as never, 'goossip');
    } else {
      await moveStage(lead.id, 'contactado', 'goossip');
    }
  }
  return { ok: true, detail: { external_id: res.externalId } };
}

/** Número sin WhatsApp: se marca y se busca otra vía. */
async function onNoWhatsapp(project: Project, leadId: string, to: string): Promise<void> {
  const rules = resolveRules(project.rules);
  const { enqueue } = await import('./queue');
  await recordEvent({ orgId: project.orgId, leadId, type: 'note', actor: 'goossip', payload: { delivery: 'no_whatsapp', to } });
  await enqueue({
    orgId: project.orgId,
    campaignId: project.id,
    leadId,
    kind: rules.twilio_mode === 'paid' ? 'send_sms' : 'notify_owner',
    priority: 2,
    status: rules.twilio_mode === 'paid' ? 'pending' : 'auto',
    reason: `el número no tiene WhatsApp — ${rules.twilio_mode === 'paid' ? 'plan B por SMS' : 'hay que marcarle'}`,
    payload:
      rules.twilio_mode === 'paid'
        ? { to }
        : { text: `Goossip · ${project.name}: ${to} no tiene WhatsApp. Hay que marcarle.` },
    createdBy: 'rule:no_whatsapp',
  });
}

async function execute(project: Project, action: QueuedAction): Promise<ExecOutcome> {
  switch (action.kind) {
    case 'notify_owner':
      return execNotifyOwner(project, action);
    case 'send_template':
      return execSendTemplate(project, action);
    case 'send_sms':
      return execSendSms(project, action);
    case 'propose_reply':
      return execProposeReply(project, action);
    case 'retarget':
      return { ok: false, skipped: true, reason: 'falta Ads API (ads_management) — queda propuesto' };
    case 'propose_campaign':
      return { ok: false, skipped: true, reason: 'propuesta de campaña: la aprueba y la ejecuta un humano' };
    default:
      return { ok: false, reason: `tipo de acción desconocido: ${action.kind}` };
  }
}

// ---------------------------------------------------------------------------
// Corrida
// ---------------------------------------------------------------------------

export async function runQueue(now = new Date()): Promise<RunReport> {
  const report: RunReport = { considered: 0, executed: 0, skipped: 0, failed: 0, byKind: {}, waiting: [] };
  const batch = await dueActions(RUNNER_MAX_PER_RUN);
  report.considered = batch.length;
  if (batch.length === 0) return report;

  const projects = await projectsById([...new Set(batch.map((a) => a.campaignId))]);
  const perProject = new Map<string, number>();

  for (const action of batch) {
    const used = perProject.get(action.campaignId) ?? 0;
    if (used >= RUNNER_MAX_PER_PROJECT) {
      report.skipped++;
      report.waiting.push({ id: action.id, kind: action.kind, reason: 'rate limit del proyecto' });
      continue;
    }

    const project = projects.get(action.campaignId);
    if (!project) {
      await setStatus(action.id, 'failed', { result: { error: 'proyecto inexistente' }, executedAt: now });
      report.failed++;
      continue;
    }

    perProject.set(action.campaignId, used + 1);
    let outcome: ExecOutcome;
    try {
      outcome = await execute(project, action);
    } catch (e) {
      outcome = { ok: false, reason: e instanceof Error ? e.message : 'error inesperado' };
    }

    if (outcome.ok) {
      await setStatus(action.id, 'executed', { result: outcome.detail ?? {}, executedAt: new Date() });
      report.executed++;
      report.byKind[action.kind] = (report.byKind[action.kind] ?? 0) + 1;
    } else if (outcome.skipped) {
      // Se queda esperando. No es falla: es que todavía no se puede.
      // El detalle va junto al motivo: sin él, "no salió por ninguna vía" no
      // dice CUÁL se intentó ni por qué, que es lo único útil para arreglarlo.
      await setStatus(action.id, 'pending', {
        result: { esperando: outcome.reason, ...(outcome.detail ?? {}) },
      });
      report.skipped++;
      report.waiting.push({ id: action.id, kind: action.kind, reason: outcome.reason ?? 'sin motivo' });
    } else {
      await setStatus(action.id, 'failed', { result: { error: outcome.reason }, executedAt: new Date() });
      report.failed++;
    }
  }

  return report;
}
