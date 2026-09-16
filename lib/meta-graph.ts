/**
 * Meta Graph API: verificación de firma de webhooks y lectura de un lead de
 * Lead Ads. El App Secret y el Page Token viven en env, nunca en la base.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { projectSecret } from './project-secrets';

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';
export const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/**
 * Valida X-Hub-Signature-256 contra el cuerpo CRUDO. Comparación en tiempo
 * constante: un `===` filtra la firma byte a byte.
 */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !appSecret) return false;
  const [algo, sent] = header.split('=');
  if (algo !== 'sha256' || !sent) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(sent, 'hex');
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Respuesta al handshake GET de Meta (hub.challenge). */
export function verifyChallenge(
  params: URLSearchParams,
  expectedToken: string | undefined,
): { ok: true; challenge: string } | { ok: false; reason: string } {
  if (!expectedToken) return { ok: false, reason: 'verify token no configurado' };
  if (params.get('hub.mode') !== 'subscribe') return { ok: false, reason: 'modo inválido' };
  if (params.get('hub.verify_token') !== expectedToken) return { ok: false, reason: 'verify token inválido' };
  const challenge = params.get('hub.challenge');
  if (!challenge) return { ok: false, reason: 'sin challenge' };
  return { ok: true, challenge };
}

export interface LeadgenFields {
  fullName: string;
  phone: string;
  email: string | null;
  createdAt: Date;
  formId: string | null;
  platform: 'Facebook' | 'Instagram';
  raw: Record<string, unknown>;
}

/**
 * Trae el lead completo por Graph. Meta solo manda el leadgen_id en el webhook;
 * los datos del formulario hay que pedirlos.
 */
export async function fetchLeadgen(slug: string, leadgenId: string): Promise<LeadgenFields> {
  const token = projectSecret(slug, 'META_PAGE_TOKEN');
  if (!token) throw new Error('El proyecto no tiene META_PAGE_TOKEN en env.');

  const url = new URL(`${GRAPH}/${encodeURIComponent(leadgenId)}`);
  url.searchParams.set('fields', 'id,created_time,field_data,platform,form_id');
  url.searchParams.set('access_token', token);

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    created_time?: string;
    field_data?: Array<{ name?: string; values?: string[] }>;
    platform?: string;
    form_id?: string;
    error?: { message?: string };
  };
  if (!res.ok || data.error) {
    // El mensaje de Graph no trae el token; es seguro propagarlo.
    throw new Error(data.error?.message ?? `Graph respondió ${res.status}`);
  }

  return mapLeadgenFields(data);
}

/** Separado de la red para poder probarlo con un payload de ejemplo. */
export function mapLeadgenFields(data: {
  created_time?: string;
  field_data?: Array<{ name?: string; values?: string[] }>;
  platform?: string;
  form_id?: string;
}): LeadgenFields {
  const fields: Record<string, string> = {};
  for (const f of data.field_data ?? []) {
    if (f?.name) fields[f.name] = (f.values ?? [''])[0] ?? '';
  }
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = fields[k];
      if (v && v.trim()) return v.trim();
    }
    return '';
  };

  return {
    fullName: pick('FULL_NAME', 'full_name', 'nombre_completo'),
    phone: pick('PHONE', 'phone_number', 'telefono'),
    email: pick('EMAIL', 'email', 'correo') || null,
    createdAt: data.created_time ? new Date(data.created_time) : new Date(),
    formId: data.form_id ?? null,
    platform: data.platform === 'ig' ? 'Instagram' : 'Facebook',
    raw: { ...fields, platform: data.platform ?? null },
  };
}

export interface LeadgenChange {
  leadgenId: string;
  pageId: string | null;
  formId: string | null;
  createdTime: Date | null;
}

/** Extrae los leadgen_id de un webhook `page/leadgen`. */
export function parseLeadgenWebhook(payload: unknown): LeadgenChange[] {
  const out: LeadgenChange[] = [];
  const body = payload as { entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: any }> }> };
  for (const entry of body?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'leadgen') continue;
      const v = change.value ?? {};
      const leadgenId = String(v.leadgen_id ?? '');
      if (!leadgenId) continue;
      out.push({
        leadgenId,
        pageId: v.page_id ? String(v.page_id) : entry.id ? String(entry.id) : null,
        formId: v.form_id ? String(v.form_id) : null,
        createdTime: v.created_time ? new Date(Number(v.created_time) * 1000) : null,
      });
    }
  }
  return out;
}
