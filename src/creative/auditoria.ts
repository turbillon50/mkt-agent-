/**
 * Auditoría de marca: ¿lo que sale se parece a lo que el cliente aprobó?
 *
 * Es la otra mitad de la sección Marca. El kit dice cómo DEBE verse; esto MIRA
 * las últimas 30 publicaciones y mide cuánto se parecen de verdad.
 *
 * Y "mide" es literal: los colores se sacan bajando la imagen y contando sus
 * píxeles con sharp, no preguntándole a un modelo si le parece que combina.
 * Un color se compara en **CIELAB con ΔE**, que es la distancia como la ve el
 * ojo — en RGB, dos azules que nadie distingue pueden estar lejísimos y dos
 * grises distintos, pegados.
 *
 * Tres cosas se revisan y cada una contesta algo que el cliente pregunta:
 *   · PALETA — "¿están usando mis colores?"
 *   · TONO   — "¿están diciendo lo que yo no digo?" (las palabras prohibidas)
 *   · HUECOS — "¿por qué no sale nada en LinkedIn?"
 */
import { and, desc, eq, gte } from 'drizzle-orm';
import sharp from 'sharp';
import { db } from '../db/client';
import {
  creativePieces,
  posts,
  type CreativePiece,
  type PaletteEntry,
  type Project,
  type ProjectBrandKit,
} from '../db/schema';
import { palabrasProhibidasEn } from './brand-kit';
import { REDES, RED_LABEL, type RedSlug } from './specs';

// ---------------------------------------------------------------------------
// Color: hex → Lab, y la distancia que ve el ojo
// ---------------------------------------------------------------------------

export function hexARgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** sRGB → CIELAB (D65). La fórmula estándar, sin atajos. */
export function rgbALab([r, g, b]: [number, number, number]): [number, number, number] {
  const lineal = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lineal(r), lineal(g), lineal(b)];
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(X), f(Y), f(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * ΔE76. Suficiente para esto y se puede leer sin un paper al lado.
 *
 * La referencia que importa para interpretarlo: por debajo de **2.3** el ojo
 * humano no distingue los dos colores (el "just noticeable difference"), y por
 * arriba de 10 son colores claramente distintos.
 */
export function deltaE(a: [number, number, number], b: [number, number, number]): number {
  const A = rgbALab(a);
  const B = rgbALab(b);
  return Math.sqrt((A[0] - B[0]) ** 2 + (A[1] - B[1]) ** 2 + (A[2] - B[2]) ** 2);
}

/** El umbral con el que se decide "este color SÍ es de la marca". */
export const UMBRAL_DE = 25;

// ---------------------------------------------------------------------------
// Los colores que de verdad tiene una imagen
// ---------------------------------------------------------------------------

export interface ColorDominante {
  rgb: [number, number, number];
  hex: string;
  /** Qué parte de la imagen ocupa, de 0 a 1. */
  peso: number;
}

const aHex = ([r, g, b]: [number, number, number]) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/**
 * Los colores dominantes de una imagen.
 *
 * Se baja a 32×32 y se cuantiza a 5 bits por canal (32 niveles). Sin cuantizar,
 * un degradado da mil colores con peso 0.001 cada uno y ninguno "domina": es lo
 * que hace que una pieza con el azul de la marca de fondo se lea como si no
 * tuviera ningún color de marca.
 */
export async function coloresDe(buf: Buffer, cuantos = 5): Promise<ColorDominante[]> {
  const { data, info } = await sharp(buf)
    .resize(32, 32, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const cubos = new Map<number, { r: number; g: number; b: number; n: number }>();
  const px = info.width * info.height;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const clave = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const c = cubos.get(clave) ?? { r: 0, g: 0, b: 0, n: 0 };
    c.r += r;
    c.g += g;
    c.b += b;
    c.n += 1;
    cubos.set(clave, c);
  }

  return [...cubos.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, cuantos)
    .map((c) => {
      const rgb: [number, number, number] = [c.r / c.n, c.g / c.n, c.b / c.n];
      return { rgb, hex: aHex(rgb), peso: c.n / px };
    });
}

// ---------------------------------------------------------------------------
// La auditoría
// ---------------------------------------------------------------------------

export interface PiezaAuditada {
  id: string;
  url: string;
  red: string;
  cuando: string;
  /** Cuánta de la imagen está pintada con colores del kit, de 0 a 1. */
  deLaMarca: number;
  /** El color del kit más cercano a su color dominante, y a qué distancia. */
  masCercano: { hex: string; rol: string; deltaE: number } | null;
  dominantes: string[];
  problema: string | null;
}

export interface Hueco {
  red: RedSlug;
  label: string;
  dias: number | null;
  texto: string;
}

export interface Sugerencia {
  texto: string;
  /** Lo que se le dicta al Asistente al apretar "Generar pieza". */
  prompt: string;
}

export interface Auditoria {
  revisadas: number;
  bajadas: number;
  /** Promedio de `deLaMarca`, en porcentaje. null si no se pudo bajar ninguna. */
  consistencia: number | null;
  piezas: PiezaAuditada[];
  paleta: PaletteEntry[];
  tono: { revisados: number; conProhibidas: Array<{ texto: string; palabras: string[] }> };
  huecos: Hueco[];
  sugerencias: Sugerencia[];
  motivo: string | null;
}

/**
 * Audita las últimas N piezas del proyecto.
 *
 * Cuando el kit no tiene paleta no se inventa un veredicto: se devuelve
 * `consistencia: null` y el motivo. Decir "60 % de consistencia" sin saber
 * contra qué colores es peor que no decir nada.
 */
export async function auditarMarca(input: {
  project: Project;
  kit: ProjectBrandKit | null;
  cuantas?: number;
  dias?: number;
}): Promise<Auditoria> {
  const { project, kit } = input;
  const cuantas = Math.min(input.cuantas ?? 30, 60);
  const dias = input.dias ?? 90;
  const desde = new Date(Date.now() - dias * 86_400_000);

  const paleta = (kit?.paleta ?? []).filter((c) => hexARgb(c.hex));
  const base = {
    revisadas: 0,
    bajadas: 0,
    consistencia: null as number | null,
    piezas: [] as PiezaAuditada[],
    paleta,
    tono: { revisados: 0, conProhibidas: [] as Array<{ texto: string; palabras: string[] }> },
    huecos: [] as Hueco[],
    sugerencias: [] as Sugerencia[],
    motivo: null as string | null,
  };

  const [filas, publicados] = await Promise.all([
    db
      .select()
      .from(creativePieces)
      .where(
        and(
          eq(creativePieces.orgId, project.orgId),
          eq(creativePieces.projectId, project.id),
          gte(creativePieces.createdAt, desde),
        ),
      )
      .orderBy(desc(creativePieces.createdAt))
      .limit(cuantas),
    db
      .select()
      .from(posts)
      .where(and(eq(posts.orgId, project.orgId), eq(posts.projectId, project.id)))
      .orderBy(desc(posts.createdAt))
      .limit(cuantas),
  ]);

  base.revisadas = filas.length;

  // --- tono: las palabras que la marca tiene prohibidas ---------------------
  base.tono.revisados = publicados.length;
  for (const p of publicados) {
    const malas = palabrasProhibidasEn(kit, p.text ?? '');
    if (malas.length) {
      base.tono.conProhibidas.push({ texto: (p.text ?? '').slice(0, 160), palabras: malas });
    }
  }

  // --- huecos: dónde no sale nada -------------------------------------------
  base.huecos = huecosPorRed(filas, publicados);

  // --- paleta: bajar las imágenes y contarles los píxeles --------------------
  if (paleta.length === 0) {
    base.motivo =
      'Este proyecto todavía no tiene paleta en su kit de marca, así que no hay contra qué comparar. Cárgala en Marca y vuelve.';
    base.sugerencias = sugerencias(project, base.huecos, null);
    return base;
  }

  const objetivo = paleta
    .map((c) => ({ ...c, rgb: hexARgb(c.hex)! }))
    .filter((c) => c.rgb);

  let suma = 0;
  for (const f of filas) {
    if (!f.url) continue;
    const auditada = await auditarUna(f, objetivo).catch(
      (e): PiezaAuditada => ({
        id: f.id,
        url: f.url!,
        red: f.red,
        cuando: f.createdAt.toISOString(),
        deLaMarca: 0,
        masCercano: null,
        dominantes: [],
        problema: e instanceof Error ? e.message : 'no se pudo leer la imagen',
      }),
    );
    base.piezas.push(auditada);
    if (!auditada.problema) {
      base.bajadas += 1;
      suma += auditada.deLaMarca;
    }
  }

  base.consistencia = base.bajadas > 0 ? Number(((suma / base.bajadas) * 100).toFixed(1)) : null;
  if (base.bajadas === 0 && filas.length > 0) {
    base.motivo = 'Ninguna de las piezas se pudo bajar para medirla. Puede ser el almacén de medios.';
  }
  base.sugerencias = sugerencias(project, base.huecos, base.consistencia);
  return base;
}

async function auditarUna(
  pieza: CreativePiece,
  objetivo: Array<PaletteEntry & { rgb: [number, number, number] }>,
): Promise<PiezaAuditada> {
  const res = await fetch(pieza.url!, { cache: 'no-store' });
  if (!res.ok) throw new Error(`la imagen contestó ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const dominantes = await coloresDe(buf);

  let deLaMarca = 0;
  let mejor: PiezaAuditada['masCercano'] = null;
  for (const d of dominantes) {
    let cerca: { hex: string; rol: string; deltaE: number } | null = null;
    for (const o of objetivo) {
      const de = deltaE(d.rgb, o.rgb);
      if (!cerca || de < cerca.deltaE) cerca = { hex: o.hex, rol: o.rol, deltaE: Number(de.toFixed(1)) };
    }
    // El peso importa: un pixel del azul de la marca no hace que la pieza sea
    // de la marca. Lo que se suma es CUÁNTA imagen está pintada con sus colores.
    if (cerca && cerca.deltaE <= UMBRAL_DE) deLaMarca += d.peso;
    if (cerca && (!mejor || cerca.deltaE < mejor.deltaE)) mejor = cerca;
  }

  return {
    id: pieza.id,
    url: pieza.url!,
    red: pieza.red,
    cuando: pieza.createdAt.toISOString(),
    deLaMarca: Number(Math.min(deLaMarca, 1).toFixed(3)),
    masCercano: mejor,
    dominantes: dominantes.map((d) => d.hex),
    problema: null,
  };
}

/**
 * Los huecos por red.
 *
 * Solo se cuentan las redes donde este proyecto YA hizo algo alguna vez: decir
 * "te falta TikTok" a un despacho contable que nunca quiso TikTok es ruido, y
 * el ruido es lo que hace que nadie lea los avisos.
 */
export function huecosPorRed(
  piezas: Array<{ red: string; createdAt: Date }>,
  publicados: Array<{ platform: string; createdAt: Date; publishedAt: Date | null }>,
): Hueco[] {
  const ultima = new Map<string, Date>();
  for (const p of piezas) {
    const previa = ultima.get(p.red);
    if (!previa || p.createdAt > previa) ultima.set(p.red, p.createdAt);
  }
  for (const p of publicados) {
    const cuando = p.publishedAt ?? p.createdAt;
    const previa = ultima.get(p.platform);
    if (!previa || cuando > previa) ultima.set(p.platform, cuando);
  }

  const out: Hueco[] = [];
  for (const red of REDES) {
    const cuando = ultima.get(red);
    if (!cuando) continue;
    const dias = Math.floor((Date.now() - cuando.getTime()) / 86_400_000);
    if (dias < 14) continue;
    out.push({
      red,
      label: RED_LABEL[red],
      dias,
      texto: `En ${RED_LABEL[red]} no sale nada desde hace ${dias} días.`,
    });
  }
  return out.sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0));
}

function sugerencias(
  project: Project,
  huecos: Hueco[],
  consistencia: number | null,
): Sugerencia[] {
  const out: Sugerencia[] = [];
  for (const h of huecos.slice(0, 3)) {
    out.push({
      texto: h.texto,
      prompt: `Hazme una pieza para ${h.label} de ${project.name}, con los colores y el logo de su marca.`,
    });
  }
  if (consistencia !== null && consistencia < 50) {
    out.push({
      texto: `Solo el ${consistencia} % de lo que sale está pintado con los colores del kit. Las piezas no se están viendo como la marca.`,
      prompt: `Rehazme la última pieza de ${project.name} usando el color primario de su kit de fondo y su color de acento en el botón.`,
    });
  }
  return out;
}
