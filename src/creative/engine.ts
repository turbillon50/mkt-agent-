/**
 * El motor de piezas: de un encargo en español a piezas publicables.
 *
 * El camino completo, en orden, y por qué cada paso está donde está:
 *
 *   1. ELEGIR EL LIENZO. La spec de la red manda (`specs.ts`). Antes de pedirle
 *      nada a un modelo ya se sabe que un reel mide 1080×1920 y que a Instagram
 *      solo le entra JPEG. Generar primero y ajustar después es cómo salen las
 *      piezas recortadas.
 *   2. LEER EL KIT del proyecto. Los colores y el tono entran en el prompt.
 *   3. PREGUNTARLE A LA MEMORIA cómo se diseña para esa red.
 *   4. IMAGEN BASE con Gemini — tres ÁNGULOS distintos, no tres versiones de lo
 *      mismo. El issue manda "nunca una sola" y tres variaciones del mismo
 *      encuadre no son opciones, son ruido.
 *   5. COMPONER el texto, el logo y el CTA: Canva si el proyecto lo tiene con
 *      plantilla de marca, si no el compositor propio con sharp.
 *   6. GUARDAR cada pieza con su prompt, su modelo y una foto del kit.
 *
 * Las tres opciones se piden EN PARALELO y una que falle no tumba a las otras.
 * Que el usuario reciba dos piezas es mucho mejor que recibir un error porque
 * la tercera se atoró.
 */
import { randomUUID } from 'node:crypto';
import type { Project, ProjectBrandKit } from '../db/schema';
import { fotoDelKit } from './brand-kit';
import { armarConCanva, canvaConectado, porQueNo } from './canva';
import { alFormatoDeLaRed, componer } from './compose';
import { construirPrompt, generarBase, guiaDeDiseno, MODELO_IMAGEN, type OpcionCreativa } from './gemini';
import { angulosParaRed } from './social-playbooks';
import { almacenListo, bajarImagen, deDataUrl, subirImagen } from './media';
import { elegirFormato, esRed, type FormatoSpec, type RedSlug } from './specs';
import { pedirAHiggsfield, type EncargoHiggsfield } from './higgsfield';
import { contextoCreativoDelProyecto } from './context';
import { evaluarImagenBase, type EvaluacionVisual } from './image-quality';

export interface Encargo {
  project: Project;
  kit: ProjectBrandKit | null;
  red: RedSlug;
  /** "historia", "reel", "cuadrado"… Lo que el usuario dijo, tal cual. */
  formatoPista?: string | null;
  /** Qué quiere anunciar, con sus palabras. */
  brief: string;
  titular?: string | null;
  cta?: string | null;
  /** Cuántas opciones. El mínimo es 2: "nunca una sola" es del issue. */
  opciones?: number;
  /** Se calcula una vez por paquete; una pieza individual lo calcula aquí. */
  contexto?: string;
}

export interface PiezaGenerada {
  angulo: string;
  url: string;
  ancho: number;
  alto: number;
  motor: 'canva' | 'sharp';
  modelo: string;
  prompt: string;
  nota: string | null;
  calidad?: EvaluacionVisual | null;
}

export interface ResultadoMotor {
  loteId: string;
  formato: FormatoSpec;
  piezas: PiezaGenerada[];
  /** Los ángulos que no salieron, con su motivo en español. */
  fallos: Array<{ angulo: string; motivo: string }>;
  /** Cómo se compuso: sirve para decirlo en la pantalla sin adivinar. */
  compositor: 'canva' | 'sharp';
  notaCompositor: string;
}

export class MotorApagado extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'MotorApagado';
  }
}

export function motorListo(): { ok: boolean; falta: string[] } {
  const falta: string[] = [];
  if (!process.env.GEMINI_API_KEY) falta.push('GEMINI_API_KEY');
  if (!almacenListo()) falta.push('RELAY_SECRET');
  return { ok: falta.length === 0, falta };
}

/**
 * Genera el lote.
 *
 * `opciones` se acota entre 2 y 3 a propósito: uno rompe la regla del issue y
 * más de tres es pedirle al cliente que compare seis imágenes casi iguales, que
 * es como no darle ninguna.
 */
export async function generarPiezas(encargo: Encargo): Promise<ResultadoMotor> {
  const listo = motorListo();
  if (!listo.ok) {
    throw new MotorApagado(
      `Falta configurar ${listo.falta.join(' y ')} para poder hacer piezas en este entorno.`,
    );
  }

  const formato = elegirFormato(encargo.red, encargo.formatoPista ?? null);
  const cuantas = Math.min(3, Math.max(2, encargo.opciones ?? 3));
  const loteId = randomUUID();
  const contexto = encargo.contexto ?? (await contextoCreativoDelProyecto({
    project: encargo.project,
    kit: encargo.kit,
    brief: encargo.brief,
  })).texto;

  const guia = await guiaDeDiseno(formato).catch(() => '');

  // ¿Canva puede? Se pregunta UNA vez para el lote, no una por pieza: son tres
  // llamadas idénticas a Composio para obtener la misma respuesta.
  const conCanva = await canvaConectado(encargo.project).catch(() => false);
  const notaCompositor = await porQueNo(encargo.project).catch(
    () => 'La pieza la armó Goossip.',
  );

  const angulos = angulosParaRed(encargo.red).slice(0, cuantas);
  const intentos = await Promise.allSettled(
    angulos.map((opcion) =>
      unaPieza({ encargo: { ...encargo, contexto }, formato, opcion, guia, conCanva }),
    ),
  );

  const piezas: PiezaGenerada[] = [];
  const fallos: Array<{ angulo: string; motivo: string }> = [];

  intentos.forEach((r, i) => {
    const angulo = angulos[i]!.angulo;
    if (r.status === 'fulfilled') piezas.push(r.value);
    else {
      fallos.push({
        angulo,
        motivo: r.reason instanceof Error ? r.reason.message : 'No se pudo generar.',
      });
    }
  });

  if (piezas.length === 0) {
    throw new MotorApagado(
      fallos[0]?.motivo ?? 'No se pudo generar ninguna pieza. Inténtalo otra vez.',
    );
  }

  return {
    loteId,
    formato,
    piezas,
    fallos,
    compositor: piezas.some((p) => p.motor === 'canva') ? 'canva' : 'sharp',
    notaCompositor,
  };
}

async function unaPieza(input: {
  encargo: Encargo;
  formato: FormatoSpec;
  opcion: OpcionCreativa;
  guia: string;
  conCanva: boolean;
}): Promise<PiezaGenerada> {
  const { encargo, formato, opcion, guia, conCanva } = input;

  const p = await construirPrompt({
    project: encargo.project,
    kit: encargo.kit,
    formato,
    brief: encargo.brief,
    opcion,
    guiaDeDiseno: guia,
    contexto: encargo.contexto,
  });
  let promptFinal = p.prompt;
  let base = await generarBase(p);
  let calidad = await evaluarImagenBase({
    imagen: base,
    brief: encargo.brief,
    contexto: encargo.contexto ?? '',
    formato,
    direccion: opcion.direccion,
  });
  if (!calidad) {
    throw new Error('El control visual no estuvo disponible; la imagen no se guardó sin revisión.');
  }

  // Una segunda oportunidad, pero con el defecto nombrado. Si tampoco pasa,
  // no se guarda: dos imágenes malas no se convierten en una opción buena.
  if (calidad && !calidad.aprobada) {
    const reintento = {
      ...p,
      prompt: `${p.prompt}\n\nCORRECCIÓN OBLIGATORIA DEL CONTROL DE CALIDAD: ${calidad.correccion || calidad.razones.join('; ')}`,
    };
    promptFinal = reintento.prompt;
    base = await generarBase(reintento);
    calidad = await evaluarImagenBase({
      imagen: base,
      brief: encargo.brief,
      contexto: encargo.contexto ?? '',
      formato,
      direccion: opcion.direccion,
    });
    if (!calidad) {
      throw new Error('El control visual no pudo revisar el segundo intento; no se guardó.');
    }
    if (!calidad.aprobada) {
      throw new Error(`Control de calidad rechazó la imagen (${calidad.score}/100): ${calidad.razones[0] ?? 'no corresponde al encargo'}`);
    }
  }
  const bytes = deDataUrl(base.dataUrl);
  if (!bytes) throw new Error('El modelo no devolvió una imagen usable.');

  // Camino Canva. Si no puede, no se insiste: se compone aquí y el usuario
  // recibe su pieza igual, con la nota de por qué.
  if (conCanva) {
    const canva = await armarConCanva(encargo.project, {
      formato,
      titular: encargo.titular ?? null,
      cta: encargo.cta ?? null,
    }).catch(() => null);
    if (canva) {
      return {
        angulo: opcion.angulo,
        url: canva.url,
        ancho: formato.ancho,
        alto: formato.alto,
        motor: 'canva',
        modelo: MODELO_IMAGEN,
        prompt: promptFinal,
        nota: null,
        calidad,
      };
    }
  }

  const compuesta = await componer({
    baseBuf: bytes.buf,
    formato,
    kit: encargo.kit,
    textos: { titular: encargo.titular ?? null, cta: encargo.cta ?? null },
  });
  const final = await alFormatoDeLaRed(compuesta.buf, formato);
  const url = await subirImagen(final.buf, final.ext);

  const faltas: string[] = [];
  if (encargo.kit?.logoUrl && !compuesta.puso.logo) faltas.push('el logo no se pudo leer');
  if (!encargo.kit?.logoUrl) faltas.push('este proyecto todavía no tiene logo cargado');

  return {
    angulo: opcion.angulo,
    url,
    ancho: compuesta.ancho,
    alto: compuesta.alto,
    motor: 'sharp',
    modelo: MODELO_IMAGEN,
    prompt: promptFinal,
    nota: faltas.length ? faltas.join(' y ') : null,
    calidad,
  };
}

// ---------------------------------------------------------------------------
// Higgsfield: producto, UGC y video
// ---------------------------------------------------------------------------

export interface EncargoHiggs {
  project: Project;
  kit: ProjectBrandKit | null;
  encargo: EncargoHiggsfield;
  red: RedSlug;
  formatoPista?: string | null;
  brief: string;
}

/**
 * La pieza de Higgsfield. Se trae a nuestro almacén en vez de dejar la URL del
 * proveedor: la suya caduca y una galería llena de imágenes rotas en tres meses
 * no es una galería.
 */
export async function generarConHiggsfield(
  e: EncargoHiggs,
): Promise<{ pieza: PiezaGenerada; formato: FormatoSpec } | { error: string }> {
  const formato = elegirFormato(e.red, e.formatoPista ?? null);
  const { kitComoPrompt } = await import('./brand-kit');

  const prompt = [
    e.brief,
    kitComoPrompt(e.kit, e.project),
    `Lienzo: ${formato.ancho} × ${formato.alto} px (${formato.ratio}).`,
  ].join(' ');

  const r = await pedirAHiggsfield({
    encargo: e.encargo,
    prompt,
    aspectRatio: formato.ratio.includes('.') ? '16:9' : formato.ratio,
    soulId: e.kit?.soulId ?? null,
  });
  if ('error' in r) return r;

  const bytes = await bajarImagen(r.pieza.url);
  const url = bytes && almacenListo() ? await subirImagen(bytes, 'png') : r.pieza.url;

  return {
    formato,
    pieza: {
      angulo: e.encargo,
      url,
      ancho: formato.ancho,
      alto: formato.alto,
      motor: 'sharp',
      modelo: r.pieza.modelo,
      prompt: r.pieza.prompt,
      nota: bytes ? null : 'La imagen se quedó alojada en Higgsfield.',
    },
  };
}

/** Para las rutas: valida la red que llegó de fuera sin confiar en ella. */
export function redOThrow(v: unknown): RedSlug {
  if (!esRed(v)) throw new Error('Esa red no está en el catálogo de Goossip.');
  return v;
}

export { fotoDelKit };
