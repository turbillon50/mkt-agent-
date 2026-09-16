/**
 * El vendedor. Uno por proyecto: su persona sale de `seller_persona`, su
 * conocimiento de la tabla `knowledge` del proyecto, y el catálogo/precios de
 * las fuentes MCP del cliente (`mcp_sources`).
 *
 * Tres leyes, en este orden:
 *  1. Nunca inventa precios ni disponibilidad. Si no lo tiene por MCP o por
 *     knowledge, dice que lo confirma un asesor.
 *  2. Siempre escala a humano si detecta intención de compra/inversión, un
 *     monto, o que el lead pide hablar con alguien.
 *  3. Si `rules.auto_reply` es false, NO manda: propone y espera el tap del
 *     dueño en /automations.
 */
import { desc, eq, isNull, or } from 'drizzle-orm';
import { db } from '../db/client';
import { knowledge, type Project, type SalesLead } from '../db/schema';
import { chat } from '../openrouter';
import { config } from '../config';
import { mcpCatalogContext, type McpSnippet } from '../sales/mcp';
import { hardEscalation } from '../sales/escalation';
import { resolveRules, type LeadStage } from '../sales/types';

export { hardEscalation };

export const INTENTS = ['info', 'precio', 'cita', 'queja', 'humano', 'spam'] as const;
export type Intent = (typeof INTENTS)[number];

export interface SellerInput {
  project: Project;
  lead: SalesLead | null;
  /** Lo que acaba de escribir el lead. */
  inbound: string;
  /** Últimos mensajes del hilo, del más viejo al más nuevo. */
  history?: Array<{ direction: 'inbound' | 'outbound'; body: string }>;
}

export interface SellerDraft {
  intent: Intent;
  /** true = un humano tiene que entrar. */
  escalate: boolean;
  escalationReason: string | null;
  reply: string;
  /** Stage al que mover el lead si la respuesta sale. */
  suggestedStage: LeadStage | null;
  /** Fuentes MCP que sí contestaron. Vacío = no se citaron precios. */
  sources: McpSnippet[];
  /** false cuando el modelo no estuvo disponible y se usó el guion de respaldo. */
  fromModel: boolean;
}

const MAX_HISTORY = 8;
const REPLY_TIMEOUT_MS = 40_000;

/** Knowledge del proyecto (y la global sin proyecto) para el contexto. */
async function projectKnowledge(project: Project, limit = 6): Promise<string[]> {
  const rows = await db
    .select({ title: knowledge.title, content: knowledge.content })
    .from(knowledge)
    .where(or(eq(knowledge.campaignId, project.id), isNull(knowledge.campaignId)))
    .orderBy(desc(knowledge.createdAt))
    .limit(limit)
    .catch(() => []);
  return rows.map((r) => `${r.title ? `${r.title}: ` : ''}${r.content}`.slice(0, 500));
}

function buildSystem(project: Project, know: string[], snippets: McpSnippet[]): string {
  const persona =
    project.sellerPersona?.trim() ||
    `Eres el asesor de ventas de ${project.name}. Hablas claro, cálido y directo, en español de México.`;

  const catalogo =
    snippets.length > 0
      ? snippets.map((s) => `[${s.source} · ${s.tool}]\n${s.text}`).join('\n\n')
      : 'SIN DATOS DE CATÁLOGO EN ESTE MOMENTO.';

  return [
    persona,
    '',
    'REGLAS QUE NO SE ROMPEN:',
    '- No inventas precios, disponibilidad, plazos ni promociones. Si el dato no está abajo, dices que lo confirma un asesor y ofreces el siguiente paso.',
    '- No prometes nada que no esté escrito abajo.',
    '- Máximo 3 oraciones. Tono de WhatsApp, sin formalismos ni bullets.',
    '- Escribes en el idioma del lead; por defecto español de México.',
    '- Si el lead pide hablar con una persona, aceptas y avisas que lo contactan.',
    '',
    `CATÁLOGO Y PRECIOS REALES (fuente MCP del cliente):\n${catalogo}`,
    '',
    know.length > 0
      ? `CONOCIMIENTO DEL PROYECTO:\n${know.map((k, i) => `[${i + 1}] ${k}`).join('\n')}`
      : 'CONOCIMIENTO DEL PROYECTO: (vacío)',
  ].join('\n');
}

function buildUser(input: SellerInput): string {
  const hist = (input.history ?? []).slice(-MAX_HISTORY);
  const histBlock =
    hist.length > 0
      ? `\nHilo reciente:\n${hist.map((m) => `${m.direction === 'inbound' ? 'Lead' : 'Tú'}: ${m.body}`).join('\n')}\n`
      : '';
  const lead = input.lead;
  const who = lead?.fullName ? `${lead.fullName} (grado ${lead.grade}, etapa ${lead.stage})` : 'un lead nuevo';

  return [
    `Te escribe ${who} por WhatsApp.`,
    histBlock,
    `Mensaje nuevo: "${input.inbound}"`,
    '',
    'Devuelve SOLO un JSON con esta forma exacta:',
    '{"intent":"info|precio|cita|queja|humano|spam","escalate":true|false,"escalation_reason":"por qué o null","reply":"el texto del WhatsApp","suggested_stage":"contactado|interesado|cita_agendada|null"}',
    '',
    'escalate = true si hay intención de compra o inversión, si menciona un monto, o si pide hablar con alguien.',
  ].join('\n');
}

function cleanIntent(v: unknown): Intent {
  return INTENTS.includes(v as Intent) ? (v as Intent) : 'info';
}

function cleanStage(v: unknown): LeadStage | null {
  const allowed: LeadStage[] = ['contactado', 'interesado', 'cita_agendada'];
  return allowed.includes(v as LeadStage) ? (v as LeadStage) : null;
}

/** Guion de respaldo: si el modelo no está, no se queda callado ni miente. */
function fallbackDraft(project: Project, escalation: string | null): SellerDraft {
  return {
    intent: escalation ? 'humano' : 'info',
    escalate: true,
    escalationReason: escalation ?? 'el modelo no respondió',
    reply: `¡Gracias por escribir a ${project.name}! Un asesor te contacta en un momento para darte la información exacta.`,
    suggestedStage: 'contactado',
    sources: [],
    fromModel: false,
  };
}

/**
 * Redacta (no manda). Quien decide si sale o se propone es el runner de la
 * cola, según `rules.auto_reply`.
 */
export async function draftReply(input: SellerInput): Promise<SellerDraft> {
  const { project } = input;
  const hard = hardEscalation(input.inbound);

  const [know, snippets] = await Promise.all([
    projectKnowledge(project).catch(() => [] as string[]),
    mcpCatalogContext(project.mcpSources ?? [], input.inbound).catch(() => [] as McpSnippet[]),
  ]);

  let raw = '';
  try {
    raw = await Promise.race([
      chat(
        [
          { role: 'system', content: buildSystem(project, know, snippets) },
          { role: 'user', content: buildUser(input) },
        ],
        { model: config.openrouter.modelReply, temperature: 0.6, maxTokens: 600 },
      ),
      new Promise<string>((_, rej) => setTimeout(() => rej(new Error('seller timeout')), REPLY_TIMEOUT_MS)),
    ]);
  } catch {
    return { ...fallbackDraft(project, hard), sources: snippets };
  }

  let parsed: Record<string, unknown>;
  try {
    const m = raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/) || raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? (m[1] ?? m[0])! : raw) as Record<string, unknown>;
  } catch {
    // El modelo contestó en prosa: se usa como respuesta y se escala por si acaso.
    const text = raw.trim();
    if (!text) return { ...fallbackDraft(project, hard), sources: snippets };
    return {
      intent: hard ? 'humano' : 'info',
      escalate: true,
      escalationReason: hard ?? 'el modelo no devolvió JSON',
      reply: text.slice(0, 900),
      suggestedStage: 'contactado',
      sources: snippets,
      fromModel: true,
    };
  }

  const reply = String(parsed.reply ?? '').trim();
  if (!reply) return { ...fallbackDraft(project, hard), sources: snippets };

  const modelEscalate = parsed.escalate === true;
  const intent = cleanIntent(parsed.intent);
  const escalate = modelEscalate || hard !== null || intent === 'humano' || intent === 'queja';

  return {
    intent,
    escalate,
    escalationReason: hard ?? (typeof parsed.escalation_reason === 'string' ? parsed.escalation_reason : null),
    reply: reply.slice(0, 900),
    suggestedStage: cleanStage(parsed.suggested_stage) ?? (escalate ? 'interesado' : 'contactado'),
    sources: snippets,
    fromModel: true,
  };
}

/** ¿El vendedor manda solo, o propone y espera aprobación? */
export function sellerMode(project: Project): 'auto' | 'propone' {
  return resolveRules(project.rules).auto_reply ? 'auto' : 'propone';
}
