import { config } from '../config';
import { upsertInbound, insertMessage } from './repo';
import { sendViaBridge } from './bridge';
import { chat } from '../openrouter';
import { recall, remember } from '../memory/index';

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

function buildAgentPrompt(p: InboundPayload, recentBodies: string[]): string {
  const ctx = recentBodies.length > 0
    ? `\n\nHistorial reciente con este contacto:\n${recentBodies.slice(0, 6).map((b, i) => `${i + 1}. ${b}`).join('\n')}`
    : '';
  return [
    `Eres Goossip, el asistente de la marca "${config.brand.name}".`,
    `Te llegó un mensaje de WhatsApp de ${p.pushName ?? p.from}.`,
    `Responde en ${config.brand.language === 'es' ? 'español' : 'el idioma del usuario'}, en tono ${config.brand.voice}.`,
    `Máximo 3 oraciones. No inventes datos. Si el usuario pide algo fuera de tu alcance, dilo y ofrece capturar el contexto.`,
    ctx,
    ``,
    `Mensaje recibido: "${p.body}"`,
    ``,
    `Tu respuesta (solo el texto, sin prefijos):`,
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
    const memories = await recall(`whatsapp ${payload.from} ${payload.body}`, {
      k: 6,
      refType: 'whatsapp',
    }).catch(() => []);
    const prompt = buildAgentPrompt(payload, memories.map((m) => m.content));
    // Auto-reply uses the cheap "reply" tier — no tool calling needed.
    replyText = await Promise.race([
      chat(
        [
          { role: 'system', content: 'You are Goossip, replying on WhatsApp. Be brief and helpful.' },
          { role: 'user', content: prompt },
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
