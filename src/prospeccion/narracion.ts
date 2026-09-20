/**
 * Lo que Goossip DICE mientras recorre la zona.
 *
 * Regla única de este archivo: **cada frase sale de un número que ya se contó.**
 * No hay modelo de lenguaje aquí y es a propósito — esto se dice en vivo delante
 * de un prospecto, y un modelo que alucina "encontré 40 restaurantes" cuando
 * cayeron 12 en el mapa que el prospecto está viendo, quema la demo y la venta
 * en la misma frase. Una plantilla con un contador adentro no puede mentir.
 *
 * Y por eso también es puro: se prueba con una tabla de entradas y salidas, sin
 * red y sin base de datos.
 */

export interface NegocioVisto {
  name: string;
  website?: string | null;
  phone?: string | null;
  rating?: number | null;
  ratingsCount?: number | null;
  category?: string | null;
  /** Lo que se leyó de su sitio. Llega después, en la fase de enriquecimiento. */
  whatsapp?: string | null;
  email?: string | null;
  /** Solo si se pidieron horarios (Google los cobra aparte). */
  abierto24h?: boolean | null;
}

export interface Contadores {
  total: number;
  conTelefono: number;
  conSitio: number;
  sinSitio: number;
  conWhatsapp: number;
  conCorreo: number;
  ratingBajo: number;
  abiertos24h: number;
}

export function contar(negocios: NegocioVisto[]): Contadores {
  const c: Contadores = {
    total: negocios.length,
    conTelefono: 0,
    conSitio: 0,
    sinSitio: 0,
    conWhatsapp: 0,
    conCorreo: 0,
    ratingBajo: 0,
    abiertos24h: 0,
  };
  for (const n of negocios) {
    if (n.phone) c.conTelefono += 1;
    if (n.website) c.conSitio += 1;
    else c.sinSitio += 1;
    if (n.whatsapp) c.conWhatsapp += 1;
    if (n.email) c.conCorreo += 1;
    // `rating < 3.5` solo cuenta si el negocio TIENE rating. Un lugar sin una
    // sola reseña no es un lugar mal calificado: es un lugar del que no se sabe,
    // y meterlo en la misma cubeta le vende al cliente una oportunidad falsa.
    if (typeof n.rating === 'number' && n.rating > 0 && n.rating < 3.5) c.ratingBajo += 1;
    if (n.abierto24h) c.abiertos24h += 1;
  }
  return c;
}

/** El contador de arriba del mapa: "37 negocios · 21 con teléfono · …". */
export function lineaDeContadores(c: Contadores): string {
  const partes = [
    `${c.total} ${c.total === 1 ? 'negocio' : 'negocios'}`,
    `${c.conTelefono} con teléfono`,
    `${c.conSitio} con sitio web`,
  ];
  if (c.conWhatsapp > 0) partes.push(`${c.conWhatsapp} con WhatsApp`);
  return partes.join(' · ');
}

/**
 * El plural en español, con las tres reglas que cubren los giros reales.
 *
 * Se hace a mano y no con un `+ 's'` porque los giros vienen de los presets y
 * la mitad no terminan en vocal: "notaría pública" → "notarías públicas",
 * "hostal" → "hostales", "codorniz" → "codornices". Un "2 hostals" en la
 * narración de una demo en vivo se oye exactamente a lo que es.
 */
const PREPOSICIONES = new Set(['de', 'del', 'en', 'para', 'a', 'al', 'con', 'por', 'y']);

const ACENTO_FINAL: Array<[RegExp, string]> = [
  [/ón$/i, 'on'],
  [/án$/i, 'an'],
  [/ín$/i, 'in'],
  [/én$/i, 'en'],
  [/ún$/i, 'un'],
];

function pluralPalabra(p: string): string {
  if (/[aeiouáéíóú]$/i.test(p)) return `${p}s`;
  // Extranjerismos: "coworking" hace "coworkings", no "coworkinges".
  if (/[gkwy]$/i.test(p)) return `${p}s`;
  if (/z$/i.test(p)) return `${p.slice(0, -1)}ces`;
  if (/[sx]$/i.test(p)) return p; // "lunes", "tórax": invariables
  // "salón" hace "salones" y pierde el acento al ganar sílaba.
  for (const [re, sin] of ACENTO_FINAL) {
    if (re.test(p)) return `${p.replace(re, sin)}es`;
  }
  return `${p}es`;
}

export function plural(palabra: string): string {
  const palabras = palabra.split(' ');
  const corte = palabras.findIndex((p) => PREPOSICIONES.has(p.toLowerCase()));
  // Solo se pluraliza la cabeza del giro. "agencia de bienes raíces" es
  // "agencias de bienes raíces": pluralizar palabra por palabra da "agencias des
  // bieneses raíceses", que es lo que sale si uno le pega una `s` a todo.
  const hasta = corte === -1 ? palabras.length : corte;
  return palabras.map((p, i) => (i < hasta ? pluralPalabra(p) : p)).join(' ');
}

function cuantos(n: number, singular: string): string {
  return `${n} ${n === 1 ? singular : plural(singular)}`;
}

/**
 * Lo que dice al ENTRAR a un cuadrante. Es el "buscando…" con palabras.
 */
export function narrarEntrada(zona: string, cuadrante: string, i: number, n: number): string {
  const donde = cuadrante === 'centro' ? `el centro de ${zona}` : `el ${cuadrante} de ${zona}`;
  return `Revisando ${donde}… (cuadrante ${i} de ${n})`;
}

/**
 * Lo que dice al TERMINAR un cuadrante, con lo que encontró ahí.
 *
 * Tres formas y ninguna adorno: si no hubo nada lo dice, si hubo lo cuenta, y si
 * entre lo que hubo hay negocios sin sitio web lo señala — que es el hallazgo
 * que le interesa a quien vende servicios de marketing.
 */
export function narrarCuadrante(input: {
  zona: string;
  cuadrante: string;
  giro: string;
  encontrados: number;
  sinSitio: number;
}): string {
  const donde = input.cuadrante === 'centro' ? `el centro de ${input.zona}` : `el ${input.cuadrante}`;
  if (input.encontrados === 0) {
    return `En ${donde} no hay ${plural(input.giro)} nuevos. Sigo.`;
  }
  // Los giros de los presets vienen en SINGULAR ("restaurante", "notaría
  // pública") justo para poder pluralizarlos aquí con el contador delante.
  const base = `En ${donde} encontré ${cuantos(input.encontrados, input.giro)}`;
  if (input.sinSitio > 0) {
    return `${base}, ${input.sinSitio} sin sitio web: ahí está la oportunidad.`;
  }
  return `${base}. Todos con sitio web.`;
}

/**
 * El resumen del final. Solo entran los hallazgos que tienen al menos uno.
 *
 * Una lista con "0 negocios sin sitio web" es peor que no tener la lista:
 * obliga a leer para descubrir que no hay nada, y en una demo en vivo nadie
 * lee, nadie pregunta y se queda con que la herramienta no encontró.
 */
export function hallazgos(negocios: NegocioVisto[], pidioHorarios = false): string[] {
  const c = contar(negocios);
  const out: string[] = [];
  if (c.sinSitio > 0) {
    out.push(`${c.sinSitio} ${c.sinSitio === 1 ? 'negocio' : 'negocios'} sin sitio web`);
  }
  if (c.ratingBajo > 0) out.push(`${c.ratingBajo} con rating menor a 3.5`);
  if (pidioHorarios && c.abiertos24h > 0) out.push(`${c.abiertos24h} abiertos 24 h`);
  const sinTelefono = c.total - c.conTelefono;
  if (sinTelefono > 0) out.push(`${sinTelefono} sin teléfono publicado`);
  if (c.conWhatsapp > 0) out.push(`${c.conWhatsapp} con WhatsApp en su sitio`);
  if (c.conCorreo > 0) out.push(`${c.conCorreo} con correo público`);
  return out;
}

/**
 * La frase de cierre. Si no hubo un solo negocio lo dice sin rodeos y sugiere
 * qué mover — no "no se encontraron resultados", que no le dice a nadie qué
 * hacer después.
 */
export function narrarCierre(input: {
  zona: string;
  total: number;
  nuevos: number;
  cuadrantes: number;
  hallazgos: string[];
}): string {
  if (input.total === 0) {
    return `Recorrí ${input.zona} completo, los ${input.cuadrantes} cuadrantes, y no salió ni un negocio con esos filtros. Abre el radio o quita un filtro.`;
  }
  const cabeza = `Terminé ${input.zona}: ${input.total} ${
    input.total === 1 ? 'negocio' : 'negocios'
  } en ${input.cuadrantes} ${input.cuadrantes === 1 ? 'cuadrante' : 'cuadrantes'}, ${
    input.nuevos
  } que no estaban en tu lista.`;
  if (input.hallazgos.length === 0) return cabeza;
  return `${cabeza} Lo que veo: ${input.hallazgos.slice(0, 3).join(', ')}.`;
}

/** Lo que dice mientras lee el sitio de un negocio. */
export function narrarLectura(nombre: string): string {
  return `Leyendo el sitio de ${nombre}…`;
}

export function narrarLeido(nombre: string, e: { email?: string | null; whatsapp?: string | null; redes?: Record<string, string> }): string {
  const tiene: string[] = [];
  if (e.email) tiene.push('correo');
  if (e.whatsapp) tiene.push('WhatsApp');
  const redes = Object.keys(e.redes ?? {});
  if (redes.length) tiene.push(redes.length === 1 ? redes[0]! : `${redes.length} redes`);
  if (tiene.length === 0) return `${nombre}: su sitio no publica datos de contacto.`;
  return `${nombre}: saqué ${tiene.join(' y ')}.`;
}
