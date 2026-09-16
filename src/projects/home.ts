/**
 * El inicio del proyecto: la lista de arranque y los números.
 *
 * Los números salen de `count(*)`, no de un promedio bonito. Cero se muestra
 * como cero: un panel que enseña "12 leads" cuando no hay ninguno solo sirve
 * para que nadie vuelva a creerle al panel.
 */
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  actionQueue,
  conversations,
  projectMembers,
  salesLeads,
  type Project,
} from '../db/schema';
import { projectConnections, type ProjectConnections } from './connections';

export interface ProjectNumbers {
  leadsHoy: number;
  leadsSemana: number;
  leadsTotal: number;
  sinContactar: number;
  conversacionesAbiertas: number;
  accionesPendientes: number;
}

export async function projectNumbers(project: Project): Promise<ProjectNumbers> {
  const now = new Date();
  const inicioDelDia = new Date(now);
  inicioDelDia.setHours(0, 0, 0, 0);
  const haceUnaSemana = new Date(now.getTime() - 7 * 24 * 3600_000);

  const scope = and(eq(salesLeads.orgId, project.orgId), eq(salesLeads.campaignId, project.id));

  const [hoy, semana, total, sinContactar, abiertas, pendientes] = await Promise.all([
    count(db.select({ c: sql<number>`count(*)::int` }).from(salesLeads).where(and(scope, gte(salesLeads.createdAt, inicioDelDia)))),
    count(db.select({ c: sql<number>`count(*)::int` }).from(salesLeads).where(and(scope, gte(salesLeads.createdAt, haceUnaSemana)))),
    count(db.select({ c: sql<number>`count(*)::int` }).from(salesLeads).where(scope)),
    count(db.select({ c: sql<number>`count(*)::int` }).from(salesLeads).where(and(scope, eq(salesLeads.stage, 'nuevo')))),
    count(
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
    count(
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(actionQueue)
        .where(
          and(
            eq(actionQueue.orgId, project.orgId),
            eq(actionQueue.campaignId, project.id),
            inArray(actionQueue.status, ['pending', 'auto', 'approved']),
          ),
        ),
    ),
  ]);

  return {
    leadsHoy: hoy,
    leadsSemana: semana,
    leadsTotal: total,
    sinContactar,
    conversacionesAbiertas: abiertas,
    accionesPendientes: pendientes,
  };
}

async function count(query: Promise<Array<{ c: number }>>): Promise<number> {
  const rows = await query;
  return rows[0]?.c ?? 0;
}

// ---------------------------------------------------------------------------
// Lista de arranque
// ---------------------------------------------------------------------------

export interface ChecklistStep {
  id: 'meta' | 'formulario' | 'vendedor' | 'equipo' | 'lead';
  label: string;
  help: string;
  done: boolean;
  /** A dónde lleva el botón cuando falta. */
  href: string;
  cta: string;
}

export interface ProjectHome {
  numbers: ProjectNumbers;
  connections: ProjectConnections;
  checklist: ChecklistStep[];
  listos: number;
}

/**
 * El estado de cada paso se MIDE, no se guarda: una bandera "ya conectó Meta"
 * se queda mintiendo el día que alguien revoca el permiso desde Facebook.
 */
export async function projectHome(project: Project): Promise<ProjectHome> {
  const [numbers, connections, equipo] = await Promise.all([
    projectNumbers(project),
    projectConnections(project),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.orgId, project.orgId),
          eq(projectMembers.projectId, project.id),
        ),
      ),
  ]);

  const meta = connections.cards.find((c) => c.id === 'meta');
  const metaConectado = meta?.state === 'conectado';
  const formularios = Array.isArray((meta?.data as { forms?: unknown[] })?.forms)
    ? ((meta!.data as { forms: unknown[] }).forms as unknown[]).length
    : 0;
  const base = `/projects/${project.id}`;

  const checklist: ChecklistStep[] = [
    {
      id: 'meta',
      label: 'Conecta Facebook e Instagram',
      help: 'Es por donde entran los leads de tus anuncios.',
      done: metaConectado,
      href: `${base}/conexiones`,
      cta: 'Conectar',
    },
    {
      id: 'formulario',
      label: 'Elige el formulario de leads',
      help: 'De cuál de tus formularios quieres recibir a la gente.',
      done: metaConectado && formularios > 0,
      href: `${base}/conexiones`,
      cta: 'Elegir',
    },
    {
      id: 'vendedor',
      label: 'Define a tu vendedor',
      help: 'Cómo habla, qué no promete y a quién le pasa la bola.',
      done: Boolean(project.sellerPersona && project.sellerPersona.trim().length > 20),
      href: `${base}/ajustes`,
      cta: 'Definir',
    },
    {
      id: 'equipo',
      label: 'Invita a tu equipo',
      help: 'Quien atiende, quien conecta y quien nada más mira.',
      // Más de uno: el dueño solo no cuenta como equipo.
      done: (equipo[0]?.c ?? 0) > 1,
      href: `${base}/equipo`,
      cta: 'Invitar',
    },
    {
      id: 'lead',
      label: 'Recibe tu primer lead',
      help: 'En cuanto entre el primero, aparece aquí.',
      done: numbers.leadsTotal > 0,
      href: `${base}/leads`,
      cta: 'Ver leads',
    },
  ];

  return {
    numbers,
    connections,
    checklist,
    listos: checklist.filter((s) => s.done).length,
  };
}
