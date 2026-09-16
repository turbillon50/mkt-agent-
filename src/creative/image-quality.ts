/** Control visual antes de que una imagen pueda entrar a la galería. */
import type { GeneratedImage } from './gemini-image';
import type { FormatoSpec } from './specs';

const MODELO_QA = 'gemini-2.5-flash';

export interface EvaluacionVisual {
  aprobada: boolean;
  score: number;
  razones: string[];
  correccion: string;
  modelo: string;
}

function dataDe(imagen: GeneratedImage): { mimeType: string; base64: string } | null {
  const match = imagen.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  return match ? { mimeType: match[1]!, base64: match[2]! } : null;
}

function normalizar(crudo: any): EvaluacionVisual {
  const score = Math.max(0, Math.min(100, Number(crudo?.score) || 0));
  const razones = Array.isArray(crudo?.razones)
    ? crudo.razones.filter((r: unknown) => typeof r === 'string').map((r: string) => r.slice(0, 220)).slice(0, 6)
    : [];
  const critica = Boolean(
    crudo?.texto_legible
      || crudo?.marca_agua
      || crudo?.artefactos
      || crudo?.irrelevante
      || crudo?.cliche_visual
      || crudo?.marca_inconsistente,
  );
  return {
    aprobada: crudo?.aprobada === true && score >= 80 && !critica,
    score,
    razones,
    correccion:
      typeof crudo?.correccion === 'string'
        ? crudo.correccion.trim().slice(0, 700)
        : razones.join('; ').slice(0, 700),
    modelo: MODELO_QA,
  };
}

/**
 * Rechaza texto inventado, stock genérico, anatomía/objetos rotos y escenas
 * que no corresponden al negocio. Si la revisión no está disponible, falla
 * cerrado: una imagen sin revisión no entra a la galería.
 */
export async function evaluarImagenBase(input: {
  imagen: GeneratedImage;
  brief: string;
  contexto: string;
  formato: FormatoSpec;
  direccion: string;
}): Promise<EvaluacionVisual | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  const archivo = dataDe(input.imagen);
  if (!apiKey || !archivo) return null;

  const instrucciones = `Actúa como control de calidad de una agencia creativa. La imagen adjunta es una BASE sin copy ni logo todavía.

Evalúala contra el negocio y el encargo, no por gusto personal. Recházala si ocurre cualquiera:
- parece stock genérico y no comunica el negocio o la idea concreta;
- usa un cliché automático de IA (cristal o gema azul, circuitos, cerebro, holograma, portal, globo, cohete, ajedrez o silueta frente a una ciudad) que no fue pedido literalmente;
- contiene letras, palabras, números, códigos hex, logotipos o marcas de agua;
- tiene manos, caras, arquitectura, objetos, perspectiva o sombras defectuosas;
- inventa una interfaz, producto, inmueble, persona, dato o promesa que no está respaldada;
- el sujeto queda cortado o invade la zona donde irá el titular;
- se ve barata, saturada, repetitiva o no resistiría una revisión profesional.
- contradice la dirección visual del proyecto, especialmente su color de fondo, materialidad o nivel de contraste.

Lienzo final: ${input.formato.label}, ${input.formato.ancho}x${input.formato.alto}.
Dirección: ${input.direccion}
Encargo: ${input.brief}
${input.contexto.slice(0, 3_500)}

Devuelve sólo JSON:
{"aprobada":true,"score":0,"razones":["..."],"correccion":"instrucción concreta para regenerar","texto_legible":false,"marca_agua":false,"artefactos":false,"irrelevante":false,"cliche_visual":false,"marca_inconsistente":false}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELO_QA}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: instrucciones },
            { inline_data: { mime_type: archivo.mimeType, data: archivo.base64 } },
          ],
        }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
      }),
      cache: 'no-store',
    },
  ).catch(() => null);
  if (!res?.ok) return null;
  const data = await res.json().catch(() => null);
  const texto: string | undefined = data?.candidates?.[0]?.content?.parts?.find(
    (p: any) => typeof p?.text === 'string',
  )?.text;
  if (!texto) return null;
  try {
    return normalizar(JSON.parse(texto));
  } catch {
    const objeto = texto.match(/\{[\s\S]*\}/)?.[0];
    return objeto ? normalizar(JSON.parse(objeto)) : null;
  }
}
