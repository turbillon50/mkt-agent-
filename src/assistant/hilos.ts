/**
 * Los hilos del Asistente y sus adjuntos.
 *
 * Todo lo de aquí lleva `project_id` en el WHERE, siempre, aunque el id del
 * hilo ya sea único. No es cinturón y tirantes: es que el id del hilo llega
 * por la URL y lo escribe el navegador. Buscar por id a secas convierte un
 * identificador adivinado en el historial del cliente de al lado.
 */
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  assistantConversations,
  assistantFiles,
  assistantMessages,
  type AssistantConversation,
  type AssistantFile,
  type AssistantMessage,
  type AssistantMessageMeta,
  type ExtractStatus,
  type FileStorage,
} from '../db/schema';

export type { AssistantConversation, AssistantFile, AssistantMessage };

interface Ambito {
  orgId: string;
  projectId: string;
  userId: string;
}

/* --------------------------------------------------------------------------
   Hilos
   -------------------------------------------------------------------------- */

export async function crearHilo(ambito: Ambito, titulo?: string | null): Promise<AssistantConversation> {
  const [fila] = await db
    .insert(assistantConversations)
    .values({
      orgId: ambito.orgId,
      projectId: ambito.projectId,
      userId: ambito.userId,
      title: titulo?.trim() || null,
    })
    .returning();
  if (!fila) throw new Error('No se pudo abrir la conversación.');
  return fila;
}

export async function listarHilos(
  ambito: Ambito,
  opciones: { q?: string | null; limite?: number } = {},
): Promise<Array<AssistantConversation & { mensajes: number }>> {
  const limite = Math.min(Math.max(opciones.limite ?? 40, 1), 100);
  const q = opciones.q?.trim();

  const base = and(
    eq(assistantConversations.projectId, ambito.projectId),
    eq(assistantConversations.userId, ambito.userId),
  );

  // Buscar mira el título Y el contenido de los mensajes. Buscar solo por
  // título sirve de poco: el título son las primeras palabras del primer
  // mensaje, y lo que uno recuerda casi nunca es cómo empezó la conversación.
  const filtro = q
    ? and(
        base,
        or(
          ilike(assistantConversations.title, `%${q}%`),
          sql`EXISTS (SELECT 1 FROM ${assistantMessages} m WHERE m.conversation_id = ${assistantConversations.id} AND m.content ILIKE ${`%${q}%`})`,
        ),
      )
    : base;

  const filas = await db
    .select({
      id: assistantConversations.id,
      orgId: assistantConversations.orgId,
      projectId: assistantConversations.projectId,
      userId: assistantConversations.userId,
      title: assistantConversations.title,
      createdAt: assistantConversations.createdAt,
      updatedAt: assistantConversations.updatedAt,
      /*
       * Ojo con las columnas del SELECT: drizzle interpola
       * `${assistantConversations.id}` SIN el prefijo de tabla cuando va en la
       * proyección (en el WHERE sí lo pone). Aquí eso salía como `"id"` a
       * secas, y `assistant_messages` TAMBIÉN tiene una columna `id`: Postgres
       * la resuelve al alcance más cercano, así que la condición se volvía
       * `m.conversation_id = m.id` y el conteo era 0 SIEMPRE. La tabla va
       * escrita completa a propósito. Lo cazó la prueba de la corrida 8.
       */
      mensajes: sql<number>`(SELECT count(*)::int FROM assistant_messages m WHERE m.conversation_id = assistant_conversations.id)`,
    })
    .from(assistantConversations)
    .where(filtro)
    .orderBy(desc(assistantConversations.updatedAt))
    .limit(limite);

  return filas;
}

export async function getHilo(ambito: Ambito, id: string): Promise<AssistantConversation | null> {
  const [fila] = await db
    .select()
    .from(assistantConversations)
    .where(
      and(
        eq(assistantConversations.id, id),
        eq(assistantConversations.projectId, ambito.projectId),
        eq(assistantConversations.userId, ambito.userId),
      ),
    )
    .limit(1);
  return fila ?? null;
}

/**
 * El hilo en el que se va a escribir.
 *
 * Si viene un id, tiene que ser de este proyecto y de esta persona; si no lo
 * es, NO se cae: se abre uno nuevo. Un id viejo guardado en el navegador
 * después de que alguien borró el hilo no debería dejar al usuario sin poder
 * escribir.
 */
export async function hiloParaEscribir(
  ambito: Ambito,
  id: string | null | undefined,
): Promise<AssistantConversation> {
  if (id) {
    const existente = await getHilo(ambito, id);
    if (existente) return existente;
  }
  return crearHilo(ambito);
}

export async function borrarHilo(ambito: Ambito, id: string): Promise<boolean> {
  const borradas = await db
    .delete(assistantConversations)
    .where(
      and(
        eq(assistantConversations.id, id),
        eq(assistantConversations.projectId, ambito.projectId),
        eq(assistantConversations.userId, ambito.userId),
      ),
    )
    .returning({ id: assistantConversations.id });
  return borradas.length > 0;
}

/**
 * El título sale de las primeras palabras del primer mensaje del usuario y se
 * escribe UNA vez. Renombrarlo en cada turno haría que la lista del historial
 * cambiara sola mientras la miras.
 */
export function tituloDesde(mensaje: string): string {
  const limpio = mensaje.replace(/\s+/g, ' ').trim();
  if (!limpio) return 'Conversación';
  if (limpio.length <= 60) return limpio;
  const corte = limpio.slice(0, 60);
  const espacio = corte.lastIndexOf(' ');
  return `${(espacio > 30 ? corte.slice(0, espacio) : corte).trim()}…`;
}

/* --------------------------------------------------------------------------
   Mensajes
   -------------------------------------------------------------------------- */

export async function mensajesDelHilo(
  ambito: Ambito,
  conversationId: string,
  limite = 200,
): Promise<AssistantMessage[]> {
  return db
    .select()
    .from(assistantMessages)
    .where(
      and(
        eq(assistantMessages.conversationId, conversationId),
        eq(assistantMessages.projectId, ambito.projectId),
      ),
    )
    .orderBy(assistantMessages.createdAt)
    .limit(limite);
}

export async function guardarMensaje(input: {
  ambito: Ambito;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: AssistantMessageMeta;
}): Promise<AssistantMessage> {
  const [fila] = await db
    .insert(assistantMessages)
    .values({
      conversationId: input.conversationId,
      orgId: input.ambito.orgId,
      projectId: input.ambito.projectId,
      role: input.role,
      content: input.content,
      metadata: input.metadata ?? {},
    })
    .returning();
  if (!fila) throw new Error('No se pudo guardar el mensaje.');

  // El hilo sube a lo alto de la lista. Y si todavía no tenía título, se lo
  // pone el primer mensaje del usuario: `COALESCE` en vez de leer-y-escribir
  // para que dos pestañas abiertas no se pisen el título.
  await db
    .update(assistantConversations)
    .set({
      updatedAt: new Date(),
      ...(input.role === 'user'
        ? { title: sql`COALESCE(${assistantConversations.title}, ${tituloDesde(input.content)})` }
        : {}),
    })
    .where(eq(assistantConversations.id, input.conversationId));

  return fila;
}

/* --------------------------------------------------------------------------
   Adjuntos
   -------------------------------------------------------------------------- */

export async function registrarArchivo(input: {
  ambito: Ambito;
  conversationId: string | null;
  name: string;
  url: string;
  mime: string;
  size: number;
  storage: FileStorage;
}): Promise<AssistantFile> {
  const [fila] = await db
    .insert(assistantFiles)
    .values({
      orgId: input.ambito.orgId,
      projectId: input.ambito.projectId,
      conversationId: input.conversationId,
      name: input.name,
      url: input.url,
      mime: input.mime,
      size: input.size,
      storage: input.storage,
      createdBy: input.ambito.userId,
    })
    .returning();
  if (!fila) throw new Error('No se pudo registrar el archivo.');
  return fila;
}

export async function marcarLectura(
  id: string,
  projectId: string,
  lectura: { estado: ExtractStatus; texto: string | null; nota: string | null },
): Promise<void> {
  await db
    .update(assistantFiles)
    .set({
      extractStatus: lectura.estado,
      extractedText: lectura.texto,
      extractNote: lectura.nota,
    })
    .where(and(eq(assistantFiles.id, id), eq(assistantFiles.projectId, projectId)));
}

/** Los adjuntos de un turno, por sus ids. Siempre acotado al proyecto. */
export async function archivosPorId(projectId: string, ids: string[]): Promise<AssistantFile[]> {
  const limpios = ids.filter((i) => /^[0-9a-f-]{36}$/i.test(i));
  if (!limpios.length) return [];
  return db
    .select()
    .from(assistantFiles)
    .where(and(eq(assistantFiles.projectId, projectId), inArray(assistantFiles.id, limpios)));
}

export async function getArchivo(projectId: string, id: string): Promise<AssistantFile | null> {
  const [fila] = await db
    .select()
    .from(assistantFiles)
    .where(and(eq(assistantFiles.id, id), eq(assistantFiles.projectId, projectId)))
    .limit(1);
  return fila ?? null;
}
