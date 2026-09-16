/**
 * La bandeja social: Messenger y los DMs de Instagram, dentro de Goossip.
 *
 * La QA del 16-sep encontró DOS capas rotas a la vez (fila 4 y fila 5):
 *
 *   (a) **Nadie había cableado Messenger.** Ni ruta en `app/api`, ni método en
 *       `src/channels`, ni herramienta del Asistente. La pantalla
 *       *Conversaciones* solo leía `whatsapp / sms / email`.
 *   (b) **El token estaba mal** para Facebook: la tool de Composio firma con el
 *       token de usuario y `/{page}/conversations` exige el de página.
 *
 * (b) se arregló en `src/channels/facebook.ts`. Esto es (a).
 *
 * Cómo entra: por POLL, cada 2 minutos, desde `/api/cron/inbox`. **No** por
 * webhooks de Messenger, y no es pereza: los webhooks de Meta exigen una app
 * propia revisada y aprobada por Meta, con su `verify_token` y su suscripción
 * por página. Goossip conecta por la app administrada de Composio justo para
 * que un cliente nuevo no tenga que pasar por eso. El día que haya app propia
 * aprobada, el webhook entra por la misma puerta de abajo (`guardarHilo`) y el
 * poll se apaga.
 *
 * Lo que se guarda y lo que no: se guardan los hilos y los últimos mensajes en
 * `conversations`/`messages`, que ya es donde vive WhatsApp. Así la pantalla es
 * UNA y no tres, y el vendedor puede proponer respuesta sobre cualquier canal
 * sin saber de cuál vino. Los tokens nunca se guardan aquí.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { conversations, messages, salesLeads, type Conversation, type Project } from '../db/schema';

export type CanalSocial = 'messenger' | 'instagram';

/** Cuántos hilos se bajan por canal en cada pasada del cron. */
const TOPE_HILOS = 25;
/** Cuántos mensajes por hilo. Con el último basta para la lista; el detalle pide más. */
const TOPE_MENSAJES = 10;

export interface ResumenDeSincronizacion {
  canal: CanalSocial;
  hilos: number;
  mensajesNuevos: number;
  /** En español, si el canal no se pudo leer. Nunca una excepción cruda. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Guardar
// ---------------------------------------------------------------------------

interface HiloCrudo {
  externalThreadId: string;
  contactoId: string | null;
  contactoNombre: string | null;
  ultimoTexto: string | null;
  ultimoAt: Date | null;
  sinLeer: number;
}

/**
 * Alta o actualización de un hilo. La clave es (proyecto, canal, hilo), que es
 * justo el índice único que dejó la 0012.
 */
async function guardarHilo(
  project: Project,
  canal: CanalSocial,
  hilo: HiloCrudo,
): Promise<Conversation> {
  const ahora = new Date();
  const previas = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.campaignId, project.id),
        eq(conversations.channel, canal),
        eq(conversations.externalThreadId, hilo.externalThreadId),
      ),
    )
    .limit(1);

  if (previas[0]) {
    const [row] = await db
      .update(conversations)
      .set({
        contactName: hilo.contactoNombre ?? previas[0].contactName,
        contactExternalId: hilo.contactoId ?? previas[0].contactExternalId,
        unreadCount: hilo.sinLeer,
        lastSyncedAt: ahora,
        updatedAt: hilo.ultimoAt ?? ahora,
      })
      .where(eq(conversations.id, previas[0].id))
      .returning();
    return row!;
  }

  const [row] = await db
    .insert(conversations)
    .values({
      orgId: project.orgId,
      campaignId: project.id,
      channel: canal,
      externalThreadId: hilo.externalThreadId,
      contactName: hilo.contactoNombre,
      contactExternalId: hilo.contactoId,
      unreadCount: hilo.sinLeer,
      lastSyncedAt: ahora,
      status: 'open',
    })
    .returning();
  return row!;
}

interface MensajeCrudo {
  id: string;
  texto: string;
  entrante: boolean;
  cuando: Date | null;
  de: string | null;
}

/**
 * Mete los mensajes que falten. `external_id` tiene índice único, así que
 * volver a correr el cron no duplica nada — y eso es lo que permite que el poll
 * sea cada 2 minutos sin pensarlo dos veces.
 */
async function guardarMensajes(
  project: Project,
  conversacion: Conversation,
  crudos: MensajeCrudo[],
): Promise<number> {
  if (crudos.length === 0) return 0;

  const ids = crudos.map((m) => m.id);
  const yaEstan = new Set(
    (
      await db
        .select({ externalId: messages.externalId })
        .from(messages)
        .where(inArray(messages.externalId, ids))
    ).map((r) => r.externalId),
  );

  const nuevos = crudos.filter((m) => !yaEstan.has(m.id));
  if (nuevos.length === 0) return 0;

  await db.insert(messages).values(
    nuevos.map((m) => ({
      orgId: project.orgId,
      conversationId: conversacion.id,
      direction: m.entrante ? ('inbound' as const) : ('outbound' as const),
      body: m.texto,
      externalId: m.id,
      respondedBy: m.entrante ? null : (m.de ?? 'la marca'),
      createdAt: m.cuando ?? new Date(),
    })),
  );

  // Las marcas de tiempo del hilo, con lo más nuevo de cada lado. Son las que
  // usa la lista para ordenar y para saber si la pelota está de nuestro lado.
  const entrante = nuevos.filter((m) => m.entrante).map((m) => m.cuando?.getTime() ?? 0);
  const saliente = nuevos.filter((m) => !m.entrante).map((m) => m.cuando?.getTime() ?? 0);
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (entrante.length) set.lastInboundAt = new Date(Math.max(...entrante));
  if (saliente.length) set.lastOutboundAt = new Date(Math.max(...saliente));
  await db.update(conversations).set(set).where(eq(conversations.id, conversacion.id));

  return nuevos.length;
}

// ---------------------------------------------------------------------------
// Sincronizar
// ---------------------------------------------------------------------------

/** Messenger de la página del proyecto. */
async function sincronizarMessenger(project: Project): Promise<ResumenDeSincronizacion> {
  const out: ResumenDeSincronizacion = { canal: 'messenger', hilos: 0, mensajesNuevos: 0 };
  try {
    const fb = await import('../channels/facebook');
    const hilos = await fb.conversacionesDeMessenger(project, { limite: TOPE_HILOS });
    for (const h of hilos) {
      const conv = await guardarHilo(project, 'messenger', {
        externalThreadId: h.id,
        contactoId: h.contacto.id,
        contactoNombre: h.contacto.nombre,
        ultimoTexto: h.ultimoTexto,
        ultimoAt: h.ultimoAt,
        sinLeer: h.sinLeer,
      });
      const msgs = await fb.mensajesDeMessenger(project, h.id, TOPE_MENSAJES).catch(() => []);
      out.mensajesNuevos += await guardarMensajes(
        project,
        conv,
        msgs.map((m) => ({
          id: m.id,
          texto: m.texto,
          entrante: m.entrante,
          cuando: m.cuando,
          de: m.de.nombre,
        })),
      );
      out.hilos += 1;
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : 'no se pudo leer Messenger';
  }
  return out;
}

/** DMs de Instagram. */
async function sincronizarInstagram(project: Project): Promise<ResumenDeSincronizacion> {
  const out: ResumenDeSincronizacion = { canal: 'instagram', hilos: 0, mensajesNuevos: 0 };
  try {
    const ig = await import('../channels/instagram');
    const hilos = await ig.conversacionesDeInstagram(project, { limite: TOPE_HILOS });
    for (const h of hilos) {
      const conv = await guardarHilo(project, 'instagram', {
        externalThreadId: h.id,
        contactoId: h.contacto.id,
        contactoNombre: h.contacto.nombre,
        ultimoTexto: h.ultimoTexto,
        ultimoAt: h.ultimoAt,
        sinLeer: h.sinLeer,
      });
      const msgs = await ig.mensajesDeInstagram(project, h.id, TOPE_MENSAJES).catch(() => []);
      out.mensajesNuevos += await guardarMensajes(
        project,
        conv,
        msgs.map((m) => ({
          id: m.id,
          texto: m.texto,
          entrante: m.entrante,
          cuando: m.cuando,
          de: m.de.nombre,
        })),
      );
      out.hilos += 1;
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : 'no se pudieron leer los DMs de Instagram';
  }
  return out;
}

/**
 * Una pasada completa por el proyecto.
 *
 * Un canal caído NO tumba al otro: cada uno trae su `error` en español y la
 * pantalla lo puede decir. Que Instagram esté de malas no puede dejar sin
 * Messenger a quien vende por Messenger.
 */
export async function sincronizarBandeja(project: Project): Promise<ResumenDeSincronizacion[]> {
  const cuentas = await cuentasVivas(project);
  const tareas: Array<Promise<ResumenDeSincronizacion>> = [];
  if (cuentas.has('facebook')) tareas.push(sincronizarMessenger(project));
  if (cuentas.has('instagram')) tareas.push(sincronizarInstagram(project));
  return Promise.all(tareas);
}

async function cuentasVivas(project: Project): Promise<Set<string>> {
  const { composioAccountsOf } = await import('./composio-connections');
  const filas = await composioAccountsOf(project).catch(() => []);
  return new Set(filas.filter((f) => f.status === 'connected').map((f) => f.platform));
}

/** El barrido del cron: todos los proyectos que tienen Facebook o Instagram. */
export async function sincronizarTodas(limite = 100): Promise<{
  proyectos: number;
  hilos: number;
  mensajesNuevos: number;
}> {
  const { campaigns, socialAccounts } = await import('../db/schema');
  const filas = await db
    .selectDistinct({ projectId: socialAccounts.campaignId })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.status, 'connected'),
        inArray(socialAccounts.platform, ['facebook', 'instagram']),
      ),
    );
  const ids = filas.map((f) => f.projectId).filter(Boolean) as string[];
  if (ids.length === 0) return { proyectos: 0, hilos: 0, mensajesNuevos: 0 };

  const proyectos = await db
    .select()
    .from(campaigns)
    .where(inArray(campaigns.id, ids.slice(0, limite)));

  let hilos = 0;
  let mensajesNuevos = 0;
  for (const project of proyectos) {
    for (const r of await sincronizarBandeja(project)) {
      hilos += r.hilos;
      mensajesNuevos += r.mensajesNuevos;
    }
  }
  return { proyectos: proyectos.length, hilos, mensajesNuevos };
}

// ---------------------------------------------------------------------------
// Responder
// ---------------------------------------------------------------------------

/**
 * Contesta en el canal que sea, desde Conversaciones.
 *
 * WhatsApp NO entra aquí: sigue detrás de su bandera y de su ventana de 24 h,
 * y tiene su propio camino con plantillas. Meterlo por esta puerta sería el
 * atajo por el que se cuela justo lo que Luis dejó apagado.
 */
export async function responderEnHilo(input: {
  project: Project;
  conversacionId: string;
  texto: string;
  quien: string;
}): Promise<{ ok: boolean; externalId: string | null; motivo?: string }> {
  const filas = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, input.conversacionId),
        eq(conversations.campaignId, input.project.id),
      ),
    )
    .limit(1);
  const conv = filas[0];
  if (!conv) return { ok: false, externalId: null, motivo: 'Ese hilo no es de este proyecto.' };

  if (conv.channel !== 'messenger' && conv.channel !== 'instagram') {
    return {
      ok: false,
      externalId: null,
      motivo: `Desde aquí se contesta Messenger e Instagram. ${conv.channel} va por su propio camino.`,
    };
  }
  if (!conv.contactExternalId) {
    return {
      ok: false,
      externalId: null,
      motivo: 'A este hilo todavía no le conocemos el destinatario. Espera a la próxima sincronización.',
    };
  }

  const r =
    conv.channel === 'messenger'
      ? await (await import('../channels/facebook')).responderEnMessenger(input.project, {
          destinatarioId: conv.contactExternalId,
          texto: input.texto,
        })
      : await (await import('../channels/instagram')).responderEnInstagram(input.project, {
          destinatarioId: conv.contactExternalId,
          texto: input.texto,
        });

  const ahora = new Date();
  await db.insert(messages).values({
    orgId: input.project.orgId,
    conversationId: conv.id,
    direction: 'outbound',
    body: input.texto,
    externalId: r.id,
    deliveryStatus: 'sent',
    respondedBy: input.quien,
    createdAt: ahora,
  });
  await db
    .update(conversations)
    .set({ lastOutboundAt: ahora, updatedAt: ahora, unreadCount: 0 })
    .where(eq(conversations.id, conv.id));

  // Contestar ES haberlo leído. Si esto falla, el mensaje ya salió: no se tira
  // la respuesta del usuario por un contador.
  await marcarLeido(input.project, conv).catch(() => undefined);

  return { ok: true, externalId: r.id };
}

export async function marcarLeido(project: Project, conv: Conversation): Promise<void> {
  if (!conv.contactExternalId) return;
  if (conv.channel === 'messenger') {
    await (await import('../channels/facebook')).marcarLeidoEnMessenger(
      project,
      conv.contactExternalId,
    );
  } else if (conv.channel === 'instagram') {
    await (await import('../channels/instagram')).marcarLeidoEnInstagram(
      project,
      conv.contactExternalId,
    );
  }
  await db.update(conversations).set({ unreadCount: 0 }).where(eq(conversations.id, conv.id));
}

// ---------------------------------------------------------------------------
// Leer para la pantalla
// ---------------------------------------------------------------------------

export interface HiloDeBandeja {
  id: string;
  canal: 'whatsapp' | 'sms' | 'email' | 'messenger' | 'instagram';
  estado: 'open' | 'escalated' | 'closed';
  /** Quién es: el lead del CRM si lo hay, si no el contacto del canal. */
  quien: string;
  lead: { id: string; nombre: string | null; telefono: string | null; grado: string } | null;
  ultimoTexto: string | null;
  ultimoAt: Date | null;
  ultimoEntrante: boolean;
  sinLeer: number;
  /** ¿Se puede contestar desde aquí? */
  respondible: boolean;
  ventanaAbierta: boolean;
}

export const CANAL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'Correo',
  messenger: 'Messenger',
  instagram: 'Instagram',
};

/**
 * Todos los hilos del proyecto, de todos los canales, ya unificados.
 *
 * Sustituye a `projectThreads` de `conversations.ts`, que solo sabía de los tres
 * canales viejos.
 */
export async function hilosDelProyecto(
  orgId: string,
  projectId: string,
  limite = 60,
): Promise<HiloDeBandeja[]> {
  const hilos = await db
    .select({ conversation: conversations, lead: salesLeads })
    .from(conversations)
    .leftJoin(salesLeads, eq(salesLeads.id, conversations.leadId))
    .where(and(eq(conversations.orgId, orgId), eq(conversations.campaignId, projectId)))
    .orderBy(desc(conversations.updatedAt))
    .limit(limite);

  if (hilos.length === 0) return [];

  // El último mensaje de cada hilo de un jalón: una consulta por hilo serían N
  // viajes a la base para pintar una lista.
  const ids = hilos.map((h) => h.conversation.id);
  const ultimos = db
    .select({
      conversationId: messages.conversationId,
      body: messages.body,
      direction: messages.direction,
      createdAt: messages.createdAt,
      rn: sql<number>`row_number() over (partition by ${messages.conversationId} order by ${messages.createdAt} desc)`.as(
        'rn',
      ),
    })
    .from(messages)
    .where(inArray(messages.conversationId, ids))
    .as('ultimos');

  const filas = await db
    .select({
      conversationId: ultimos.conversationId,
      body: ultimos.body,
      direction: ultimos.direction,
      createdAt: ultimos.createdAt,
    })
    .from(ultimos)
    .where(eq(ultimos.rn, 1));

  const porHilo = new Map(filas.map((f) => [f.conversationId, f]));
  const ahora = Date.now();

  return hilos.map(({ conversation, lead }) => {
    const ultimo = porHilo.get(conversation.id);
    return {
      id: conversation.id,
      canal: conversation.channel,
      estado: conversation.status,
      quien:
        lead?.fullName ??
        conversation.contactName ??
        lead?.phone ??
        conversation.externalThreadId.slice(0, 18),
      lead: lead
        ? { id: lead.id, nombre: lead.fullName, telefono: lead.phone, grado: lead.grade }
        : null,
      ultimoTexto: ultimo?.body?.trim() ? ultimo.body.slice(0, 160) : null,
      ultimoAt: ultimo?.createdAt ?? conversation.updatedAt,
      ultimoEntrante: ultimo?.direction === 'inbound',
      sinLeer: conversation.unreadCount ?? 0,
      respondible:
        (conversation.channel === 'messenger' || conversation.channel === 'instagram') &&
        Boolean(conversation.contactExternalId),
      ventanaAbierta: Boolean(
        conversation.windowExpiresAt && conversation.windowExpiresAt.getTime() > ahora,
      ),
    };
  });
}

/** Un hilo con sus mensajes, para la vista de detalle. */
export async function hiloConMensajes(
  orgId: string,
  projectId: string,
  conversacionId: string,
  limite = 50,
): Promise<{
  hilo: HiloDeBandeja | null;
  mensajes: Array<{ id: string; texto: string; entrante: boolean; cuando: Date; quien: string | null }>;
}> {
  const todos = await hilosDelProyecto(orgId, projectId, 200);
  const hilo = todos.find((h) => h.id === conversacionId) ?? null;
  if (!hilo) return { hilo: null, mensajes: [] };

  const filas = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversacionId))
    .orderBy(desc(messages.createdAt))
    .limit(limite);

  return {
    hilo,
    mensajes: filas
      .slice()
      .reverse()
      .map((m) => ({
        id: m.id,
        texto: m.body,
        entrante: m.direction === 'inbound',
        cuando: m.createdAt,
        quien: m.respondedBy,
      })),
  };
}
