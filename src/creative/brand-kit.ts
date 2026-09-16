/**
 * El kit de marca DEL PROYECTO.
 *
 * Una fila por proyecto con el logo, la paleta (cada color con su ROL), las
 * tipografías, el tono de voz y las palabras que el cliente no quiere leer.
 * Todo lo que Goossip genere para ese proyecto pasa por aquí antes de pedirle
 * nada a un modelo.
 *
 * Por qué el color lleva ROL y no solo hex: al componer una pieza hay que saber
 * cuál va de fondo y cuál va en el botón. Una lista de seis hex sin rol obliga
 * a adivinar, y adivinar con la marca del cliente es exactamente lo que no se
 * puede hacer.
 *
 * El alta es guiada y en dos tiempos: el usuario sube el logo, Gemini lo MIRA y
 * propone paleta y tono, y el usuario corrige y aprueba. La propuesta cruda se
 * guarda aparte (`propuesta`) para poder ver qué cambió a mano — si el cliente
 * corrige siempre lo mismo, el prompt está mal y se sabe con datos.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import {
  projectBrandKit,
  type FontEntry,
  type PaletteEntry,
  type Project,
  type ProjectBrandKit,
} from '../db/schema';

export type { ProjectBrandKit, PaletteEntry, FontEntry };

export const ROLES_DE_COLOR = ['primario', 'secundario', 'fondo', 'texto', 'acento'] as const;
export const ROLES_DE_FUENTE = ['titulos', 'texto'] as const;

const HEX = /^#[0-9a-fA-F]{6}$/;

export function esHex(v: unknown): v is string {
  return typeof v === 'string' && HEX.test(v.trim());
}

/**
 * Limpia lo que llegue de fuera (el formulario o Gemini) y deja algo que el
 * motor de piezas pueda usar sin preguntarse nada.
 *
 * Nunca revienta: un color torcido se descarta, no tira el guardado entero. Que
 * el cliente pierda la paleta completa porque escribió mal un hex sería un
 * castigo desproporcionado por un dedazo.
 */
export function limpiarPaleta(entrada: unknown): PaletteEntry[] {
  if (!Array.isArray(entrada)) return [];
  const vistos = new Set<string>();
  const salida: PaletteEntry[] = [];
  for (const raw of entrada) {
    const hex = typeof raw?.hex === 'string' ? raw.hex.trim() : '';
    if (!esHex(hex)) continue;
    const rol = (ROLES_DE_COLOR as readonly string[]).includes(raw?.rol) ? raw.rol : 'acento';
    const clave = `${rol}:${hex.toLowerCase()}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push({
      rol,
      hex: hex.toUpperCase(),
      ...(typeof raw?.nombre === 'string' && raw.nombre.trim()
        ? { nombre: raw.nombre.trim().slice(0, 60) }
        : {}),
    });
    if (salida.length >= 12) break;
  }
  return salida;
}

export function limpiarTipografias(entrada: unknown): FontEntry[] {
  if (!Array.isArray(entrada)) return [];
  const salida: FontEntry[] = [];
  for (const raw of entrada) {
    const familia = typeof raw?.familia === 'string' ? raw.familia.trim().slice(0, 60) : '';
    if (!familia) continue;
    const rol = (ROLES_DE_FUENTE as readonly string[]).includes(raw?.rol) ? raw.rol : 'texto';
    salida.push({
      rol,
      familia,
      ...(typeof raw?.peso === 'string' && raw.peso.trim() ? { peso: raw.peso.trim().slice(0, 10) } : {}),
    });
    if (salida.length >= 6) break;
  }
  return salida;
}

export function limpiarPalabras(entrada: unknown): string[] {
  const lista = Array.isArray(entrada)
    ? entrada
    : typeof entrada === 'string'
      ? entrada.split(/[,\n]/)
      : [];
  return [
    ...new Set(
      lista
        .map((p) => (typeof p === 'string' ? p.trim() : ''))
        .filter((p) => p.length > 0 && p.length <= 40),
    ),
  ].slice(0, 40);
}

// ---------------------------------------------------------------------------
// Leer y escribir
// ---------------------------------------------------------------------------

export async function getBrandKit(orgId: string, projectId: string): Promise<ProjectBrandKit | null> {
  const [fila] = await db
    .select()
    .from(projectBrandKit)
    .where(and(eq(projectBrandKit.projectId, projectId), eq(projectBrandKit.orgId, orgId)))
    .limit(1);
  return fila ?? null;
}

export interface BrandKitInput {
  logoUrl?: string | null;
  logoOscuroUrl?: string | null;
  paleta?: unknown;
  tipografias?: unknown;
  tono?: string | null;
  palabrasProhibidas?: unknown;
  ejemplos?: Array<{ url: string; nota?: string }>;
  soulId?: string | null;
  propuesta?: Record<string, unknown> | null;
}

/**
 * Guarda el kit.
 *
 * Lo que NO viene en `input` NO SE TOCA. Es la diferencia entre guardar y
 * pisar: con la otra semántica, una llamada que solo trae la paleta —un
 * formulario parcial, una tool del Asistente que corrige un color— le borraba
 * al cliente su tono de voz y sus palabras prohibidas sin decir nada. La
 * pantalla manda el kit completo, sí; pero el día que algo mande la mitad, la
 * mitad que falta no se puede interpretar como "bórralo".
 *
 * `null` explícito sí borra: mandar `logoUrl: null` es quitar el logo.
 */
export async function saveBrandKit(
  orgId: string,
  projectId: string,
  input: BrandKitInput,
  quien: string | null,
): Promise<ProjectBrandKit> {
  const ahora = new Date();
  const tiene = (k: keyof BrandKitInput) => Object.prototype.hasOwnProperty.call(input, k);

  const previo = await getBrandKit(orgId, projectId);

  const paleta = tiene('paleta') ? limpiarPaleta(input.paleta) : (previo?.paleta ?? []);
  const tipografias = tiene('tipografias')
    ? limpiarTipografias(input.tipografias)
    : (previo?.tipografias ?? []);
  const palabrasProhibidas = tiene('palabrasProhibidas')
    ? limpiarPalabras(input.palabrasProhibidas)
    : (previo?.palabrasProhibidas ?? []);
  const ejemplos = tiene('ejemplos')
    ? (Array.isArray(input.ejemplos)
        ? input.ejemplos
            .filter((e) => typeof e?.url === 'string' && e.url.startsWith('http'))
            .slice(0, 12)
        : [])
    : (previo?.ejemplos ?? []);

  const texto = (v: unknown, max: number) =>
    typeof v === 'string' ? v.trim().slice(0, max) || null : null;

  const valores = {
    projectId,
    orgId,
    logoUrl: tiene('logoUrl') ? (input.logoUrl ?? null) : (previo?.logoUrl ?? null),
    logoOscuroUrl: tiene('logoOscuroUrl')
      ? (input.logoOscuroUrl ?? null)
      : (previo?.logoOscuroUrl ?? null),
    paleta,
    tipografias,
    tono: tiene('tono') ? texto(input.tono, 600) : (previo?.tono ?? null),
    palabrasProhibidas,
    ejemplos,
    soulId: tiene('soulId') ? texto(input.soulId, 120) : (previo?.soulId ?? null),
    ...(tiene('propuesta') ? { propuesta: input.propuesta ?? null } : {}),
    aprobadoPor: quien,
    aprobadoEn: ahora,
    updatedAt: ahora,
  };

  const [fila] = await db
    .insert(projectBrandKit)
    .values(valores)
    .onConflictDoUpdate({
      target: projectBrandKit.projectId,
      set: {
        logoUrl: valores.logoUrl,
        logoOscuroUrl: valores.logoOscuroUrl,
        paleta: valores.paleta,
        tipografias: valores.tipografias,
        tono: valores.tono,
        palabrasProhibidas: valores.palabrasProhibidas,
        ejemplos: valores.ejemplos,
        soulId: valores.soulId,
        ...(tiene('propuesta') ? { propuesta: input.propuesta ?? null } : {}),
        aprobadoPor: quien,
        aprobadoEn: ahora,
        updatedAt: ahora,
      },
    })
    .returning();

  return fila!;
}

// ---------------------------------------------------------------------------
// El kit dicho para un modelo
// ---------------------------------------------------------------------------

export function colorDe(kit: ProjectBrandKit | null, rol: PaletteEntry['rol']): string | null {
  return kit?.paleta.find((c) => c.rol === rol)?.hex ?? null;
}

/** ¿Está lo mínimo para que una pieza salga con cara de la marca? */
export function kitCompleto(kit: ProjectBrandKit | null): boolean {
  return Boolean(kit && kit.paleta.length >= 2 && (kit.logoUrl || kit.tono));
}

/**
 * El kit convertido en instrucciones para el modelo de imagen.
 *
 * Es texto y no JSON a propósito: los modelos de imagen obedecen mucho mejor
 * "el fondo es #0B1220, casi negro" que un objeto con llaves.
 */
export function kitComoPrompt(kit: ProjectBrandKit | null, project: Project): string {
  const lineas: string[] = [`Marca: ${project.name}.`];

  if (!kit || kit.paleta.length === 0) {
    lineas.push(
      'Este proyecto todavía no tiene kit de marca cargado: usa una paleta sobria de dos colores y deja espacio limpio para poner después el logo.',
    );
    return lineas.join(' ');
  }

  const porRol = (rol: PaletteEntry['rol']) => kit.paleta.filter((c) => c.rol === rol);
  const decir = (rol: PaletteEntry['rol'], etiqueta: string) => {
    const cs = porRol(rol);
    if (cs.length) lineas.push(`${etiqueta}: ${cs.map((c) => c.hex).join(', ')}.`);
  };
  decir('primario', 'Color principal');
  decir('secundario', 'Color secundario');
  decir('fondo', 'Fondo');
  decir('texto', 'Color del texto');
  decir('acento', 'Acento');

  if (kit.tipografias.length) {
    lineas.push(
      `Tipografía: ${kit.tipografias.map((f) => `${f.familia}${f.peso ? ` ${f.peso}` : ''} para ${f.rol === 'titulos' ? 'títulos' : 'texto'}`).join('; ')}.`,
    );
  }
  if (kit.tono) lineas.push(`Tono de la marca: ${kit.tono}.`);
  if (kit.palabrasProhibidas.length) {
    lineas.push(`No uses nunca estas palabras: ${kit.palabrasProhibidas.join(', ')}.`);
  }
  lineas.push('Respeta los colores exactos: son los de la marca, no una sugerencia.');
  return lineas.join(' ');
}

/** Lo que se guarda pegado a la pieza: la marca de hoy no explica la de ayer. */
export function fotoDelKit(kit: ProjectBrandKit | null): Record<string, unknown> {
  if (!kit) return { sinKit: true };
  return {
    paleta: kit.paleta,
    tipografias: kit.tipografias,
    tono: kit.tono,
    logoUrl: kit.logoUrl,
    aprobadoEn: kit.aprobadoEn?.toISOString() ?? null,
  };
}

/**
 * ¿El texto se cuela alguna palabra prohibida? Devuelve cuáles, para poder
 * decirlo y no solo bloquear.
 */
export function palabrasProhibidasEn(kit: ProjectBrandKit | null, texto: string): string[] {
  if (!kit?.palabrasProhibidas.length) return [];
  const t = texto.toLowerCase();
  return kit.palabrasProhibidas.filter((p) => t.includes(p.toLowerCase()));
}
