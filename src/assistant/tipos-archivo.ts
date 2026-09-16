/**
 * Qué acepta el compose y qué se puede hacer con cada cosa.
 *
 * Este archivo es PURO a propósito: lo importa el navegador (para validar el
 * arrastre antes de subir nada) y lo importa el servidor (para decidir con qué
 * lector abrirlo). Si un día importara `server-only` o la base, el compose
 * dejaría de compilar y la validación se iría al servidor — que es exactamente
 * lo que no se quiere: rechazar un archivo de 300 MB DESPUÉS de subirlo es
 * gastarle a la gente su tiempo y su datos.
 *
 * Los topes no son redondos por gusto. Cada uno es el más chico de tres cosas:
 * lo que aguanta el almacén, lo que aguanta el lector y lo que tiene sentido
 * mandarle a un modelo.
 */

export type FamiliaArchivo = 'imagen' | 'video' | 'audio' | 'documento' | 'hoja' | 'texto';

export interface TipoArchivo {
  familia: FamiliaArchivo;
  /** Cómo se lee. `ninguno` = se guarda y se enseña, pero no se puede leer. */
  lector: 'gemini-imagen' | 'gemini-medio' | 'pdf' | 'docx' | 'pptx' | 'hoja' | 'texto' | 'ninguno';
  /** Tope de tamaño en bytes. */
  tope: number;
  etiqueta: string;
}

const MB = 1024 * 1024;

/**
 * Por extensión, no por MIME. El MIME que manda el navegador es una mentira
 * frecuente: un `.heic` de un iPhone llega como `image/heic`, como
 * `application/octet-stream` o vacío según el sistema, y un `.csv` exportado
 * de Excel llega como `application/vnd.ms-excel`. La extensión la escribió una
 * persona y es lo único estable.
 */
const POR_EXTENSION: Record<string, TipoArchivo> = {
  // Imágenes — las ve Gemini. 20 MB es el tope de lo que se manda en línea en
  // una llamada a `generateContent`; arriba de eso hay que subirlo por la API
  // de archivos, y para una foto no vale la pena el viaje.
  jpg: { familia: 'imagen', lector: 'gemini-imagen', tope: 20 * MB, etiqueta: 'Imagen' },
  jpeg: { familia: 'imagen', lector: 'gemini-imagen', tope: 20 * MB, etiqueta: 'Imagen' },
  png: { familia: 'imagen', lector: 'gemini-imagen', tope: 20 * MB, etiqueta: 'Imagen' },
  webp: { familia: 'imagen', lector: 'gemini-imagen', tope: 20 * MB, etiqueta: 'Imagen' },
  gif: { familia: 'imagen', lector: 'gemini-imagen', tope: 20 * MB, etiqueta: 'Imagen' },
  // HEIC es el formato de fábrica del iPhone y NINGÚN modelo lo lee hoy. Se
  // acepta —el usuario no tiene por qué saberlo— pero se dice con esas
  // palabras en vez de dejar el chip en gris sin explicación.
  heic: { familia: 'imagen', lector: 'ninguno', tope: 20 * MB, etiqueta: 'Imagen (HEIC)' },
  heif: { familia: 'imagen', lector: 'ninguno', tope: 20 * MB, etiqueta: 'Imagen (HEIF)' },

  // Video y audio — por la API de archivos de Gemini.
  mp4: { familia: 'video', lector: 'gemini-medio', tope: 200 * MB, etiqueta: 'Video' },
  mov: { familia: 'video', lector: 'gemini-medio', tope: 200 * MB, etiqueta: 'Video' },
  webm: { familia: 'video', lector: 'gemini-medio', tope: 200 * MB, etiqueta: 'Video' },
  m4a: { familia: 'audio', lector: 'gemini-medio', tope: 100 * MB, etiqueta: 'Audio' },
  mp3: { familia: 'audio', lector: 'gemini-medio', tope: 100 * MB, etiqueta: 'Audio' },
  ogg: { familia: 'audio', lector: 'gemini-medio', tope: 100 * MB, etiqueta: 'Audio' },
  wav: { familia: 'audio', lector: 'gemini-medio', tope: 100 * MB, etiqueta: 'Audio' },

  // Documentos.
  pdf: { familia: 'documento', lector: 'pdf', tope: 50 * MB, etiqueta: 'PDF' },
  docx: { familia: 'documento', lector: 'docx', tope: 25 * MB, etiqueta: 'Word' },
  pptx: { familia: 'documento', lector: 'pptx', tope: 50 * MB, etiqueta: 'PowerPoint' },
  // `.doc` y `.ppt` son el formato binario viejo de Office. Se aceptan para
  // que el usuario no se quede sin poder mandarlos, pero no hay lector: se
  // dice, no se finge.
  doc: { familia: 'documento', lector: 'ninguno', tope: 25 * MB, etiqueta: 'Word (viejo)' },
  ppt: { familia: 'documento', lector: 'ninguno', tope: 50 * MB, etiqueta: 'PowerPoint (viejo)' },

  // Hojas.
  xlsx: { familia: 'hoja', lector: 'hoja', tope: 25 * MB, etiqueta: 'Excel' },
  xls: { familia: 'hoja', lector: 'hoja', tope: 25 * MB, etiqueta: 'Excel' },
  csv: { familia: 'hoja', lector: 'hoja', tope: 25 * MB, etiqueta: 'CSV' },

  // Texto.
  txt: { familia: 'texto', lector: 'texto', tope: 10 * MB, etiqueta: 'Texto' },
  md: { familia: 'texto', lector: 'texto', tope: 10 * MB, etiqueta: 'Markdown' },
  json: { familia: 'texto', lector: 'texto', tope: 10 * MB, etiqueta: 'JSON' },
};

/** El tope más grande de todos: lo que se acepta soltar, antes de mirar el tipo. */
export const TOPE_ABSOLUTO = 200 * MB;

export function extensionDe(nombre: string): string {
  const punto = nombre.lastIndexOf('.');
  if (punto < 0 || punto === nombre.length - 1) return '';
  return nombre.slice(punto + 1).toLowerCase();
}

/** `null` = este archivo no se acepta. */
export function tipoDe(nombre: string, mime?: string | null): TipoArchivo | null {
  const porExt = POR_EXTENSION[extensionDe(nombre)];
  if (porExt) return porExt;

  // Sin extensión útil se cae al MIME, que es peor pero es algo. Pasa con lo
  // que se PEGA desde el portapapeles: una captura de pantalla llega como un
  // `File` llamado "image.png" en unos navegadores y sin nombre en otros.
  const m = (mime ?? '').toLowerCase();
  if (m.startsWith('image/')) return POR_EXTENSION.png;
  if (m.startsWith('video/')) return POR_EXTENSION.mp4;
  if (m.startsWith('audio/')) return POR_EXTENSION.m4a;
  if (m === 'application/pdf') return POR_EXTENSION.pdf;
  if (m.startsWith('text/')) return POR_EXTENSION.txt;
  return null;
}

export interface Veredicto {
  ok: boolean;
  /** En español y con el número, para poder enseñarlo tal cual. */
  motivo?: string;
  tipo?: TipoArchivo;
}

export function revisarArchivo(nombre: string, mime: string | null, size: number): Veredicto {
  const tipo = tipoDe(nombre, mime);
  if (!tipo) {
    return {
      ok: false,
      motivo: `No sé abrir archivos ${extensionDe(nombre) ? `«.${extensionDe(nombre)}»` : 'de ese tipo'}. Puedo con imágenes, video, audio, PDF, Word, PowerPoint, Excel, CSV y texto.`,
    };
  }
  if (size <= 0) {
    return { ok: false, motivo: `«${nombre}» está vacío.`, tipo };
  }
  if (size > tipo.tope) {
    return {
      ok: false,
      motivo: `«${nombre}» pesa ${pesoLegible(size)} y el tope para ${tipo.etiqueta.toLowerCase()} es ${pesoLegible(tipo.tope)}.`,
      tipo,
    };
  }
  return { ok: true, tipo };
}

export function pesoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * MB) return `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0)} MB`;
  return `${(bytes / (1024 * MB)).toFixed(1)} GB`;
}
