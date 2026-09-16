/**
 * Dónde viven las imágenes que Goossip genera.
 *
 * El almacenamiento de medios de la casa ya existía y funcionaba desde la
 * corrida 1 (`/api/upload-image`): el archivo se escribe en el servidor por el
 * relay y queda servido en `mcp.mindcontextia.one/media/<archivo>`. Esta
 * corrida NO lo cambia, lo extrae — la lógica estaba metida dentro de una ruta
 * de Next y por eso el motor de piezas, que corre fuera de esa ruta, no la
 * podía usar.
 *
 * Por qué importa que la URL sea pública y no un data URL: Instagram y
 * LinkedIn no reciben la imagen, reciben una DIRECCIÓN y van por ella. Una
 * pieza que solo existe como base64 en la pantalla no se puede publicar.
 *
 * El issue pide Blob. Aquí se usa el almacén que ya está montado y probado en
 * producción, por la regla de la casa de no reescribir lo que llega
 * funcionando. Cambiar el destino es cambiar este archivo y nada más.
 */
import { randomUUID } from 'node:crypto';

const RELAY_URL = process.env.MEDIA_RELAY_URL || 'https://brain.vforge.site/brain/exec';
const PUBLIC_BASE = process.env.MEDIA_PUBLIC_BASE || 'https://mcp.mindcontextia.one/media';
const DIR = process.env.MEDIA_DIR || '/var/www/html/tmp-media';

export class SinAlmacen extends Error {
  constructor() {
    super('No hay dónde guardar la imagen: falta configurar el almacenamiento de medios.');
    this.name = 'SinAlmacen';
  }
}

function secreto(): string | null {
  const v = (process.env.RELAY_SECRET ?? '').trim();
  return v && !v.startsWith('[') ? v : null;
}

export function almacenListo(): boolean {
  return secreto() !== null;
}

async function relayExec(cmd: string): Promise<string> {
  const s = secreto();
  if (!s) throw new SinAlmacen();
  const res = await fetch(RELAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: s, cmd }),
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => ({}))) as { stdout?: string; stderr?: string };
  return (data.stdout || '') + (data.stderr || '');
}

/**
 * Sube bytes y devuelve la URL pública.
 *
 * Va por pedazos de 60 KB porque el relay tiene tope de tamaño por orden. Una
 * imagen de Gemini pesa cerca de 1 MB en base64: mandarla de un golpe la corta
 * a la mitad y lo que queda es un PNG roto que el navegador pinta en blanco.
 */
export async function subirImagen(buf: Buffer, ext = 'png'): Promise<string> {
  if (!almacenListo()) throw new SinAlmacen();

  const nombre = `${randomUUID()}.${ext}`;
  const b64 = buf.toString('base64');
  const tmp = `/tmp/${nombre}.b64`;

  await relayExec(`rm -f ${tmp}`);
  for (let i = 0; i < b64.length; i += 60000) {
    await relayExec(`cat >> ${tmp} << 'B64EOF'\n${b64.slice(i, i + 60000)}\nB64EOF`);
  }
  const out = await relayExec(
    `mkdir -p ${DIR} && base64 -d ${tmp} > ${DIR}/${nombre} && chmod 644 ${DIR}/${nombre} && rm -f ${tmp} && echo LISTO`,
  );
  if (!out.includes('LISTO')) throw new Error('No se pudo guardar la imagen.');
  return `${PUBLIC_BASE}/${nombre}`;
}

/** Baja una imagen por su URL. Se usa para el logo del cliente al componer. */
export async function bajarImagen(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    // 20 MB de tope: un logo no pesa eso, y bajarse un archivo enorme desde
    // una URL que puso el usuario es una puerta abierta a tumbar el proceso.
    if (ab.byteLength > 20 * 1024 * 1024) return null;
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

/** `data:image/png;base64,…` → bytes. */
export function deDataUrl(dataUrl: string): { buf: Buffer; ext: string } | null {
  const m = dataUrl.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) return null;
  const ext = m[1]!.toLowerCase() === 'jpeg' ? 'jpg' : m[1]!.toLowerCase();
  return { buf: Buffer.from(m[2]!, 'base64'), ext };
}
