/**
 * Gemini leyendo archivos de verdad: video, audio, PDF escaneado, imagen.
 *
 * `gemini-vision.ts` ya existía y sirve para CONTESTAR un turno del chat con
 * una foto pegada. Esto es otra cosa: EXTRAER lo que dice un archivo para
 * guardarlo en `assistant_files.extracted_text` y no volver a pagarlo nunca.
 *
 * Dos caminos, y el que se toma depende del tamaño:
 *
 *   · **En línea** (`inline_data`), hasta 18 MB. Es un solo viaje. El tope real
 *     de la API es 20 MB para la petición ENTERA, y la petición lleva además
 *     las instrucciones y el base64 infla un tercio; 18 MB de archivo ya se
 *     pasan. Se deja el corte en 14 MB de archivo, que en base64 son ~18.7 MB.
 *
 *   · **Por la API de archivos** (`files.upload` → `file_data`), hasta 2 GB.
 *     Son tres viajes y una espera: el archivo se sube, Gemini lo PROCESA (un
 *     video de un minuto tarda segundos en quedar `ACTIVE`) y hasta entonces
 *     se puede preguntar por él. Preguntar antes devuelve un 400 que dice
 *     "file is not in an ACTIVE state" — por eso hay espera y no un `await`
 *     optimista.
 *
 * Por qué no se extraen fotogramas con ffmpeg, que es lo que decía el spec:
 * en el entorno donde corre esta app (funciones de Vercel) NO hay ffmpeg ni
 * forma de instalarlo. Gemini 2.5 recibe el video entero y lo muestrea él a
 * 1 fps con su audio — es la misma idea, hecha donde sí se puede hacer.
 */

const MODEL = 'gemini-2.5-flash';
const BASE = 'https://generativelanguage.googleapis.com';

/** Arriba de esto se sube por la API de archivos en vez de mandarlo en línea. */
export const TOPE_EN_LINEA = 14 * 1024 * 1024;

export function geminiListo(): boolean {
  return Boolean((process.env.GEMINI_API_KEY ?? '').trim());
}

function llave(): string {
  const k = (process.env.GEMINI_API_KEY ?? '').trim();
  if (!k) throw new Error('GEMINI_API_KEY no está configurada.');
  return k;
}

/* --------------------------------------------------------------------------
   La API de archivos
   -------------------------------------------------------------------------- */

interface ArchivoDeGemini {
  uri: string;
  name: string;
  state: string;
}

async function subirAGemini(bytes: Buffer, mime: string, nombre: string): Promise<ArchivoDeGemini> {
  const k = llave();

  const inicio = await fetch(`${BASE}/upload/v1beta/files?key=${k}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.byteLength),
      'X-Goog-Upload-Header-Content-Type': mime,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: nombre } }),
  });
  if (!inicio.ok) {
    throw new Error(`Gemini no aceptó el archivo (HTTP ${inicio.status}).`);
  }
  const destino = inicio.headers.get('x-goog-upload-url');
  if (!destino) throw new Error('Gemini no devolvió a dónde subir el archivo.');

  const subida = await fetch(destino, {
    method: 'POST',
    headers: {
      'Content-Length': String(bytes.byteLength),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: new Uint8Array(bytes),
  });
  if (!subida.ok) {
    throw new Error(`No se pudo subir el archivo a Gemini (HTTP ${subida.status}).`);
  }
  const data = (await subida.json()) as { file?: ArchivoDeGemini };
  if (!data.file?.uri) throw new Error('Gemini no devolvió el identificador del archivo.');
  return data.file;
}

/**
 * Espera a que Gemini termine de procesar. Sin esto, preguntar por un video
 * recién subido devuelve 400 "file is not in an ACTIVE state".
 */
async function esperarActivo(archivo: ArchivoDeGemini, msTope = 120_000): Promise<void> {
  const k = llave();
  let estado = archivo.state;
  let espera = 1000;
  let gastado = 0;
  while (estado === 'PROCESSING' && gastado < msTope) {
    await new Promise((r) => setTimeout(r, espera));
    gastado += espera;
    espera = Math.min(espera * 1.5, 8000);
    const res = await fetch(`${BASE}/v1beta/${archivo.name}?key=${k}`, { cache: 'no-store' });
    if (!res.ok) break;
    const d = (await res.json()) as { state?: string };
    estado = d.state ?? 'ACTIVE';
  }
  if (estado === 'FAILED') throw new Error('Gemini no pudo procesar el archivo.');
  if (estado === 'PROCESSING') {
    throw new Error('Gemini sigue procesando el archivo. Vuelve a intentarlo en un minuto.');
  }
}

async function borrarDeGemini(archivo: ArchivoDeGemini): Promise<void> {
  // De higiene: el archivo se borra solo a las 48 h, pero dejarlo tirado en el
  // proyecto de Gemini cuando ya se extrajo el texto no le sirve a nadie.
  await fetch(`${BASE}/v1beta/${archivo.name}?key=${llave()}`, { method: 'DELETE' }).catch(
    () => undefined,
  );
}

/* --------------------------------------------------------------------------
   Leer
   -------------------------------------------------------------------------- */

async function generar(partes: unknown[]): Promise<string> {
  const res = await fetch(`${BASE}/v1beta/models/${MODEL}:generateContent?key=${llave()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: partes }],
      // Leer un archivo no es escribir un post: nada de creatividad.
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Gemini contestó ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const texto = data.candidates?.[0]?.content?.parts?.find((p) => typeof p.text === 'string')?.text;
  if (!texto) throw new Error('Gemini no devolvió texto.');
  return texto.trim();
}

/**
 * Lee un archivo y devuelve lo que dice, en texto.
 *
 * `instruccion` cambia según la familia: a un video se le pide el resumen con
 * marcas de tiempo, a una imagen que describa lo que se ve y transcriba el
 * texto que traiga. Da igual el tipo: lo que sale es texto que se guarda y se
 * le pone al modelo en el turno siguiente.
 */
export async function leerConGemini(input: {
  bytes: Buffer;
  mime: string;
  nombre: string;
  instruccion: string;
}): Promise<string> {
  const { bytes, mime, nombre, instruccion } = input;

  if (bytes.byteLength <= TOPE_EN_LINEA) {
    return generar([
      { text: instruccion },
      { inline_data: { mime_type: mime, data: bytes.toString('base64') } },
    ]);
  }

  const archivo = await subirAGemini(bytes, mime, nombre);
  try {
    await esperarActivo(archivo);
    return await generar([
      { text: instruccion },
      { file_data: { mime_type: mime, file_uri: archivo.uri } },
    ]);
  } finally {
    await borrarDeGemini(archivo);
  }
}
