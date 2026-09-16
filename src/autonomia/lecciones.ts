/**
 * Lo que Goossip aprende, que es SOLO lo que una persona le corrigió.
 *
 * La regla está tomada de la doctrina y es la que separa el aprendizaje de la
 * autocomplacencia: **una lección se guarda cuando hubo una corrección con
 * causa, no cuando algo salió bien.** Un sistema que se apunta sus aciertos
 * aprende a apuntarse aciertos.
 *
 * Qué cuenta como corrección:
 *   · una pieza RECHAZADA,
 *   · una pieza a la que le PIDIERON CAMBIOS (con el comentario, que es la
 *     mitad que enseña),
 *   · un texto que el usuario reescribió antes de publicar.
 *
 * Y para qué sirve: cada lección entra al contexto del Asistente de ESE
 * proyecto. Cómo corrige sus piezas el de tacos no le sirve al desarrollador
 * inmobiliario, y por eso `lessons` cuelga del proyecto y no de la aplicación
 * —al revés que `design_knowledge`, que sí es de la casa.
 */
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { lessons, type Lesson, type LessonKind, type Project } from '../db/schema';
import { config } from '../config';

export interface NuevaLeccion {
  project: Project;
  kind: LessonKind;
  /** Qué hizo Goossip. */
  queHizo: string;
  /** Qué corrigió la persona. */
  queCorrigio: string;
  refType?: string | null;
  refId?: string | null;
  actor?: string | null;
}

/**
 * La lección en una línea, como se la vamos a decir al modelo.
 *
 * Se arma con plantilla y no con un LLM a propósito: pedirle a un modelo que
 * resuma la corrección mete una llamada más, una latencia más y —lo que
 * importa— una interpretación entre lo que la persona dijo y lo que queda
 * escrito. Aquí lo que queda escrito son SUS palabras.
 */
export function redactarLeccion(input: Omit<NuevaLeccion, 'project'>): string {
  switch (input.kind) {
    case 'pieza_rechazada':
      return `Rechazaron una pieza (${input.queHizo}). Motivo: ${input.queCorrigio}. No volver a proponer algo así sin preguntar.`;
    case 'cambios_pedidos':
      return `Pidieron cambios sobre "${input.queHizo}": ${input.queCorrigio}. Aplicarlo de entrada la próxima vez.`;
    case 'pieza_editada':
      return `Editaron la pieza a mano. Antes: "${input.queHizo}". Después: "${input.queCorrigio}". Esa es la forma que quieren.`;
    case 'texto_corregido':
    default:
      return `Corrigieron el texto. Escribí "${input.queHizo}" y lo dejaron en "${input.queCorrigio}".`;
  }
}

/**
 * Guarda la lección. El embedding es OPCIONAL a propósito: si el proveedor de
 * embeddings está caído o apagado, la lección se guarda igual sin vector. Una
 * corrección perdida es peor que una corrección que de momento no se puede
 * buscar por parecido — el texto sigue ahí y sigue entrando al contexto por
 * fecha.
 */
export async function guardarLeccion(input: NuevaLeccion): Promise<Lesson> {
  const leccion = redactarLeccion(input);

  let embedding: number[] | null = null;
  if (config.embeddings.enabled) {
    const { embed } = await import('../memory/embed');
    embedding = await embed(leccion).catch(() => null);
  }

  const [fila] = await db
    .insert(lessons)
    .values({
      orgId: input.project.orgId,
      projectId: input.project.id,
      kind: input.kind,
      queHizo: input.queHizo.slice(0, 2000),
      queCorrigio: input.queCorrigio.slice(0, 2000),
      leccion,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      actor: input.actor ?? null,
      embedding,
    })
    .returning();
  if (!fila) throw new Error('No se pudo guardar la lección.');
  return fila;
}

export async function leccionesDelProyecto(
  projectId: string,
  limite = 20,
): Promise<Lesson[]> {
  return db
    .select()
    .from(lessons)
    .where(eq(lessons.projectId, projectId))
    .orderBy(desc(lessons.createdAt))
    .limit(Math.min(limite, 100));
}

/**
 * Las lecciones parecidas a lo que se está por hacer.
 *
 * Cae a "las más recientes" cuando no hay embeddings: el Asistente prefiere
 * cinco lecciones de la semana pasada a ninguna.
 */
export async function leccionesParecidas(
  projectId: string,
  texto: string,
  k = 5,
): Promise<Lesson[]> {
  if (!config.embeddings.enabled) return leccionesDelProyecto(projectId, k);
  try {
    const { embed } = await import('../memory/embed');
    const vec = await embed(texto);
    const literal = sql.raw(`'[${vec.join(',')}]'::vector`);
    return await db
      .select()
      .from(lessons)
      .where(and(eq(lessons.projectId, projectId), sql`${lessons.embedding} is not null`))
      .orderBy(sql`${lessons.embedding} <=> ${literal}`)
      .limit(k);
  } catch {
    return leccionesDelProyecto(projectId, k);
  }
}

/** Lo que las lecciones le dicen al MODELO, dentro de sus instrucciones. */
export function leccionesComoTexto(filas: Lesson[]): string {
  if (filas.length === 0) return '';
  return [
    'Lo que este cliente ya te corrigió (no lo repitas):',
    ...filas.slice(0, 8).map((l) => `· ${l.leccion}`),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// "Qué aprendí" — el reporte semanal
// ---------------------------------------------------------------------------

export interface QueAprendi {
  desde: string;
  total: number;
  porTipo: Record<string, number>;
  lecciones: Array<{ leccion: string; cuando: string; quien: string | null }>;
  /** El resumen en una frase, para la sección Actividad. */
  resumen: string;
}

export async function queAprendi(projectId: string, dias = 7): Promise<QueAprendi> {
  const desde = new Date(Date.now() - dias * 86_400_000);
  const filas = await db
    .select()
    .from(lessons)
    .where(and(eq(lessons.projectId, projectId), gte(lessons.createdAt, desde)))
    .orderBy(desc(lessons.createdAt))
    .limit(50);

  const porTipo: Record<string, number> = {};
  for (const f of filas) porTipo[f.kind] = (porTipo[f.kind] ?? 0) + 1;

  return {
    desde: desde.toISOString(),
    total: filas.length,
    porTipo,
    lecciones: filas.map((f) => ({
      leccion: f.leccion,
      cuando: f.createdAt.toISOString(),
      quien: f.actor,
    })),
    resumen:
      filas.length === 0
        ? `Esta semana nadie me corrigió nada en ${dias} días. Eso no es un elogio: puede ser que no haya sacado nada.`
        : filas.length === 1
          ? 'Esta semana me corrigieron 1 vez y ya lo tengo anotado.'
          : `Esta semana me corrigieron ${filas.length} veces. Las tengo anotadas y entran a lo que hago de aquí en adelante.`,
  };
}
