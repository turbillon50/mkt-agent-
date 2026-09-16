/**
 * Goossip medido como lo que es: un empleado.
 *
 * Las cinco preguntas que un dueño le hace a quien contrata, con `count(*)` y
 * no con estimaciones:
 *
 *   · ¿cuánto publicaste?
 *   · ¿a cuánta gente contactaste?
 *   · ¿cuánto tardas en contestar el primer mensaje?
 *   · ¿cuántas veces te sale bien a la primera?
 *   · ¿cuántas horas me ahorraste?
 *
 * La última es la única que no es un conteo, y por eso se dice CÓMO se calcula
 * en la propia pantalla. Un "te ahorré 40 horas" sin la cuenta al lado es
 * marketing, y lo que Luis va a enseñarle a un cliente tiene que aguantar la
 * pregunta "¿de dónde sacaste eso?".
 */
import { and, avg, count, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  actionQueue,
  creativePieces,
  lessons,
  posts,
  salesLeads,
  type Project,
} from '../db/schema';

/**
 * Cuánto tarda una persona en hacer a mano cada cosa. Son MINUTOS y son
 * conservadores a propósito: el número que se enseña tiene que quedarse corto,
 * no largo. De donde salen: lo que tarda alguien en armar una pieza con su
 * copy (20), en escribir y mandar el primer contacto de un lead (6) y en
 * redactar una respuesta (4).
 */
export const MINUTOS_POR = { pieza: 20, contacto: 6, respuesta: 4 } as const;

export interface MetricasDeGoossip {
  desde: string;
  dias: number;
  piezasPublicadas: number;
  piezasHechas: number;
  leadsContactados: number;
  /** Minutos entre que entra el lead y sale el primer mensaje. Mediana, no promedio. */
  primeraRespuestaMin: number | null;
  /** De las piezas decididas, cuántas se aprobaron sin pedir cambios. */
  aprobacionSinCambios: { aprobadas: number; conCambios: number; rechazadas: number; tasa: number | null };
  correcciones: number;
  ahorro: { horas: number; cuenta: string };
}

export async function metricasDeGoossip(
  project: Project,
  dias = 30,
): Promise<MetricasDeGoossip> {
  const desde = new Date(Date.now() - dias * 86_400_000);
  const alcance = and(
    eq(creativePieces.orgId, project.orgId),
    eq(creativePieces.projectId, project.id),
    gte(creativePieces.createdAt, desde),
  );

  const [publicadas, hechas, estados, contactados, correcciones, tiempos] = await Promise.all([
    uno(
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(posts)
        .where(
          and(
            eq(posts.orgId, project.orgId),
            eq(posts.projectId, project.id),
            isNotNull(posts.publishedAt),
            gte(posts.publishedAt, desde),
          ),
        ),
    ),
    uno(db.select({ c: sql<number>`count(*)::int` }).from(creativePieces).where(alcance)),
    db
      .select({ estado: creativePieces.estado, c: sql<number>`count(*)::int` })
      .from(creativePieces)
      .where(alcance)
      .groupBy(creativePieces.estado),
    uno(
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(actionQueue)
        .where(
          and(
            eq(actionQueue.orgId, project.orgId),
            eq(actionQueue.campaignId, project.id),
            eq(actionQueue.status, 'executed'),
            gte(actionQueue.createdAt, desde),
          ),
        ),
    ),
    uno(
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(lessons)
        .where(and(eq(lessons.projectId, project.id), gte(lessons.createdAt, desde))),
    ),
    /**
     * La MEDIANA y no el promedio.
     *
     * Un lead que se quedó sin contestar tres días mueve el promedio del
     * proyecto entero y esconde que los otros cuarenta se contestaron en dos
     * minutos. La mediana contesta la pregunta que de verdad se hace el dueño:
     * "¿normalmente cuánto tardan?".
     */
    db.execute(sql`
      select percentile_cont(0.5) within group (
        order by extract(epoch from (aq.executed_at - sl.created_at)) / 60
      )::numeric as mediana
      from action_queue aq
      join sales_leads sl on sl.id = aq.lead_id
      where aq.campaign_id = ${project.id}
        and aq.status = 'executed'
        and aq.executed_at is not null
        and aq.executed_at >= sl.created_at
        and sl.created_at >= ${desde.toISOString()}
    `),
  ]);

  const porEstado = new Map(estados.map((e) => [e.estado, e.c]));
  const aprobadas =
    (porEstado.get('aprobada') ?? 0) +
    (porEstado.get('programada') ?? 0) +
    (porEstado.get('publicada') ?? 0);
  const conCambios = porEstado.get('cambios') ?? 0;
  const rechazadas = porEstado.get('descartada') ?? 0;
  const decididas = aprobadas + conCambios + rechazadas;

  const filaMediana = (tiempos as unknown as { rows?: Array<{ mediana: string | null }> })?.rows?.[0];
  const mediana = filaMediana?.mediana != null ? Math.round(Number(filaMediana.mediana)) : null;

  const minutos = publicadas * MINUTOS_POR.pieza + contactados * MINUTOS_POR.contacto;

  return {
    desde: desde.toISOString(),
    dias,
    piezasPublicadas: publicadas,
    piezasHechas: hechas,
    leadsContactados: contactados,
    primeraRespuestaMin: mediana,
    aprobacionSinCambios: {
      aprobadas,
      conCambios,
      rechazadas,
      // Solo se calcula sobre las DECIDIDAS. Meter en el denominador las piezas
      // que nadie ha mirado da una tasa que baja sola con el tiempo y no mide
      // nada de lo que Goossip hizo.
      tasa: decididas > 0 ? Number(((aprobadas / decididas) * 100).toFixed(1)) : null,
    },
    correcciones,
    ahorro: {
      horas: Number((minutos / 60).toFixed(1)),
      cuenta: `${publicadas} publicaciones × ${MINUTOS_POR.pieza} min + ${contactados} contactos × ${MINUTOS_POR.contacto} min`,
    },
  };
}

async function uno(query: Promise<Array<{ c: number }>>): Promise<number> {
  const rows = await query;
  return rows[0]?.c ?? 0;
}

/** Las métricas de TODOS los proyectos de la org, para `/admin`. */
export async function metricasDeLaOrg(
  proyectos: Project[],
  dias = 30,
): Promise<Array<{ project: string; nombre: string; metricas: MetricasDeGoossip }>> {
  const out: Array<{ project: string; nombre: string; metricas: MetricasDeGoossip }> = [];
  for (const p of proyectos) {
    out.push({ project: p.id, nombre: p.name, metricas: await metricasDeGoossip(p, dias) });
  }
  return out;
}
