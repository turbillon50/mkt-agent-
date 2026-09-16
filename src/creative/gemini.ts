/**
 * La imagen BASE de una pieza, con Gemini.
 *
 * Base quiere decir: el fondo, la escena, la atmósfera. El texto, el logo y el
 * botón NO los pone Gemini — los compone el paso siguiente (Canva o sharp).
 * Es a propósito: un modelo de imagen escribe mal y a la tercera letra pone
 * "OFERTTA". Pedirle que ponga el copy del cliente es garantizar que la pieza
 * no se pueda usar.
 *
 * El lienzo lo manda la spec de la red (`src/creative/specs.ts`). Gemini acepta
 * una proporción, pero no la respeta al píxel: pidiéndole 4:5 devolvió
 * 896 × 1152 (medido 16-sep-2026), que es 7:9. Por eso siempre se recorta
 * después al tamaño exacto — la red sí cuenta los píxeles.
 */
import { generateImage } from './gemini-image';
import { buscarDiseno } from '../design/knowledge';
import { kitComoPrompt, type ProjectBrandKit } from './brand-kit';
import { zonaSeguraPx, type FormatoSpec } from './specs';
import type { Project } from '../db/schema';

export const MODELO_IMAGEN = 'gemini-2.5-flash-image';

/** Las proporciones que Gemini admite. La de la spec se acerca a una de estas. */
const RATIOS_GEMINI = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];

export function ratioParaGemini(f: FormatoSpec): string {
  if (RATIOS_GEMINI.includes(f.ratio)) return f.ratio;
  const objetivo = f.ancho / f.alto;
  let mejor = '1:1';
  let dist = Infinity;
  for (const r of RATIOS_GEMINI) {
    const [a, b] = r.split(':').map(Number);
    const d = Math.abs(a! / b! - objetivo);
    if (d < dist) {
      dist = d;
      mejor = r;
    }
  }
  return mejor;
}

export interface OpcionCreativa {
  /** Cómo se llama el ángulo, para que el usuario elija sabiendo qué elige. */
  angulo: string;
  /** La instrucción visual concreta de ESTA opción. */
  direccion: string;
}

/**
 * Tres ángulos distintos, no tres versiones de lo mismo.
 *
 * El issue manda "nunca una sola" opción, y dar tres variaciones del mismo
 * encuadre no es dar opciones: es dar ruido. Estos tres se contraponen a
 * propósito — uno cuida el producto, uno cuida a la persona y uno cuida el
 * mensaje— para que elegir signifique algo.
 */
export const ANGULOS: OpcionCreativa[] = [
  {
    angulo: 'Producto limpio',
    direccion:
      'fotografía de producto en estudio, fondo liso del color de fondo de la marca, luz suave y direccional, sombra corta, el objeto centrado y respirando, sin texto de ningún tipo',
  },
  {
    angulo: 'Persona en contexto',
    direccion:
      'fotografía documental de una persona real usando o disfrutando lo que ofrece la marca, luz natural, profundidad de campo corta, ambiente creíble y no de catálogo, sin texto de ningún tipo',
  },
  {
    angulo: 'Gráfico de marca',
    direccion:
      'composición gráfica plana con formas geométricas grandes en los colores de la marca, mucho aire, ritmo tipográfico insinuado con bloques (NO letras reales), estilo editorial',
  },
];

export interface BasePrompt {
  prompt: string;
  modelo: string;
  ratio: string;
  angulo: string;
}

/**
 * Arma el prompt de la imagen base: qué se pide, con qué colores, en qué
 * lienzo, dejando libre la zona segura y lo que la memoria de diseño sepa de
 * esa red.
 */
export async function construirPrompt(input: {
  project: Project;
  kit: ProjectBrandKit | null;
  formato: FormatoSpec;
  brief: string;
  opcion: OpcionCreativa;
  /** Lo que la memoria de diseño aporte. Se pasa hecho para no buscar 3 veces. */
  guiaDeDiseno?: string;
}): Promise<BasePrompt> {
  const { formato, kit, project, brief, opcion } = input;
  const z = zonaSeguraPx(formato);

  const partes = [
    `Imagen para ${formato.label}, lienzo de ${formato.ancho} × ${formato.alto} px (${formato.ratio}).`,
    `Encargo: ${brief}`,
    `Dirección visual — ${opcion.angulo}: ${opcion.direccion}.`,
    kitComoPrompt(kit, project),
  ];

  if (formato.zonaSegura) {
    partes.push(
      `Deja el motivo principal dentro de la zona segura: nada importante en los ${z.arriba} px de arriba, los ${z.abajo} px de abajo ni los ${z.lados} px de cada lado — ahí la red encima sus botones.`,
    );
  }
  if (input.guiaDeDiseno) partes.push(`Cómo se diseña para esta red: ${input.guiaDeDiseno}`);

  // Lo que no se negocia, al final, porque es lo último que lee el modelo.
  partes.push(
    'SIN TEXTO, sin letras, sin palabras, sin logotipos y sin marcas de agua en la imagen: el texto y el logo se ponen encima después.',
    'Deja una zona tranquila y de contraste parejo donde luego entre el titular.',
  );

  return {
    prompt: partes.join('\n'),
    modelo: MODELO_IMAGEN,
    ratio: ratioParaGemini(formato),
    angulo: opcion.angulo,
  };
}

/** La guía de diseño que la memoria tenga para esta red y este formato. */
export async function guiaDeDiseno(formato: FormatoSpec): Promise<string> {
  const hits = await buscarDiseno(
    `cómo diseñar una pieza para ${formato.label} ${formato.ratio} composición y jerarquía visual`,
    { k: 3 },
  ).catch(() => []);
  if (hits.length === 0) return '';
  return hits
    .map((h) => h.content.replace(/\s+/g, ' ').slice(0, 420))
    .join(' · ')
    .slice(0, 1200);
}

export interface ImagenBase {
  dataUrl: string;
  mimeType: string;
  prompt: string;
  modelo: string;
  angulo: string;
}

/** Pide la imagen. Devuelve el data URL crudo — todavía sin recortar. */
export async function generarBase(p: BasePrompt): Promise<ImagenBase> {
  const img = await generateImage(p.prompt, { aspectRatio: p.ratio });
  return {
    dataUrl: img.dataUrl,
    mimeType: img.mimeType,
    prompt: p.prompt,
    modelo: p.modelo,
    angulo: p.angulo,
  };
}
