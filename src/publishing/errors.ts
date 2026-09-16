/** Quita tokens, llaves y URLs de autorización antes de guardar o registrar. */
export function sanitizePublicationError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? 'No se pudo publicar.');
  return raw
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, '$1[OCULTO]')
    .replace(/\b(access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|authorization)\b\s*[:=]\s*[^\s,;]+/gi, '$1=[OCULTO]')
    .replace(/https?:\/\/[^\s]+(?:oauth|authorize|callback)[^\s]*/gi, '[URL DE AUTORIZACIÓN OCULTA]')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 500) || 'No se pudo publicar.';
}
