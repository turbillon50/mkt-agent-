/**
 * El alta guiada del kit: el usuario sube el logo y Gemini lo MIRA.
 *
 * Mirar es la palabra. No se adivina la paleta del nombre del negocio ni del
 * giro: se le pasa el archivo a un modelo con visión y se le pide que saque los
 * colores que REALMENTE están en el logo, con su rol. Lo que devuelve es una
 * PROPUESTA — el usuario la corrige y la aprueba, y hasta ese momento no es el
 * kit de nadie.
 *
 * Es una llamada aparte y no la de chat porque aquí se necesita JSON, no prosa:
 * pedirle a un modelo conversacional que conteste JSON dentro de un párrafo es
 * cómo se acaba parseando texto con expresiones regulares.
 */
import type { PaletteEntry, FontEntry } from '../db/schema';
import { limpiarPaleta, limpiarTipografias, limpiarPalabras } from './brand-kit';

const MODELO = 'gemini-2.5-flash';

export interface PropuestaDeKit {
  paleta: PaletteEntry[];
  tipografias: FontEntry[];
  tono: string;
  palabrasProhibidas: string[];
  /** Lo que el modelo vio en el logo, en una línea, para enseñárselo al usuario. */
  lectura: string;
  modelo: string;
}

const INSTRUCCIONES = `Eres el director de arte de una agencia. Te doy el logotipo de un negocio y quiero que me devuelvas el arranque de su manual de marca.

Mira el archivo de verdad: saca los colores que ESTÁN en la imagen, no los que te parecerían bonitos.

Contesta SOLO un objeto JSON, sin texto antes ni después, con esta forma exacta:

{
  "lectura": "qué ves en el logo, en una frase",
  "paleta": [{"rol":"primario","hex":"#RRGGBB","nombre":"cómo llamarías a este color"}],
  "tipografias": [{"rol":"titulos","familia":"nombre de una familia real","peso":"700"}],
  "tono": "cómo debería hablar esta marca, en dos o tres frases",
  "palabras_prohibidas": ["palabras que esta marca no debería usar"]
}

Reglas:
- "rol" de color: exactamente uno de primario, secundario, fondo, texto, acento. Pon SIEMPRE un primario, un fondo y un texto.
- Entre 3 y 6 colores. Los hex en mayúsculas y de 6 dígitos.
- "rol" de tipografía: titulos o texto. Propón dos, y que sean familias que existan de verdad.
- El tono y los nombres de color, en español.`;

export async function proponerKit(input: {
  logoDataUrl: string;
  nombreProyecto: string;
  giro?: string | null;
  sitio?: string | null;
}): Promise<PropuestaDeKit> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no está configurada.');

  const m = input.logoDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error('El logo no llegó en un formato que se pueda leer.');
  const [, mimeType, base64] = m;

  const contexto = [
    `El negocio se llama ${input.nombreProyecto}.`,
    input.giro ? `Se dedica a: ${input.giro}.` : null,
    input.sitio ? `Su sitio es ${input.sitio}.` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `${INSTRUCCIONES}\n\n${contexto}` },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ],
          },
        ],
        // Sin esto el modelo envuelve el JSON en ```json y hay que destaparlo
        // a mano, que es donde se rompe el día que cambie el envoltorio.
        generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
      }),
      cache: 'no-store',
    },
  );

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`No se pudo leer el logo (${res.status}): ${t.slice(0, 180)}`);
  }

  const data = await res.json();
  const texto: string | undefined = data?.candidates?.[0]?.content?.parts?.find(
    (p: any) => typeof p?.text === 'string',
  )?.text;
  if (!texto) throw new Error('El modelo no devolvió nada sobre el logo.');

  let crudo: any;
  try {
    crudo = JSON.parse(texto);
  } catch {
    // Red de seguridad: si algún día vuelve envuelto, se rescata el objeto.
    const dentro = texto.match(/\{[\s\S]*\}/);
    if (!dentro) throw new Error('No se entendió lo que devolvió el modelo.');
    crudo = JSON.parse(dentro[0]);
  }

  const paleta = limpiarPaleta(crudo?.paleta);
  const tipografias = limpiarTipografias(crudo?.tipografias);

  return {
    paleta,
    tipografias,
    tono: typeof crudo?.tono === 'string' ? crudo.tono.trim().slice(0, 600) : '',
    palabrasProhibidas: limpiarPalabras(crudo?.palabras_prohibidas ?? crudo?.palabrasProhibidas),
    lectura: typeof crudo?.lectura === 'string' ? crudo.lectura.trim().slice(0, 300) : '',
    modelo: MODELO,
  };
}
