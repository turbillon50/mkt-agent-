/**
 * Leer de verdad lo que el usuario adjunta.
 *
 * La diferencia entre "acepta archivos" y "lee archivos" es esta carpeta. Un
 * chat que guarda el PDF y le dice al modelo «el usuario adjuntó brochure.pdf»
 * no leyó nada: el modelo contesta sobre el NOMBRE del archivo. Aquí cada
 * familia tiene su lector y lo que sale es texto que entra al contexto del
 * turno.
 *
 * Tres reglas que se ganaron a golpes en corridas anteriores:
 *
 *  1. **Se lee UNA vez.** El resultado se guarda en `assistant_files`. Releer
 *     un PDF de 40 páginas en cada turno de la conversación es pagar cinco
 *     veces el mismo trabajo y tardar cinco veces más en contestar.
 *
 *  2. **Lo que no se puede leer se DICE.** Un `.heic` de iPhone, un `.doc` de
 *     Office 97 o un PDF con contraseña no se pueden abrir. El chip se queda
 *     con su motivo en español, y el modelo recibe esa misma frase: contestar
 *     sobre un archivo que no se pudo abrir, como si se hubiera abierto, es la
 *     forma más cara de mentir.
 *
 *  3. **Nada se trunca en silencio.** Cuando un documento pasa del tope, se
 *     corta Y se anota dónde se cortó. Medio PDF leído sin avisar contesta con
 *     media verdad, que es peor que decir "no pude".
 */
import { bajarParaLeer, TOPE_DE_LECTURA } from './almacen';
import { tipoDe, type FamiliaArchivo } from './tipos-archivo';
import { geminiListo, leerConGemini } from '../../lib/gemini-media';

/** El tope de texto que se guarda por archivo. ~60 mil caracteres. */
export const TOPE_TEXTO = 60_000;

export interface Lectura {
  estado: 'leido' | 'sin-lector' | 'error';
  texto: string | null;
  nota: string | null;
}

const INSTRUCCIONES: Record<FamiliaArchivo, string> = {
  imagen:
    'Describe con precisión esta imagen para que alguien que no la ve pueda trabajar con ella: qué se ve, composición, colores dominantes con su hex aproximado, y TRANSCRIBE literalmente todo el texto que aparezca. No opines ni propongas nada: solo describe y transcribe.',
  video:
    'Resume este video para alguien que no lo vio y que va a hacer contenido con él. Di de qué trata, qué se ve, qué se dice (transcribe lo hablado) y marca los momentos con su tiempo (0:12, 0:35…). Termina con los 3 momentos que mejor funcionarían como gancho. No inventes nada que no esté en el video.',
  audio:
    'Transcribe literalmente este audio en español. Si hay más de una voz, sepáralas. Al final, en dos renglones, di de qué se habló. No agregues nada que no se haya dicho.',
  documento:
    'Extrae el contenido de este documento en texto plano y ordenado: títulos, párrafos, listas, cifras y lo que digan las tablas. Si hay imágenes con texto, transcríbelo. No resumas ni interpretes: quiero el contenido, no una opinión sobre el contenido.',
  hoja: 'Extrae el contenido de esta hoja de cálculo como tablas en texto.',
  texto: 'Extrae el contenido de este archivo tal cual.',
};

export interface ArchivoALeer {
  nombre: string;
  url: string;
  mime: string;
  size: number;
}

export async function leerAdjunto(archivo: ArchivoALeer): Promise<Lectura> {
  const tipo = tipoDe(archivo.nombre, archivo.mime);
  if (!tipo) {
    return { estado: 'sin-lector', texto: null, nota: 'No sé abrir este tipo de archivo.' };
  }
  if (tipo.lector === 'ninguno') {
    return {
      estado: 'sin-lector',
      texto: null,
      nota: notaDeSinLector(archivo.nombre),
    };
  }

  if (archivo.size > TOPE_DE_LECTURA) {
    return {
      estado: 'sin-lector',
      texto: null,
      nota: `«${archivo.nombre}» pesa más de ${Math.round(TOPE_DE_LECTURA / (1024 * 1024))} MB: se guarda y se puede ver, pero no lo puedo abrir entero para leerlo.`,
    };
  }

  try {
    const bytes = await bajarParaLeer(archivo.url);
    switch (tipo.lector) {
      case 'texto':
        return recortar(bytes.toString('utf8'));
      case 'hoja':
        return recortar(await leerHoja(bytes, archivo.nombre));
      case 'docx':
        return recortar(await leerDocx(bytes));
      case 'pptx':
        return recortar(await leerPptx(bytes));
      case 'pdf':
        return await leerPdf(bytes, archivo);
      case 'gemini-imagen':
      case 'gemini-medio':
        if (!geminiListo()) {
          return {
            estado: 'error',
            texto: null,
            nota: 'No puedo mirar este archivo: falta GEMINI_API_KEY en el entorno.',
          };
        }
        return recortar(
          await leerConGemini({
            bytes,
            mime: mimeReal(archivo.mime, archivo.nombre),
            nombre: archivo.nombre,
            instruccion: INSTRUCCIONES[tipo.familia],
          }),
        );
      default:
        return { estado: 'sin-lector', texto: null, nota: 'No sé abrir este tipo de archivo.' };
    }
  } catch (e) {
    return {
      estado: 'error',
      texto: null,
      nota: e instanceof Error ? e.message : 'No pude leer el archivo.',
    };
  }
}

function notaDeSinLector(nombre: string): string {
  const ext = nombre.slice(nombre.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'heic' || ext === 'heif') {
    return 'Es una foto en HEIC, el formato de fábrica del iPhone, y ningún modelo lo lee todavía. Guárdala como JPG y la miro.';
  }
  if (ext === 'doc' || ext === 'ppt') {
    return `Es un ${ext === 'doc' ? 'Word' : 'PowerPoint'} del formato viejo (binario). Guárdalo como .${ext}x y lo leo.`;
  }
  return 'Lo guardé, pero no tengo con qué abrirlo.';
}

/** El navegador miente con el MIME. Para Gemini importa que sea el correcto. */
function mimeReal(mime: string, nombre: string): string {
  if (mime && mime !== 'application/octet-stream' && mime.includes('/')) return mime;
  const ext = nombre.slice(nombre.lastIndexOf('.') + 1).toLowerCase();
  const tabla: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    m4a: 'audio/mp4',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    pdf: 'application/pdf',
  };
  return tabla[ext] ?? 'application/octet-stream';
}

function recortar(texto: string): Lectura {
  // Se quitan los bytes NUL antes de nada: Postgres rechaza un `\u0000` en
  // una columna `text` con "unsupported Unicode escape sequence", y los PDF
  // los sueltan a diario. Guardar la lectura reventaría al insertar.
  const limpio = (texto ?? '').replace(/\u0000/g, '').trim();
  if (!limpio) {
    return { estado: 'leido', texto: '', nota: 'El archivo no tenía texto que leer.' };
  }
  if (limpio.length <= TOPE_TEXTO) {
    return { estado: 'leido', texto: limpio, nota: null };
  }
  return {
    estado: 'leido',
    texto: limpio.slice(0, TOPE_TEXTO),
    nota: `El archivo es largo: leí los primeros ${TOPE_TEXTO.toLocaleString('es-MX')} caracteres de ${limpio.length.toLocaleString('es-MX')}.`,
  };
}

/* --------------------------------------------------------------------------
   Los lectores
   -------------------------------------------------------------------------- */

/**
 * PDF: primero el texto incrustado, que es exacto y gratis. Si el PDF trae
 * menos de 200 caracteres es que está ESCANEADO —páginas que son fotos— y ahí
 * sí se le manda a Gemini, que lo mira página por página. Es el "páginas como
 * imagen si hace falta" del spec, y el "si hace falta" es literal: mandar a un
 * modelo un PDF de texto que ya se pudo leer es pagar por nada.
 */
async function leerPdf(bytes: Buffer, archivo: ArchivoALeer): Promise<Lectura> {
  let texto = '';
  let paginas = 0;
  let fallo: string | null = null;
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(bytes) });
    try {
      const r = await parser.getText();
      texto = (r.text ?? '').trim();
      paginas = r.total ?? r.pages?.length ?? 0;
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  } catch (e) {
    fallo = e instanceof Error ? e.message : String(e);
  }

  if (texto.length >= 200) {
    const salida = recortar(texto);
    return {
      ...salida,
      nota: [paginas ? `${paginas} páginas.` : null, salida.nota].filter(Boolean).join(' ') || null,
    };
  }

  if (!geminiListo()) {
    if (texto) return recortar(texto);
    return {
      estado: 'error',
      texto: null,
      nota: fallo
        ? `No pude abrir el PDF: ${fallo}`
        : 'El PDF no trae texto (parece escaneado) y no puedo mirarlo: falta GEMINI_API_KEY.',
    };
  }

  const mirado = await leerConGemini({
    bytes,
    mime: 'application/pdf',
    nombre: archivo.nombre,
    instruccion: INSTRUCCIONES.documento,
  });
  const salida = recortar(mirado);
  return {
    ...salida,
    nota: [
      paginas ? `${paginas} páginas.` : null,
      'El PDF no traía texto seleccionable (está escaneado): lo leí mirando las páginas.',
      salida.nota,
    ]
      .filter(Boolean)
      .join(' '),
  };
}

async function leerDocx(bytes: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const r = await mammoth.extractRawText({ buffer: bytes });
  return r.value ?? '';
}

/**
 * PPTX: no hay librería en el árbol que lo lea y no hace falta una. Un .pptx
 * es un ZIP con un XML por diapositiva; el texto vive en los nodos `<a:t>`.
 * Se descomprime con `fflate` y se sacan esos nodos, en orden de diapositiva.
 *
 * El orden importa: `ppt/slides/slide10.xml` va DESPUÉS de `slide9.xml`, y
 * ordenar por nombre pone la 10 antes de la 2. Se ordena por el número.
 */
async function leerPptx(bytes: Buffer): Promise<string> {
  const { unzipSync, strFromU8 } = await import('fflate');
  const zip = unzipSync(new Uint8Array(bytes));
  const diapositivas = Object.keys(zip)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => numeroDeDiapositiva(a) - numeroDeDiapositiva(b));

  const partes: string[] = [];
  for (const nombre of diapositivas) {
    const xml = strFromU8(zip[nombre]!);
    const textos = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
      .map((m) => desescapar(m[1] ?? ''))
      .filter((t) => t.trim());
    if (textos.length) {
      partes.push(`— Diapositiva ${numeroDeDiapositiva(nombre)} —\n${textos.join('\n')}`);
    }
  }
  return partes.join('\n\n');
}

function numeroDeDiapositiva(ruta: string): number {
  return Number(ruta.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
}

function desescapar(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Hojas: XLSX, XLS y CSV por el mismo camino. Salen como tablas en texto
 * separadas por tabuladores, con el nombre de cada pestaña arriba — un modelo
 * lee eso mucho mejor que un JSON de filas, y ocupa la mitad.
 *
 * El tope de 400 filas por pestaña no es pereza: una exportación de leads trae
 * 8 mil renglones y meterlos todos en el contexto tira el turno por tokens. Se
 * corta y se dice cuántas quedaron fuera.
 */
const TOPE_FILAS = 400;

async function leerHoja(bytes: Buffer, nombre: string): Promise<string> {
  const XLSX = await import('xlsx');
  const libro = XLSX.read(bytes, { type: 'buffer', cellDates: true });
  const partes: string[] = [];

  for (const pestana of libro.SheetNames) {
    const hoja = libro.Sheets[pestana];
    if (!hoja) continue;
    const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, blankrows: false });
    if (!filas.length) continue;

    const cabeza = libro.SheetNames.length > 1 ? `— Pestaña «${pestana}» —` : `— ${nombre} —`;
    const cuerpo = filas
      .slice(0, TOPE_FILAS)
      .map((f) => (Array.isArray(f) ? f.map(celda).join('\t') : celda(f)))
      .join('\n');
    const sobrantes = filas.length - TOPE_FILAS;
    partes.push(
      [
        cabeza,
        `${filas.length} filas.`,
        cuerpo,
        sobrantes > 0 ? `… y ${sobrantes} filas más que no leí.` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  return partes.join('\n\n');
}

function celda(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}
