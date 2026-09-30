/**
 * El radar de mercado: medir el mercado DIRECTO antes de leer lo que otros opinan
 * de él (principio 3 del issue #63).
 *
 * Reparto de trabajo, que es el patrón de `langchain-ai/paid-media-agent`
 * (Apache-2.0): **el modelo decide qué investigar; el código calcula y verifica.**
 * Por eso este archivo no llama a ningún modelo. Recibe observaciones crudas —las
 * que juntó un worker con navegador— y saca las cifras a mano, con su muestra y
 * su método, para que cualquiera pueda rehacer la cuenta.
 *
 * Lo que corre con navegador NO vive aquí: vive en `motor/radar/` y corre en el
 * servidor. La app en Vercel solo LEE lo que el worker dejó escrito. Por eso este
 * módulo no importa Playwright ni sabe que existe.
 *
 * Agnóstico al producto: las consultas salen de la ficha del proyecto, no de una
 * lista de categorías. Un proyecto de departamentos en Miami mide sus propios
 * portales con este mismo código.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import {
  marketSignals,
  radarRuns,
  type MarketSignal,
  type NewMarketSignal,
  type ProjectBrief,
  type RadarRun,
} from '../db/schema';
import { formatearNumero, senalDeCifra, senalHueco, SIN_DATO, type Cifra } from './procedencia';

/* ---------------------------------------------------------------------------
   Lo que un worker observa en una plataforma de proyectos o un marketplace.

   Se guarda CRUDO. La tentación es guardar solo el promedio, y es un error: con
   el crudo se puede recalcular cuando alguien discute el método, y sin él hay que
   volver a salir a la red (o creerle a la cifra de ayer sin poder revisarla).
--------------------------------------------------------------------------- */
export interface ObservacionPrecio {
  titulo: string;
  url?: string | null;
  /** Presupuesto fijo publicado. Nulo cuando la publicación no lo trae. */
  min?: number | null;
  max?: number | null;
  moneda?: string | null;
  /** Por hora es OTRA cosa, no un presupuesto chico. Se cuenta aparte. */
  porHora?: boolean;
  /** Cuántos ya cotizaron. Es la señal de competencia más directa que hay. */
  propuestas?: number | null;
  publicado?: string | null;
}

export interface ResumenPrecios {
  /**
   * El porcentaje cuyo tope NO PASA del umbral (`tope <= umbral`). Es el que se
   * publica, porque es lo que la pregunta quiere saber: cuántos compradores no
   * van a pagar más de eso. Null si no hay con qué contar.
   */
  pct: number | null;
  /**
   * El mismo porcentaje con el corte ESTRICTO (`tope < umbral`).
   *
   * Los dos se reportan a propósito, y no es un adorno: en plataformas los
   * presupuestos vienen en bandas con topes redondos, y "USD 250 - 500" cae justo
   * en el filo del umbral de 500. Según cuál de los dos cortes se use, la misma
   * medición da porcentajes muy distintos. Enseñar solo uno sin decir cuál es el
   * truco más fácil para que un número diga lo que uno quiere; enseñar los dos y
   * cuántos están exactamente en el filo deja al comprador juzgar.
   */
  pctEstricto: number | null;
  /** Cuántos ENTRARON a la cuenta: los que publican presupuesto fijo comparable. */
  muestra: number;
  /** Cuántos se observaron en total, antes de descartar. */
  observados: number;
  /** Los que no pasan del umbral (`<=`). */
  bajoUmbral: number;
  /** Los estrictamente por debajo (`<`). */
  bajoUmbralEstricto: number;
  /** Los que están EXACTAMENTE en el umbral: la diferencia entre los dos cortes. */
  enElFilo: number;
  /** Los que se quedaron fuera y POR QUÉ. Esto es el método, no una nota al pie. */
  descartados: { porHora: number; sinPresupuesto: number; otraMoneda: number };
  mediana: number | null;
  minimo: number | null;
  maximo: number | null;
  propuestasMediana: number | null;
  /** El método en español, listo para pegarse en la pantalla. */
  metodo: string;
}

/**
 * El cálculo que contesta la aceptación 2.
 *
 * La decisión de método que importa: **"por hora" NO cuenta como presupuesto bajo
 * el umbral.** La medición semilla del 30-sep decía "6 de 7 con presupuesto de USD
 * 100-500 o por hora", juntando las dos cosas. Son distintas: un proyecto por hora
 * puede acabar en USD 5,000. Meterlos al mismo saco inflaría el porcentaje y sería
 * un número indefendible enfrente del comprador. Aquí se descartan del numerador Y
 * del denominador, y se dice cuántos fueron.
 */
export function pctBajoUmbral(
  obs: ObservacionPrecio[],
  umbral: number,
  moneda: string,
): ResumenPrecios {
  const descartados = { porHora: 0, sinPresupuesto: 0, otraMoneda: 0 };
  const comparables: Array<{ tope: number; propuestas: number | null }> = [];

  for (const o of obs) {
    if (o.porHora) { descartados.porHora++; continue; }
    const tope = o.max ?? o.min ?? null;
    if (tope == null || !Number.isFinite(tope)) { descartados.sinPresupuesto++; continue; }
    // Comparar MXN con USD sin tipo de cambio fechado es inventar. Si la moneda no
    // es la del umbral, se descarta y se dice, en vez de convertir a ojo.
    if (o.moneda && o.moneda.toUpperCase() !== moneda.toUpperCase()) { descartados.otraMoneda++; continue; }
    comparables.push({ tope, propuestas: o.propuestas ?? null });
  }

  const muestra = comparables.length;
  const bajoUmbral = comparables.filter((c) => c.tope <= umbral).length;
  const bajoUmbralEstricto = comparables.filter((c) => c.tope < umbral).length;
  const enElFilo = bajoUmbral - bajoUmbralEstricto;
  const topes = comparables.map((c) => c.tope).sort((a, b) => a - b);
  const props = comparables.map((c) => c.propuestas).filter((p): p is number => p != null).sort((a, b) => a - b);

  const metodo = [
    `conteo directo de los proyectos abiertos observados en la plataforma`,
    `se compara el TOPE del presupuesto publicado contra ${umbral} ${moneda}`,
    `el porcentaje que se publica usa "no pasa de ${umbral}" (tope <= ${umbral})`,
    `de ${obs.length} observados entraron ${muestra} a la cuenta`,
    `fuera: ${descartados.porHora} por hora (no son presupuesto fijo), ` +
      `${descartados.sinPresupuesto} sin presupuesto publicado, ` +
      `${descartados.otraMoneda} en otra moneda (no se convierte sin tipo de cambio fechado)`,
    enElFilo > 0
      ? `${enElFilo} publican su tope exactamente en ${umbral} ${moneda}: con el corte estricto ` +
        `(menos de ${umbral}) el porcentaje baja, y por eso se reportan los dos`
      : `ninguno publica su tope exactamente en ${umbral} ${moneda}, así que los dos cortes coinciden`,
  ].join('; ');

  return {
    pct: muestra > 0 ? redondear((bajoUmbral / muestra) * 100, 1) : null,
    pctEstricto: muestra > 0 ? redondear((bajoUmbralEstricto / muestra) * 100, 1) : null,
    muestra,
    observados: obs.length,
    bajoUmbral,
    bajoUmbralEstricto,
    enElFilo,
    descartados,
    mediana: medianaDe(topes),
    minimo: topes[0] ?? null,
    maximo: topes[topes.length - 1] ?? null,
    propuestasMediana: medianaDe(props),
    metodo,
  };
}

export function medianaDe(ordenados: number[]): number | null {
  if (!ordenados.length) return null;
  const m = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[m]! : redondear((ordenados[m - 1]! + ordenados[m]!) / 2, 2);
}

export function redondear(n: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round(n * f) / f;
}

/* ---------------------------------------------------------------------------
   Anuncios activos: lo que se ve en la Biblioteca de Anuncios de Meta.

   La API oficial (`ads_archive`) solo devuelve anuncios políticos fuera de la UE,
   así que se lee la página pública. Eso significa que el total que Meta enseña es
   aproximado y trae coincidencias sueltas — y la cifra tiene que DECIRLO en vez de
   presentarse como un censo.
--------------------------------------------------------------------------- */
export interface ObservacionAnuncio {
  anunciante: string;
  texto?: string | null;
  /** ¿Este anunciante vende de verdad lo del proyecto, o cayó por coincidencia? */
  relevante?: boolean;
  publicaPrecio?: boolean;
  url?: string | null;
}

export interface ResumenAnuncios {
  /** El total que Meta declara para la búsqueda. Aproximado y así se dice. */
  totalDeclarado: number | null;
  revisados: number;
  relevantes: number;
  publicanPrecio: number;
  anunciantesUnicos: number;
  metodo: string;
}

export function resumirAnuncios(obs: ObservacionAnuncio[], totalDeclarado: number | null, consulta: string): ResumenAnuncios {
  const relevantes = obs.filter((o) => o.relevante !== false);
  return {
    totalDeclarado,
    revisados: obs.length,
    relevantes: relevantes.length,
    publicanPrecio: relevantes.filter((o) => o.publicaPrecio).length,
    anunciantesUnicos: new Set(relevantes.map((o) => o.anunciante.trim().toLowerCase())).size,
    metodo: [
      `lectura de la página pública de la Biblioteca de Anuncios de Meta para "${consulta}"`,
      `la API ads_archive solo cubre anuncios políticos, por eso se lee la página`,
      `el total que declara Meta es aproximado e incluye coincidencias sueltas`,
      `de ${obs.length} anuncios revisados a mano, ${relevantes.length} son del giro`,
    ].join('; '),
  };
}

/* ---------------------------------------------------------------------------
   Qué consultas le toca a cada proyecto.

   Salen de la FICHA, no de una lista de categorías. Esto es lo que hace que el
   motor sea agnóstico: si mañana se da de alta "departamentos en Miami", las
   consultas salen de su ficha y nadie tuvo que enseñarle nada al sistema.
--------------------------------------------------------------------------- */
export interface ConsultaRadar {
  clave: string;
  texto: string;
  porque: string;
}

export function consultasDeFicha(f: ProjectBrief | null, nombreProyecto: string): ConsultaRadar[] {
  const out: ConsultaRadar[] = [];
  const visto = new Set<string>();
  const push = (clave: string, texto: string | null | undefined, porque: string) => {
    const t = (texto ?? '').trim();
    if (!t || t.length < 3) return;
    const k = t.toLowerCase();
    if (visto.has(k)) return;
    visto.add(k);
    out.push({ clave, texto: t, porque });
  };

  push('categoria', f?.categoria, 'el giro del proyecto: es la búsqueda que hace un comprador que ya sabe qué quiere');
  push('que_vende', f?.queVende?.split(/[.;\n]/)[0], 'lo que el proyecto dice que vende, en sus palabras');

  // El giro + la plaza. Un comprador busca "departamentos en Miami", no
  // "departamentos": la plaza es parte de la intención de compra.
  const plaza = f?.mercados?.[0];
  const dondeTexto = [plaza?.ciudad, plaza?.pais].filter(Boolean).join(' ');
  if (f?.categoria && dondeTexto) {
    push('categoria_plaza', `${f.categoria} en ${dondeTexto}`, 'el giro más la plaza: así busca quien ya decidió dónde quiere comprar');
  }

  // La búsqueda de quien compara precio. Es donde aparecen los competidores que
  // pelean por precio, que son los que marcan el piso del mercado.
  if (f?.categoria) push('categoria_precio', `${f.categoria} precio`, 'quien ya está comparando precio: ahí se ve el piso del mercado');

  if (!out.length) {
    push('nombre', nombreProyecto, 'no hay ficha todavía, así que se busca por el nombre del proyecto y se dice que es un arranque pobre');
  }
  return out.slice(0, 6);
}

/* ---------------------------------------------------------------------------
   Escritura. Una corrida del radar y sus señales, en la base.
--------------------------------------------------------------------------- */

export async function abrirCorrida(input: {
  orgId: string;
  projectId: string;
  tipo: string;
  worker?: string;
  consultas?: Array<Record<string, unknown>>;
}): Promise<RadarRun> {
  const [r] = await db.insert(radarRuns).values({
    orgId: input.orgId,
    projectId: input.projectId,
    tipo: input.tipo,
    worker: input.worker ?? null,
    consultas: input.consultas ?? [],
    estado: 'corriendo',
  }).returning();
  return r!;
}

export async function cerrarCorrida(
  id: string,
  estado: RadarRun['estado'],
  datos: { hallazgos?: number; huecos?: number; negadas?: Array<Record<string, unknown>>; error?: string | null } = {},
): Promise<void> {
  await db.update(radarRuns).set({
    estado,
    hallazgos: datos.hallazgos ?? 0,
    huecos: datos.huecos ?? 0,
    negadas: datos.negadas ?? [],
    error: datos.error ?? null,
    terminadoEn: new Date(),
  }).where(eq(radarRuns.id, id));
}

/**
 * Guarda una señal medida.
 *
 * `senalDeCifra` ya le calcula la calidad por código. Si a la cifra le falta
 * fuente, fecha o método, la BASE la rechaza — y eso es lo que queremos: que
 * reviente aquí y no que llegue a una pantalla como un número huérfano.
 */
export async function guardarSenal(
  base: { orgId: string; projectId: string; tema: string; clave: string; etiqueta: string; pregunta?: string; radarRunId?: string },
  c: Cifra,
  crudo?: Record<string, unknown>,
): Promise<MarketSignal> {
  const fila = { ...senalDeCifra(base, c), crudo: crudo ?? {} } as NewMarketSignal;
  const [s] = await db.insert(marketSignals).values(fila).returning();
  return s!;
}

/** Guarda un hueco: no hay dato, se dice, y se propone cómo medirlo. */
export async function guardarHueco(
  base: { orgId: string; projectId: string; tema: string; clave: string; etiqueta: string; pregunta?: string; radarRunId?: string },
  comoMedirlo: string,
  motivo?: string,
): Promise<MarketSignal> {
  const [s] = await db.insert(marketSignals).values(senalHueco(base, comoMedirlo, motivo) as NewMarketSignal).returning();
  return s!;
}

/* ---------------------------------------------------------------------------
   Lectura, para la pantalla y para las etapas siguientes.
--------------------------------------------------------------------------- */

/**
 * Las señales vigentes de un proyecto: la última medición de cada `clave`.
 *
 * Se agrupa por clave a propósito. Si el radar midió el mismo dato tres veces, la
 * pantalla tiene que enseñar la de hoy, no las tres — pero el historial se queda
 * en la tabla para poder ver cómo se movió el mercado.
 */
export async function senalesVigentes(orgId: string, projectId: string): Promise<MarketSignal[]> {
  const filas = await db
    .select()
    .from(marketSignals)
    .where(and(eq(marketSignals.orgId, orgId), eq(marketSignals.projectId, projectId)))
    .orderBy(desc(marketSignals.medidoEn), desc(marketSignals.createdAt));

  const porClave = new Map<string, MarketSignal>();
  for (const f of filas) if (!porClave.has(f.clave)) porClave.set(f.clave, f);
  return [...porClave.values()];
}

/**
 * El valor de una señal, como se le enseña a una persona.
 *
 * La columna es `numeric(18,4)`, así que el driver devuelve "28.6000" y "36.0000".
 * Pegado a su unidad eso sale en pantalla como "28.6000%" y "36.0000propuestas",
 * que es basura: los ceros de la escala de la columna no son precisión de la
 * medición. Se recorta la cola de ceros y se separa la unidad cuando no es `%`.
 */
export function valorEnPalabras(s: MarketSignal): string {
  if (s.valorNum == null) return s.valorTexto ?? SIN_DATO;
  const n = Number(s.valorNum);
  if (!Number.isFinite(n)) return s.valorTexto ?? SIN_DATO;
  const texto = formatearNumero(n);
  if (!s.unidad) return texto;
  return s.unidad === '%' ? `${texto}%` : `${texto} ${s.unidad}`;
}

export async function ultimaCorrida(orgId: string, projectId: string, tipo?: string): Promise<RadarRun | null> {
  const cond = [eq(radarRuns.orgId, orgId), eq(radarRuns.projectId, projectId)];
  if (tipo) cond.push(eq(radarRuns.tipo, tipo));
  const [r] = await db.select().from(radarRuns).where(and(...cond)).orderBy(desc(radarRuns.iniciadoEn)).limit(1);
  return r ?? null;
}

/**
 * El contexto de mercado que leen las etapas siguientes.
 *
 * Incluye los HUECOS a propósito, igual que la ficha. Una etapa que no sabe que
 * no hay datos de tendencia los da por buenos y escribe "la tendencia va al alza".
 */
export function contextoDeRadar(senales: MarketSignal[]): string {
  if (!senales.length) return 'El radar todavía no ha medido nada de este mercado. No afirmes nada sobre el mercado: dilo como pregunta.';
  const L: string[] = ['LO QUE EL RADAR MIDIÓ:'];
  const medidas = senales.filter((s) => !s.hueco);
  const huecos = senales.filter((s) => s.hueco);

  for (const s of medidas) {
    const v = valorEnPalabras(s);
    const cola = [
      s.fuenteNombre ? `fuente: ${s.fuenteNombre}` : null,
      s.medidoEn ? `medido: ${s.medidoEn.toISOString().slice(0, 10)}` : null,
      s.muestra != null ? `muestra: ${s.muestra}` : 'sin muestra',
      `calidad: ${s.calidad}`,
    ].filter(Boolean).join(' · ');
    L.push(`- ${s.etiqueta}: ${v} (${cola})`);
  }

  if (huecos.length) {
    L.push('', 'LO QUE NO SE PUDO MEDIR (no lo des por cierto ni lo rellenes):');
    for (const h of huecos) L.push(`- ${h.etiqueta}: sin dato. Se mediría así: ${h.comoMedirlo}`);
  }

  const baja = medidas.filter((s) => s.calidad === 'baja');
  if (baja.length) {
    L.push('', `OJO: estas cifras son de calidad baja y hay que presentarlas con reservas: ${baja.map((s) => s.etiqueta).join(', ')}.`);
  }
  return L.join('\n');
}

/** Borra las señales de un proyecto. Solo para pruebas y para volver a medir limpio. */
export async function borrarSenales(projectIds: string[]): Promise<void> {
  if (!projectIds.length) return;
  await db.delete(marketSignals).where(inArray(marketSignals.projectId, projectIds));
  await db.delete(radarRuns).where(inArray(radarRuns.projectId, projectIds));
}
