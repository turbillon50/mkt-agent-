/**
 * El Inicio del proyecto: el CENTRO DE MANDO.
 *
 * Lo que había hasta la corrida 6 era una lista de cinco pendientes y seis
 * ceros. Luis lo dijo con todas sus letras: *"en un nuevo proyecto no se ve todo
 * lo que tenemos de conexiones y demás; el chat y todas las herramientas deben
 * ser visibles y funcionar"*. Un panel que solo enseña lo que FALTA esconde lo
 * que la app sabe hacer, y quien entra por primera vez se va creyendo que no
 * hay nada.
 *
 * Así que esta pantalla ya no pregunta "¿qué te falta?" sino "¿qué tienes y qué
 * quieres hacer con ello?": las conexiones TODAS —conectadas o no—, el
 * Asistente a la mano, las herramientas con su estado y la bitácora.
 *
 * Los números siguen saliendo de `count(*)`. Cero se muestra como cero: un
 * panel que enseña "12 leads" cuando no hay ninguno solo sirve para que nadie
 * vuelva a creerle al panel.
 */
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  actionQueue,
  conversations,
  creativePieces,
  knowledge,
  marketingCampaigns,
  projectMembers,
  salesLeads,
  type Project,
} from '../db/schema';
import { listProjectEvents, type ProjectEvent } from './events';
import { metaConectado, projectConnections, type ProjectConnections } from './connections';

export interface ProjectNumbers {
  leadsHoy: number;
  leadsSemana: number;
  leadsTotal: number;
  sinContactar: number;
  conversacionesAbiertas: number;
  accionesPendientes: number;
  /** Piezas ya aprobadas y con fecha, esperando su turno de salir. */
  postsProgramados: number;
}

export async function projectNumbers(project: Project): Promise<ProjectNumbers> {
  const now = new Date();
  const inicioDelDia = new Date(now);
  inicioDelDia.setHours(0, 0, 0, 0);
  const haceUnaSemana = new Date(now.getTime() - 7 * 24 * 3600_000);

  const scope = and(eq(salesLeads.orgId, project.orgId), eq(salesLeads.campaignId, project.id));

  const [hoy, semana, total, sinContactar, abiertas, pendientes, programados] = await Promise.all([
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
    count(
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(creativePieces)
        .where(
          and(
            eq(creativePieces.orgId, project.orgId),
            eq(creativePieces.projectId, project.id),
            eq(creativePieces.estado, 'programada'),
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
    postsProgramados: programados,
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

// ---------------------------------------------------------------------------
// Las herramientas del proyecto
// ---------------------------------------------------------------------------

export interface Herramienta {
  id: string;
  label: string;
  /** Una línea de para qué sirve. */
  blurb: string;
  /** El estado REAL, contado: "0 activas · crear", "4 reglas listas". */
  estado: string;
  href: string;
  /** Hay algo dentro. Las vacías se ven, pero apagadas. */
  conContenido: boolean;
}

export interface ProjectHome {
  numbers: ProjectNumbers;
  connections: ProjectConnections;
  checklist: ChecklistStep[];
  listos: number;
  herramientas: Herramienta[];
  actividad: ProjectEvent[];
  /** Quién vende en este proyecto, en una línea, o null si nadie lo definió. */
  vendedor: string | null;
}

/**
 * El estado de cada paso se MIDE, no se guarda: una bandera "ya conectó Meta"
 * se queda mintiendo el día que alguien revoca el permiso desde Facebook.
 *
 * `verificar: true` no es un lujo: reconcilia contra Composio antes de contar.
 * Sin eso, esta pantalla le decía a Luis que MOMENTUM no tenía Facebook con
 * seis cuentas vivas del otro lado.
 */
export async function projectHome(project: Project): Promise<ProjectHome> {
  const [numbers, connections, equipo, campanas, documentos, piezas, actividad] = await Promise.all([
    projectNumbers(project),
    projectConnections(project, { verificar: true }),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.orgId, project.orgId),
          eq(projectMembers.projectId, project.id),
        ),
      ),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(marketingCampaigns)
      .where(
        and(
          eq(marketingCampaigns.orgId, project.orgId),
          eq(marketingCampaigns.projectId, project.id),
          eq(marketingCampaigns.status, 'activa'),
        ),
      )
      .catch(() => [{ c: 0 }]),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(knowledge)
      .where(and(eq(knowledge.orgId, project.orgId), eq(knowledge.campaignId, project.id)))
      .catch(() => [{ c: 0 }]),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(creativePieces)
      .where(
        and(eq(creativePieces.orgId, project.orgId), eq(creativePieces.projectId, project.id)),
      )
      .catch(() => [{ c: 0 }]),
    listProjectEvents(project.orgId, project.id, 10).catch(() => [] as ProjectEvent[]),
  ]);

  const meta = metaConectado(connections.cards);
  const base = `/projects/${project.id}`;
  const nEquipo = equipo[0]?.c ?? 0;
  const nCampanas = campanas[0]?.c ?? 0;
  const nDocs = documentos[0]?.c ?? 0;
  const nPiezas = piezas[0]?.c ?? 0;

  const checklist: ChecklistStep[] = [
    {
      id: 'meta',
      label: 'Conecta Facebook e Instagram',
      help: 'Es por donde entran los leads de tus anuncios.',
      // La verdad sale de las tarjetas de Facebook e Instagram de Composio, que
      // es donde vive de verdad. Preguntarle al conector `meta` —la app propia,
      // apagada desde la corrida 5— era preguntarle a un canal que ya no
      // existe, y contestaba "no" con las dos cuentas conectadas.
      done: meta.conectado,
      href: `${base}/conexiones`,
      cta: 'Conectar',
    },
    {
      id: 'formulario',
      label: 'Elige el formulario de leads',
      help: 'De cuál de tus formularios quieres recibir a la gente.',
      // Por Composio los leads entran solos de todos los formularios de la
      // página: con Facebook conectado cuenta como hecho.
      done: meta.conectado,
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
      done: nEquipo > 1,
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

  /**
   * El grid de herramientas. Cada tarjeta trae su estado CONTADO, porque es la
   * diferencia entre un menú y un panel: "Campañas" no dice nada, "0 activas ·
   * crear" dice qué hacer al entrar.
   */
  const herramientas: Herramienta[] = [
    {
      id: 'campanas',
      label: 'Campañas',
      blurb: 'Lo que estás promoviendo y con cuánto.',
      estado: nCampanas === 0 ? '0 activas · crear' : `${nCampanas} ${nCampanas === 1 ? 'activa' : 'activas'}`,
      href: `${base}/campanas`,
      conContenido: nCampanas > 0,
    },
    {
      id: 'contenido',
      label: 'Contenido',
      blurb: 'Tus piezas, cómo se ven en cada red y qué se publicó.',
      estado: nPiezas === 0 ? 'sin piezas · hacer la primera' : `${nPiezas} ${nPiezas === 1 ? 'pieza' : 'piezas'}`,
      href: `${base}/contenido`,
      conContenido: nPiezas > 0,
    },
    {
      id: 'marca',
      label: 'Marca',
      blurb: 'Tu logo, tus colores y tu tono. Y qué tan parecido es lo que sale.',
      estado: 'kit y auditoría',
      href: `${base}/marca`,
      conContenido: true,
    },
    {
      id: 'competencia',
      label: 'Competencia',
      blurb: 'Qué publican tus rivales y cada cuánto, contra lo que publicas tú.',
      estado: 'comparar',
      href: `${base}/competencia`,
      conContenido: true,
    },
    {
      id: 'prospeccion',
      label: 'Prospección',
      blurb: 'Negocios por zona y giro en Google Maps, con teléfono y sitio.',
      estado: 'buscar en el mapa',
      href: `${base}/leads?vista=prospeccion`,
      conContenido: true,
    },
    {
      id: 'conocimiento',
      label: 'Conocimiento',
      blurb: 'Precios, unidades y reglas para que tu vendedor no invente.',
      estado: nDocs === 0 ? 'vacío · cargar' : `${nDocs} ${nDocs === 1 ? 'documento' : 'documentos'}`,
      href: `${base}/conocimiento`,
      conContenido: nDocs > 0,
    },
    {
      id: 'automatizaciones',
      label: 'Automatizaciones',
      blurb: 'Qué hace Goossip solo y qué te pregunta antes.',
      estado:
        numbers.accionesPendientes === 0
          ? 'nada por aprobar'
          : `${numbers.accionesPendientes} por aprobar`,
      href: `${base}/automatizaciones`,
      conContenido: numbers.accionesPendientes > 0,
    },
    {
      id: 'equipo',
      label: 'Equipo',
      blurb: 'Quién entra a este proyecto y qué puede tocar.',
      estado: nEquipo <= 1 ? '1 persona · invitar' : `${nEquipo} personas`,
      href: `${base}/equipo`,
      conContenido: nEquipo > 1,
    },
  ];

  return {
    numbers,
    connections,
    checklist,
    listos: checklist.filter((s) => s.done).length,
    herramientas,
    actividad,
    vendedor: resumenDelVendedor(project),
  };
}

/**
 * El vendedor en una línea.
 *
 * `seller_persona` es un párrafo largo que el usuario escribió; en la cabecera
 * no cabe y no se lee. Se corta en la primera frase, que es donde la gente pone
 * quién es. Sin persona definida devuelve null y la cabecera ofrece el enlace
 * para definirla — que es la acción, no el reproche.
 */
export function resumenDelVendedor(project: Project): string | null {
  const raw = (project.sellerPersona ?? '').trim();
  if (raw.length < 3) return null;
  const primera = raw.split(/(?<=[.!?])\s|\n/)[0]?.trim() ?? raw;
  return primera.length > 90 ? `${primera.slice(0, 87)}…` : primera;
}
