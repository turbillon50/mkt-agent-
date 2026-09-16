/**
 * Qué pasa cuando un lead escribe por WhatsApp.
 *
 * inbound → lead (se busca o se crea) → conversación → mensaje → ventana 24 h →
 * vendedor. El vendedor REDACTA; si `rules.auto_reply` es false no sale nada:
 * se encola `propose_reply` y el dueño aprueba con un tap.
 */
import { draftReply } from '../agent/seller';
import { sendText } from '../../lib/whatsapp-cloud';
import type { InboundMessage, StatusUpdate } from '../../lib/whatsapp-cloud';
import type { Project } from '../db/schema';
import { enqueue } from './queue';
import {
  findLeadByPhone,
  getOrCreateConversation,
  insertMessage,
  listMessages,
  moveStage,
  recordEvent,
  setConversationStatus,
  touchInbound,
  touchOutbound,
  updateDeliveryStatus,
} from './repo';
import { scoreLead } from './scoring';
import { upsertLead } from './repo';
import { resolveRules } from './types';

export interface InboundOutcome {
  leadId: string;
  conversationId: string;
  /** 'sent' = salió sola · 'proposed' = espera aprobación · 'none' = no se redactó. */
  reply: 'sent' | 'proposed' | 'none';
  intent: string;
  escalated: boolean;
  ms: number;
}

export async function handleCloudInbound(
  project: Project,
  msg: InboundMessage,
): Promise<InboundOutcome> {
  const t0 = Date.now();
  const rules = resolveRules(project.rules);
  const phone = `+${msg.from.replace(/^\+/, '')}`;

  // --- lead ----------------------------------------------------------------
  let lead = await findLeadByPhone(project.id, phone);
  if (!lead) {
    const scored = scoreLead({ fullName: msg.profileName ?? null, phone, createdAt: msg.timestamp });
    const created = await upsertLead({
      userId: project.userId,
      campaignId: project.id,
      phone,
      fullName: msg.profileName ?? null,
      source: 'site',
      sourceRef: null,
      score: scored.score,
      grade: scored.grade,
      scoreBreakdown: { base: 40, signals: scored.signals, zone: scored.zone, lada: scored.lada, country: scored.country },
      stage: 'contactado',
      raw: { origen: 'whatsapp_inbound', wa_id: msg.from },
    });
    lead = created.lead;
  }

  // --- conversación y mensaje ----------------------------------------------
  const conv = await getOrCreateConversation({
    campaignId: project.id,
    leadId: lead.id,
    channel: 'whatsapp',
    externalThreadId: msg.from,
  });
  const stored = await insertMessage({
    conversationId: conv.id,
    direction: 'inbound',
    body: msg.body,
    externalId: msg.externalId,
    createdAt: msg.timestamp,
  });
  // Reintento de Meta con el mismo message id: ya estaba, no se contesta dos veces.
  if (!stored) {
    return { leadId: lead.id, conversationId: conv.id, reply: 'none', intent: 'duplicado', escalated: false, ms: Date.now() - t0 };
  }

  await touchInbound(conv.id, msg.timestamp);
  await recordEvent({ leadId: lead.id, type: 'message_in', actor: 'lead', payload: { body: msg.body.slice(0, 500) } });
  await moveStage(lead.id, 'contactado', 'goossip');

  // --- vendedor -------------------------------------------------------------
  const history = (await listMessages(conv.id, 12)).map((m) => ({
    direction: m.direction,
    body: m.body,
  }));

  const draft = await draftReply({ project, lead, inbound: msg.body, history });

  if (draft.escalate) {
    await setConversationStatus(conv.id, 'escalated');
    await enqueue({
      campaignId: project.id,
      leadId: lead.id,
      kind: 'notify_owner',
      priority: 1,
      status: 'auto',
      reason: `escalado a humano: ${draft.escalationReason ?? 'intención de compra'}`,
      payload: {
        text: `Goossip · ${project.name}: ${lead.fullName ?? phone} necesita un humano — ${draft.escalationReason ?? draft.intent}. Dijo: "${msg.body.slice(0, 120)}"`,
      },
      createdBy: 'seller:escalacion',
    });
    await recordEvent({
      leadId: lead.id,
      type: 'note',
      actor: 'goossip',
      payload: { escalado: true, motivo: draft.escalationReason, intent: draft.intent },
    });
  }

  if (!draft.reply) {
    return { leadId: lead.id, conversationId: conv.id, reply: 'none', intent: draft.intent, escalated: draft.escalate, ms: Date.now() - t0 };
  }

  // --- ¿sale sola o se propone? --------------------------------------------
  if (!rules.auto_reply) {
    await enqueue({
      campaignId: project.id,
      leadId: lead.id,
      kind: 'propose_reply',
      priority: draft.escalate ? 2 : 4,
      status: 'pending',
      reason: `respuesta propuesta (intención: ${draft.intent}${draft.sources.length ? ` · catálogo: ${draft.sources.map((s) => s.source).join(', ')}` : ' · sin datos de catálogo'})`,
      payload: {
        reply: draft.reply,
        to: phone,
        intent: draft.intent,
        suggested_stage: draft.suggestedStage,
        from_model: draft.fromModel,
      },
      createdBy: 'seller',
    });
    return { leadId: lead.id, conversationId: conv.id, reply: 'proposed', intent: draft.intent, escalated: draft.escalate, ms: Date.now() - t0 };
  }

  const sent = await sendText(project, phone, draft.reply);
  if (!sent.ok) {
    // No se pudo mandar: se propone para que no se pierda el trabajo del vendedor.
    await enqueue({
      campaignId: project.id,
      leadId: lead.id,
      kind: 'propose_reply',
      priority: 2,
      status: 'pending',
      reason: `auto_reply falló (${sent.error}) — queda propuesta`,
      payload: { reply: draft.reply, to: phone, intent: draft.intent, suggested_stage: draft.suggestedStage },
      createdBy: 'seller',
    });
    return { leadId: lead.id, conversationId: conv.id, reply: 'proposed', intent: draft.intent, escalated: draft.escalate, ms: Date.now() - t0 };
  }

  await insertMessage({
    conversationId: conv.id,
    direction: 'outbound',
    body: draft.reply,
    externalId: sent.externalId,
    deliveryStatus: 'sent',
    respondedBy: 'goossip',
  });
  await touchOutbound(conv.id, new Date());
  await recordEvent({
    leadId: lead.id,
    type: 'message_out',
    actor: 'goossip',
    payload: { intent: draft.intent, external_id: sent.externalId },
  });
  if (draft.suggestedStage) await moveStage(lead.id, draft.suggestedStage, 'goossip');

  return { leadId: lead.id, conversationId: conv.id, reply: 'sent', intent: draft.intent, escalated: draft.escalate, ms: Date.now() - t0 };
}

/**
 * Acuse de Cloud API. El caso que importa: `failed` porque el número no tiene
 * WhatsApp → se marca `no_whatsapp` y se busca otra vía.
 */
export async function handleStatusUpdate(project: Project, s: StatusUpdate): Promise<{ updated: boolean; noWhatsapp: boolean }> {
  const { isNoWhatsappError } = await import('../../lib/whatsapp-cloud');
  const noWhatsapp = s.status === 'failed' && isNoWhatsappError(s.errorCode);
  const status = noWhatsapp ? 'no_whatsapp' : s.status;

  const row = await updateDeliveryStatus(s.externalId, status);
  // Si el mensaje no es nuestro (salió por fuera de Goossip) igual seguimos con
  // el plan B: lo que importa es que ese número NO tiene WhatsApp.
  if (!noWhatsapp) return { updated: row !== null, noWhatsapp: false };

  const rules = resolveRules(project.rules);
  const to = s.recipient ? `+${s.recipient.replace(/^\+/, '')}` : null;
  const lead = to ? await findLeadByPhone(project.id, to) : null;

  if (lead) {
    await recordEvent({
      leadId: lead.id,
      type: 'note',
      actor: 'goossip',
      payload: { delivery: 'no_whatsapp', error_code: s.errorCode, error: s.errorTitle },
    });
  }

  // Con Twilio pagado se intenta SMS; en trial se le avisa al dueño que marque.
  await enqueue({
    campaignId: project.id,
    leadId: lead?.id ?? null,
    kind: rules.twilio_mode === 'paid' ? 'send_sms' : 'notify_owner',
    priority: 2,
    status: rules.twilio_mode === 'paid' ? 'pending' : 'auto',
    reason: `el número ${to ?? ''} no tiene WhatsApp (${s.errorTitle ?? s.errorCode ?? 'failed'})`,
    payload:
      rules.twilio_mode === 'paid'
        ? { to }
        : { text: `Goossip · ${project.name}: ${to ?? 'un lead'} no tiene WhatsApp. Hay que marcarle.` },
    createdBy: 'rule:no_whatsapp',
  });

  return { updated: row !== null, noWhatsapp: true };
}
