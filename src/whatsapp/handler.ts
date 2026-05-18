import { config } from '../config';
import { upsertInbound, insertMessage } from './repo';
import { sendViaBridge } from './bridge';
import { chat } from '../openrouter';
import { recall, remember } from '../memory/index';
import { buildClientManifesto } from '../agent/manifesto';

export interface InboundPayload {
  externalId: string;
  from: string;
  body: string;
  timestamp: number;
  pushName?: string;
}

export interface InboundResult {
  stored: boolean;
  replied: boolean;
  replyText?: string;
  replyId?: string;
}

const REPLY_TIMEOUT_MS = 45_000;

function buildClientUserPrompt(p: InboundPayload, recentBodies: string[]): string {
  const ctx = recentBodies.length > 0
    ? `\n\nHistorial reciente con este contacto:\n${recentBodies.slice(0, 6).map((b, i) => `${i + 1}. ${b}`).join('\n')}`
    : '';
  return [
    `Te llegó un WhatsApp de ${p.pushName ?? p.from}.`,
    `Máximo 3-4 oraciones. Espeja el tono del lead. No inventes datos.`,
    `Si pide algo fuera de tu conocimiento, dilo y propón un siguiente paso suave.`,
    ctx,
    ``,
    `Mensaje recibido: "${p.body}"`,
    ``,
    `Tu respuesta (solo el texto del WhatsApp, sin prefijos):`,
  ].join('\n');
}

export async function handleInbound(payload: InboundPayload): Promise<InboundResult> {
  const inbound = await upsertInbound({
    externalId: payload.externalId,
    fromNumber: payload.from,
    body: payload.body,
    direction: 'inbound',
    messageTimestamp: new Date(payload.timestamp * 1000),
    metadata: payload.pushName ? { pushName: payload.pushName } : undefined,
  });
  if (!inbound) return { stored: false, replied: false };

  await remember({
    refType: 'whatsapp',
    refId: inbound.id,
    content: payload.body,
    metadata: { from: payload.from, direction: 'inbound' },
  }).catch(() => undefined);

  if (!config.whatsapp.autoReply) {
    return { stored: true, replied: false };
  }

  let replyText = '';
  try {
    const [memories, brandKnowledge] = await Promise.all([
      recall(`whatsapp ${payload.from} ${payload.body}`, { k: 6, refType: 'whatsapp' }).catch(() => []),
      recall(payload.body, { k: 5, refType: 'knowledge' }).catch(() => []),
    ]);
    const userPrompt = buildClientUserPrompt(payload, memories.map((m) => m.content));
    const knowledgeBlock = brandKnowledge.length > 0
      ? `\n\nConocimiento relevante de la marca (úsalo si aplica):\n${brandKnowledge.map((m, i) => `[${i + 1}] ${m.content.slice(0, 300)}`).join('\n')}`
      : '';
    // Modo CLIENT (profesional, no juguetón) — usa el tier "reply" barato.
    replyText = await Promise.race([
      chat(
        [
          { role: 'system', content: buildClientManifesto(config.brand) + knowledgeBlock },
          { role: 'user', content: userPrompt },
        ],
        { model: config.openrouter.modelReply, temperature: 0.7, maxTokens: 400 },
      ),
      new Promise<string>((_, rej) => setTimeout(() => rej(new Error('reply timeout')), REPLY_TIMEOUT_MS)),
    ]);
    replyText = replyText.trim();
  } catch (e) {
    return { stored: true, replied: false };
  }

  if (!replyText) return { stored: true, replied: false };

  let externalId: string | undefined;
  try {
    const sent = await sendViaBridge(payload.from, replyText);
    externalId = sent.id;
  } catch {
    return { stored: true, replied: false, replyText };
  }

  const outbound = await insertMessage({
    externalId: externalId ?? null,
    fromNumber: payload.from,
    toNumber: payload.from,
    body: replyText,
    direction: 'outbound',
    respondedBy: 'goossip',
    messageTimestamp: new Date(),
  });

  await remember({
    refType: 'whatsapp',
    refId: outbound.id,
    content: replyText,
    metadata: { to: payload.from, direction: 'outbound', respondedBy: 'goossip' },
  }).catch(() => undefined);

  return { stored: true, replied: true, replyText, replyId: outbound.id };
}
