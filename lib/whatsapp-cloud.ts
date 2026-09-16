/**
 * WhatsApp Cloud API oficial. Reemplaza a Baileys para todo lo que sea cliente:
 * Baileys es una sesión no oficial y no se usa con números de clientes.
 *
 * phone_number_id y token salen del PROYECTO (channels.waba_phone_id + env
 * `WHATSAPP_TOKEN_<SLUG>`), nunca hardcodeados.
 */
import { projectSecret } from './project-secrets';
import type { Project } from '@/src/db/schema';
import type { ProjectChannels } from '@/src/sales/types';

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export interface CloudCreds {
  phoneNumberId: string;
  token: string;
}

export function cloudCreds(project: Project): CloudCreds | null {
  const phoneNumberId = (project.channels as ProjectChannels | null)?.waba_phone_id;
  const token = projectSecret(project.slug, 'WHATSAPP_TOKEN');
  if (!phoneNumberId || !token) return null;
  return { phoneNumberId, token };
}

export type SendOutcome =
  | { ok: true; externalId: string }
  | { ok: false; error: string; code?: number; noWhatsapp?: boolean };

/**
 * Códigos de Cloud API que significan "este número no tiene WhatsApp" o no
 * se puede entregar ahí. Disparan el plan B (SMS o llamar al dueño).
 *   131026 — Message undeliverable (el destino no existe en WhatsApp)
 *   131047 — Re-engagement: la ventana de 24 h se cerró
 *   1013   — Usuario no válido / no está en WhatsApp
 */
const NO_WHATSAPP_CODES = new Set([131026, 1013]);

async function post(creds: CloudCreds, body: Record<string, unknown>): Promise<SendOutcome> {
  try {
    const res = await fetch(`${GRAPH}/${creds.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string; code?: number };
    };
    if (!res.ok || data.error) {
      const code = data.error?.code;
      return {
        ok: false,
        error: data.error?.message ?? `HTTP ${res.status}`,
        code,
        noWhatsapp: code !== undefined && NO_WHATSAPP_CODES.has(code),
      };
    }
    const externalId = data.messages?.[0]?.id ?? '';
    if (!externalId) return { ok: false, error: 'Cloud API no devolvió message id.' };
    return { ok: true, externalId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error de red' };
  }
}

/** Texto libre. Solo válido dentro de la ventana de servicio de 24 h. */
export async function sendText(project: Project, to: string, body: string): Promise<SendOutcome> {
  const creds = cloudCreds(project);
  if (!creds) return { ok: false, error: 'El proyecto no tiene WABA phone id o token en env.' };
  return post(creds, {
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body },
  });
}

export interface TemplateInput {
  to: string;
  name: string;
  language?: string;
  /** URL pública de la imagen del header, si la plantilla lo lleva. */
  headerImageUrl?: string | null;
  /** Variables {{1}}, {{2}}… del cuerpo, en orden. */
  bodyParams?: string[];
}

/** Plantilla aprobada. Es lo único que sale con la ventana de 24 h cerrada. */
export async function sendTemplate(project: Project, input: TemplateInput): Promise<SendOutcome> {
  const creds = cloudCreds(project);
  if (!creds) return { ok: false, error: 'El proyecto no tiene WABA phone id o token en env.' };

  const components: Array<Record<string, unknown>> = [];
  if (input.headerImageUrl) {
    components.push({
      type: 'header',
      parameters: [{ type: 'image', image: { link: input.headerImageUrl } }],
    });
  }
  if (input.bodyParams && input.bodyParams.length > 0) {
    components.push({
      type: 'body',
      parameters: input.bodyParams.map((text) => ({ type: 'text', text })),
    });
  }

  return post(creds, {
    recipient_type: 'individual',
    to: input.to,
    type: 'template',
    template: {
      name: input.name,
      language: { code: input.language ?? 'es_MX' },
      ...(components.length > 0 ? { components } : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Parseo del webhook. Separado del envío para poder probarlo con un payload de
// ejemplo sin tocar la red (ver test/whatsapp-webhook.test.ts).
// ---------------------------------------------------------------------------

export interface InboundMessage {
  phoneNumberId: string;
  from: string;
  externalId: string;
  body: string;
  timestamp: Date;
  profileName?: string;
  type: string;
}

export interface StatusUpdate {
  phoneNumberId: string;
  externalId: string;
  recipient: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  errorCode?: number;
  errorTitle?: string;
}

export interface ParsedWebhook {
  inbound: InboundMessage[];
  statuses: StatusUpdate[];
}

/** Extrae el texto de cualquier tipo de mensaje que sepamos leer. */
function textOf(m: Record<string, any>): string {
  switch (m.type) {
    case 'text':
      return String(m.text?.body ?? '');
    case 'button':
      return String(m.button?.text ?? '');
    case 'interactive':
      return String(
        m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '',
      );
    case 'image':
    case 'video':
    case 'document':
      return String(m[m.type]?.caption ?? `[${m.type}]`);
    case 'audio':
      return '[audio]';
    case 'location':
      return '[ubicación]';
    default:
      return `[${m.type ?? 'desconocido'}]`;
  }
}

export function parseWebhook(payload: unknown): ParsedWebhook {
  const out: ParsedWebhook = { inbound: [], statuses: [] };
  const body = payload as { entry?: Array<{ changes?: Array<{ value?: any }> }> };
  for (const entry of body?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;
      const phoneNumberId = String(value.metadata?.phone_number_id ?? '');
      if (!phoneNumberId) continue;

      const names = new Map<string, string>();
      for (const c of value.contacts ?? []) {
        if (c?.wa_id) names.set(String(c.wa_id), String(c.profile?.name ?? ''));
      }

      for (const m of value.messages ?? []) {
        const from = String(m.from ?? '');
        const externalId = String(m.id ?? '');
        if (!from || !externalId) continue;
        out.inbound.push({
          phoneNumberId,
          from,
          externalId,
          body: textOf(m),
          timestamp: new Date(Number(m.timestamp ?? 0) * 1000 || Date.now()),
          profileName: names.get(from) || undefined,
          type: String(m.type ?? 'text'),
        });
      }

      for (const s of value.statuses ?? []) {
        const externalId = String(s.id ?? '');
        const status = String(s.status ?? '');
        if (!externalId || !['sent', 'delivered', 'read', 'failed'].includes(status)) continue;
        const err = Array.isArray(s.errors) ? s.errors[0] : undefined;
        out.statuses.push({
          phoneNumberId,
          externalId,
          recipient: String(s.recipient_id ?? ''),
          status: status as StatusUpdate['status'],
          errorCode: err?.code !== undefined ? Number(err.code) : undefined,
          errorTitle: err?.title ? String(err.title) : undefined,
        });
      }
    }
  }
  return out;
}

/** ¿El `failed` es porque el número no tiene WhatsApp? */
export function isNoWhatsappError(code: number | undefined): boolean {
  return code !== undefined && NO_WHATSAPP_CODES.has(code);
}
