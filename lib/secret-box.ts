// Sin `server-only` a propósito, igual que `project-secrets.ts` y `meta-graph.ts`:
// aquí no hay nada de Next, solo `node:crypto` y env, y los scripts de tsx y las
// pruebas necesitan poder abrir un sobre fuera del servidor.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Cajita para guardar tokens de terceros en la base.
 *
 * La corrida 1 decidió que los tokens NO van a la tabla, y era la decisión
 * correcta mientras los ponía Luis a mano en el env de Vercel. Con OAuth de
 * verdad ya no se puede: el token de la página de Facebook lo emite Meta en
 * mitad del flujo, con la sesión del usuario, y nadie va a copiarlo a un panel.
 *
 * Así que se guarda, pero cifrado con AES-256-GCM y jamás sale por una API.
 * Lo que devuelven las rutas es `true`/`false`, nunca el valor.
 *
 * La llave sale de `CONNECTIONS_SECRET`. Si no está, se DERIVA de
 * `META_APP_SECRET`: quien tenga el app secret de Meta puede emitir tokens de
 * esa app por su cuenta, así que cifrar tokens de Meta con él no abre ninguna
 * puerta nueva — y evita que la función se quede muerta esperando un secreto
 * más. Sin ninguno de los dos no se cifra y no se guarda nada.
 */

function keyMaterial(): string | null {
  const explicit = process.env.CONNECTIONS_SECRET?.trim();
  if (explicit && explicit.length >= 16) return explicit;
  const derived = process.env.META_APP_SECRET?.trim();
  if (derived && derived.length >= 16) return `derivada-de-meta:${derived}`;
  return null;
}

export function canSealSecrets(): boolean {
  return keyMaterial() !== null;
}

function key(): Buffer {
  const material = keyMaterial();
  if (!material) throw new Error('No hay con qué cifrar: falta CONNECTIONS_SECRET.');
  return createHash('sha256').update(material, 'utf8').digest();
}

/** Devuelve `v1.<iv>.<tag>.<cifrado>`, todo en base64url. */
export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), body.toString('base64url')].join('.');
}

/** null si el sobre viene roto, cambiado o cifrado con otra llave. */
export function open(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  const parts = sealed.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(parts[1], 'base64url'));
    decipher.setAuthTag(Buffer.from(parts[2], 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[3], 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Etiqueta que no cuadra = contenido alterado. Se trata como "no hay token",
    // nunca como "úsalo de todos modos".
    return null;
  }
}
