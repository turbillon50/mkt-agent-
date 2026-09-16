/**
 * Twilio — Lookup y SMS, con bandera trial/paid POR PROYECTO.
 *
 * Orden de Luis (15-sep-2026): Twilio va AL ÚLTIMO, no se paga hasta que todo
 * lo demás esté cerrado.
 *   - `trial`: solo salen SMS a números verificados. notify_owner al dueño sí
 *     funciona hoy. Los send_sms a leads NO se intentan: se quedan esperando en
 *     la cola con reason `twilio_trial`. Lookup básico sí se usa; Line Type
 *     Intelligence se marca "no_se_pudo (trial)".
 *   - `paid`: se abre la llave y se activa Line Type Intelligence.
 *
 * Las credenciales salen de env (globales o por proyecto). Nunca se loguean.
 */
import { projectSecret } from './project-secrets';
import type { TwilioMode } from '@/src/sales/types';

const LOOKUP_BASE = 'https://lookups.twilio.com/v2/PhoneNumbers';
const API_BASE = 'https://api.twilio.com/2010-04-01/Accounts';

export interface TwilioCreds {
  sid: string;
  token: string;
}

export function twilioCreds(slug: string): TwilioCreds | null {
  const sid = projectSecret(slug, 'TWILIO_ACCOUNT_SID');
  const token = projectSecret(slug, 'TWILIO_AUTH_TOKEN');
  if (!sid || !token) return null;
  return { sid, token };
}

function authHeader({ sid, token }: TwilioCreds): string {
  return `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`;
}

export interface LookupResult {
  checked_at: string;
  valid: boolean | null;
  line_type: string | null;
  carrier: string | null;
  detail: string;
}

/**
 * Valida el número. En `trial` pide solo el lookup básico (gratis) y deja
 * line_type en "no_se_pudo (trial)". Nunca lanza: un lead entra igual aunque
 * Twilio esté caído — se marca "no_se_pudo" y sigue.
 */
export async function lookupPhone(
  slug: string,
  e164: string,
  mode: TwilioMode,
): Promise<LookupResult> {
  const now = new Date().toISOString();
  const creds = twilioCreds(slug);
  if (!creds) {
    return { checked_at: now, valid: null, line_type: null, carrier: null, detail: 'no_se_pudo (sin credenciales)' };
  }

  const wantsLineType = mode === 'paid';
  const url = `${LOOKUP_BASE}/${encodeURIComponent(e164)}${wantsLineType ? '?Fields=line_type_intelligence' : ''}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: authHeader(creds) },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) {
      return { checked_at: now, valid: false, line_type: null, carrier: null, detail: 'número inexistente' };
    }
    if (!res.ok) {
      return {
        checked_at: now,
        valid: null,
        line_type: null,
        carrier: null,
        detail: `no_se_pudo (HTTP ${res.status})`,
      };
    }
    const data = (await res.json()) as {
      valid?: boolean;
      line_type_intelligence?: { type?: string; carrier_name?: string } | null;
    };
    const lti = data.line_type_intelligence ?? null;
    return {
      checked_at: now,
      valid: data.valid ?? null,
      line_type: wantsLineType ? (lti?.type ?? null) : null,
      carrier: wantsLineType ? (lti?.carrier_name ?? null) : null,
      detail: wantsLineType ? 'lookup + line type intelligence' : 'lookup básico · line type: no_se_pudo (trial)',
    };
  } catch (e) {
    const why = e instanceof Error ? e.name : 'error';
    return { checked_at: now, valid: null, line_type: null, carrier: null, detail: `no_se_pudo (${why})` };
  }
}

export type SmsOutcome =
  | { ok: true; sid: string }
  | { ok: false; skipped: true; reason: 'twilio_trial' }
  | { ok: false; skipped: false; error: string; code?: number };

export interface SendSmsInput {
  slug: string;
  from: string;
  to: string;
  body: string;
  mode: TwilioMode;
  /** true para notify_owner: el dueño tiene su número verificado en el trial. */
  toVerifiedNumber?: boolean;
}

/**
 * Manda un SMS. En `trial`, si el destino no es un número verificado NO se
 * intenta: se devuelve `skipped` y el runner deja la acción esperando.
 */
export async function sendSms(input: SendSmsInput): Promise<SmsOutcome> {
  if (input.mode === 'trial' && !input.toVerifiedNumber) {
    return { ok: false, skipped: true, reason: 'twilio_trial' };
  }
  const creds = twilioCreds(input.slug);
  if (!creds) return { ok: false, skipped: false, error: 'Twilio sin credenciales en env.' };
  if (!input.from) return { ok: false, skipped: false, error: 'El proyecto no tiene número Twilio configurado.' };

  const body = new URLSearchParams({ From: input.from, To: input.to, Body: input.body });
  try {
    const res = await fetch(`${API_BASE}/${creds.sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: authHeader(creds),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
    if (!res.ok) {
      // 21608 = "unverified number" del trial: no es una falla del código.
      if (data.code === 21608) return { ok: false, skipped: true, reason: 'twilio_trial' };
      return { ok: false, skipped: false, error: data.message ?? `HTTP ${res.status}`, code: data.code };
    }
    return { ok: true, sid: data.sid ?? '' };
  } catch (e) {
    return { ok: false, skipped: false, error: e instanceof Error ? e.message : 'error de red' };
  }
}
