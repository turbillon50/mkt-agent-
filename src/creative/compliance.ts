/**
 * La compuerta anti-baneo.
 *
 * Lo último que pasa antes de "Aprobar" o "Publicar", y lo único que puede
 * decir que no. Tres semáforos:
 *
 *   **Verde** — sale.
 *   **Ámbar** — sale si una persona lo decide, con la advertencia delante.
 *   **Rojo** — no sale. Ni con el nivel de autonomía 4, que es lo que hace que
 *              sea una compuerta y no un permiso.
 *
 * Cómo decide, en dos pasadas y en este orden:
 *
 *   1. **Reglas duras.** Se calculan, no se opinan: el formato contra la spec
 *      oficial, el largo contra el tope de la red, la frecuencia contra lo que
 *      lleva publicado hoy, los enlaces, las menciones y el texto repetido
 *      contra lo que ya salió. Esto no falla ni cuesta un token.
 *   2. **El modelo, con las reglas delante.** Lo que un `if` no alcanza:
 *      "garantiza 20 % de rendimiento" no es una palabra prohibida, es una
 *      PROMESA — y solo se reconoce leyendo. Se le pasan las reglas de esa red
 *      ingeridas de su página oficial y se le pide que cite la que se rompe.
 *      Si el modelo no contesta o contesta mal, **no se aprueba por defecto**:
 *      se devuelve ámbar diciendo que no se pudo revisar. No revisar no es
 *      estar limpio.
 *
 * Y una decisión de fondo: **el modelo no puede poner verde lo que las reglas
 * duras pusieron rojo.** Puede agregar hallazgos, nunca quitarlos. Un semáforo
 * que el modelo puede abrir con una buena excusa no protege de nada.
 */
import { and, desc, eq, ne } from 'drizzle-orm';
import { db } from '../db/client';
import { creativePieces, posts, type Project } from '../db/schema';
import { chatJSON } from '../openrouter';
import { config } from '../config';
import { logProjectEvent } from '../projects/events';
import { puedeSolo } from '../autonomia/niveles';
import { corteDe } from './cortes';
import { revisarCalidad, type Dictamen, type Medida } from './calidad';
import { usoDeHoy, veredictoDeFrecuencia, type UsoDeHoy } from './frecuencia';
import { REGLAS, reglaPorId, reglasDe, type Regla } from './reglas';
import { formatoPorId, RED_LABEL, type RedSlug } from './specs';

export type Semaforo = 'verde' | 'ambar' | 'rojo';

export interface Hallazgo {
  /** Qué se encontró, en español y sin jerga. */
  texto: string;
  nivel: Exclude<Semaforo, 'verde'>;
  /** La regla que lo dice, con su URL. null cuando es criterio de la casa. */
  regla: { id: string; titulo: string; fuente: string; leidoEl: string } | null;
  /** Lo dijo un `if` o lo dijo el modelo. */
  origen: 'duro' | 'modelo';
  /** ¿"Corregir con Goossip" puede intentarlo? */
  corregible: boolean;
}

export interface Veredicto {
  semaforo: Semaforo;
  hallazgos: Hallazgo[];
  /** Cuántas reglas se evaluaron. Va a la bitácora. */
  reglasEvaluadas: number;
  /** Si el modelo no pudo opinar, aquí está el porqué. */
  avisoDeRevision: string | null;
  calidad: Dictamen | null;
  uso: UsoDeHoy | null;
  /** Una línea para la pantalla. */
  resumen: string;
}

// ---------------------------------------------------------------------------
// Detectores duros
// ---------------------------------------------------------------------------

/**
 * Acortadores de enlaces.
 *
 * No están prohibidos por sí solos, pero las cuatro redes los tratan como
 * señal de phishing cuando esconden el destino, y Meta lo dice en su política
 * de prácticas engañosas. Por eso es ámbar y no rojo: un `bit.ly` de una
 * campaña legítima existe.
 */
const ACORTADORES =
  /\b(?:bit\.ly|tinyurl\.com|goo\.gl|t\.co|ow\.ly|is\.gd|buff\.ly|rebrand\.ly|cutt\.ly|shorturl\.at|rb\.gy|s\.id)\b/i;

/**
 * Promesas de rendimiento financiero.
 *
 * Es el patrón que pide la prueba 2 del spec y el que más caro sale en los
 * proyectos inmobiliarios de la casa. Tiene DOS formas y las dos cuentan:
 *
 *   · el verbo de garantía cerca de un número con porcentaje o de una palabra
 *     de rendimiento — "garantizamos 20 % de rendimiento", "rendimiento
 *     garantizado del 20 %";
 *   · la plusvalía, el retorno o la ganancia dados como hecho — "tu inversión
 *     se duplica en dos años".
 *
 * No se busca "20 %" a secas: un descuento del 20 % es legal y se anuncia todos
 * los días. Lo que lo vuelve ilegal es la GARANTÍA sobre el rendimiento.
 */
const VERBO_GARANTIA =
  /(garantiz\w+|asegur\w+|prometemos|prometido|sin riesgo|cero riesgo|100\s*%\s*seguro|te aseguramos)/i;
const PALABRA_RENDIMIENTO =
  /(rendimiento|retorno|plusval[ií]a|ganancia|utilidad|rentabilidad|roi\b|inter[eé]s anual|dividendo)/i;
const NUMERO_PORCENTAJE = /\d+(?:[.,]\d+)?\s*%/;
/**
 * "Tu inversión se duplica en dos años."
 *
 * En español el sujeto va DELANTE del verbo tan a menudo como detrás ("se
 * duplica tu inversión"), así que la pareja se busca en los dos sentidos. Con
 * un solo orden, la frase más común de todas se colaba — medido.
 */
const MULTIPLICA_VERBO = /(dupl\w+|tripl\w+|multiplic\w+|x\s?[2-9]\b)/i;
const MULTIPLICA_DINERO = /(invers|dinero|capital|patrimonio|ahorro)/i;

/** Detecta la promesa. Devuelve el trozo que la dispara, para poder citarlo. */
export function promesaDeRendimiento(texto: string): string | null {
  // Por oración: "Garantizamos entrega en 30 días. El rendimiento del sector
  // fue del 8 %." son dos frases inocentes que juntas dispararían un falso
  // positivo si se buscara en todo el texto de corrido.
  for (const oracion of texto.split(/(?<=[.!?\n])\s+/)) {
    const conGarantia = VERBO_GARANTIA.test(oracion);
    const conRendimiento = PALABRA_RENDIMIENTO.test(oracion);
    const conNumero = NUMERO_PORCENTAJE.test(oracion);

    // Garantía + palabra de rendimiento: es la promesa, con número o sin él.
    // "Rendimiento garantizado" ya es ilegal aunque no diga cuánto.
    if (conGarantia && conRendimiento) return oracion.trim();

    // Garantía + porcentaje, cuando el TEXTO habla de rendimiento en alguna
    // parte: "Invierte con nosotros. Te garantizamos el 20 %." son dos frases
    // que por separado no dicen nada y juntas prometen un rendimiento.
    if (conGarantia && conNumero && PALABRA_RENDIMIENTO.test(texto)) return oracion.trim();

    // "Tu inversión se duplica en dos años" no lleva garantía ni porcentaje y
    // es exactamente la misma promesa.
    if (MULTIPLICA_VERBO.test(oracion) && MULTIPLICA_DINERO.test(oracion)) return oracion.trim();
  }
  return null;
}

const RE_MENCION = /@[\p{L}\p{N}_.]+/gu;
const RE_HASHTAG = /#[\p{L}\p{N}_]+/gu;

/**
 * Menciones masivas.
 *
 * Ninguna red publica un número. Lo que sí publican las cuatro es que etiquetar
 * en masa es spam. Ocho es criterio de la casa y se dice que lo es: es el punto
 * donde una publicación deja de mencionar a quien sale en ella y empieza a
 * repartir etiquetas a ver qué pega.
 */
export const MENCIONES_QUE_HUELEN_MAL = 8;

/** Cuánto se parecen dos textos, de 0 a 1. Bolsa de palabras, que basta. */
export function parecido(a: string, b: string): number {
  const palabras = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3),
    );
  const A = palabras(a);
  const B = palabras(b);
  if (A.size === 0 || B.size === 0) return 0;
  let comunes = 0;
  for (const w of A) if (B.has(w)) comunes += 1;
  return comunes / Math.max(A.size, B.size);
}

/** A partir de aquí, dos publicaciones son "la misma otra vez". */
export const PARECIDO_QUE_ES_REPETIR = 0.85;

// ---------------------------------------------------------------------------
// La revisión
// ---------------------------------------------------------------------------

export interface EntradaCompuerta {
  orgId: string;
  project: Project;
  red: RedSlug;
  formatoId: string | null;
  texto: string;
  /** La pieza, si hay. Se mide su calidad. */
  piezaId?: string | null;
  /** Lo ya medido, para no volver a bajar el archivo. */
  medida?: Medida | null;
  /** Saltarse el conteo de frecuencia (pruebas, vistas previas). */
  sinFrecuencia?: boolean;
  /** Saltarse al modelo (pruebas, o cuando no hay llave). */
  sinModelo?: boolean;
  ahora?: Date;
}

function comoHallazgo(
  texto: string,
  nivel: Hallazgo['nivel'],
  regla: Regla | null,
  origen: Hallazgo['origen'],
  corregible = true,
): Hallazgo {
  return {
    texto,
    nivel,
    regla: regla
      ? { id: regla.id, titulo: regla.titulo, fuente: regla.fuente, leidoEl: regla.leidoEl }
      : null,
    origen,
    corregible,
  };
}

/**
 * Las reglas duras. Sin modelo, sin red, sin excusas.
 *
 * Está exportada aparte porque las pruebas la corren sola: una prueba que
 * necesita una llave de un proveedor para comprobar que "garantiza 20 % de
 * rendimiento" sale en rojo no es una prueba, es una apuesta.
 */
export async function reglasDuras(input: EntradaCompuerta): Promise<{
  hallazgos: Hallazgo[];
  calidad: Dictamen | null;
  uso: UsoDeHoy | null;
}> {
  const hallazgos: Hallazgo[] = [];
  const texto = input.texto ?? '';
  const red = input.red;

  // --- 1. el largo -----------------------------------------------------------
  const corte = corteDe(red);
  if (corte.tope !== null && texto.length > corte.tope) {
    hallazgos.push(
      comoHallazgo(
        `El texto lleva ${texto.length} caracteres y ${RED_LABEL[red]} acepta ${corte.tope} en ${corte.hueco}. Tal cual, no publica.`,
        // Si el número es OFICIAL, bloquea. Si es observado, solo advierte: no
        // se frena una publicación con un número que nadie publicó.
        corte.origenTope === 'oficial' ? 'rojo' : 'ambar',
        null,
        'duro',
      ),
    );
  }

  // --- 2. hashtags -----------------------------------------------------------
  const formato = input.formatoId ? formatoPorId(input.formatoId) : null;
  const hashtags = [...new Set(texto.match(RE_HASHTAG) ?? [])];
  const topeHashtags = formato?.limites?.hashtags;
  if (topeHashtags && hashtags.length > topeHashtags) {
    // El tope de hashtags sale de la ficha del formato (`specs.ts`), que ya trae
    // su propia fuente oficial; NO de la regla de publicaciones/día, que es otra
    // cosa. Si la red tiene una norma de comunidad o spam contra el exceso de
    // hashtags, se cita esa —etiquetar de más es señal de spam—; si no, se deja
    // sin cita antes que colgarle al usuario un enlace que no viene al caso.
    const normaSpam =
      reglasDe(red).find((r) => r.id.includes('spam')) ??
      reglasDe(red).find((r) => r.id.includes('normas-comuni')) ??
      null;
    hallazgos.push(
      comoHallazgo(
        `${hashtags.length} hashtags y ${RED_LABEL[red]} acepta ${topeHashtags}. De más, rechaza la publicación entera.`,
        'rojo',
        normaSpam,
        'duro',
      ),
    );
  }

  // --- 3. menciones masivas --------------------------------------------------
  const menciones = [...new Set(texto.match(RE_MENCION) ?? [])];
  if (menciones.length >= MENCIONES_QUE_HUELEN_MAL) {
    hallazgos.push(
      comoHallazgo(
        `${menciones.length} menciones en una sola publicación. Ninguna red publica un número, pero todas llaman spam a etiquetar en masa — ${MENCIONES_QUE_HUELEN_MAL} es donde lo ponemos nosotros.`,
        'ambar',
        reglasDe(red).find((r) => r.id.includes('spam')) ?? null,
        'duro',
      ),
    );
  }

  // --- 4. enlaces acortados --------------------------------------------------
  const acortador = texto.match(ACORTADORES);
  if (acortador) {
    hallazgos.push(
      comoHallazgo(
        `El enlace va acortado (${acortador[0]}). Las redes lo leen como esconder el destino y es una de las señales que más rápido tumban el alcance. Pon la dirección completa.`,
        'ambar',
        reglaPorId('meta-ads-fraude'),
        'duro',
      ),
    );
  }

  // --- 5. promesa de rendimiento financiero ----------------------------------
  const promesa = promesaDeRendimiento(texto);
  if (promesa) {
    hallazgos.push(
      comoHallazgo(
        `"${promesa}" es una promesa de rendimiento. Meta prohíbe las afirmaciones de ganancia irreal o garantizada en publicidad.`,
        'rojo',
        reglaPorId('meta-ads-contenido-enganoso'),
        'duro',
      ),
    );
    hallazgos.push(
      comoHallazgo(
        'Y en México, además, es publicidad engañosa: el artículo 32 de la LFPC exige que la publicidad sea veraz y COMPROBABLE, y sanciona la que induce a error por exagerada. Esto lo ve PROFECO, no solo la red.',
        'rojo',
        reglaPorId('mx-lfpc-32'),
        'duro',
        false,
      ),
    );
  }

  // --- 6. texto repetido -----------------------------------------------------
  const repetido = await textoYaPublicado({
    orgId: input.orgId,
    projectId: input.project.id,
    red,
    texto,
    piezaId: input.piezaId ?? null,
  }).catch(() => null);
  if (repetido) {
    hallazgos.push(
      comoHallazgo(
        `Este texto se parece un ${Math.round(repetido.parecido * 100)} % a algo que ya salió en ${RED_LABEL[red]}${
          repetido.cuando ? ` el ${repetido.cuando.toLocaleDateString('es-MX')}` : ''
        }. Repetir lo mismo es lo que las redes llaman contenido repetitivo, y es de lo primero que castigan.`,
        'ambar',
        reglaPorId(red === 'linkedin' ? 'linkedin-spam' : 'youtube-produccion-masiva'),
        'duro',
      ),
    );
  }

  // --- 7. la calidad del archivo --------------------------------------------
  let calidad: Dictamen | null = null;
  if (input.formatoId && input.medida) {
    calidad = revisarCalidad(input.formatoId, input.medida);
    for (const falla of calidad.fallas) {
      hallazgos.push(
        comoHallazgo(
          `${falla.texto}${falla.adaptable ? ' Se arregla con "Adaptar".' : ''}`,
          'rojo',
          null,
          'duro',
          falla.adaptable,
        ),
      );
    }
  }

  // --- 8. la frecuencia ------------------------------------------------------
  let uso: UsoDeHoy | null = null;
  if (!input.sinFrecuencia) {
    uso = await usoDeHoy({
      orgId: input.orgId,
      projectId: input.project.id,
      red,
      ahora: input.ahora,
    }).catch(() => null);
    if (uso) {
      const v = veredictoDeFrecuencia(uso);
      if (v.nivel !== 'verde') {
        hallazgos.push(
          comoHallazgo(v.motivo, v.nivel, v.regla ? reglaPorId(uso.limite.regla) : null, 'duro', false),
        );
      }
    }
  }

  return { hallazgos, calidad, uso };
}

/** ¿Ya salió algo casi igual en esta red? */
async function textoYaPublicado(input: {
  orgId: string;
  projectId: string;
  red: RedSlug;
  texto: string;
  piezaId: string | null;
}): Promise<{ parecido: number; cuando: Date | null } | null> {
  if (input.texto.trim().length < 40) return null;

  const anteriores = await db
    .select({ text: posts.text, cuando: posts.publishedAt, creado: posts.createdAt })
    .from(posts)
    .where(
      and(
        eq(posts.orgId, input.orgId),
        eq(posts.projectId, input.projectId),
        eq(posts.platform, input.red),
      ),
    )
    .orderBy(desc(posts.createdAt))
    .limit(40);

  for (const a of anteriores) {
    const p = parecido(input.texto, a.text);
    if (p >= PARECIDO_QUE_ES_REPETIR) return { parecido: p, cuando: a.cuando ?? a.creado ?? null };
  }
  return null;
}

// ---------------------------------------------------------------------------
// El modelo, con las reglas delante
// ---------------------------------------------------------------------------

interface RespuestaDelModelo {
  hallazgos?: Array<{ regla?: string; texto?: string; nivel?: string }>;
}

async function revisionDelModelo(
  input: EntradaCompuerta,
  reglas: Regla[],
): Promise<{ hallazgos: Hallazgo[]; aviso: string | null }> {
  if (input.sinModelo || !config.openrouter.apiKey) {
    return {
      hallazgos: [],
      aviso:
        'No se pudo pasar la pieza por la revisión del modelo (falta la llave del proveedor). Las reglas que se calculan sí se revisaron; las que hay que LEER, no.',
    };
  }

  const catalogo = reglas
    .map((r) => `- [${r.id}] ${r.titulo} (${r.peso}): ${r.dice.slice(0, 420)}`)
    .join('\n');

  const sistema = [
    'Eres el revisor de cumplimiento de Goossip. Tu trabajo es evitar que a un cliente le cierren su cuenta.',
    'Recibes un texto que va a publicarse y las REGLAS OFICIALES de esa red y de México. Solo puedes usar esas reglas.',
    'NO inventes reglas. NO cites una regla que no esté en la lista. Si no rompe ninguna, devuelve la lista vacía.',
    'Busca sobre todo: promesas de rendimiento o ganancia, precios sin respaldo, afirmaciones no comprobables,',
    'contenido prohibido, suplantación de marca, clickbait que no cumple lo que promete, y spam.',
    'Devuelve SOLO un JSON: {"hallazgos":[{"regla":"<id de la lista>","nivel":"rojo|ambar","texto":"<qué está mal, en español, dirigido al dueño del negocio, sin jerga>"}]}',
  ].join(' ');

  const usuario = [
    `Red: ${RED_LABEL[input.red]}`,
    `Negocio: ${input.project.name}`,
    '',
    'REGLAS QUE PUEDES CITAR:',
    catalogo,
    '',
    'TEXTO QUE SE VA A PUBLICAR:',
    input.texto,
  ].join('\n');

  try {
    const r = await chatJSON<RespuestaDelModelo>(
      [
        { role: 'system', content: sistema },
        { role: 'user', content: usuario },
      ],
      { temperature: 0.1, maxTokens: 900 },
    );

    const hallazgos: Hallazgo[] = [];
    for (const h of r.hallazgos ?? []) {
      // Una cita a una regla que no existe se tira. Es la protección contra
      // que el modelo se invente una política con nombre creíble — que es
      // exactamente el error que este archivo entero viene a evitar.
      const regla = h.regla ? reglaPorId(h.regla) : null;
      if (!regla || !h.texto) continue;
      if (!reglas.some((x) => x.id === regla.id)) continue;
      const nivel: Hallazgo['nivel'] =
        h.nivel === 'rojo' || regla.peso === 'bloquea' ? 'rojo' : 'ambar';
      hallazgos.push(comoHallazgo(h.texto, nivel, regla, 'modelo'));
    }
    return { hallazgos, aviso: null };
  } catch (e) {
    return {
      hallazgos: [],
      aviso: `No se pudo completar la revisión con el modelo (${
        e instanceof Error ? e.message.slice(0, 120) : 'error'
      }). Lo que se calcula sí se revisó.`,
    };
  }
}

// ---------------------------------------------------------------------------
// La compuerta
// ---------------------------------------------------------------------------

export async function revisar(input: EntradaCompuerta): Promise<Veredicto> {
  const reglas = reglasDe(input.red);
  const duras = await reglasDuras(input);
  const delModelo = await revisionDelModelo(input, reglas);

  const hallazgos = [...duras.hallazgos, ...delModelo.hallazgos];

  // El semáforo sale del hallazgo MÁS GRAVE. El modelo suma, nunca resta:
  // `hallazgos` ya trae los duros y nada de abajo los puede quitar.
  let semaforo: Semaforo = 'verde';
  if (hallazgos.some((h) => h.nivel === 'rojo')) semaforo = 'rojo';
  else if (hallazgos.some((h) => h.nivel === 'ambar')) semaforo = 'ambar';

  // No haber podido revisar no es estar limpio. Si el modelo no opinó y todo lo
  // demás salió verde, queda ámbar: que una persona lo mire.
  if (semaforo === 'verde' && delModelo.aviso) semaforo = 'ambar';

  return {
    semaforo,
    hallazgos,
    reglasEvaluadas: reglas.length,
    avisoDeRevision: delModelo.aviso,
    calidad: duras.calidad,
    uso: duras.uso,
    resumen: resumir(semaforo, hallazgos, delModelo.aviso, input.red),
  };
}

function resumir(
  semaforo: Semaforo,
  hallazgos: Hallazgo[],
  aviso: string | null,
  red: RedSlug,
): string {
  if (semaforo === 'verde') {
    return `Se puede publicar en ${RED_LABEL[red]}: no rompe ninguna de las reglas que revisé.`;
  }
  if (semaforo === 'rojo') {
    const primero = hallazgos.find((h) => h.nivel === 'rojo');
    return `No se publica en ${RED_LABEL[red]}. ${primero?.texto ?? ''}`;
  }
  if (aviso && hallazgos.length === 0) return aviso;
  const n = hallazgos.filter((h) => h.nivel === 'ambar').length;
  return `Sale, pero con ${n} ${n === 1 ? 'advertencia' : 'advertencias'}. Léelas antes de aprobar.`;
}

// ---------------------------------------------------------------------------
// Corregir con Goossip
// ---------------------------------------------------------------------------

export interface Correccion {
  /** El texto ya reescrito. Igual al de entrada si no se pudo o no hacía falta. */
  textoCorregido: string;
  /** ¿De verdad cambió algo? */
  cambio: boolean;
  /** Qué se tocó, en español, para enseñárselo al dueño. */
  queSeCambio: string[];
  /** Por qué NO se pudo, si no se pudo. */
  aviso: string | null;
}

interface RespuestaCorreccion {
  texto: string;
  cambios: string[];
}

/**
 * "Corregir con Goossip": el botón del ámbar que de verdad corrige.
 *
 * Reescribe el TEXTO para que pase la compuerta —quita la promesa que no se
 * puede probar, baja los hashtags o las menciones al tope de la red, abre el
 * enlace acortado, redacta distinto lo que se parecía demasiado a algo ya
 * publicado— sin cambiar el mensaje ni el tono, y sin pasarse del largo que la
 * red corta.
 *
 * Lo que NO toca, y por eso lo dice:
 *   · la calidad del archivo (resolución, peso, duración) → eso es "Adaptar";
 *   · la frecuencia (te quedan N hoy) → eso es esperar, no reescribir.
 *
 * Devuelve el texto nuevo para que la pantalla lo ponga en el editor y vuelva a
 * pasar la compuerta: la corrección se PRUEBA, no se promete.
 */
export async function corregir(input: EntradaCompuerta): Promise<Correccion> {
  // La frecuencia no se arregla reescribiendo, así que ni se mide aquí.
  const veredicto = await revisar({ ...input, sinFrecuencia: true });
  const arreglables = veredicto.hallazgos.filter((h) => h.corregible);

  if (arreglables.length === 0) {
    return {
      textoCorregido: input.texto,
      cambio: false,
      queSeCambio: [],
      aviso:
        'No hay nada que reescribir aquí: lo que queda o se arregla con "Adaptar" (es el archivo) o es cuestión de esperar (es la frecuencia).',
    };
  }

  if (!config.openrouter.apiKey) {
    return {
      textoCorregido: input.texto,
      cambio: false,
      queSeCambio: [],
      aviso: 'Falta la llave del proveedor, así que no se pudo reescribir con el modelo.',
    };
  }

  const corte = corteDe(input.red);
  const problemas = arreglables
    .map((h, i) => `${i + 1}. ${h.texto}${h.regla ? ` (política: ${h.regla.titulo})` : ''}`)
    .join('\n');

  const sistema = [
    'Eres Goossip reescribiendo un texto para que pase la compuerta anti-baneo de una red social sin perder lo que quiere decir.',
    'Te dan el texto, la red, y la LISTA de problemas que hay que arreglar. Arréglalos TODOS y solo esos.',
    'Reglas de la reescritura: mantén el mensaje, la intención y el tono; escribe en el MISMO idioma (español de México);',
    'quita toda promesa de rendimiento, ganancia o plusvalía garantizada y cualquier afirmación que no se pueda comprobar;',
    'si sobran hashtags o menciones, deja solo los que de verdad vengan al caso hasta caber en el límite;',
    'si hay un enlace acortado, ponlo como texto neutro ("(enlace)") en vez de inventar una URL;',
    'no inventes datos, precios ni cifras; no agregues hashtags nuevos.',
    corte.tope !== null
      ? `El texto final NO puede pasar de ${corte.tope} caracteres, que es donde ${RED_LABEL[input.red]} lo corta.`
      : '',
    'Devuelve SOLO un JSON: {"texto":"<el texto ya corregido>","cambios":["<qué cambiaste, en español, una frase por cambio>"]}',
  ]
    .filter(Boolean)
    .join(' ');

  const usuario = [
    `Red: ${RED_LABEL[input.red]}`,
    `Negocio: ${input.project.name}`,
    '',
    'PROBLEMAS QUE HAY QUE ARREGLAR:',
    problemas,
    '',
    'TEXTO A REESCRIBIR:',
    input.texto,
  ].join('\n');

  try {
    const r = await chatJSON<RespuestaCorreccion>(
      [
        { role: 'system', content: sistema },
        { role: 'user', content: usuario },
      ],
      { temperature: 0.3, maxTokens: 900 },
    );
    const nuevo = (r.texto ?? '').trim();
    if (!nuevo || nuevo === input.texto.trim()) {
      return {
        textoCorregido: input.texto,
        cambio: false,
        queSeCambio: [],
        aviso: 'El modelo no propuso un cambio distinto. Revísalo a mano.',
      };
    }
    return {
      textoCorregido: nuevo,
      cambio: true,
      queSeCambio: Array.isArray(r.cambios) ? r.cambios.filter((c) => typeof c === 'string') : [],
      aviso: null,
    };
  } catch (e) {
    return {
      textoCorregido: input.texto,
      cambio: false,
      queSeCambio: [],
      aviso: `No se pudo reescribir (${e instanceof Error ? e.message.slice(0, 120) : 'error'}).`,
    };
  }
}

/**
 * La compuerta de verdad: revisa Y decide, con el nivel de autonomía delante.
 *
 * La diferencia con `revisar` es quién aprieta el botón. Si lo aprieta una
 * persona, el ámbar se puede pasar. Si lo aprieta Goossip solo, no: un ámbar
 * sin nadie que lo lea es un rojo que se publicó.
 */
export async function compuerta(
  input: EntradaCompuerta & { quien: 'persona' | 'goossip'; accion: 'aprobar' | 'publicar' },
): Promise<{ veredicto: Veredicto; puede: boolean; motivo: string }> {
  const veredicto = await revisar(input);

  if (veredicto.semaforo === 'rojo') {
    await registrar(input, veredicto, false);
    return {
      veredicto,
      puede: false,
      motivo: veredicto.resumen,
    };
  }

  if (veredicto.semaforo === 'ambar' && input.quien === 'goossip') {
    const nivel = puedeSolo(input.project, 'publicar_organico');
    await registrar(input, veredicto, false);
    return {
      veredicto,
      puede: false,
      motivo: `Hay advertencias y esto lo iba a hacer Goossip sola. Lo dudoso lo mira una persona, en cualquier nivel de autonomía. ${nivel.motivo}`,
    };
  }

  await registrar(input, veredicto, true);
  return { veredicto, puede: true, motivo: veredicto.resumen };
}

/**
 * Cada revisión queda en la bitácora con LAS REGLAS QUE SE EVALUARON.
 *
 * No solo el resultado: las reglas. Dentro de seis meses, cuando alguien
 * pregunte por qué esta pieza salió y aquella no, la respuesta tiene que estar
 * en la bitácora y no en la memoria de nadie.
 */
async function registrar(
  input: EntradaCompuerta,
  veredicto: Veredicto,
  paso: boolean,
): Promise<void> {
  await logProjectEvent({
    orgId: input.orgId,
    projectId: input.project.id,
    type: 'compuerta_revisada',
    payload: {
      red: input.red,
      formato: input.formatoId,
      piezaId: input.piezaId ?? null,
      semaforo: veredicto.semaforo,
      paso,
      reglasEvaluadas: veredicto.reglasEvaluadas,
      hallazgos: veredicto.hallazgos.map((h) => ({
        nivel: h.nivel,
        origen: h.origen,
        regla: h.regla?.id ?? null,
        fuente: h.regla?.fuente ?? null,
        texto: h.texto.slice(0, 300),
      })),
      avisoDeRevision: veredicto.avisoDeRevision,
      cuotaHoy: veredicto.uso ? { hoy: veredicto.uso.hoy, tope: veredicto.uso.tope } : null,
    },
  });
}

/** Cuántas reglas tiene Goossip cargadas hoy. Para /admin y para la entrega. */
export function cuantasReglas(): { total: number; porAmbito: Record<string, number> } {
  const porAmbito: Record<string, number> = {};
  for (const r of REGLAS) porAmbito[r.ambito] = (porAmbito[r.ambito] ?? 0) + 1;
  return { total: REGLAS.length, porAmbito };
}

/** Las piezas que la compuerta frenó, para no volver a proponerlas igual. */
export async function piezasFrenadas(orgId: string, projectId: string): Promise<number> {
  const filas = await db
    .select({ id: creativePieces.id })
    .from(creativePieces)
    .where(
      and(
        eq(creativePieces.orgId, orgId),
        eq(creativePieces.projectId, projectId),
        ne(creativePieces.estado, 'publicada'),
      ),
    );
  return filas.length;
}
