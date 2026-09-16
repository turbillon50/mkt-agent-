import crypto from 'node:crypto';

/**
 * Verificación de firma Svix (la que usa Clerk para sus webhooks).
 *
 * Se implementa a mano en vez de meter el SDK `svix`: son 30 líneas, el
 * algoritmo está documentado y así no entra una dependencia nueva a un
 * proyecto en producción solo para un HMAC.
 *
 * Contrato de Svix:
 *   - `svix-id`, `svix-timestamp` (epoch en segundos), `svix-signature`.
 *   - Se firma `${id}.${timestamp}.${body}` con HMAC-SHA256.
 *   - La llave es `whsec_<base64>`: se firma con los BYTES del base64, no con
 *     el string. Confundir eso es el error clásico y da 401 siempre.
 *   - `svix-signature` trae una lista separada por espacios: `v1,<b64> v1,<b64>`
 *     (hay varias durante la rotación de llaves). Basta con que UNA case.
 *   - Se rechaza lo que venga con más de 5 min de desfase: contra replays.
 */

export const SVIX_TOLERANCE_SECONDS = 5 * 60;

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export type SvixResult =
  | { ok: true }
  | { ok: false; reason: 'sin_secreto' | 'faltan_cabeceras' | 'timestamp' | 'firma' };

export function verifySvix(
  body: string,
  headers: SvixHeaders,
  secret: string | undefined,
  now = Date.now(),
): SvixResult {
  if (!secret) return { ok: false, reason: 'sin_secreto' };
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return { ok: false, reason: 'faltan_cabeceras' };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'timestamp' };
  if (Math.abs(now / 1000 - ts) > SVIX_TOLERANCE_SECONDS) return { ok: false, reason: 'timestamp' };

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${body}`)
    .digest();

  for (const part of signature.split(' ')) {
    const [version, value] = part.split(',');
    if (version !== 'v1' || !value) continue;
    let given: Buffer;
    try {
      given = Buffer.from(value, 'base64');
    } catch {
      continue;
    }
    // Comparación en tiempo constante: distinta longitud ni se compara.
    if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) {
      return { ok: true };
    }
  }
  return { ok: false, reason: 'firma' };
}

/** Firma un cuerpo como lo haría Svix. Solo lo usan las pruebas. */
export function signSvix(body: string, id: string, timestamp: string, secret: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const mac = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return `v1,${mac}`;
}
