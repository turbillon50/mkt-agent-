/**
 * ¿Esta pieza se puede publicar, de verdad?
 *
 * El visor enseña cómo se va a ver. Esto contesta la otra mitad: si la red la
 * va a ACEPTAR. Son cosas distintas y la segunda es la que tumba publicaciones
 * — una imagen preciosa de 900 KB en X (tope 3 MB) sale; la misma en 1:1 a
 * 640 px de ancho la rechaza el endpoint sin decir por qué.
 *
 * Seis revisiones, todas contra `specs.ts`, que trae la medida oficial con su
 * URL y su fecha:
 *
 *   1. RESOLUCIÓN — el ancho mínimo que pide la red.
 *   2. PESO — el tope de MB del archivo.
 *   3. FORMATO — jpg, png, mp4, mov… lo que esa red acepta y nada más.
 *   4. DURACIÓN — reel, Short, video de X, TikTok.
 *   5. ASPECTO — contra el LIENZO elegido, no contra el rango que tolera la API.
 *   6. BITRATE — el tope de Mbps del video.
 *
 * Por qué el aspecto se mide contra el lienzo y no contra el rango de la API:
 * la Graph API de Instagram acepta de 4:5 a 1.91:1, así que una foto 16:9
 * "pasa" — y lo que el cliente ve publicado es su foto recortada al lienzo del
 * muro, con la mitad de los lados fuera. El lienzo es la promesa que hizo el
 * visor; si la pieza no cabe en él, no es publicable TAL CUAL, y decirlo es
 * justo lo que evita el "¿por qué salió cortada?" de la semana siguiente.
 *
 * Nada de esto se ejecuta en el navegador: medir pide leer el archivo, y
 * recodificar un video pide ffmpeg, que en Vercel no existe (medido) y en el
 * servidor de la casa sí (ffmpeg 6.1.1). Por eso el video va por el relay.
 */
import { formatoPorId, formatosDe, RED_LABEL, type FormatoSpec, type RedSlug } from './specs';
import { bajarImagen, relayExec, subirImagen, MEDIA, almacenListo, SinAlmacen } from './media';

// ---------------------------------------------------------------------------
// Lo que se mide
// ---------------------------------------------------------------------------

export interface Medida {
  ancho: number | null;
  alto: number | null;
  bytes: number | null;
  /** Extensión normalizada: jpg, png, mp4, mov, gif, pdf… */
  archivo: string | null;
  duracionS: number | null;
  bitrateKbps: number | null;
}

export function medidaVacia(): Medida {
  return { ancho: null, alto: null, bytes: null, archivo: null, duracionS: null, bitrateKbps: null };
}

export type ClaveFalla = 'resolucion' | 'peso' | 'formato' | 'duracion' | 'aspecto' | 'bitrate';

export interface Falla {
  clave: ClaveFalla;
  /** El motivo, en español y con el número. Es lo que se le enseña al usuario. */
  texto: string;
  /** ¿"Adaptar" lo arregla? Un video de once minutos para un Short, no. */
  adaptable: boolean;
}

export interface Dictamen {
  formato: FormatoSpec;
  medida: Medida;
  /** Vacío = publicable. */
  fallas: Falla[];
  publicable: boolean;
  /** Se puede arreglar apretando "Adaptar". */
  adaptable: boolean;
  /** Lo que no se pudo medir. No se calla: no medir no es aprobar. */
  sinMedir: ClaveFalla[];
  fuente: string;
  leidoEl: string;
}

// ---------------------------------------------------------------------------
// Las proporciones que ofrece cada red
// ---------------------------------------------------------------------------

/**
 * Las proporciones de una red para un tipo de pieza, dichas como las diría una
 * persona: "1:1 o 4:5". Sale del catálogo, así que el día que Instagram abra
 * otra, el mensaje se corrige solo.
 */
export function proporcionesDe(red: RedSlug, tipo: FormatoSpec['tipo'], soloMuro = false): string[] {
  const pool = formatosDe(red).filter(
    (f) => f.tipo === tipo && (!soloMuro || /feed|muro|imagen|miniatura/.test(f.id)),
  );
  // De la más ancha a la más alta, que es como las nombra cualquiera:
  // "1:1 o 4:5", no "4:5 o 1:1". El orden del catálogo no sirve aquí — es el
  // orden en que se escribieron las specs, y cambiarlo movería esta frase.
  return [...new Set(pool.map((f) => f.ratio))].sort(
    (a, b) => valorDeRatio(b) - valorDeRatio(a),
  );
}

function valorDeRatio(r: string): number {
  const [a, b] = r.split(':').map(Number);
  return b ? a! / b : 1;
}

function comoLista(xs: string[]): string {
  if (xs.length === 0) return '';
  if (xs.length === 1) return xs[0]!;
  return `${xs.slice(0, -1).join(', ')} o ${xs[xs.length - 1]}`;
}

/**
 * Cuánto se le perdona a la proporción.
 *
 * El 3 % no es un número cómodo: es el que publica Facebook en su guía de
 * anuncios para el muro ("Tolerancia de proporción del 3 %"). Para lo que se
 * pinta a pantalla completa —historias y reels— la misma guía baja a 1 %, y
 * tiene sentido: ahí una banda negra se ve entera.
 */
export function toleranciaDe(f: FormatoSpec): number {
  return f.zonaSegura ? 0.01 : 0.03;
}

/** El ancho mínimo que pide la red, leído de la nota oficial de la spec. */
export function anchoMinimoDe(f: FormatoSpec): number | null {
  const m = f.nota?.match(/[Aa]ncho mínimo(?: de)? (\d+)/);
  if (m) return Number(m[1]);
  const m2 = f.nota?.match(/[Mm]ínimo (\d+)\s*[×x]\s*(\d+)/);
  if (m2) return Number(m2[1]);
  const m3 = f.nota?.match(/[Rr]esolución mínima (\d+)\s*[×x]\s*(\d+)/);
  if (m3) return Number(m3[1]);
  return null;
}

/** El tope de bitrate del video, leído de la nota oficial. En kbps. */
export function bitrateMaxDe(f: FormatoSpec): number | null {
  const m = f.nota?.match(/(\d+)\s*Mbps/);
  return m ? Number(m[1]) * 1000 : null;
}

// ---------------------------------------------------------------------------
// El dictamen
// ---------------------------------------------------------------------------

export function revisarCalidad(formatoId: string, medida: Medida): Dictamen {
  const formato = formatoPorId(formatoId);
  if (!formato) throw new Error(`No conozco el formato ${formatoId}.`);

  const fallas: Falla[] = [];
  const sinMedir: ClaveFalla[] = [];
  const red = RED_LABEL[formato.red];

  // --- 3. formato de archivo ------------------------------------------------
  if (medida.archivo) {
    const ext = normalizarExt(medida.archivo);
    if (!formato.archivos.includes(ext)) {
      fallas.push({
        clave: 'formato',
        texto: `El archivo es ${ext.toUpperCase()} y ${red} acepta ${formato.archivos
          .map((a) => a.toUpperCase())
          .join(', ')} en este formato.`,
        // Convertir una imagen es trivial; convertir un PDF a video, no.
        adaptable: convertible(ext, formato),
      });
    }
  } else {
    sinMedir.push('formato');
  }

  // --- 2. peso --------------------------------------------------------------
  if (medida.bytes !== null && formato.pesoMaxMb !== undefined) {
    const mb = medida.bytes / (1024 * 1024);
    if (mb > formato.pesoMaxMb) {
      fallas.push({
        clave: 'peso',
        texto: `Pesa ${mb.toFixed(1)} MB y ${red} acepta hasta ${
          formato.pesoMaxMb < 1 ? `${Math.round(formato.pesoMaxMb * 1024)} KB` : `${formato.pesoMaxMb} MB`
        }.`,
        adaptable: true,
      });
    }
  } else if (formato.pesoMaxMb !== undefined) {
    sinMedir.push('peso');
  }

  // --- 1. resolución --------------------------------------------------------
  const minimo = anchoMinimoDe(formato);
  if (medida.ancho !== null) {
    if (minimo !== null && medida.ancho < minimo) {
      fallas.push({
        clave: 'resolucion',
        texto: `Mide ${medida.ancho} px de ancho y ${red} pide al menos ${minimo} px. Estirarla la deja borrosa.`,
        // Subir de resolución es inventar píxeles. Adaptar NO lo hace.
        adaptable: false,
      });
    }
  } else {
    sinMedir.push('resolucion');
  }

  // --- 5. aspecto -----------------------------------------------------------
  if (medida.ancho !== null && medida.alto !== null && medida.alto > 0) {
    const suyo = medida.ancho / medida.alto;
    const lienzo = formato.ancho / formato.alto;
    const desvio = Math.abs(suyo - lienzo) / lienzo;
    if (desvio > toleranciaDe(formato)) {
      const ofrece = comoLista(proporcionesDe(formato.red, formato.tipo, formato.tipo === 'imagen'));
      fallas.push({
        clave: 'aspecto',
        texto: `${red} requiere ${ofrece} en ${etiquetaDeHueco(formato)} y tu pieza es ${enPalabras(
          suyo,
        )} (${medida.ancho} × ${medida.alto}). Tal cual, la red la recorta.`,
        adaptable: true,
      });
    }
  } else {
    sinMedir.push('aspecto');
  }

  // --- 4. duración ----------------------------------------------------------
  if (formato.tipo === 'video') {
    if (medida.duracionS !== null) {
      if (formato.duracionMaxS !== undefined && medida.duracionS > formato.duracionMaxS) {
        fallas.push({
          clave: 'duracion',
          texto: `Dura ${segundos(medida.duracionS)} y ${red} acepta hasta ${segundos(
            formato.duracionMaxS,
          )} en ${etiquetaDeHueco(formato)}.`,
          // Cortar un video es una decisión de edición, no un botón: qué se
          // queda fuera lo decide quien lo hizo.
          adaptable: false,
        });
      }
      if (formato.duracionMinS !== undefined && medida.duracionS < formato.duracionMinS) {
        fallas.push({
          clave: 'duracion',
          texto: `Dura ${segundos(medida.duracionS)} y ${red} pide al menos ${segundos(
            formato.duracionMinS,
          )}.`,
          adaptable: false,
        });
      }
    } else {
      sinMedir.push('duracion');
    }

    // --- 6. bitrate ---------------------------------------------------------
    const tope = bitrateMaxDe(formato);
    if (tope !== null) {
      if (medida.bitrateKbps !== null) {
        if (medida.bitrateKbps > tope) {
          fallas.push({
            clave: 'bitrate',
            texto: `Va a ${(medida.bitrateKbps / 1000).toFixed(1)} Mbps y ${red} admite hasta ${
              tope / 1000
            } Mbps.`,
            adaptable: true,
          });
        }
      } else {
        sinMedir.push('bitrate');
      }
    }
  }

  return {
    formato,
    medida,
    fallas,
    publicable: fallas.length === 0,
    adaptable: fallas.length > 0 && fallas.every((f) => f.adaptable),
    sinMedir,
    fuente: formato.fuente,
    leidoEl: formato.leidoEl,
  };
}

function etiquetaDeHueco(f: FormatoSpec): string {
  if (f.id.includes('reel')) return 'un reel';
  if (f.id.includes('short')) return 'un Short';
  if (f.id.includes('historia')) return 'una historia';
  if (f.id.includes('carrusel')) return 'un carrusel';
  if (f.id.includes('miniatura')) return 'la miniatura';
  if (f.tipo === 'video') return 'video';
  return 'el muro';
}

/** 1.7777… → "16:9". Solo las que la gente reconoce; el resto, el número. */
function enPalabras(r: number): string {
  const conocidas: Array<[number, string]> = [
    [16 / 9, '16:9'],
    [1.91, '1.91:1'],
    [4 / 3, '4:3'],
    [1, '1:1'],
    [4 / 5, '4:5'],
    [9 / 16, '9:16'],
    [3 / 4, '3:4'],
    [2 / 3, '2:3'],
  ];
  for (const [v, nombre] of conocidas) if (Math.abs(r - v) / v < 0.02) return nombre;
  return `${r.toFixed(2)}:1`;
}

function segundos(s: number): string {
  if (s < 60) return `${Math.round(s)} s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return r ? `${m} min ${r} s` : `${m} min`;
}

export function normalizarExt(x: string): string {
  const e = x.toLowerCase().replace(/^\./, '').trim();
  if (e === 'jpeg') return 'jpg';
  if (e === 'quicktime') return 'mov';
  return e;
}

/** ¿Se puede pasar de este archivo a uno que la red acepte, sin inventar nada? */
function convertible(ext: string, f: FormatoSpec): boolean {
  const imagenes = ['jpg', 'png', 'webp', 'gif', 'avif', 'tiff', 'bmp'];
  const videos = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'mpeg', '3gp'];
  if (f.tipo === 'imagen') return imagenes.includes(ext) && f.archivos.some((a) => imagenes.includes(a));
  if (f.tipo === 'video') return videos.includes(ext) && f.archivos.some((a) => videos.includes(a));
  return false;
}

// ---------------------------------------------------------------------------
// Medir de verdad
// ---------------------------------------------------------------------------

const EXT_DE_URL = /\.([a-z0-9]{2,5})(?:\?|#|$)/i;

export function extDeUrl(url: string): string | null {
  const m = url.match(EXT_DE_URL);
  return m ? normalizarExt(m[1]!) : null;
}

export function esVideo(url: string, formato?: FormatoSpec | null): boolean {
  if (formato?.tipo === 'video') return true;
  const e = extDeUrl(url);
  return e !== null && ['mp4', 'mov', 'webm', 'mkv', 'avi', 'mpeg', '3gp'].includes(e);
}

/**
 * Medir una imagen. `sharp` ya es dependencia de la casa (compone las piezas),
 * así que esto corre igual en Vercel que en el servidor.
 */
export async function medirImagen(buf: Buffer): Promise<Medida> {
  const sharp = (await import('sharp')).default;
  const m = await sharp(buf).metadata();
  return {
    ancho: m.width ?? null,
    alto: m.height ?? null,
    bytes: buf.length,
    archivo: m.format ? normalizarExt(m.format) : null,
    duracionS: null,
    bitrateKbps: null,
  };
}

/**
 * Medir un video con ffprobe, en el servidor.
 *
 * ffprobe lee una URL directamente, así que no hace falta bajarse 300 MB para
 * saber cuánto duran. Si el relay no está configurado, se dice — no se devuelve
 * una medida vacía como si el video estuviera bien.
 */
export async function medirVideo(url: string): Promise<Medida> {
  if (!almacenListo()) throw new SinAlmacen();
  const salida = await relayExec(
    `ffprobe -v quiet -print_format json -show_format -show_streams ${JSON.stringify(url)}`,
  );
  const json = salida.slice(salida.indexOf('{'));
  let datos: any;
  try {
    datos = JSON.parse(json);
  } catch {
    throw new Error('No se pudo leer el video: ffprobe no devolvió nada legible.');
  }
  const video = (datos.streams ?? []).find((s: any) => s.codec_type === 'video');
  const dur = Number(datos.format?.duration);
  const bits = Number(datos.format?.bit_rate);
  return {
    ancho: video?.width ?? null,
    alto: video?.height ?? null,
    bytes: Number(datos.format?.size) || null,
    archivo: extDeUrl(url),
    duracionS: Number.isFinite(dur) ? dur : null,
    bitrateKbps: Number.isFinite(bits) ? Math.round(bits / 1000) : null,
  };
}

/** Medir lo que haya en esa dirección, sea imagen o video. */
export async function medirPieza(url: string, formatoId?: string | null): Promise<Medida> {
  const formato = formatoId ? formatoPorId(formatoId) : null;
  if (esVideo(url, formato)) return medirVideo(url);
  const buf = await bajarImagen(url);
  if (!buf) throw new Error('No se pudo bajar la pieza para medirla.');
  const m = await medirImagen(buf);
  // La extensión de la URL manda sobre lo que diga sharp cuando las dos
  // existen: lo que la red va a recibir es el archivo, no el contenedor que
  // sharp adivinó.
  return { ...m, archivo: extDeUrl(url) ?? m.archivo };
}

// ---------------------------------------------------------------------------
// Adaptar
// ---------------------------------------------------------------------------

export interface Adaptacion {
  url: string;
  medida: Medida;
  /** Qué se le hizo, en español. Va a la bitácora y a la pantalla. */
  queSeHizo: string[];
  dictamen: Dictamen;
}

/**
 * Dejar la pieza como la pide la red.
 *
 * Imagen: `sharp` recorta al lienzo con `cover` —la misma regla que usa el
 * visor para enseñar el recorte, así que lo que se aprobó es lo que sale— y
 * baja la calidad JPEG en escalones hasta caber en el tope de peso.
 *
 * Video: ffmpeg en el servidor, escalando y recortando al lienzo y con el
 * bitrate topado. No corta duración: qué se queda fuera de un video no lo
 * decide un botón.
 */
export async function adaptarPieza(input: {
  url: string;
  formatoId: string;
}): Promise<Adaptacion> {
  const formato = formatoPorId(input.formatoId);
  if (!formato) throw new Error(`No conozco el formato ${input.formatoId}.`);

  const antes = await medirPieza(input.url, input.formatoId);
  const previo = revisarCalidad(input.formatoId, antes);
  if (previo.publicable) {
    return { url: input.url, medida: antes, queSeHizo: ['Ya cumplía: no se tocó.'], dictamen: previo };
  }
  const imposibles = previo.fallas.filter((f) => !f.adaptable);
  if (imposibles.length) {
    throw new Error(
      `Esto no lo arregla un recorte: ${imposibles.map((f) => f.texto).join(' ')} Hay que rehacer la pieza.`,
    );
  }

  const r = formato.tipo === 'video' ? await adaptarVideo(input.url, formato) : await adaptarImagen(input.url, formato);
  const despues = await medirPieza(r.url, input.formatoId);
  return { url: r.url, medida: despues, queSeHizo: r.queSeHizo, dictamen: revisarCalidad(input.formatoId, despues) };
}

async function adaptarImagen(url: string, f: FormatoSpec): Promise<{ url: string; queSeHizo: string[] }> {
  const buf = await bajarImagen(url);
  if (!buf) throw new Error('No se pudo bajar la pieza para adaptarla.');
  const sharp = (await import('sharp')).default;
  const queSeHizo: string[] = [];

  // A qué archivo se convierte: el primero de la lista oficial que sepamos
  // escribir. Instagram por API solo acepta JPEG, y esto es lo que lo cumple.
  const destino = f.archivos.find((a) => ['jpg', 'png'].includes(a)) ?? 'jpg';

  const base = sharp(buf).resize(f.ancho, f.alto, { fit: 'cover', position: 'attention' });
  queSeHizo.push(`Recortada a ${f.ancho} × ${f.alto} px (${f.ratio}), centrando lo que importa.`);

  let salida: Buffer;
  if (destino === 'png') {
    salida = await base.png({ compressionLevel: 9 }).toBuffer();
    queSeHizo.push('Guardada como PNG.');
  } else {
    // Escalones de calidad hasta caber en el tope. Empezar en 90 y bajar es
    // mejor que adivinar: una foto con cielo plano cabe en 90 y una con mucha
    // textura necesita 60, y probar cuesta milisegundos.
    const tope = f.pesoMaxMb !== undefined ? f.pesoMaxMb * 1024 * 1024 : Infinity;
    salida = await base.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    let calidad = 90;
    while (salida.length > tope && calidad > 40) {
      calidad -= 10;
      salida = await sharp(buf)
        .resize(f.ancho, f.alto, { fit: 'cover', position: 'attention' })
        .jpeg({ quality: calidad, mozjpeg: true })
        .toBuffer();
    }
    queSeHizo.push(
      calidad === 90
        ? 'Guardada como JPEG al 90 % de calidad.'
        : `Guardada como JPEG al ${calidad} % para caber en el tope de peso de la red.`,
    );
  }

  const nueva = await subirImagen(salida, destino === 'png' ? 'png' : 'jpg');
  return { url: nueva, queSeHizo };
}

async function adaptarVideo(url: string, f: FormatoSpec): Promise<{ url: string; queSeHizo: string[] }> {
  if (!almacenListo()) throw new SinAlmacen();
  const destino = f.archivos.includes('mp4') ? 'mp4' : f.archivos[0]!;
  const nombre = `${crypto.randomUUID()}.${destino}`;
  const tope = bitrateMaxDe(f);
  const bitrate = tope ? Math.min(tope, 8000) : 8000;

  // `scale` + `crop` es el mismo recorte que hace la red y que enseña el visor:
  // se agranda hasta cubrir el lienzo y se recorta el sobrante por el centro.
  const filtro = `scale=${f.ancho}:${f.alto}:force_original_aspect_ratio=increase,crop=${f.ancho}:${f.alto}`;
  const cmd = [
    `mkdir -p ${MEDIA.dir}`,
    `ffmpeg -nostdin -y -i ${JSON.stringify(url)} -vf ${JSON.stringify(filtro)}`,
    `-c:v libx264 -preset medium -b:v ${bitrate}k -maxrate ${bitrate}k -bufsize ${bitrate * 2}k`,
    `-pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 128k -ar 48000`,
    `${MEDIA.dir}/${nombre} 2>&1 | tail -5`,
    `&& chmod 644 ${MEDIA.dir}/${nombre} && echo ADAPTADO`,
  ].join(' ');

  const salida = await relayExec(cmd);
  if (!salida.includes('ADAPTADO')) {
    throw new Error(`No se pudo recodificar el video: ${salida.slice(-300)}`);
  }
  return {
    url: `${MEDIA.publicBase}/${nombre}`,
    queSeHizo: [
      `Recortado a ${f.ancho} × ${f.alto} px (${f.ratio}).`,
      `Recodificado a ${destino.toUpperCase()} H.264 con audio AAC a 48 kHz y ${(bitrate / 1000).toFixed(
        1,
      )} Mbps, con el índice al frente para que la red lo pueda leer mientras lo sube.`,
    ],
  };
}
