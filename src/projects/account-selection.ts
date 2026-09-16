/**
 * Un @ de X es una identidad, no un texto libre. Mantener esta normalización
 * compartida evita que la UI compare `@Cuenta` contra `cuenta` y acepte o
 * rechace una autorización por formato en vez de por la cuenta real.
 */
export function normalizeXHandle(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let raw = input.trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (!/(^|\.)x\.com$/i.test(url.hostname) && !/(^|\.)twitter\.com$/i.test(url.hostname)) {
        return null;
      }
      raw = url.pathname.split('/').filter(Boolean)[0] ?? '';
    } catch {
      return null;
    }
  }

  raw = raw.replace(/^@+/, '');
  if (!/^[A-Za-z0-9_]{1,15}$/.test(raw)) return null;
  return `@${raw}`;
}

export function xHandlesMatch(expected: unknown, actual: unknown): boolean {
  const a = normalizeXHandle(expected);
  const b = normalizeXHandle(actual);
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

