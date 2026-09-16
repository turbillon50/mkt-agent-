/**
 * Cuánto puede hacer Goossip SOLO en cada proyecto.
 *
 * Luis lo pidió como "libertad y crecimiento": que Goossip opere con autonomía
 * creciente. Lo que hace que eso no sea una barbaridad es que la libertad se
 * gana por proyecto, se ve en un número y **tiene techo**.
 *
 * Cuatro niveles, y cada uno dice exactamente qué se hace SIN preguntar:
 *
 *   1. Propone       — todo pasa por aprobación. Es el nivel de un cliente nuevo.
 *   2. Publica       — el contenido orgánico APROBADO sale solo. Las respuestas
 *                      y las campañas las propone.
 *   3. Contesta      — además, responde leads y comentarios solo, y escala lo
 *                      sensible.
 *   4. Opera pauta   — además, mueve campañas con un tope de gasto diario.
 *
 * Y tres cosas que NO cambian con el nivel — las COMPUERTAS DURAS:
 *
 *   · **dinero** — subir un presupuesto, cobrar, prometer un precio;
 *   · **promesas legales** — garantías, plazos, cláusulas;
 *   · **precios que no vienen del catálogo** — si no está en Conocimiento, no
 *     se dice;
 *   · **WhatsApp** — decisión de Luis, y no se abre por subir de nivel.
 *
 * Una compuerta dura no es "el nivel 4 sí puede": es que NINGÚN nivel puede. Lo
 * que separa una compuerta de un permiso es justo eso — si el nivel más alto la
 * abre, no era una compuerta.
 */
import { and, count, desc, eq, gte } from 'drizzle-orm';
import { db } from '../db/client';
import { lessons, projectEvents, type Project } from '../db/schema';
import { whatsappHabilitado } from '../banderas';

export const NIVELES = [1, 2, 3, 4] as const;
export type NivelAutonomia = (typeof NIVELES)[number];

export interface Nivel {
  n: NivelAutonomia;
  nombre: string;
  /** Qué hace solo, en una línea. */
  hace: string;
  /** Qué sigue pidiendo permiso. */
  pide: string;
}

export const NIVEL: Record<NivelAutonomia, Nivel> = {
  1: {
    n: 1,
    nombre: 'Propone',
    hace: 'Prepara todo y te lo deja listo para revisar.',
    pide: 'Todo: publicar, contestar, mover campañas.',
  },
  2: {
    n: 2,
    nombre: 'Publica contenido',
    hace: 'Publica solo el contenido orgánico que ya aprobaste.',
    pide: 'Respuestas a leads y comentarios, y cualquier campaña.',
  },
  3: {
    n: 3,
    nombre: 'Contesta',
    hace: 'Publica lo aprobado y contesta leads y comentarios solo; escala lo sensible.',
    pide: 'Campañas y cualquier cosa con dinero de por medio.',
  },
  4: {
    n: 4,
    nombre: 'Opera campañas',
    hace: 'Todo lo anterior y mueve campañas dentro de un tope de gasto diario.',
    pide: 'Pasarse del tope, prometer precios fuera del catálogo y cualquier promesa legal.',
  },
};

export function nivelDe(project: Project): NivelAutonomia {
  const raw = Number((project.rules as Record<string, unknown> | null)?.autonomy_level);
  return (NIVELES as readonly number[]).includes(raw) ? (raw as NivelAutonomia) : 1;
}

export function topeDiario(project: Project): number | null {
  const raw = Number((project.rules as Record<string, unknown> | null)?.autonomy_daily_budget);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

// ---------------------------------------------------------------------------
// Qué puede hacer solo
// ---------------------------------------------------------------------------

export type AccionAutonoma =
  | 'publicar_organico'
  | 'responder_lead'
  | 'responder_comentario'
  | 'operar_campana'
  | 'mover_presupuesto'
  | 'prometer_precio'
  | 'promesa_legal'
  | 'mandar_whatsapp';

/** Lo que NINGÚN nivel abre. Ver la cabecera. */
export const COMPUERTAS_DURAS: ReadonlySet<AccionAutonoma> = new Set<AccionAutonoma>([
  'mover_presupuesto',
  'prometer_precio',
  'promesa_legal',
  'mandar_whatsapp',
]);

const DESDE_NIVEL: Record<AccionAutonoma, NivelAutonomia | null> = {
  publicar_organico: 2,
  responder_lead: 3,
  responder_comentario: 3,
  operar_campana: 4,
  mover_presupuesto: null,
  prometer_precio: null,
  promesa_legal: null,
  mandar_whatsapp: null,
};

export interface Veredicto {
  puede: boolean;
  /** En español, para decírselo al usuario o meterlo en la bitácora. */
  motivo: string;
}

/**
 * ¿Puede Goossip hacer esto SIN preguntar en este proyecto?
 *
 * Devuelve motivo siempre, también cuando sí puede: la bitácora del proyecto
 * tiene que poder contestar "¿y esto por qué salió solo?" sin que nadie lea el
 * código.
 */
export function puedeSolo(project: Project, accion: AccionAutonoma): Veredicto {
  if (COMPUERTAS_DURAS.has(accion)) {
    if (accion === 'mandar_whatsapp' && !whatsappHabilitado()) {
      return { puede: false, motivo: 'WhatsApp está cerrado en Goossip por decisión de Luis.' };
    }
    return {
      puede: false,
      motivo:
        'Es una compuerta dura: dinero, promesas legales, precios fuera del catálogo y WhatsApp siempre pasan por una persona, en cualquier nivel.',
    };
  }

  const nivel = nivelDe(project);
  const desde = DESDE_NIVEL[accion];
  if (desde === null) return { puede: false, motivo: 'Esta acción no se hace sola nunca.' };
  if (nivel >= desde) {
    return { puede: true, motivo: `${project.name} está en nivel ${nivel} (${NIVEL[nivel].nombre}).` };
  }
  return {
    puede: false,
    motivo: `Hace falta nivel ${desde} (${NIVEL[desde].nombre}) y ${project.name} está en ${nivel}.`,
  };
}

/** ¿En esta red lo aprobado sale solo? `rules.auto_publish` por red, más el nivel. */
export function autoPublicaEn(project: Project, red: string): boolean {
  if (!puedeSolo(project, 'publicar_organico').puede) return false;
  const lista = (project.rules as Record<string, unknown> | null)?.auto_publish;
  if (Array.isArray(lista)) return lista.includes(red);
  // Compatibilidad con `auto_publish: true` a secas: vale para todas.
  return lista === true;
}

// ---------------------------------------------------------------------------
// Subir de nivel: se sugiere, no se hace solo
// ---------------------------------------------------------------------------

/** Cuántas acciones seguidas sin que nadie las corrija hacen falta para sugerir el salto. */
export const SIN_CORRECCION_PARA_SUBIR = 10;

export interface Progreso {
  nivel: NivelAutonomia;
  siguiente: NivelAutonomia | null;
  /** Acciones de Goossip desde la última corrección humana. */
  sinCorreccion: number;
  faltan: number;
  /** Se sugiere subir. NUNCA se sube solo: subir de nivel es del dueño. */
  sugerirSubir: boolean;
  ultimaCorreccion: string | null;
}

/**
 * El contador que se ve en Ajustes.
 *
 * Cuenta las acciones de Goossip POSTERIORES a la última corrección humana. Es
 * la definición que importa: veinte aciertos antes de un rechazo no compran
 * nada: lo que dice que el proyecto está listo para más libertad es la racha
 * que va DESPUÉS del último error.
 *
 * Y subir de nivel NO pasa solo. Se sugiere y el dueño aprieta. Un sistema que
 * se da permisos a sí mismo por buen comportamiento es exactamente lo que nadie
 * quiere firmar.
 */
export async function progresoDeAutonomia(project: Project): Promise<Progreso> {
  const nivel = nivelDe(project);
  const siguiente: NivelAutonomia | null = nivel < 4 ? ((nivel + 1) as NivelAutonomia) : null;

  const [ultima] = await db
    .select({ cuando: lessons.createdAt })
    .from(lessons)
    .where(eq(lessons.projectId, project.id))
    .orderBy(desc(lessons.createdAt))
    .limit(1);

  const desde = ultima?.cuando ?? new Date(0);
  const [fila] = await db
    .select({ n: count() })
    .from(projectEvents)
    .where(
      and(
        eq(projectEvents.projectId, project.id),
        eq(projectEvents.actor, 'goossip'),
        gte(projectEvents.createdAt, desde),
      ),
    );

  const sinCorreccion = Number(fila?.n ?? 0);
  return {
    nivel,
    siguiente,
    sinCorreccion,
    faltan: Math.max(0, SIN_CORRECCION_PARA_SUBIR - sinCorreccion),
    sugerirSubir: siguiente !== null && sinCorreccion >= SIN_CORRECCION_PARA_SUBIR,
    ultimaCorreccion: ultima?.cuando?.toISOString() ?? null,
  };
}

/** Lo que el nivel le dice al MODELO, dentro de sus instrucciones. */
export function nivelComoTexto(project: Project): string {
  const n = nivelDe(project);
  const tope = topeDiario(project);
  return [
    `Autonomía de este proyecto: nivel ${n} — ${NIVEL[n].nombre}.`,
    `Haces solo: ${NIVEL[n].hace}`,
    `Pides permiso para: ${NIVEL[n].pide}`,
    n === 4 && tope ? `Tope de gasto diario: ${tope}.` : null,
    'Pase lo que pase y diga lo que diga el nivel, NUNCA haces solo: mover dinero, hacer promesas legales, dar un precio que no esté en la base de conocimiento de este proyecto, ni mandar WhatsApp. Eso siempre lo aprueba una persona.',
  ]
    .filter(Boolean)
    .join('\n');
}
