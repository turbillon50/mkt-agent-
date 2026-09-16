/**
 * Los números que el menú lateral pinta junto a cada sección.
 *
 * Son `count(*)` del proyecto activo, no estimados ni banderas guardadas. Un
 * badge que dice 3 cuando no hay nada es peor que no tener badge: la siguiente
 * vez nadie le cree al menú y deja de servir para decidir a dónde entrar.
 *
 * Cero NO se pinta. El spec lo pide así, y tiene razón: un menú con cinco ceros
 * es ruido, y lo que el badge tiene que gritar es "aquí hay algo que atender".
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { actionQueue, conversations, salesLeads, type Project } from '../db/schema';
import { buildChannelCards, listProjectAccounts } from './connections';

/**
 * El punto de Conexiones, en tres colores y sin medias tintas:
 *   verde — todos los canales que hoy se pueden conectar, conectados
 *   ámbar — alguno sí, alguno no
 *   rojo  — ninguno. El proyecto no está recibiendo nada.
 *
 * Los canales en "Próximamente" no cuentan para ningún lado: pintar el punto en
 * ámbar para siempre por un canal que ni siquiera se puede conectar sería
 * castigar al usuario por algo que no depende de él.
 */
export type ConnectionsHealth = 'verde' | 'ambar' | 'rojo';

export interface ProjectBadges {
  /** Leads que nadie ha tocado. */
  leads: number;
  /** Conversaciones abiertas o escaladas. */
  conversaciones: number;
  /** Acciones esperando visto bueno. Solo `pending`: lo que de verdad frena. */
  automatizaciones: number;
  conexiones: {
    estado: ConnectionsHealth;
    conectados: number;
    conectables: number;
  };
}

export async function projectBadges(project: Project): Promise<ProjectBadges> {
  const scope = and(eq(salesLeads.orgId, project.orgId), eq(salesLeads.campaignId, project.id));

  const [leads, conversaciones, automatizaciones, cuentas] = await Promise.all([
    uno(
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(salesLeads)
        .where(and(scope, eq(salesLeads.stage, 'nuevo'))),
    ),
    uno(
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(conversations)
        .where(
          and(
            eq(conversations.orgId, project.orgId),
            eq(conversations.campaignId, project.id),
            inArray(conversations.status, ['open', 'escalated']),
          ),
        ),
    ),
    uno(
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(actionQueue)
        .where(
          and(
            eq(actionQueue.orgId, project.orgId),
            eq(actionQueue.campaignId, project.id),
            eq(actionQueue.status, 'pending'),
          ),
        ),
    ),
    listProjectAccounts(project.orgId, project.id),
  ]);

  // `buildChannelCards` y no `projectConnections`: el segundo sale a preguntarle
  // a Composio si LinkedIn sigue vivo, y esto se llama cada vez que alguien
  // cambia de proyecto en el menú. Un punto de color no vale una llamada de red
  // a un tercero; la verdad fina se mide al entrar a Conexiones.
  const { conectables, conectados } = buildChannelCards(project, cuentas);

  return {
    leads,
    conversaciones,
    automatizaciones,
    conexiones: {
      estado: conectados === 0 ? 'rojo' : conectados >= conectables ? 'verde' : 'ambar',
      conectados,
      conectables,
    },
  };
}

async function uno(query: Promise<Array<{ c: number }>>): Promise<number> {
  const rows = await query;
  return rows[0]?.c ?? 0;
}
