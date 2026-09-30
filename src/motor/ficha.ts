/**
 * La ficha del proyecto — el paso 0 del motor.
 *
 * Es el documento de contexto compartido que leen TODAS las etapas siguientes
 * (patrón del template de marketing de vercel-labs y del skill product-marketing
 * de coreyhaines31/marketingskills, ambos MIT). Nada del radar, de los públicos
 * ni del plan se arma sin ella: sin ficha, cada etapa se inventa su propia idea
 * del negocio y las estrategias salen incoherentes entre sí.
 *
 * Tres reglas que la gobiernan:
 *
 *   1. **Se arma sola primero, pregunta después.** Lo que se puede LEER no se
 *      pregunta: el sitio, los anuncios activos y los leads ya dicen mucho. Al
 *      dueño solo se le hacen las pocas preguntas que ninguna lectura contesta
 *      (su precio real, qué ya le funcionó). Pedirle que llene un formulario de
 *      veinte campos es trabajo que el motor puede hacer.
 *   2. **Cada campo carga de dónde salió.** `origenes` guarda `{origen, url,
 *      fecha, metodo}` campo por campo. Un campo con origen `modelo` es una
 *      deducción y la pantalla lo dice así; uno con origen `dueño` es un hecho.
 *      Sin esto la ficha es una opinión anónima y no se le puede enseñar al
 *      comprador, que es justo lo que pide el principio 1.
 *   3. **Agnóstica al producto.** No hay ni una palabra de "apps" aquí. Una
 *      fábrica de software y unos departamentos en Miami pasan por el mismo
 *      código; lo único que cambia es lo que se leyó de cada uno.
 *
 * Lo que NO hace: no inventa el precio. Si el sitio no lo publica y el dueño no
 * lo dijo, el precio queda nulo y la pregunta queda pendiente. Rellenarlo con un
 * promedio de internet sería el error que el issue #63 prohíbe.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  campaigns,
  marketSignals,
  projectBrief,
  salesLeads,
  type MercadoFicha,
  type OrigenCampo,
  type PreguntaPendiente,
  type Project,
  type ProjectBrief,
  type ProcedenciaCampo,
} from '../db/schema';
import { chatJSON } from '../openrouter';
import { leerWebPublica } from '../competencia/lectura';

/* ---------------------------------------------------------------------------
   Lo que se leyó, antes de interpretarlo.

   Se guarda aparte del resultado a propósito: así la pantalla puede enseñar la
   evidencia cruda al lado de la conclusión, y una ficha que salió mal se puede
   auditar sin volver a salir a la red.
--------------------------------------------------------------------------- */
export interface EvidenciaFicha {
  sitio: {
    url: string | null;
    status: number;
    titulo: string | null;
    descripcion: string | null;
    /** JSON-LD de Organization/LocalBusiness si el sitio lo publica. */
    ficha: Record<string, unknown> | null;
    error: string | null;
  } | null;
  anuncios: {
    /** Señales que el radar ya midió sobre los anuncios activos del proyecto. */
    senales: Array<{ etiqueta: string; valor: string; fuente: string; medidoEn: Date }>;
    /** Cuando no hay nada medido todavía, se dice en vez de callarlo. */
    nota: string | null;
  };
  leads: {
    total: number;
    /** De dónde llegan: es la pista más honesta de qué canal ya funciona. */
    porFuente: Record<string, number>;
    porEtapa: Record<string, number>;
    /** Lo que los compradores escribieron. Recortado, sin datos personales. */
    intereses: string[];
    nota: string | null;
  };
}

export interface FichaArmada {
  brief: ProjectBrief;
  evidencia: EvidenciaFicha;
  /** Qué se pudo leer y qué no. Va a la pantalla tal cual. */
  lecturas: Array<{ que: string; resultado: 'leido' | 'vacio' | 'negado'; detalle: string }>;
}

/* ---------------------------------------------------------------------------
   Paso 1 — leer. Sin modelo todavía: puro recoger evidencia.
--------------------------------------------------------------------------- */

export async function leerEvidencia(project: Project): Promise<{ evidencia: EvidenciaFicha; lecturas: FichaArmada['lecturas'] }> {
  const lecturas: FichaArmada['lecturas'] = [];

  // --- el sitio ---
  let sitio: EvidenciaFicha['sitio'] = null;
  if (project.website) {
    const url = project.website.startsWith('http') ? project.website : `https://${project.website}`;
    const w = await leerWebPublica(url);
    sitio = {
      url,
      status: w.status,
      titulo: w.titulo,
      descripcion: w.descripcion,
      ficha: (w.ficha as Record<string, unknown> | null) ?? null,
      error: w.error,
    };
    if (w.error) lecturas.push({ que: 'el sitio del proyecto', resultado: 'negado', detalle: `${url} — ${w.error}` });
    else if (!w.titulo && !w.descripcion) lecturas.push({ que: 'el sitio del proyecto', resultado: 'vacio', detalle: `${url} contestó ${w.status} pero no trae título ni descripción` });
    else lecturas.push({ que: 'el sitio del proyecto', resultado: 'leido', detalle: `${url} — ${w.titulo ?? 'sin título'}` });
  } else {
    lecturas.push({ que: 'el sitio del proyecto', resultado: 'vacio', detalle: 'el proyecto no tiene sitio registrado' });
  }

  // --- los anuncios activos: lo que el radar ya midió ---
  const senalesAnuncios = await db
    .select()
    .from(marketSignals)
    .where(and(
      eq(marketSignals.projectId, project.id),
      eq(marketSignals.tema, 'anuncios_propios'),
      eq(marketSignals.hueco, false),
    ))
    .orderBy(desc(marketSignals.medidoEn))
    .limit(20);

  const anuncios: EvidenciaFicha['anuncios'] = {
    senales: senalesAnuncios.map((s) => ({
      etiqueta: s.etiqueta,
      valor: s.valorNum != null ? `${s.valorNum}${s.unidad ?? ''}` : (s.valorTexto ?? ''),
      fuente: s.fuenteNombre ?? 'sin fuente',
      medidoEn: s.medidoEn ?? s.createdAt,
    })),
    nota: senalesAnuncios.length === 0
      ? 'El radar todavía no ha medido los anuncios activos de este proyecto en la Biblioteca de Anuncios de Meta.'
      : null,
  };
  lecturas.push({
    que: 'los anuncios activos del proyecto',
    resultado: senalesAnuncios.length ? 'leido' : 'vacio',
    detalle: anuncios.nota ?? `${senalesAnuncios.length} señales medidas por el radar`,
  });

  // --- los leads ---
  const filas = await db
    .select({
      source: salesLeads.source,
      stage: salesLeads.stage,
      interest: salesLeads.interest,
    })
    .from(salesLeads)
    .where(eq(salesLeads.campaignId, project.id))
    .orderBy(desc(salesLeads.createdAt))
    .limit(500);

  const porFuente: Record<string, number> = {};
  const porEtapa: Record<string, number> = {};
  const intereses: string[] = [];
  for (const f of filas) {
    porFuente[f.source] = (porFuente[f.source] ?? 0) + 1;
    porEtapa[f.stage] = (porEtapa[f.stage] ?? 0) + 1;
    // Solo el texto de lo que PIDIÓ. Ni teléfono, ni correo, ni nombre: la ficha
    // se le puede enseñar a cualquiera y no tiene por qué cargar datos de nadie.
    const texto = interesLegible(f.interest);
    if (texto && intereses.length < 40) intereses.push(texto);
  }

  const leads: EvidenciaFicha['leads'] = {
    total: filas.length,
    porFuente,
    porEtapa,
    intereses,
    nota: filas.length === 0 ? 'El proyecto todavía no tiene leads registrados.' : null,
  };
  lecturas.push({
    que: 'los leads del proyecto',
    resultado: filas.length ? 'leido' : 'vacio',
    detalle: leads.nota ?? `${filas.length} leads, ${Object.keys(porFuente).length} fuentes distintas`,
  });

  return { evidencia: { sitio, anuncios, leads }, lecturas };
}

/** Saca el texto de lo que pidió un lead, sin arrastrar datos personales. */
function interesLegible(interest: unknown): string | null {
  if (!interest || typeof interest !== 'object') return null;
  const o = interest as Record<string, unknown>;
  for (const llave of ['mensaje', 'message', 'interes', 'interest', 'nota', 'notes', 'texto', 'pregunta', 'producto']) {
    const v = o[llave];
    if (typeof v === 'string' && v.trim().length > 3) return v.trim().slice(0, 240);
  }
  return null;
}

/* ---------------------------------------------------------------------------
   Paso 2 — interpretar. Aquí sí entra el modelo, y entra ATADO.

   El modelo NO decide la procedencia: solo propone el contenido de cada campo y
   dice en qué evidencia se apoyó. El código traduce eso a `origenes` y, si el
   modelo dice que algo salió del sitio pero el sitio no se pudo leer, lo baja a
   origen `modelo` — que es la verdad. Mismo patrón que `creative/compliance.ts`,
   donde una cita a una regla inexistente se tira.
--------------------------------------------------------------------------- */

interface PropuestaDelModelo {
  que_vende?: string;
  categoria?: string;
  propuesta_valor?: string;
  precio_min?: number | null;
  precio_max?: number | null;
  moneda?: string | null;
  precio_nota?: string | null;
  mercados?: Array<{ ciudad?: string; pais?: string; prioridad?: number }>;
  idiomas?: string[];
  ya_funciono?: string | null;
  ya_no_funciono?: string | null;
  resumen?: string;
  /** Campo → en qué se apoyó: 'sitio' | 'anuncios' | 'leads' | 'deduccion'. */
  apoyos?: Record<string, string>;
  preguntas?: Array<{ clave?: string; pregunta?: string; porque?: string }>;
}

const SISTEMA = [
  'Eres el analista que arma la ficha de un negocio para poder venderle a sus compradores.',
  '',
  'Reglas que no puedes romper:',
  '1. Solo puedes afirmar lo que esté en la EVIDENCIA que te doy. Si algo no está, no lo pongas:',
  '   deja el campo en null y agrégalo a `preguntas` como pregunta para el dueño.',
  '2. NUNCA inventes un precio. Si la evidencia no trae precio, precio_min y precio_max van en null',
  '   y va una pregunta al dueño. Un precio inventado destruye la confianza del comprador.',
  '3. En `apoyos` di, campo por campo, en qué parte de la evidencia te apoyaste:',
  '   "sitio", "anuncios", "leads" o "deduccion" si lo razonaste sin evidencia directa.',
  '4. Escribe en español de México, claro y sin jerga de marketing. Nada de "sinergia",',
  '   "disruptivo" ni "soluciones integrales". Como se lo explicarías al dueño en su mesa.',
  '5. El `resumen` es el documento que van a leer todas las demás etapas: qué vende,',
  '   a quién, en dónde, a qué precio si se sabe, y qué ya le funcionó. Máximo 200 palabras.',
  '6. Las `preguntas` son POCAS (máximo 5) y solo de lo que ninguna lectura puede contestar.',
  '   No preguntes lo que ya está en la evidencia.',
  '',
  'Contesta SOLO JSON con esta forma:',
  '{"que_vende":"","categoria":"","propuesta_valor":"","precio_min":null,"precio_max":null,',
  ' "moneda":null,"precio_nota":null,"mercados":[{"ciudad":"","pais":"","prioridad":1}],',
  ' "idiomas":["es"],"ya_funciono":null,"ya_no_funciono":null,"resumen":"",',
  ' "apoyos":{"que_vende":"sitio"},"preguntas":[{"clave":"precio","pregunta":"","porque":""}]}',
].join('\n');

function evidenciaEnTexto(project: Project, e: EvidenciaFicha): string {
  const L: string[] = [];
  L.push('DATOS DE ALTA DEL PROYECTO (los puso quien lo dio de alta):');
  L.push(`- nombre: ${project.name}`);
  if (project.description) L.push(`- descripción: ${project.description}`);
  if (project.kind) L.push(`- giro declarado: ${project.kind}`);
  if (project.city || project.country) L.push(`- dónde: ${[project.city, project.country].filter(Boolean).join(', ')}`);
  if (project.audience) L.push(`- público declarado: ${project.audience}`);
  if (project.brandVoice) L.push(`- tono de marca: ${project.brandVoice}`);
  if (project.brandTopics) L.push(`- temas: ${project.brandTopics}`);

  L.push('');
  L.push('EL SITIO:');
  if (!e.sitio) L.push('- no hay sitio registrado.');
  else if (e.sitio.error) L.push(`- no se pudo leer (${e.sitio.url}): ${e.sitio.error}`);
  else {
    L.push(`- url: ${e.sitio.url} (contestó ${e.sitio.status})`);
    if (e.sitio.titulo) L.push(`- título: ${e.sitio.titulo}`);
    if (e.sitio.descripcion) L.push(`- descripción: ${e.sitio.descripcion}`);
    if (e.sitio.ficha) L.push(`- ficha estructurada del sitio: ${JSON.stringify(e.sitio.ficha).slice(0, 1200)}`);
  }

  L.push('');
  L.push('SUS ANUNCIOS ACTIVOS (medidos por el radar en la Biblioteca de Anuncios de Meta):');
  if (e.anuncios.nota) L.push(`- ${e.anuncios.nota}`);
  for (const s of e.anuncios.senales) L.push(`- ${s.etiqueta}: ${s.valor} (${s.fuente})`);

  L.push('');
  L.push('SUS LEADS:');
  if (e.leads.nota) L.push(`- ${e.leads.nota}`);
  else {
    L.push(`- total: ${e.leads.total}`);
    L.push(`- por fuente: ${JSON.stringify(e.leads.porFuente)}`);
    L.push(`- por etapa: ${JSON.stringify(e.leads.porEtapa)}`);
    if (e.leads.intereses.length) {
      L.push('- lo que escribieron los compradores:');
      for (const i of e.leads.intereses.slice(0, 25)) L.push(`  · ${i}`);
    }
  }
  return L.join('\n');
}

/**
 * Traduce el apoyo que dijo el modelo a un origen REAL, verificando contra la
 * evidencia. Si dice "sitio" y el sitio no se leyó, el origen es `modelo`: el
 * modelo puede equivocarse sobre de dónde sacó algo, y la ficha no puede.
 */
function origenVerificado(apoyo: string | undefined, e: EvidenciaFicha): { origen: OrigenCampo; url?: string; metodo?: string } {
  const sitioVivo = !!e.sitio && !e.sitio.error && (!!e.sitio.titulo || !!e.sitio.descripcion || !!e.sitio.ficha);
  switch ((apoyo ?? '').toLowerCase()) {
    case 'sitio':
      return sitioVivo
        ? { origen: 'sitio', url: e.sitio!.url ?? undefined, metodo: 'lectura del sitio público del proyecto' }
        : { origen: 'modelo', metodo: 'deducción: el sitio no se pudo leer' };
    case 'anuncios':
      return e.anuncios.senales.length
        ? { origen: 'anuncios', metodo: 'señales de los anuncios activos medidas por el radar' }
        : { origen: 'modelo', metodo: 'deducción: no hay anuncios medidos' };
    case 'leads':
      return e.leads.total > 0
        ? { origen: 'leads', metodo: `lectura de ${e.leads.total} leads del proyecto` }
        : { origen: 'modelo', metodo: 'deducción: el proyecto no tiene leads' };
    default:
      return { origen: 'modelo', metodo: 'deducción del analista, sin evidencia directa' };
  }
}

const CAMPOS_CON_ORIGEN = [
  'queVende', 'categoria', 'propuestaValor', 'precio', 'mercados', 'idiomas', 'yaFunciono', 'yaNoFunciono',
] as const;

/** Traduce el nombre del campo como lo dice el modelo al nombre de la columna. */
const ALIAS_CAMPO: Record<string, string> = {
  que_vende: 'queVende',
  categoria: 'categoria',
  propuesta_valor: 'propuestaValor',
  precio_min: 'precio',
  precio_max: 'precio',
  precio: 'precio',
  mercados: 'mercados',
  idiomas: 'idiomas',
  ya_funciono: 'yaFunciono',
  ya_no_funciono: 'yaNoFunciono',
};

/* ---------------------------------------------------------------------------
   Paso 3 — armar y guardar.
--------------------------------------------------------------------------- */

export async function armarFicha(project: Project, opts: { ahora?: Date } = {}): Promise<FichaArmada> {
  const ahora = opts.ahora ?? new Date();
  const { evidencia, lecturas } = await leerEvidencia(project);

  let p: PropuestaDelModelo = {};
  try {
    p = await chatJSON<PropuestaDelModelo>(
      [
        { role: 'system', content: SISTEMA },
        { role: 'user', content: evidenciaEnTexto(project, evidencia) },
      ],
      { temperature: 0.2, maxTokens: 1600 },
    );
  } catch (e) {
    // Si el modelo falla, la ficha NO se inventa: queda en borrador con lo que se
    // leyó y con las preguntas base. Media ficha honesta sirve; una inventada no.
    lecturas.push({
      que: 'la interpretación del analista',
      resultado: 'negado',
      detalle: e instanceof Error ? e.message : 'el modelo no contestó',
    });
  }

  const origenes: Record<string, ProcedenciaCampo> = {};
  const fechaISO = ahora.toISOString().slice(0, 10);
  for (const [campoModelo, apoyo] of Object.entries(p.apoyos ?? {})) {
    const campo = ALIAS_CAMPO[campoModelo] ?? campoModelo;
    if (!(CAMPOS_CON_ORIGEN as readonly string[]).includes(campo)) continue;
    const v = origenVerificado(apoyo, evidencia);
    origenes[campo] = { origen: v.origen, url: v.url, fecha: fechaISO, metodo: v.metodo };
  }

  // El precio: solo pasa si viene completo y coherente. Un "desde 500" sin moneda
  // no significa nada, y un min mayor que el max es un dato roto — los dos los
  // rechaza la base, así que se limpian aquí en vez de reventar el insert.
  const precio = precioLimpio(p);
  if (!precio.moneda) {
    delete origenes.precio;
  }

  const preguntas = preguntasPendientes(p, evidencia, precio);

  const valores = {
    orgId: project.orgId,
    projectId: project.id,
    queVende: recorta(p.que_vende, 600),
    categoria: recorta(p.categoria, 160),
    propuestaValor: recorta(p.propuesta_valor, 800),
    precioMin: precio.min,
    precioMax: precio.max,
    moneda: precio.moneda,
    precioNota: recorta(p.precio_nota, 400),
    mercados: mercadosLimpios(p, project),
    idiomas: (p.idiomas ?? ['es']).filter((x) => typeof x === 'string').slice(0, 5),
    yaFunciono: recorta(p.ya_funciono, 800),
    yaNoFunciono: recorta(p.ya_no_funciono, 800),
    origenes,
    resumen: recorta(p.resumen, 2400),
    preguntasPendientes: preguntas,
    // `confirmada` solo la pone un humano al contestar. El motor nunca se
    // autoconfirma: la ficha es borrador hasta que el dueño la mira.
    estado: (p.resumen ? 'borrador' : 'vacia') as 'vacia' | 'borrador',
    armadaEn: ahora,
    updatedAt: ahora,
  };

  const [brief] = await db
    .insert(projectBrief)
    .values(valores)
    .onConflictDoUpdate({ target: projectBrief.projectId, set: valores })
    .returning();

  return { brief: brief!, evidencia, lecturas };
}

function recorta(v: string | null | undefined, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

function precioLimpio(p: PropuestaDelModelo): { min: string | null; max: string | null; moneda: string | null } {
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
  let min = num(p.precio_min);
  let max = num(p.precio_max);
  const moneda = typeof p.moneda === 'string' && /^[A-Za-z]{3}$/.test(p.moneda.trim()) ? p.moneda.trim().toUpperCase() : null;
  if (min == null && max == null) return { min: null, max: null, moneda: null };
  // Sin moneda no hay precio: "desde 500" no dice nada.
  if (!moneda) return { min: null, max: null, moneda: null };
  if (min != null && max != null && min > max) [min, max] = [max, min];
  return { min: min == null ? null : String(min), max: max == null ? null : String(max), moneda };
}

function mercadosLimpios(p: PropuestaDelModelo, project: Project): MercadoFicha[] {
  const salida: MercadoFicha[] = [];
  for (const m of p.mercados ?? []) {
    const ciudad = recorta(m?.ciudad, 120) ?? undefined;
    const pais = recorta(m?.pais, 120) ?? undefined;
    if (!ciudad && !pais) continue;
    salida.push({ ciudad, pais, prioridad: typeof m?.prioridad === 'number' ? m.prioridad : salida.length + 1 });
    if (salida.length >= 8) break;
  }
  // Si el modelo no propuso nada pero el alta sí trae ciudad/país, se usa eso:
  // es un dato del dueño y pesa más que el silencio del modelo.
  if (!salida.length && (project.city || project.country)) {
    salida.push({ ciudad: project.city ?? undefined, pais: project.country ?? undefined, prioridad: 1 });
  }
  return salida;
}

/**
 * Las pocas preguntas para el dueño.
 *
 * Dos fuentes: las que propuso el modelo, y las que el CÓDIGO sabe que faltan
 * porque miró la evidencia. Las del código no son negociables — si no hay precio,
 * la pregunta del precio va, diga lo que diga el modelo.
 */
function preguntasPendientes(
  p: PropuestaDelModelo,
  e: EvidenciaFicha,
  precio: { moneda: string | null },
): PreguntaPendiente[] {
  const fijas: PreguntaPendiente[] = [];

  if (!precio.moneda) {
    fijas.push({
      clave: 'precio',
      pregunta: '¿En qué rango de precio vendes, y en qué moneda?',
      porque: 'Ni el sitio ni los anuncios publican precio. Sin esto no se puede comparar con el mercado ni escribir una oferta honesta, y no se va a inventar.',
    });
  }
  if (!e.leads.total) {
    fijas.push({
      clave: 'ya_funciono',
      pregunta: '¿Por dónde te han llegado los clientes que sí cerraste?',
      porque: 'Todavía no hay leads registrados, así que el motor no puede ver qué canal ya te funciona. Es el dato que más cambia el plan.',
    });
  }
  if (!e.sitio || e.sitio.error || (!e.sitio.titulo && !e.sitio.descripcion)) {
    fijas.push({
      clave: 'que_vende',
      pregunta: '¿Qué vendes exactamente, en tus palabras?',
      porque: 'No se pudo leer tu sitio, así que lo que el motor cree que vendes es una deducción y conviene confirmarla.',
    });
  }
  if (!e.anuncios.senales.length) {
    fijas.push({
      clave: 'anuncios',
      pregunta: '¿Estás pautando hoy en algún lado, y con qué mensaje?',
      porque: 'No encontramos anuncios activos tuyos medidos. Si ya pautas, el plan tiene que partir de eso en vez de proponerte lo mismo otra vez.',
    });
  }

  const delModelo: PreguntaPendiente[] = [];
  for (const q of p.preguntas ?? []) {
    const pregunta = recorta(q?.pregunta, 400);
    const porque = recorta(q?.porque, 400);
    if (!pregunta || !porque) continue;
    const clave = recorta(q?.clave, 60) ?? pregunta.slice(0, 40);
    delModelo.push({ clave, pregunta, porque });
  }

  // Las fijas primero y sin duplicar clave: son las que el código comprobó.
  const vistas = new Set(fijas.map((f) => f.clave));
  const salida = [...fijas];
  for (const q of delModelo) {
    if (vistas.has(q.clave)) continue;
    vistas.add(q.clave);
    salida.push(q);
    if (salida.length >= 6) break;
  }
  return salida;
}

/* ---------------------------------------------------------------------------
   Lectura, para las demás etapas y para la pantalla.
--------------------------------------------------------------------------- */

export async function fichaDe(orgId: string, projectId: string): Promise<ProjectBrief | null> {
  const [f] = await db
    .select()
    .from(projectBrief)
    .where(and(eq(projectBrief.orgId, orgId), eq(projectBrief.projectId, projectId)))
    .limit(1);
  return f ?? null;
}

/**
 * El contexto que se le inyecta a las etapas siguientes.
 *
 * Incluye a propósito lo que NO se sabe. Una etapa que no sabe que el precio es
 * desconocido escribe "precios desde $X" y se lo inventa; una que sí lo sabe
 * escribe la oferta sin precio y lo dice.
 */
export function contextoDeFicha(f: ProjectBrief | null): string {
  if (!f) return 'No hay ficha del proyecto todavía. No des por cierto nada del negocio: pregunta o mide.';
  const L: string[] = [];
  if (f.queVende) L.push(`Qué vende: ${f.queVende}`);
  if (f.categoria) L.push(`Giro: ${f.categoria}`);
  if (f.propuestaValor) L.push(`Propuesta: ${f.propuestaValor}`);
  if (f.precioMin || f.precioMax) {
    const r = f.precioMin && f.precioMax ? `${f.precioMin} a ${f.precioMax}` : (f.precioMin ?? f.precioMax);
    L.push(`Precio: ${r} ${f.moneda ?? ''}`.trim());
  } else {
    L.push('Precio: NO SE SABE. No inventes uno ni lo insinúes; si hace falta, dilo como pregunta.');
  }
  if (f.mercados.length) {
    L.push(`Dónde vende: ${f.mercados.map((m) => [m.ciudad, m.pais].filter(Boolean).join(', ')).join(' · ')}`);
  }
  if (f.idiomas.length) L.push(`Idiomas: ${f.idiomas.join(', ')}`);
  if (f.yaFunciono) L.push(`Qué ya le funcionó: ${f.yaFunciono}`);
  if (f.yaNoFunciono) L.push(`Qué NO le funcionó: ${f.yaNoFunciono}`);
  if (f.resumen) L.push('', `Resumen del negocio: ${f.resumen}`);

  const deducidos = Object.entries(f.origenes).filter(([, v]) => v.origen === 'modelo').map(([k]) => k);
  if (deducidos.length) {
    L.push('', `OJO: estos campos son deducción, no hechos confirmados: ${deducidos.join(', ')}. Trátalos como hipótesis.`);
  }
  if (f.preguntasPendientes.length) {
    L.push('', `Sigue sin contestar: ${f.preguntasPendientes.map((q) => q.pregunta).join(' ')}`);
  }
  if (f.estado !== 'confirmada') {
    L.push('', 'La ficha es BORRADOR: el dueño todavía no la confirmó.');
  }
  return L.join('\n');
}

/** Contesta una de las preguntas pendientes. Lo que contesta el dueño es un HECHO. */
export async function contestarPregunta(
  orgId: string,
  projectId: string,
  clave: string,
  respuesta: string,
  quien: string,
): Promise<ProjectBrief | null> {
  const f = await fichaDe(orgId, projectId);
  if (!f) return null;

  const pendientes = f.preguntasPendientes.filter((q) => q.clave !== clave);
  const origenes = { ...f.origenes };
  const parche: Record<string, unknown> = {};
  const hoy = new Date();
  const marca: ProcedenciaCampo = {
    origen: 'dueño',
    fecha: hoy.toISOString().slice(0, 10),
    metodo: `lo contestó ${quien} en el Asistente`,
  };

  // El precio se parsea en vez de guardarse como prosa: es lo que después se
  // compara contra el mercado, y para comparar hace falta un número.
  if (clave === 'precio') {
    const p = precioDeTexto(respuesta);
    if (p) {
      parche.precioMin = p.min == null ? null : String(p.min);
      parche.precioMax = p.max == null ? null : String(p.max);
      parche.moneda = p.moneda;
      origenes.precio = marca;
    }
    parche.precioNota = respuesta.trim().slice(0, 400);
  } else if (clave === 'ya_funciono') {
    parche.yaFunciono = respuesta.trim().slice(0, 800);
    origenes.yaFunciono = marca;
  } else if (clave === 'que_vende') {
    parche.queVende = respuesta.trim().slice(0, 600);
    origenes.queVende = marca;
  }

  const [out] = await db
    .update(projectBrief)
    .set({ ...parche, origenes, preguntasPendientes: pendientes, updatedAt: hoy })
    .where(and(eq(projectBrief.orgId, orgId), eq(projectBrief.projectId, projectId)))
    .returning();
  return out ?? null;
}

/**
 * Saca un rango de precio de lo que escribió una persona.
 *
 * Acepta "de 8 mil a 20 mil pesos", "USD 3,000-8,000", "desde 500 dólares".
 * Si no entiende, devuelve null y el texto se guarda como nota: es mejor no
 * tener el número que tener uno mal leído.
 */
export function precioDeTexto(texto: string): { min: number | null; max: number | null; moneda: string } | null {
  const t = texto.toLowerCase().replace(/\s+/g, ' ');
  const moneda = /usd|d[oó]lar|dls|dolares/.test(t) ? 'USD'
    : /eur|euro/.test(t) ? 'EUR'
    : /mxn|peso|pesos|mx\$/.test(t) ? 'MXN'
    : null;
  if (!moneda) return null;

  // Primero se normalizan los separadores de miles, EN EL MISMO TEXTO, y después
  // se lee una sola vez. Antes había dos lecturas (una para "3,000" y otra para
  // "3 mil") y la de miles le ganaba a la otra, así que "de 1,500 a 2 millones"
  // perdía los dos millones por completo.
  // Se repite hasta que no cambie: "1,200,000" necesita más de una pasada porque
  // los grupos se solapan.
  let plano = t;
  for (let i = 0; i < 4; i++) {
    const siguiente = plano.replace(/(\d),(\d{3})\b/g, '$1$2');
    if (siguiente === plano) break;
    plano = siguiente;
  }

  const valores: number[] = [];
  // Ojo con el ORDEN de la alternancia: `millones` va antes que `mil`. La
  // alternancia de regex es por orden, no por longitud, así que con `mil` primero
  // "1.5 millones" matchea `mil` y se vuelve 1,500 en vez de 1,500,000. Es un
  // error de tres ceros en un precio: exactamente el tipo de cifra mal leída que
  // el motor no puede permitirse.
  for (const m of plano.matchAll(/(\d+(?:\.\d+)?)\s*(millones|millón|millon|mil|k)?\b/g)) {
    let v = Number(m[1]!);
    if (!Number.isFinite(v)) continue;
    const mult = m[2];
    if (mult && mult.startsWith('mill')) v *= 1_000_000;
    else if (mult === 'mil' || mult === 'k') v *= 1_000;
    valores.push(v);
  }
  if (!valores.length) return null;

  const ordenados = [...new Set(valores)].sort((a, b) => a - b);
  if (ordenados.length === 1) {
    // "desde X" es un mínimo; "hasta X" es un máximo; un número solo es ambos.
    if (/desde|a partir|arranca|m[ií]nimo/.test(t)) return { min: ordenados[0]!, max: null, moneda };
    if (/hasta|m[aá]ximo|tope/.test(t)) return { min: null, max: ordenados[0]!, moneda };
    return { min: ordenados[0]!, max: ordenados[0]!, moneda };
  }
  return { min: ordenados[0]!, max: ordenados[ordenados.length - 1]!, moneda };
}

/** Cuenta cuántos campos de la ficha son hechos y cuántos deducción. Va a pantalla. */
export function solidezDeFicha(f: ProjectBrief): { hechos: number; deducidos: number; sinDato: number; detalle: string } {
  let hechos = 0;
  let deducidos = 0;
  let sinDato = 0;
  const campos: Array<[string, unknown]> = [
    ['queVende', f.queVende],
    ['categoria', f.categoria],
    ['propuestaValor', f.propuestaValor],
    ['precio', f.precioMin ?? f.precioMax],
    ['mercados', f.mercados.length ? f.mercados : null],
    ['yaFunciono', f.yaFunciono],
  ];
  for (const [nombre, valor] of campos) {
    if (valor == null || valor === '') { sinDato++; continue; }
    const o = f.origenes[nombre]?.origen;
    if (o === 'modelo' || o == null) deducidos++;
    else hechos++;
  }
  return {
    hechos,
    deducidos,
    sinDato,
    detalle: `${hechos} campos medidos o dichos por el dueño · ${deducidos} deducidos por la IA · ${sinDato} sin dato`,
  };
}
