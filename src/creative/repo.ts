/**
 * Las piezas en la base: guardarlas, listarlas y aprobarlas.
 *
 * Cada pieza guarda con qué se hizo: el prompt completo, el modelo, el motor
 * que la compuso y una FOTO del kit de marca de ese momento. Sin eso, una pieza
 * que salió bien no se puede repetir y una que salió mal no se puede explicar.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
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
    .set({ estado: 'aprobada', aprobadaPor: quien, aprobadaEn: ahora })
    .where(eq(creativePieces.id, id))
    .returning();

  if (pieza.loteId) {
    const hermanas = await db
      .select({ id: creativePieces.id })
      .from(creativePieces)
      .where(and(eq(creativePieces.loteId, pieza.loteId), eq(creativePieces.estado, 'propuesta')));
    const otras = hermanas.map((h) => h.id).filter((h) => h !== id);
    if (otras.length) {
      await db
        .update(creativePieces)
        .set({ estado: 'descartada' })
        .where(inArray(creativePieces.id, otras));
    }
  }

  return fila ?? null;
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
