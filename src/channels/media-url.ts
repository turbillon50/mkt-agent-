/** Impide que una URL de pieza convierta la subida automática en una llamada interna. */
export function assertPublicMediaUrl(raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('La pieza no tiene una URL válida.');
  }
  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new Error('La pieza debe tener una URL pública HTTP.');
  }
  const host = url.hostname.toLowerCase();
  const privada =
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (privada) throw new Error('La pieza debe estar en una URL pública.');
}
