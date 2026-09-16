/**
 * Dónde quedan los bytes de un adjunto del Asistente.
 *
 * Hay DOS almacenes y no es indecisión, es que ninguno de los dos solo alcanza:
 *
 *   · **Blob de Vercel** es el que pide el spec y el único que puede con un
 *     video de 200 MB. La razón no es el precio: en Vercel, el CUERPO de una
 *     petición a una función tiene tope de 4.5 MB. Un video de 200 MB no puede
 *     ENTRAR por una ruta de Next aunque el almacén de destino lo aguante. Blob
 *     lo resuelve con subida directa del navegador: la función solo firma un
 *     permiso y el archivo nunca la atraviesa.
 *
 *   · **El almacén de la casa** (`mcp.mindcontextia.one/media`, por el relay)
 *     es el que YA está montado y probado desde la corrida 1. Sirve para lo
 *     chico y es el que hay cuando no existe `BLOB_READ_WRITE_TOKEN`.
 *
 * Medido el 16-sep-2026: `BLOB_READ_WRITE_TOKEN` NO está en el entorno de
 * Vercel del proyecto ni en `/root/.env`. Por eso el código elige el almacén en
 * tiempo de ejecución y lo DICE en la interfaz, en vez de fingir que acepta
 * 200 MB y reventar con un 413 después de que el usuario esperó la subida.
 */
import { randomUUID } from 'node:crypto';
import { extensionDe } from './tipos-archivo';

export type Almacen = 'blob' | 'casa' | 'ninguno';

/**
 * El tope de lo que puede pasar POR una función de Vercel. Son 4.5 MB de
 * cuerpo; el archivo viaja en base64, que infla un tercio, así que el archivo
 * de verdad no puede pasar de ~3.3 MB. Se deja en 3 MB con holgura para el
 * resto del JSON.
 */
export const TOPE_POR_LA_CASA = 3 * 1024 * 1024;

function tokenBlob(): string | null {
  const v = (process.env.BLOB_READ_WRITE_TOKEN ?? '').trim();
  return v && !v.startsWith('[') ? v : null;
}

function secretoRelay(): string | null {
  const v = (process.env.RELAY_SECRET ?? '').trim();
  return v && !v.startsWith('[') ? v : null;
}

export function almacenDeAdjuntos(): Almacen {
  if (tokenBlob()) return 'blob';
  if (secretoRelay()) return 'casa';
  return 'ninguno';
}

/** Lo que la interfaz necesita saber para no prometer de más. */
export interface CapacidadDeAlmacen {
  almacen: Almacen;
  /** El archivo más grande que se puede subir HOY, en bytes. */
  tope: number;
  /** En español, para enseñarlo cuando algo no cabe. */
  nota: string | null;
}

export function capacidadDeAlmacen(): CapacidadDeAlmacen {
  const almacen = almacenDeAdjuntos();
  if (almacen === 'blob') {
    return { almacen, tope: 200 * 1024 * 1024, nota: null };
  }
  if (almacen === 'casa') {
    return {
      almacen,
      tope: TOPE_POR_LA_CASA,
      nota:
        'Sin BLOB_READ_WRITE_TOKEN los archivos suben por el almacén de la casa, y ahí el tope son 3 MB: es lo que cabe en el cuerpo de una función de Vercel. Video y PDFs grandes necesitan el token.',
    };
  }
  return {
    almacen,
    tope: 0,
    nota: 'No hay dónde guardar archivos: falta BLOB_READ_WRITE_TOKEN o RELAY_SECRET.',
  };
}

/* --------------------------------------------------------------------------
   El almacén de la casa
   -------------------------------------------------------------------------- */

const RELAY_URL = process.env.MEDIA_RELAY_URL || 'https://brain.vforge.site/brain/exec';
const PUBLIC_BASE = process.env.MEDIA_PUBLIC_BASE || 'https://mcp.mindcontextia.one/media';
const DIR = process.env.MEDIA_DIR || '/var/www/html/tmp-media';

async function relayExec(cmd: string): Promise<string> {
  const s = secretoRelay();
  if (!s) throw new Error('No hay dónde guardar el archivo: falta RELAY_SECRET.');
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
 * Sube bytes al almacén de la casa y devuelve la URL pública.
 *
 * Va por pedazos de 60 KB porque el relay tiene tope de tamaño POR ORDEN. Es la
 * misma mecánica de `src/creative/media.ts` y por eso mismo este camino no
 * puede con archivos grandes: 3 MB ya son 70 viajes.
 */
export async function subirPorLaCasa(bytes: Buffer, nombre: string): Promise<string> {
  if (bytes.byteLength > TOPE_POR_LA_CASA) {
    throw new Error(
      'El archivo no cabe por el almacén de la casa. Hace falta BLOB_READ_WRITE_TOKEN.',
    );
  }
  const ext = extensionDe(nombre) || 'bin';
  const archivo = `${randomUUID()}.${ext}`;
  const b64 = bytes.toString('base64');
  const tmp = `/tmp/${archivo}.b64`;

  await relayExec(`rm -f ${tmp}`);
  for (let i = 0; i < b64.length; i += 60000) {
    await relayExec(`cat >> ${tmp} << 'B64EOF'\n${b64.slice(i, i + 60000)}\nB64EOF`);
  }
  const out = await relayExec(
    `mkdir -p ${DIR} && base64 -d ${tmp} > ${DIR}/${archivo} && chmod 644 ${DIR}/${archivo} && rm -f ${tmp} && echo LISTO`,
  );
  if (!out.includes('LISTO')) throw new Error('No se pudo guardar el archivo.');
  return `${PUBLIC_BASE}/${archivo}`;
}

/**
 * Baja el archivo para poder leerlo.
 *
 * El tope es del LECTOR, no del almacén: un video de 200 MB se guarda bien y se
 * puede volver a ver, pero meterlo entero en la memoria de una función para
 * mandárselo a Gemini es otra cosa. Cuando no cabe se dice, no se trunca en
 * silencio — medio PDF leído contesta con media verdad, que es peor que decir
 * "no pude".
 */
export const TOPE_DE_LECTURA = 120 * 1024 * 1024;

export async function bajarParaLeer(url: string, tope = TOPE_DE_LECTURA): Promise<Buffer> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`No pude bajar el archivo (HTTP ${res.status}).`);
  const declarado = Number(res.headers.get('content-length') ?? '0');
  if (declarado > tope) {
    throw new Error(`El archivo pesa más de ${Math.round(tope / (1024 * 1024))} MB y no lo puedo abrir entero.`);
  }
  const ab = await res.arrayBuffer();
  if (ab.byteLength > tope) {
    throw new Error(`El archivo pesa más de ${Math.round(tope / (1024 * 1024))} MB y no lo puedo abrir entero.`);
  }
  return Buffer.from(ab);
}
