/**
 * Tokens por proyecto. NUNCA se guardan en la base ni se imprimen: viven en
 * env de Vercel. La tabla solo guarda ids públicos (page_id, form_id,
 * phone_number_id, número Twilio).
 *
 * Convención: `<CLAVE>_<SLUG_EN_MAYUSCULAS>`, con fallback a `<CLAVE>` global.
 * Ejemplo para el proyecto `vliving`:
 *   META_PAGE_TOKEN_VLIVING=...      (específico del proyecto)
 *   META_PAGE_TOKEN=...              (fallback para todos)
 */

export type ProjectSecretKey =
  | 'META_PAGE_TOKEN'
  | 'WHATSAPP_TOKEN'
  | 'TWILIO_ACCOUNT_SID'
  | 'TWILIO_AUTH_TOKEN';

export function envSuffix(slug: string): string {
  return slug.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/** Devuelve el valor o null. Nunca lo loguea ni lo devuelve en respuestas HTTP. */
export function projectSecret(slug: string, key: ProjectSecretKey): string | null {
  const scoped = process.env[`${key}_${envSuffix(slug)}`];
  if (scoped && scoped.trim()) return scoped.trim();
  const global = process.env[key];
  if (global && global.trim()) return global.trim();
  return null;
}

/** Para el panel: "¿está conectado?" sin exponer el valor. */
export function hasProjectSecret(slug: string, key: ProjectSecretKey): boolean {
  return projectSecret(slug, key) !== null;
}
