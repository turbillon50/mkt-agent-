/**
 * Las piezas en la base: guardarlas, listarlas y aprobarlas.
 *
 * Cada pieza guarda con qué se hizo: el prompt completo, el modelo, el motor
 * que la compuso y una FOTO del kit de marca de ese momento. Sin eso, una pieza
 * que salió bien no se puede repetir y una que salió mal no se puede explicar.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  creativePieces,
  type CreativePiece,
  type PieceState,
  type Project,
  type ProjectBrandKit,
} from '../db/schema';
import { fotoDelKit } from './brand-kit';
import type { PiezaGenerada, ResultadoMotor } from './engine';
import { RED_LABEL, formatoPorId, type RedSlug } from './specs';

export type { CreativePiece };

export async function guardarLote(input: {
  project: Project;
  kit: ProjectBrandKit | null;
  red: RedSlug;
  brief: string;
  resultado: ResultadoMotor;
  metadata?: Record<string, unknown>;
}): Promise<CreativePiece[]> {
  const { project, kit, red, brief, resultado } = input;
  if (resultado.piezas.length === 0) return [];

  return db
    .insert(creativePieces)
    .values(
      resultado.piezas.map((p) => ({
        orgId: project.orgId,
        projectId: project.id,
        red,
        formato: resultado.formato.id,
        tipo: resultado.formato.tipo,
        brief,
        prompt: p.prompt,
        modelo: p.modelo,
        motor: p.motor,
        url: p.url,
        ancho: p.ancho,
        alto: p.alto,
        kitUsado: fotoDelKit(kit),
        estado: 'propuesta' as PieceState,
        loteId: resultado.loteId,
        metadata: {
          angulo: p.angulo,
          nota: p.nota,
          notaCompositor: resultado.notaCompositor,
          ...(input.metadata ?? {}),
        },
      })),
    )
    .returning();
}

export async function guardarUna(input: {
  project: Project;
  kit: ProjectBrandKit | null;
  red: RedSlug;
  formatoId: string;
  brief: string;
  pieza: PiezaGenerada;
  motor?: CreativePiece['motor'];
}): Promise<CreativePiece> {
  const [fila] = await db
    .insert(creativePieces)
    .values({
      orgId: input.project.orgId,
      projectId: input.project.id,
      red: input.red,
      formato: input.formatoId,
      tipo: formatoPorId(input.formatoId)?.tipo ?? 'imagen',
      brief: input.brief,
      prompt: input.pieza.prompt,
      modelo: input.pieza.modelo,
      motor: input.motor ?? 'higgsfield',
      url: input.pieza.url,
      ancho: input.pieza.ancho,
      alto: input.pieza.alto,
      kitUsado: fotoDelKit(input.kit),
      estado: 'propuesta',
      metadata: { angulo: input.pieza.angulo, nota: input.pieza.nota },
    })
    .returning();
  return fila!;
}

export interface FiltroPiezas {
  red?: RedSlug | null;
  estado?: PieceState | null;
  loteId?: string | null;
  limite?: number;
}

export async function listarPiezas(
  orgId: string,
  projectId: string,
  filtro: FiltroPiezas = {},
): Promise<CreativePiece[]> {
  const condiciones = [
    eq(creativePieces.orgId, orgId),
    eq(creativePieces.projectId, projectId),
  ];
  if (filtro.red) condiciones.push(eq(creativePieces.red, filtro.red));
  if (filtro.estado) condiciones.push(eq(creativePieces.estado, filtro.estado));
  if (filtro.loteId) condiciones.push(eq(creativePieces.loteId, filtro.loteId));

  return db
    .select()
    .from(creativePieces)
    .where(and(...condiciones))
    .orderBy(desc(creativePieces.createdAt))
    .limit(Math.min(filtro.limite ?? 60, 200));
}

export async function getPieza(
  orgId: string,
  projectId: string,
  id: string,
): Promise<CreativePiece | null> {
  const [fila] = await db
    .select()
    .from(creativePieces)
    .where(
      and(
        eq(creativePieces.id, id),
        eq(creativePieces.orgId, orgId),
        eq(creativePieces.projectId, projectId),
      ),
    )
    .limit(1);
  return fila ?? null;
}

/**
 * Aprobar una pieza descarta a sus hermanas del lote.
 *
 * Es lo que hace que "la aprobada" signifique algo: si tres piezas del mismo
 * brief quedan las tres en `propuesta`, `publish-post` no sabe cuál adjuntar.
 */
export async function aprobarPieza(
  orgId: string,
  projectId: string,
  id: string,
  quien: string | null,
): Promise<CreativePiece | null> {
  const pieza = await getPieza(orgId, projectId, id);
  if (!pieza) return null;

  const ahora = new Date();
  const [fila] = await db
    .update(creativePieces)
    .set({
      estado: 'aprobada',
      aprobadaPor: quien,
      aprobadaEn: ahora,
      estadoPor: quien,
      estadoEn: ahora,
    })
    .where(eq(creativePieces.id, id))
    .returning();

  if (pieza.loteId) {
    const hermanas = await db
      .select({ id: creativePieces.id })
      .from(creativePieces)
      .where(
        and(
          eq(creativePieces.loteId, pieza.loteId),
          // También las que estaban "en revisión": aprobar una opción cierra el
          // lote entero, y dejar a sus hermanas esperando revisión es dejar
          // trabajo abierto que ya no tiene sentido.
          inArray(creativePieces.estado, ['propuesta', 'en_revision']),
        ),
      );
    const otras = hermanas.map((h) => h.id).filter((h) => h !== id);
    if (otras.length) {
      await db
        .update(creativePieces)
        .set({ estado: 'descartada', estadoPor: quien, estadoEn: ahora })
        .where(inArray(creativePieces.id, otras));
    }
  }

  return fila ?? null;
}

// ---------------------------------------------------------------------------
// El camino de la pieza (corrida 7)
// ---------------------------------------------------------------------------

/**
 * Qué se puede hacer desde cada estado.
 *
 * La tabla existe para que un botón mal pintado no pueda mandar una pieza
 * publicada de vuelta a borrador. Las transiciones NO se validan en la pantalla:
 * se validan aquí, que es por donde pasan todas.
 */
export const TRANSICIONES: Record<PieceState, PieceState[]> = {
  propuesta: ['en_revision', 'aprobada', 'descartada'],
  en_revision: ['aprobada', 'cambios', 'descartada'],
  // De "cambios" se vuelve a revisión cuando ya se rehízo, o se tira.
  cambios: ['en_revision', 'descartada'],
  aprobada: ['programada', 'publicada', 'cambios', 'descartada'],
  programada: ['publicada', 'aprobada', 'descartada'],
  publicada: [],
  descartada: ['propuesta'],
};

export function puedeIr(de: PieceState, a: PieceState): boolean {
  return TRANSICIONES[de]?.includes(a) ?? false;
}

export const ESTADO_LABEL: Record<PieceState, string> = {
  propuesta: 'Borrador',
  en_revision: 'En revisión',
  cambios: 'Cambios pedidos',
  aprobada: 'Aprobada',
  programada: 'Programada',
  publicada: 'Publicada',
  descartada: 'Rechazada',
};

export class TransicionInvalida extends Error {
  constructor(de: PieceState, a: PieceState) {
    super(`Una pieza ${ESTADO_LABEL[de].toLowerCase()} no puede pasar a ${ESTADO_LABEL[a].toLowerCase()}.`);
    this.name = 'TransicionInvalida';
  }
}

export interface CambioDeEstado {
  orgId: string;
  projectId: string;
  id: string;
  a: PieceState;
  quien: string | null;
  /** Obligatorio para "Pedir cambios": sin el porqué, no es una corrección, es un no. */
  comentario?: string | null;
  programadaPara?: Date | null;
}

/**
 * Mueve la pieza por el camino y devuelve el estado anterior.
 *
 * Devuelve el anterior y no solo la fila nueva porque quien llama necesita los
 * dos para la bitácora y para decidir si esto fue una CORRECCIÓN que hay que
 * guardar como lección.
 */
export async function moverPieza(
  input: CambioDeEstado,
): Promise<{ pieza: CreativePiece; antes: PieceState } | null> {
  const pieza = await getPieza(input.orgId, input.projectId, input.id);
  if (!pieza) return null;

  const antes = pieza.estado;
  if (antes === input.a) return { pieza, antes };
  if (!puedeIr(antes, input.a)) throw new TransicionInvalida(antes, input.a);

  if (input.a === 'cambios' && !input.comentario?.trim()) {
    throw new Error('Para pedir cambios hay que decir cuáles. Escribe qué quieres distinto.');
  }
  if (input.a === 'programada' && !input.programadaPara) {
    throw new Error('Para programarla hay que decir cuándo sale.');
  }

  // Aprobar pasa por `aprobarPieza`, que además cierra el lote.
  if (input.a === 'aprobada') {
    const fila = await aprobarPieza(input.orgId, input.projectId, input.id, input.quien);
    return fila ? { pieza: fila, antes } : null;
  }

  const ahora = new Date();
  const [fila] = await db
    .update(creativePieces)
    .set({
      estado: input.a,
      estadoPor: input.quien,
      estadoEn: ahora,
      ...(input.a === 'cambios' ? { comentario: input.comentario!.trim() } : {}),
      ...(input.a === 'programada' ? { programadaPara: input.programadaPara } : {}),
      // Volver a revisión limpia el comentario viejo: si siguiera ahí, la
      // siguiente vuelta enseñaría un pedido que ya se atendió.
      ...(input.a === 'en_revision' ? { comentario: null } : {}),
    })
    .where(eq(creativePieces.id, input.id))
    .returning();

  return fila ? { pieza: fila, antes } : null;
}

/** Las piezas programadas que ya les tocaba salir. Las lee el cron. */
export async function programadasVencidas(ahora = new Date()): Promise<CreativePiece[]> {
  return db
    .select()
    .from(creativePieces)
    .where(
      and(
        eq(creativePieces.estado, 'programada'),
        sql`${creativePieces.programadaPara} is not null`,
        sql`${creativePieces.programadaPara} <= ${ahora.toISOString()}`,
      ),
    )
    .orderBy(creativePieces.programadaPara)
    .limit(50);
}

/**
 * La semana: las piezas con fecha, por día y por red.
 *
 * Solo entran las que tienen `programada_para`. Una pieza aprobada sin fecha no
 * está "en el lunes": está esperando que alguien decida cuándo sale, y ponerla
 * en el calendario de hoy sería inventarle un plan al cliente.
 */
export async function semanaDe(
  orgId: string,
  projectId: string,
  desde: Date,
): Promise<Array<{ dia: string; piezas: CreativePiece[] }>> {
  const hasta = new Date(desde.getTime() + 7 * 86_400_000);
  const filas = await db
    .select()
    .from(creativePieces)
    .where(
      and(
        eq(creativePieces.orgId, orgId),
        eq(creativePieces.projectId, projectId),
        sql`${creativePieces.programadaPara} >= ${desde.toISOString()}`,
        sql`${creativePieces.programadaPara} < ${hasta.toISOString()}`,
      ),
    )
    .orderBy(creativePieces.programadaPara);

  const dias: Array<{ dia: string; piezas: CreativePiece[] }> = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(desde.getTime() + i * 86_400_000);
    const clave = d.toISOString().slice(0, 10);
    dias.push({
      dia: clave,
      piezas: filas.filter((f) => f.programadaPara?.toISOString().slice(0, 10) === clave),
    });
  }
  return dias;
}

export async function descartarPieza(
  orgId: string,
  projectId: string,
  id: string,
): Promise<CreativePiece | null> {
  const pieza = await getPieza(orgId, projectId, id);
  if (!pieza) return null;
  const [fila] = await db
    .update(creativePieces)
    .set({ estado: 'descartada' })
    .where(eq(creativePieces.id, id))
    .returning();
  return fila ?? null;
}

/** Al publicar: la pieza queda atada al post que salió con ella. */
export async function marcarPublicada(id: string, postId: string | null): Promise<void> {
  await db
    .update(creativePieces)
    .set({ estado: 'publicada', ...(postId ? { postId } : {}) })
    .where(eq(creativePieces.id, id));
}

/**
 * La pieza aprobada más reciente de una red. Es lo que `publish-post` adjunta
 * cuando el usuario dice "publícalo" sin decir cuál imagen.
 */
export async function piezaAprobadaDe(
  orgId: string,
  projectId: string,
  red: RedSlug,
): Promise<CreativePiece | null> {
  const [fila] = await db
    .select()
    .from(creativePieces)
    .where(
      and(
        eq(creativePieces.orgId, orgId),
        eq(creativePieces.projectId, projectId),
        eq(creativePieces.red, red),
        eq(creativePieces.estado, 'aprobada'),
      ),
    )
    .orderBy(desc(creativePieces.aprobadaEn))
    .limit(1);
  return fila ?? null;
}

/** Cuántas piezas hay por red, para los filtros de la galería. */
export async function contarPorRed(
  orgId: string,
  projectId: string,
): Promise<Array<{ red: RedSlug; label: string; n: number }>> {
  const filas = await db
    .select({ red: creativePieces.red, estado: creativePieces.estado })
    .from(creativePieces)
    .where(and(eq(creativePieces.orgId, orgId), eq(creativePieces.projectId, projectId)));

  const mapa = new Map<string, number>();
  for (const f of filas) mapa.set(f.red, (mapa.get(f.red) ?? 0) + 1);

  return [...mapa.entries()]
    .map(([red, n]) => ({
      red: red as RedSlug,
      label: RED_LABEL[red as RedSlug] ?? red,
      n,
    }))
    .sort((a, b) => b.n - a.n);
}
