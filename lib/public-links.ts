import 'server-only';

// Helpers compartidos por las features influencer (ofertas, landings, referidos,
// story links, votaciones). Centraliza el slug y la URL publica para no repetir.

export { appUrl } from './mailing';

/** Normaliza un texto a slug url-safe (sin acentos, minusculas, guiones). */
export function slugify(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Sufijo corto aleatorio para garantizar unicidad de slugs/codigos. */
export function shortId(len = 6): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/** Slug base + sufijo: "oferta-verano-k3f9a2". Unico en la practica. */
export function uniqueSlug(base: string, suffixLen = 6): string {
  const s = slugify(base);
  return s ? `${s}-${shortId(suffixLen)}` : shortId(8);
}

/** Codigo de referido corto en MAYUSCULAS legible: "ANA4K7P". */
export function referralCode(name?: string | null): string {
  const base = slugify(name || '')
    .replace(/-/g, '')
    .slice(0, 4)
    .toUpperCase();
  return `${base}${shortId(4).toUpperCase()}`;
}
