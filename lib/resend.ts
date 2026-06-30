import 'server-only';
import type { FunnelStep } from '@/src/db/schema';

// ── Motor de mailing de Goossip via Resend (addendum 681 punto 8) ────────
// Distinto del correo PERSONAL conectado por Composio (tarea 5): esto es el
// motor transaccional/masivo del propio Goossip — envia desde el dominio de
// Goossip, no desde la cuenta personal del usuario. Se usa para las
// automatizaciones de embudo (punto 7).
//
// Requiere RESEND_API_KEY. Opcional RESEND_FROM (ej. "Goossip <hola@tudominio.com>").
// Si no hay RESEND_FROM se usa el remitente universal de pruebas de Resend,
// que funciona sin verificar dominio pero solo entrega al dueno de la cuenta.

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function resendFrom(): string {
  return process.env.RESEND_FROM?.trim() || 'Goossip <onboarding@resend.dev>';
}

export type SendResult = {
  ok: boolean;
  id: string | null;
  error: string | null;
};

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export function isValidEmail(s: string): boolean {
  return EMAIL_RE.test((s ?? '').trim());
}

export type EmailInput = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  // Si se da, agrega el header List-Unsubscribe (mejora entregabilidad y
  // cumple buenas practicas anti-spam). El link visible va dentro del html.
  unsubscribeUrl?: string;
};

function buildPayload(input: EmailInput) {
  return {
    from: resendFrom(),
    to: [input.to.trim()],
    subject: input.subject,
    html: input.html ?? textToHtml(input.text ?? ''),
    text: input.text ?? stripHtml(input.html ?? ''),
    ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    ...(input.unsubscribeUrl
      ? { headers: { 'List-Unsubscribe': `<${input.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }
      : {}),
  };
}

export async function sendEmail(input: EmailInput): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, id: null, error: 'RESEND_API_KEY no está configurada.' };
  }
  const to = input.to.trim();
  if (!isValidEmail(to)) {
    return { ok: false, id: null, error: `Correo destino inválido: ${to}` };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildPayload(input)),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.message || data?.error?.message || `Resend respondió ${res.status}`;
      return { ok: false, id: null, error: String(msg).slice(0, 300) };
    }
    return { ok: true, id: data?.id ?? null, error: null };
  } catch (e) {
    return { ok: false, id: null, error: e instanceof Error ? e.message : 'error de red' };
  }
}

// ── Envio por lotes (Resend /emails/batch, hasta 100 por request) ─────────
// Cada elemento se personaliza por separado (html/subject propios). El indice
// del resultado corresponde 1:1 con el de la entrada para poder mapear ids.
export type BatchItemResult = { ok: boolean; id: string | null; error: string | null };

export async function sendBatch(items: EmailInput[]): Promise<BatchItemResult[]> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return items.map(() => ({ ok: false, id: null, error: 'RESEND_API_KEY no está configurada.' }));
  }
  if (items.length === 0) return [];
  if (items.length > 100) throw new Error('sendBatch acepta máximo 100 por lote.');

  try {
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(items.map(buildPayload)),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = String(data?.message || data?.error?.message || `Resend respondió ${res.status}`).slice(0, 300);
      return items.map(() => ({ ok: false, id: null, error: msg }));
    }
    const ids: Array<{ id?: string }> = Array.isArray(data?.data) ? data.data : [];
    return items.map((_, i) => ({ ok: true, id: ids[i]?.id ?? null, error: null }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error de red';
    return items.map(() => ({ ok: false, id: null, error: msg }));
  }
}

// Reemplaza {{nombre}} {{empresa}} {{remitente}} en asunto/cuerpo de un step.
export function renderTemplate(
  tpl: string,
  vars: { nombre?: string | null; empresa?: string | null; remitente?: string | null },
): string {
  return tpl
    .replace(/\{\{\s*nombre\s*\}\}/gi, vars.nombre?.trim() || 'hola')
    .replace(/\{\{\s*empresa\s*\}\}/gi, vars.empresa?.trim() || 'tu negocio')
    .replace(/\{\{\s*remitente\s*\}\}/gi, vars.remitente?.trim() || 'el equipo');
}

// Envuelve texto plano en un HTML limpio y responsivo para el correo.
export function emailHtml(body: string, brandName?: string | null): string {
  const safe = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const brand = escapeHtml(brandName?.trim() || 'Goossip');
  return `<!doctype html><html><body style="margin:0;background:#f6f6f7;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1622">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:32px;border:1px solid #ececf1">
    <div style="font-size:18px;font-weight:700;margin-bottom:20px;color:#d6336c">${brand}</div>
    <div style="font-size:15px;color:#2a2530">${safe}</div>
    <div style="margin-top:28px;padding-top:16px;border-top:1px solid #ececf1;font-size:12px;color:#9b96a3">
      Enviado por ${brand} · Si no esperabas este correo, ignóralo.
    </div>
  </div></body></html>`;
}

// Igual que emailHtml pero con link de baja real (opt-out) en el pie. Se usa
// en campanas masivas — toda campana DEBE llevar como darse de baja.
export function campaignHtml(body: string, brandName: string | null | undefined, unsubscribeUrl: string): string {
  const safe = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const brand = escapeHtml(brandName?.trim() || 'Goossip');
  const unsub = escapeHtml(unsubscribeUrl);
  return `<!doctype html><html><body style="margin:0;background:#f6f6f7;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1622">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:32px;border:1px solid #ececf1">
    <div style="font-size:18px;font-weight:700;margin-bottom:20px;color:#d6336c">${brand}</div>
    <div style="font-size:15px;color:#2a2530">${safe}</div>
    <div style="margin-top:28px;padding-top:16px;border-top:1px solid #ececf1;font-size:12px;color:#9b96a3">
      Enviado por ${brand}. Si ya no quieres recibir estos correos,
      <a href="${unsub}" style="color:#9b96a3;text-decoration:underline">date de baja aquí</a>.
    </div>
  </div></body></html>`;
}

// Secuencia de bienvenida + seguimiento por defecto para leads nuevos.
// El usuario puede editarla; esto es el punto de partida real.
export function defaultWelcomeSequence(): FunnelStep[] {
  return [
    {
      delayHours: 0,
      subject: 'Hola {{nombre}}, gracias por tu interés',
      body: `Hola {{nombre}},

Gracias por acercarte. Soy {{remitente}} y me da mucho gusto saludarte.

Me encantaría conocer un poco más de {{empresa}} y mostrarte cómo podemos ayudarte. ¿Te late si agendamos una llamada corta esta semana?

Quedo al pendiente.`,
    },
    {
      delayHours: 48,
      subject: '¿Seguimos, {{nombre}}?',
      body: `Hola {{nombre}},

Te escribo de nuevo por si el correo anterior se te traspapeló. Sigo con muchas ganas de platicar sobre {{empresa}}.

Si te queda más fácil, mándame un horario y yo me ajusto.

Un saludo.`,
    },
    {
      delayHours: 120,
      subject: 'Última nota por ahora',
      body: `Hola {{nombre}},

No quiero ser insistente, así que este es mi último correo por el momento. La puerta queda abierta: cuando quieras retomar, aquí estoy.

Te deseo mucho éxito con {{empresa}}.`,
    },
  ];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p style="line-height:1.6">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
