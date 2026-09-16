/**
 * La memoria de diseño de Goossip.
 *
 * Qué es: todo lo que la casa sabe de diseñar para redes —las skills de
 * Higgsfield, el protocolo de diseño, la biblioteca de estilos, el playbook de
 * Meta y las medidas oficiales de cada red— metido en una tabla con vectores
 * para poder preguntarlo en español.
 *
 * Qué NO es: conocimiento del cliente. Eso vive en `knowledge`, por
 * organización. Esto es de la aplicación: `scope = 'global'`.
 *
 * La regla de la idempotencia, que es lo único delicado aquí: la llave es
 * `(source_path, chunk_index)` y el `source_hash` es del ARCHIVO COMPLETO. Una
 * re-corrida compara un hash por archivo; si no cambió, ese archivo no se lee,
 * no se parte y no se le pagan embeddings. Eso es lo que hace que la segunda
 * corrida diga "0 nuevos" en vez de "los mismos 900 otra vez".
 */
import { createHash } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { designKnowledge, type DesignCategory } from '../db/schema';
import { embed, embedBatch } from '../memory/embed';
import { config } from '../config';

export type { DesignCategory };

/** Un pedazo listo para guardar. */
export interface DesignChunk {
  category: DesignCategory;
  title: string;
  content: string;
  sourcePath: string;
  chunkIndex: number;
  metadata?: Record<string, unknown>;
}

/** Un archivo (o una spec) con todos sus pedazos y el hash de su origen. */
export interface DesignSource {
  sourcePath: string;
  sourceHash: string;
  category: DesignCategory;
  title: string;
  chunks: Array<{ content: string; metadata?: Record<string, unknown> }>;
}

export function hashOf(texto: string): string {
  return createHash('sha256').update(texto).digest('hex');
}

// ---------------------------------------------------------------------------
// Partir en pedazos
// ---------------------------------------------------------------------------

/** Ni tan corto que pierda el sentido, ni tan largo que el vector no distinga. */
const OBJETIVO = 1400;
const MINIMO = 200;

/**
 * Parte un markdown por sus encabezados y, si un tramo se pasa de largo, por
 * párrafos. No parte a media oración: un pedazo que empieza en "…y por eso" no
 * sirve para contestarle a nadie.
 */
export function partirMarkdown(texto: string): Array<{ content: string; titulo: string | null }> {
  const lineas = texto.split('\n');
  const bloques: Array<{ titulo: string | null; cuerpo: string[] }> = [];
  let actual: { titulo: string | null; cuerpo: string[] } = { titulo: null, cuerpo: [] };

  for (const linea of lineas) {
    const h = linea.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      if (actual.cuerpo.join('\n').trim() || actual.titulo) bloques.push(actual);
      actual = { titulo: h[2]!.trim(), cuerpo: [] };
    } else {
      actual.cuerpo.push(linea);
    }
  }
  if (actual.cuerpo.join('\n').trim() || actual.titulo) bloques.push(actual);

  const salida: Array<{ content: string; titulo: string | null }> = [];

  for (const b of bloques) {
    const cuerpo = b.cuerpo.join('\n').trim();
    const entero = [b.titulo ? `## ${b.titulo}` : null, cuerpo].filter(Boolean).join('\n');
    if (!entero.trim()) continue;

    if (entero.length <= OBJETIVO * 1.6) {
      salida.push({ content: entero, titulo: b.titulo });
      continue;
    }

    // Demasiado largo: se parte por párrafos, arrastrando el título a cada
    // pedazo para que ninguno quede huérfano de contexto.
    const parrafos = cuerpo.split(/\n{2,}/);
    let buffer = '';
    const cerrar = () => {
      if (buffer.trim().length >= MINIMO) {
        salida.push({
          content: (b.titulo ? `## ${b.titulo}\n` : '') + buffer.trim(),
          titulo: b.titulo,
        });
      } else if (buffer.trim() && salida.length) {
        salida[salida.length - 1]!.content += `\n\n${buffer.trim()}`;
      }
      buffer = '';
    };
    for (const p of parrafos) {
      if (buffer.length + p.length > OBJETIVO && buffer) cerrar();
      buffer += (buffer ? '\n\n' : '') + p;
    }
    cerrar();
  }

  // Los pedazos ridículamente cortos se pegan al anterior: un vector de doce
  // palabras se parece a todo y no ayuda a nada.
  const juntados: Array<{ content: string; titulo: string | null }> = [];
  for (const s of salida) {
    if (s.content.trim().length < MINIMO && juntados.length) {
      juntados[juntados.length - 1]!.content += `\n\n${s.content.trim()}`;
    } else {
      juntados.push(s);
    }
  }
  return juntados.filter((s) => s.content.trim().length > 0);
}

// ---------------------------------------------------------------------------
// Guardar
// ---------------------------------------------------------------------------

export interface IngestReport {
  fuentesVistas: number;
  fuentesNuevas: number;
  fuentesCambiadas: number;
  fuentesSinCambio: number;
  chunksEscritos: number;
  chunksBorrados: number;
  embeddings: number;
}

export function reporteVacio(): IngestReport {
  return {
    fuentesVistas: 0,
    fuentesNuevas: 0,
    fuentesCambiadas: 0,
    fuentesSinCambio: 0,
    chunksEscritos: 0,
    chunksBorrados: 0,
    embeddings: 0,
  };
}

/** Qué hash tenemos guardado de cada fuente. */
export async function hashesGuardados(): Promise<Map<string, string>> {
  const filas = await db
    .select({ sourcePath: designKnowledge.sourcePath, sourceHash: designKnowledge.sourceHash })
    .from(designKnowledge);
  const m = new Map<string, string>();
  for (const f of filas) m.set(f.sourcePath, f.sourceHash);
  return m;
}

/**
 * Mete una fuente. Devuelve cuántos pedazos escribió — cero si el hash ya
 * estaba y nada cambió, que es el caso normal de la segunda corrida.
 */
export async function ingestSource(
  fuente: DesignSource,
  guardados: Map<string, string>,
  reporte: IngestReport,
): Promise<number> {
  reporte.fuentesVistas += 1;
  const previo = guardados.get(fuente.sourcePath);

  if (previo === fuente.sourceHash) {
    reporte.fuentesSinCambio += 1;
    return 0;
  }
  if (previo) reporte.fuentesCambiadas += 1;
  else reporte.fuentesNuevas += 1;

  // El archivo cambió: fuera los pedazos viejos. Reemplazar en vez de sumar es
  // lo que evita que un archivo al que le quitaron una sección deje huérfanos
  // contestando cosas que ya no están escritas en ningún lado.
  if (previo) {
    const borrados = await db
      .delete(designKnowledge)
      .where(eq(designKnowledge.sourcePath, fuente.sourcePath))
      .returning({ id: designKnowledge.id });
    reporte.chunksBorrados += borrados.length;
  }

  const vectores = config.embeddings.enabled
    ? await embedEnTandas(fuente.chunks.map((c) => c.content), reporte)
    : fuente.chunks.map(() => null);

  const filas = fuente.chunks.map((c, i) => ({
    scope: 'global',
    category: fuente.category,
    title: fuente.title,
    content: c.content,
    sourcePath: fuente.sourcePath,
    sourceHash: fuente.sourceHash,
    chunkIndex: i,
    metadata: c.metadata ?? {},
    embedding: vectores[i] ?? null,
  }));

  // De a 100: una fuente con 400 pedazos en un solo INSERT se pasa del tope de
  // parámetros de Postgres y truena a la mitad de la ingesta.
  for (let i = 0; i < filas.length; i += 100) {
    await db.insert(designKnowledge).values(filas.slice(i, i + 100));
  }
  reporte.chunksEscritos += filas.length;
  return filas.length;
}

/**
 * Los embeddings se piden de a 16 y con paciencia.
 *
 * El proveedor (Jina) contesta 429 cuando se le pide demasiado seguido — pasó
 * a mitad de la primera ingesta de verdad, con 1174 pedazos por delante. Así
 * que: tandas chicas, una pausa corta entre tandas y reintento con espera que
 * se duplica. Sin esto, una ingesta completa se muere a la mitad y hay que
 * volver a empezar.
 *
 * Que se pueda volver a empezar, de hecho, es la otra mitad del diseño: cada
 * fuente se escribe y se confirma por separado, así que una caída deja hechas
 * las que ya pasaron y la siguiente corrida arranca donde se quedó.
 */
const TANDA = 16;
const PAUSA_MS = 350;
const REINTENTOS = 6;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function embedBatchConEspera(textos: string[]): Promise<number[][]> {
  let espera = 2000;
  for (let intento = 0; intento <= REINTENTOS; intento += 1) {
    try {
      return await embedBatch(textos);
    } catch (e) {
      const status = (e as { status?: number })?.status;
      const recuperable = status === 429 || (typeof status === 'number' && status >= 500);
      if (!recuperable || intento === REINTENTOS) throw e;
      await dormir(espera);
      espera = Math.min(espera * 2, 60000);
    }
  }
  throw new Error('inalcanzable');
}

async function embedEnTandas(textos: string[], reporte: IngestReport): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < textos.length; i += TANDA) {
    if (i > 0) await dormir(PAUSA_MS);
    const vecs = await embedBatchConEspera(textos.slice(i, i + TANDA));
    out.push(...vecs);
    reporte.embeddings += vecs.length;
  }
  return out;
}

/** Quita de la base las fuentes que ya no existen en el origen. */
export async function podarFuentesAusentes(vivas: string[]): Promise<number> {
  const filas = await db
    .select({ sourcePath: designKnowledge.sourcePath })
    .from(designKnowledge);
  const set = new Set(vivas);
  const muertas = [...new Set(filas.map((f) => f.sourcePath))].filter((p) => !set.has(p));
  if (muertas.length === 0) return 0;
  const borradas = await db
    .delete(designKnowledge)
    .where(inArray(designKnowledge.sourcePath, muertas))
    .returning({ id: designKnowledge.id });
  return borradas.length;
}

// ---------------------------------------------------------------------------
// Preguntar
// ---------------------------------------------------------------------------

export interface DesignHit {
  title: string | null;
  content: string;
  sourcePath: string;
  category: DesignCategory;
  metadata: Record<string, unknown>;
  similarity: number;
}

/**
 * Buscar en la memoria de diseño.
 *
 * Con embeddings, por vector. Sin ellos (una base nueva, un entorno sin llave
 * de embeddings), cae a buscar palabras: contesta peor, pero contesta — y el
 * Asistente no se queda mudo cuando le preguntan cuánto mide un reel.
 */
export async function buscarDiseno(
  query: string,
  opts: { k?: number; category?: DesignCategory } = {},
): Promise<DesignHit[]> {
  const k = opts.k ?? 6;

  if (!config.embeddings.enabled) {
    return buscarPorPalabras(query, k, opts.category);
  }

  let vec: number[];
  try {
    vec = await embed(query);
  } catch {
    return buscarPorPalabras(query, k, opts.category);
  }
  const literal = `[${vec.join(',')}]`;

  const rows = await db.execute<{
    title: string | null;
    content: string;
    source_path: string;
    category: DesignCategory;
    metadata: Record<string, unknown> | null;
    similarity: number;
  }>(sql`
    SELECT title, content, source_path, category, metadata,
           1 - (embedding <=> ${literal}::vector) AS similarity
    FROM design_knowledge
    WHERE embedding IS NOT NULL
      ${opts.category ? sql`AND category = ${opts.category}` : sql``}
    ORDER BY embedding <=> ${literal}::vector
    LIMIT ${k}
  `);

  const filas = (rows as any).rows ?? (rows as unknown as any[]);
  if (!filas?.length) return buscarPorPalabras(query, k, opts.category);

  return filas.map((r: any) => ({
    title: r.title,
    content: r.content,
    sourcePath: r.source_path,
    category: r.category,
    metadata: r.metadata ?? {},
    similarity: Number(r.similarity),
  }));
}

async function buscarPorPalabras(
  query: string,
  k: number,
  category?: DesignCategory,
): Promise<DesignHit[]> {
  const tokens = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4)
    .slice(0, 5);
  if (tokens.length === 0) return [];

  const rows = await db
    .execute<{
      title: string | null;
      content: string;
      source_path: string;
      category: DesignCategory;
      metadata: Record<string, unknown> | null;
    }>(sql`
      SELECT title, content, source_path, category, metadata
      FROM design_knowledge
      WHERE ${category ? sql`category = ${category} AND` : sql``}
        (${sql.join(
          tokens.map((t) => sql`content ILIKE ${'%' + t + '%'}`),
          sql` OR `,
        )})
      LIMIT ${k}
    `)
    .catch(() => ({ rows: [] as any[] }));

  return (((rows as any).rows ?? []) as any[]).map((r) => ({
    title: r.title,
    content: r.content,
    sourcePath: r.source_path,
    category: r.category,
    metadata: r.metadata ?? {},
    similarity: 0,
  }));
}

/** Cuántos pedazos y cuántas fuentes hay hoy, para la entrega y para /admin. */
export async function contarDiseno(): Promise<{
  chunks: number;
  fuentes: number;
  porCategoria: Record<string, number>;
}> {
  const rows = await db.execute<{ category: string; chunks: string; fuentes: string }>(sql`
    SELECT category, count(*) AS chunks, count(DISTINCT source_path) AS fuentes
    FROM design_knowledge
    GROUP BY category
  `);
  const filas = ((rows as any).rows ?? []) as Array<{ category: string; chunks: string; fuentes: string }>;
  const porCategoria: Record<string, number> = {};
  let chunks = 0;
  let fuentes = 0;
  for (const f of filas) {
    porCategoria[f.category] = Number(f.chunks);
    chunks += Number(f.chunks);
    fuentes += Number(f.fuentes);
  }
  return { chunks, fuentes, porCategoria };
}
