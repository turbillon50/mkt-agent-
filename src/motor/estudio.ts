/**
 * El estudio por red: cómo se arma una pieza para CADA red, no una pieza para
 * todas (corrida 14, P3 — lo aprendido el 30-sep).
 *
 * La idea que lo ordena todo: **una publicación no es un texto con una imagen; es
 * un objeto con la forma de su red.** LinkedIn premia un documento que se hojea,
 * Instagram recorta el centro de la imagen en la retícula del perfil, TikTok se
 * juega todo en los primeros segundos y X castiga dos ideas en un mismo mensaje.
 * Mandar la misma pieza a las cuatro no es eficiencia: es cuatro piezas malas.
 *
 * De dónde salen las medidas: de `SOCIAL_PLAYBOOKS` y `FORMATOS`, que ya viven en
 * el repo con su URL oficial y su fecha de lectura. **Aquí no se escribe ni un
 * número a mano**: los que hacen falta se piden como cifras citables
 * (`cifraDeSpec`, `cifraDeLienzo`) y pasan el mismo arnés de procedencia que
 * cualquier dato de mercado. Eso es lo que prometió `procedencia.ts` cuando se
 * quitó la lista de excepciones para las medidas de plataforma.
 */
import { elegirFormato, RED_LABEL, type RedSlug } from '../creative/specs';
import { SOCIAL_PLAYBOOKS, type RedPublicable } from '../creative/social-playbooks';
import { cifraDeLienzo, cifraDeSpec } from './plan';
import type { Afirmacion } from './procedencia';

/** Qué forma tiene la pieza en cada red. No es el formato del archivo: es el objeto. */
export type FormaDePieza =
  | 'carrusel_documento'
  | 'imagen_centro_seguro'
  | 'guion_por_segundos'
  | 'una_sola_idea'
  | 'imagen_con_contexto'
  | 'miniatura_y_titulo';

export interface RecetaDeRed {
  red: RedPublicable;
  forma: FormaDePieza;
  /** Qué es la pieza, en una línea que entienda quien la va a hacer. */
  que: string;
  /** El hero: lo primero que ve alguien y lo único que muchos van a ver. */
  hero: string;
  /** El CTA pensado para ESA red, no el mismo para todas. */
  cta: string;
  /** Los pasos de armado, en orden. */
  pasos: string[];
  /** Lo que NO hay que hacer en esta red. Duele más lo que sobra que lo que falta. */
  evitar: string[];
  /**
   * Los números de la red que la receta usa. Se declaran como parámetros para que
   * el texto los pueda nombrar sin escribirlos a mano.
   */
  parametros: Record<string, string>;
}

/* ---------------------------------------------------------------------------
   Las recetas. Una por red, y distintas de verdad.
--------------------------------------------------------------------------- */

export const RECETAS: Record<RedPublicable, RecetaDeRed> = {
  linkedin: {
    red: 'linkedin',
    forma: 'carrusel_documento',
    que: 'Un carrusel documento que se hojea, no una imagen suelta.',
    hero: 'La primera lámina es una tesis, no una portada. Tiene que poder leerse sola y dar ganas de pasar a la siguiente.',
    cta: 'Pedir una opinión informada, no una compra. Aquí se juega el criterio, no el cierre.',
    pasos: [
      'Primera lámina: la tesis en una frase corta, grande y sin adornos.',
      'Segunda lámina: por qué importa, con el dato que lo sostiene y su fuente a la vista.',
      'Láminas del medio: una idea por lámina. Si una necesita dos, son dos láminas.',
      'Penúltima: qué hacer con esto el lunes en la mañana.',
      'Última: la pregunta que abre conversación, y ahí el CTA.',
      'El copy del post repite la tesis: mucha gente no abre el documento.',
    ],
    evitar: [
      'Frases de gurú y párrafos de una sola palabra.',
      'Poner el dato sin decir de dónde salió: en LinkedIn eso se nota y cuesta caro.',
      'Vender en la primera lámina.',
    ],
    parametros: { laminas: '8-12' },
  },

  instagram: {
    red: 'instagram',
    forma: 'imagen_centro_seguro',
    que: 'Una imagen vertical pensada para sobrevivir el recorte de la retícula del perfil.',
    hero: 'El sujeto, grande y claro. Si hay que entrecerrar los ojos para saber qué es, está mal.',
    cta: 'Guardar o mandar por mensaje. Pedir clic aquí es pedir lo que la red no da bien.',
    pasos: [
      'El texto y el logo van DENTRO del centro cuadrado: es lo único que sobrevive al recorte del perfil.',
      'Máximo una idea de texto sobre la imagen, en pocas palabras.',
      'Contraste alto: la mayoría lo va a ver en la calle, con sol y a media pantalla.',
      'El copy arranca con una línea que funcione sola, porque el resto viene cortado por "ver más".',
      'El CTA va en la primera línea del copy, no al final.',
    ],
    evitar: [
      'Texto pegado a los bordes: lo recorta el perfil y lo tapan los íconos.',
      'Paletas lavadas: en la retícula, al lado de otras nueve, desaparece.',
      'Meter tres mensajes en una sola pieza.',
    ],
    parametros: { centro: '3:4' },
  },

  tiktok: {
    red: 'tiktok',
    forma: 'guion_por_segundos',
    que: 'Un guion cronometrado, no un video con texto encima.',
    hero: 'La propuesta entra en los primeros segundos: qué es y para quién. Sin logo de intro.',
    cta: 'En PANTALLA y hablado. Nadie lleva el audio prendido ni lee la descripción.',
    pasos: [
      'Segundos iniciales: la propuesta, dicha y escrita. Nada de logo animado.',
      'Antes del sexto segundo: el gancho, la razón para no deslizar.',
      'Del gancho al final: una sola demostración, concreta y visible.',
      'El CTA aparece EN PANTALLA, no solo en el audio ni en la descripción.',
      'Subtítulos quemados siempre: se ve sin sonido.',
    ],
    evitar: [
      'Abrir con el logo: es el segundo más caro del video y se regala.',
      'Fiarse del audio: la mayoría lo ve en silencio.',
      'Texto en la zona baja, que la tapan la descripción y los botones.',
    ],
    parametros: { propuesta: '0-3 s', gancho: 'antes de 6 s' },
  },

  twitter: {
    red: 'twitter',
    forma: 'una_sola_idea',
    que: 'Una idea. Una. Si hay dos, son dos publicaciones.',
    hero: 'La primera línea ES la pieza: es lo que se ve en la línea de tiempo.',
    cta: 'Responder o citar. Pedir clic fuera cuesta alcance.',
    pasos: [
      'Escribe la idea en una línea. Si no cabe, todavía no está clara.',
      'Quita todo lo que se pueda quitar sin perder la idea.',
      'Si hay un dato, va con su fuente en la misma publicación.',
      'La imagen refuerza, no explica: se lee sin ella.',
    ],
    evitar: [
      'Hilos para lo que cabe en una publicación.',
      'Poner el remate al final de un párrafo largo.',
      'Etiquetas de moda que no son del tema.',
    ],
    parametros: {},
  },

  facebook: {
    red: 'facebook',
    forma: 'imagen_con_contexto',
    que: 'Una escena reconocible con contexto suficiente para entenderla de un vistazo.',
    hero: 'Una situación cotidiana creíble, con gente real y espacio para el mensaje.',
    cta: 'Comentar o mandar mensaje: es donde la conversación de verdad arranca.',
    pasos: [
      'Primer párrafo: el contexto que hace reconocible la situación.',
      'Segundo: el beneficio concreto, sin adjetivos.',
      'Una prueba breve, con su fuente si es un número.',
      'Cierra con pregunta o con el CTA de mensaje.',
    ],
    evitar: [
      'Fotografía de banco de imágenes: se reconoce y baja la confianza.',
      'Tono de anuncio clasificado.',
      'Párrafos largos: aquí se lee a saltos.',
    ],
    parametros: {},
  },

  youtube: {
    red: 'youtube',
    forma: 'miniatura_y_titulo',
    que: 'La miniatura y el título son la pieza; el video es lo que viene después del clic.',
    hero: 'La miniatura tiene que leerse del tamaño de un pulgar.',
    cta: 'Suscribirse o ver el siguiente. El clic ya lo diste al entrar.',
    pasos: [
      'Miniatura: una sola cara o un solo objeto, grande, con tres o cuatro palabras como máximo.',
      'El título dice qué se lleva quien lo vea, no de qué trata.',
      'Los primeros segundos repiten la promesa del título: si no, se cierra.',
      'Capítulos siempre: la gente busca el minuto que le sirve.',
    ],
    evitar: [
      'Miniaturas con párrafos: no se leen en un teléfono.',
      'Títulos que prometen lo que el video no da.',
    ],
    parametros: {},
  },
};

export function recetaDe(red: string): RecetaDeRed | null {
  return (RECETAS as Record<string, RecetaDeRed>)[red] ?? null;
}

/* ---------------------------------------------------------------------------
   La receta como afirmaciones: para que la pantalla la enseñe y el arnés la revise.

   Aquí está el remate de lo que prometió `procedencia.ts`: las medidas de red NO
   son una excepción a la regla de la procedencia. Van como cifras `oficial` con la
   URL de la plataforma y la fecha en que se leyó la spec, o como parámetros
   declarados. El arnés las revisa igual que a un dato de mercado.
--------------------------------------------------------------------------- */
export function recetaEnAfirmaciones(red: RedPublicable): Afirmacion[] {
  const r = RECETAS[red];
  const f = elegirFormato(red);
  const out: Afirmacion[] = [];

  out.push({ plantilla: r.que });
  out.push({ plantilla: `Lo primero que se ve: ${r.hero}` });
  out.push({ plantilla: `Qué se le pide a quien lo ve: ${r.cta}` });

  out.push({
    etiqueta: `El lienzo de ${RED_LABEL[red as RedSlug] ?? red}`,
    plantilla: '{cifra}',
    cifra: cifraDeLienzo(red),
  });
  out.push({
    etiqueta: 'Hasta cuánto texto acepta la red',
    plantilla: '{cifra}',
    cifra: cifraDeSpec(red, 'caracteres'),
  });
  out.push({
    etiqueta: 'Cuántas etiquetas conviene poner',
    plantilla: '{cifra}',
    cifra: cifraDeSpec(red, 'hashtags'),
  });

  // Los pasos, con sus parámetros declarados cuando llevan números.
  for (const paso of r.pasos) {
    const conHueco = aplicarParametros(paso, r.parametros);
    out.push({ plantilla: conHueco.plantilla, parametros: conHueco.usados });
  }
  for (const e of r.evitar) {
    const conHueco = aplicarParametros(`Evitar: ${e}`, r.parametros);
    out.push({ plantilla: conHueco.plantilla, parametros: conHueco.usados });
  }

  if (f.zonaSegura) {
    out.push({
      plantilla: 'Hay zona segura: deja aire arriba y abajo para que la interfaz no tape el mensaje.',
    });
  }
  return out;
}

/**
 * Cambia los valores literales de los parámetros por sus huecos.
 *
 * Los pasos están escritos con las palabras de un humano ("va de 8-12 láminas"),
 * y el arnés no acepta dígitos en la prosa. En vez de pedirle a quien escriba la
 * receta que aprenda la sintaxis de las plantillas, el código hace la conversión:
 * busca el valor del parámetro dentro del texto y lo reemplaza por su hueco.
 */
export function aplicarParametros(
  texto: string,
  parametros: Record<string, string>,
): { plantilla: string; usados: Record<string, string> } {
  let plantilla = texto;
  const usados: Record<string, string> = {};
  for (const [nombre, valor] of Object.entries(parametros)) {
    if (!valor || !plantilla.includes(valor)) continue;
    plantilla = plantilla.split(valor).join(`{${nombre}}`);
    usados[nombre] = valor;
  }
  return { plantilla, usados };
}

/* ---------------------------------------------------------------------------
   El kit de marca, leído de los anuncios REALES que suba el dueño.

   Regla dura de la corrida: **NO se cambia el kit de ningún proyecto real.** Si
   lo medido no coincide con la marca, se PROPONE en el reporte y ahí se queda.
   Cambiarle los colores a la marca de alguien porque un algoritmo midió otra cosa
   es exactamente el tipo de iniciativa que nadie pidió.
--------------------------------------------------------------------------- */
export interface KitMedido {
  /** Colores medidos, en hex, del más usado al menos. */
  colores: Array<{ hex: string; porcentaje: number }>;
  /** Cuántas imágenes se midieron. Sin esto, los porcentajes no se defienden. */
  muestra: number;
  fuente: string;
  medidoEn: Date;
  metodo: string;
}

export interface PropuestaDeKit {
  /** `true` solo si lo medido difiere de verdad de lo que el proyecto tiene. */
  difiere: boolean;
  /** En palabras, para el reporte. Nunca se aplica solo. */
  propuesta: string;
  medido: KitMedido;
  actual: { primario?: string | null; secundario?: string | null };
}

/**
 * Compara lo medido con el kit que el proyecto ya tiene y PROPONE, no cambia.
 *
 * La comparación es por distancia de color y no por igualdad de texto: `#1A2B3C`
 * y `#1b2b3d` son el mismo color para un ojo y distintos para un `===`.
 */
export function proponerKit(
  medido: KitMedido,
  actual: { primario?: string | null; secundario?: string | null },
): PropuestaDeKit {
  const principal = medido.colores[0]?.hex;
  const difiere = Boolean(
    principal && actual.primario && distanciaColor(principal, actual.primario) > 60,
  );

  const propuesta = !principal
    ? 'No se pudo medir ningún color dominante en los anuncios que se subieron.'
    : !actual.primario
      ? `Los anuncios usan sobre todo ${principal}. El proyecto no tiene color primario registrado; ` +
        `vale la pena confirmarlo con el dueño antes de ponerlo.`
      : difiere
        ? `Los anuncios reales usan sobre todo ${principal}, y el kit del proyecto dice ${actual.primario}. ` +
          `No se cambió nada: si el kit está bien, quizá los anuncios se salieron de marca; ` +
          `si los anuncios están bien, el kit está viejo. Eso lo decide el dueño.`
        : `Los anuncios reales coinciden con el kit del proyecto (${actual.primario}). No hay nada que proponer.`;

  return { difiere, propuesta, medido, actual };
}

/** Distancia burda entre dos colores hex. Alcanza para "¿son el mismo o no?". */
export function distanciaColor(a: string, b: string): number {
  const p = (h: string) => {
    const s = h.replace('#', '').trim();
    const n = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
  };
  try {
    const [r1, g1, b1] = p(a);
    const [r2, g2, b2] = p(b);
    if ([r1, g1, b1, r2, g2, b2].some((x) => Number.isNaN(x))) return Infinity;
    return Math.sqrt((r1! - r2!) ** 2 + (g1! - g2!) ** 2 + (b1! - b2!) ** 2);
  } catch {
    return Infinity;
  }
}

/** El playbook y la receta juntos, para el prompt de la pieza. */
export function briefDeRed(red: RedPublicable): string {
  const p = SOCIAL_PLAYBOOKS[red];
  const r = RECETAS[red];
  const f = elegirFormato(red);
  return [
    `RED: ${RED_LABEL[red as RedSlug] ?? red}`,
    `Qué es la pieza: ${r.que}`,
    `Lo primero que se ve: ${r.hero}`,
    `Qué se le pide a quien la ve: ${r.cta}`,
    `Lienzo: ${f.label} ${f.ratio} (${f.ancho}x${f.alto}), fuente ${f.fuente}, leído el ${f.leidoEl}`,
    `Tono: ${p.tono}`,
    `Estructura del copy: ${p.estructuraCopy}`,
    '',
    'Cómo se arma:',
    ...r.pasos.map((x) => `  - ${x}`),
    '',
    'Qué NO hacer:',
    ...r.evitar.map((x) => `  - ${x}`),
  ].join('\n');
}
