/**
 * Avisarle al dueño. Por donde se pueda, en orden, y sin morir en el intento.
 *
 * Lo que había: `notify_owner` solo sabía mandar SMS/WhatsApp a
 * `campaigns.rules.owner_phone`. MOMENTUM no tiene ese campo, así que la QA del
 * 16-sep encontró la acción `4702daf1-…` —y las 3 anteriores del proyecto— en
 * **`failed`**, con `{"error":"el proyecto no tiene owner_phone en sus reglas"}`,
 * mientras Gmail estaba conectado y mandaba correo sin problema.
 *
 * Eso no es un aviso que falla: es un lead grado A que nadie atiende porque a
 * un proyecto le faltó llenar un campo.
 *
 * La regla de la corrida 13: **la acción nunca queda `failed` por falta de
 * canal**. Se baja al siguiente disponible y se DICE por cuál salió.
 *
 * La escalera, en orden y con su porqué:
 *
 *   1. **SMS** al `owner_phone`. Es lo más rápido de leer y es lo que el dueño
 *      espera si dio su teléfono.
 *   2. **Gmail del proyecto** al `owner_email`. Sale de la cuenta del cliente:
 *      el correo le llega de sí mismo, no de un remitente desconocido que su
 *      bandeja mande a spam.
 *   3. **Resend de la casa**, si el proyecto no tiene Gmail conectado. Es el
 *      último recurso y se nota que es de Goossip.
 *
 * Y si NINGUNO está, tampoco es `failed`: queda `pending` con "no hay por dónde
 * avisarte, pon tu teléfono o tu correo en Ajustes". Un `failed` invita a
 * reintentar algo que nunca va a funcionar; un `pending` con motivo dice qué
 * hacer.
 */
import type { Project } from '../db/schema';
import { sendSms } from '../../lib/twilio';
import { resolveRules } from './types';

export type ViaDeAviso = 'sms' | 'gmail' | 'resend';

export interface ResultadoDeAviso {
  ok: boolean;
  /** Por dónde salió de verdad. */
  via: ViaDeAviso | null;
  /** Lo que se intentó y por qué no se pudo, en orden. Va al `result` de la acción. */
  intentos: Array<{ via: ViaDeAviso; ok: boolean; motivo?: string }>;
  detalle?: Record<string, unknown>;
  /** true = no hay ningún canal configurado. Se deja `pending`, no `failed`. */
  sinCanal?: boolean;
  motivo?: string;
}

/** Un correo con forma de correo. Barato y suficiente. */
export function correoValido(v: string | null | undefined): boolean {
  return typeof v === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());
}

/** E.164: `+` y de 8 a 15 dígitos. Twilio rechaza todo lo demás. */
export function telefonoValido(v: string | null | undefined): boolean {
  return typeof v === 'string' && /^\+[1-9]\d{7,14}$/.test(v.trim());
}

function asunto(project: Project, texto: string): string {
  const primera = texto.split('\n')[0]?.trim() ?? '';
  return primera.length > 8 ? primera.slice(0, 110) : `Goossip · ${project.name}`;
}

/**
 * Manda el aviso por el primer canal que sirva.
 *
 * `preferirCorreo` existe para el modo trial de Twilio: ahí el SMS a un número
 * sin verificar no sale, y probarlo primero solo gasta tiempo.
 */
export async function avisarAlDueno(input: {
  project: Project;
  texto: string;
  preferirCorreo?: boolean;
}): Promise<ResultadoDeAviso> {
  const { project, texto } = input;
  const rules = resolveRules(project.rules);
  const intentos: ResultadoDeAviso['intentos'] = [];

  const telefono = (rules.owner_phone ?? process.env.OWNER_PHONE ?? '').trim();
  const correo = (rules.owner_email ?? process.env.OWNER_EMAIL ?? '').trim();

  // --- 1. SMS ---------------------------------------------------------------
  if (telefonoValido(telefono) && !input.preferirCorreo) {
    const from = project.channels?.twilio_number ?? process.env.TWILIO_FROM ?? '';
    const res = await sendSms({
      slug: project.slug,
      from,
      to: telefono,
      body: texto,
      mode: rules.twilio_mode,
      // El dueño SÍ tiene su número verificado en el trial de Twilio.
      toVerifiedNumber: true,
    }).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : 'error' }) as const);

    if ('ok' in res && res.ok) {
      intentos.push({ via: 'sms', ok: true });
      return { ok: true, via: 'sms', intentos, detalle: { sid: (res as any).sid } };
    }
    intentos.push({
      via: 'sms',
      ok: false,
      motivo: (res as any).skipped ? 'twilio en trial' : ((res as any).error ?? 'no salió'),
    });
  } else if (telefono) {
    intentos.push({ via: 'sms', ok: false, motivo: 'el teléfono no está en formato +52…' });
  }

  // --- 2. Gmail del proyecto -------------------------------------------------
  if (correoValido(correo)) {
    try {
      const { gmail } = await import('../channels/operacion');
      const estado = await gmail.verify(project);
      if (estado.conectado) {
        await gmail.sendEmail!(project, {
          to: correo,
          subject: asunto(project, texto),
          body: texto,
        });
        intentos.push({ via: 'gmail', ok: true });
        return { ok: true, via: 'gmail', intentos, detalle: { to: correo } };
      }
      intentos.push({ via: 'gmail', ok: false, motivo: estado.motivo ?? 'Gmail no está conectado' });
    } catch (e) {
      intentos.push({
        via: 'gmail',
        ok: false,
        motivo: e instanceof Error ? e.message : 'Gmail falló',
      });
    }

    // --- 3. Resend de la casa ------------------------------------------------
    const porResend = await mandarPorResend(correo, asunto(project, texto), texto);
    intentos.push({ via: 'resend', ok: porResend.ok, motivo: porResend.motivo });
    if (porResend.ok) {
      return { ok: true, via: 'resend', intentos, detalle: { to: correo, id: porResend.id } };
    }
  } else if (correo) {
    intentos.push({ via: 'gmail', ok: false, motivo: 'el correo no tiene forma de correo' });
  }

  const nada = !telefono && !correo;
  return {
    ok: false,
    via: null,
    intentos,
    sinCanal: nada,
    motivo: nada
      ? 'no hay por dónde avisarte: pon tu teléfono o tu correo en Ajustes del proyecto'
      : `no salió por ninguna vía (${intentos.map((i) => `${i.via}: ${i.motivo ?? 'sin motivo'}`).join(' · ')})`,
  };
}

/**
 * El correo de la casa. Es el ÚLTIMO recurso: un proyecto sin Gmail conectado
 * igual tiene que poder enterarse de que le entró un lead grado A.
 */
async function mandarPorResend(
  to: string,
  subject: string,
  texto: string,
): Promise<{ ok: boolean; id?: string; motivo?: string }> {
  const key = (process.env.RESEND_API_KEY ?? '').trim();
  const from = (process.env.RESEND_FROM ?? '').trim();
  if (!key || key.startsWith('[')) return { ok: false, motivo: 'no hay RESEND_API_KEY' };
  if (!from) return { ok: false, motivo: 'no hay RESEND_FROM' };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text: texto }),
      cache: 'no-store',
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, motivo: json?.message ?? `Resend contestó ${res.status}` };
    }
    return { ok: true, id: json?.id };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : 'Resend no contestó' };
  }
}
