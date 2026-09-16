/**
 * Enlaces de conexión: "pídele a alguien que conecte su Facebook a este
 * proyecto".
 *
 * El caso real es el community manager o el dueño de la página del cliente, que
 * no tiene por qué ser usuario de Goossip ni ver los leads de nadie. Se le
 * manda un enlace, entra, da permiso y se acabó.
 *
 * Tres candados:
 *   1. Un solo uso — al quemarse se estampa `used_at` y `used_by`.
 *   2. 72 horas de vida.
 *   3. En la base solo vive el sha256 del token. Llevarse la tabla no da ni un
 *      enlace usable.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { campaigns, connectionLinks, type ConnectionLink, type Project } from '../db/schema';
import type { ConnectionChannel } from './types';

export type { ConnectionLink };

/** 72 horas, como pide el issue. */
export const LINK_TTL_HOURS = 72;

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * 32 bytes de aleatoriedad real en base64url. Nada de timestamps ni ids
 * correlativos: un token adivinable es un token público.
 */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export interface CreateLinkInput {
  orgId: string;
  projectId: string;
  channel: ConnectionChannel;
  createdBy: string;
  note?: string | null;
  ttlHours?: number;
  /** Inyectable para poder probar la expiración sin esperar tres días. */
  now?: Date;
}

/** Devuelve la fila y el token EN CLARO. El token no se vuelve a poder leer. */
export async function createConnectionLink(
  input: CreateLinkInput,
): Promise<{ link: ConnectionLink; token: string }> {
  const token = newToken();
  const now = input.now ?? new Date();
  const [row] = await db
    .insert(connectionLinks)
    .values({
      orgId: input.orgId,
      projectId: input.projectId,
      channel: input.channel,
      tokenHash: hashToken(token),
      createdBy: input.createdBy,
      note: input.note ?? null,
      expiresAt: new Date(now.getTime() + (input.ttlHours ?? LINK_TTL_HOURS) * 3600_000),
      createdAt: now,
    })
    .returning();
  if (!row) throw new Error('No se pudo crear el enlace de conexión.');
  return { link: row, token };
}

export type LinkProblem = 'no_existe' | 'usado' | 'expirado' | 'cancelado';

export type LinkResolution =
  | { ok: true; link: ConnectionLink; project: Project }
  | { ok: false; problem: LinkProblem };

/**
 * Resuelve un token SIN quemarlo: es lo que ve la página antes de que la
 * persona apriete el botón. Un enlace no se gasta por abrirlo — un prefetch del
 * navegador o un antivirus de correo lo dejarían inútil.
 */
export async function resolveConnectionLink(
  token: string,
  now: Date = new Date(),
): Promise<LinkResolution> {
  const rows = await db
    .select({ link: connectionLinks, project: campaigns })
    .from(connectionLinks)
    .innerJoin(campaigns, eq(campaigns.id, connectionLinks.projectId))
    .where(eq(connectionLinks.tokenHash, hashToken(token)))
    .limit(1);

  const found = rows[0];
  if (!found) return { ok: false, problem: 'no_existe' };

  // El hash ya es único, pero la comparación final va en tiempo constante por
  // costumbre: es gratis y cierra la puerta a medir el índice.
  const a = Buffer.from(found.link.tokenHash, 'hex');
  const b = Buffer.from(hashToken(token), 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, problem: 'no_existe' };

  if (found.link.revokedAt) return { ok: false, problem: 'cancelado' };
  if (found.link.usedAt) return { ok: false, problem: 'usado' };
  if (found.link.expiresAt.getTime() <= now.getTime()) return { ok: false, problem: 'expirado' };
  return { ok: true, link: found.link, project: found.project };
}

/**
 * Quema el enlace. El `where` repite TODAS las condiciones para que dos
 * pestañas abiertas al mismo tiempo no lo usen dos veces: la segunda no
 * actualiza ninguna fila y se va con `usado`.
 */
export async function redeemConnectionLink(
  token: string,
  usedBy: string,
  now: Date = new Date(),
): Promise<LinkResolution> {
  const resolution = await resolveConnectionLink(token, now);
  if (!resolution.ok) return resolution;

  const [row] = await db
    .update(connectionLinks)
    .set({ usedAt: now, usedBy })
    .where(
      and(
        eq(connectionLinks.id, resolution.link.id),
        // `is null` explícito: es lo que hace que la carrera la gane uno solo.
        eq(connectionLinks.tokenHash, resolution.link.tokenHash),
      ),
    )
    .returning();

  if (!row || !row.usedAt) return { ok: false, problem: 'usado' };
  return { ok: true, link: row, project: resolution.project };
}

export async function listConnectionLinks(
  orgId: string,
  projectId: string,
  limit = 20,
): Promise<ConnectionLink[]> {
  return db
    .select()
    .from(connectionLinks)
    .where(and(eq(connectionLinks.orgId, orgId), eq(connectionLinks.projectId, projectId)))
    .orderBy(desc(connectionLinks.createdAt))
    .limit(limit);
}

export async function revokeConnectionLink(
  orgId: string,
  projectId: string,
  id: string,
): Promise<ConnectionLink | null> {
  const [row] = await db
    .update(connectionLinks)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(connectionLinks.orgId, orgId),
        eq(connectionLinks.projectId, projectId),
        eq(connectionLinks.id, id),
      ),
    )
    .returning();
  return row ?? null;
}

/** Estado legible de un enlace, para la pantalla de Equipo. */
export function linkState(link: ConnectionLink, now: Date = new Date()):
  | 'activo'
  | 'usado'
  | 'expirado'
  | 'cancelado' {
  if (link.revokedAt) return 'cancelado';
  if (link.usedAt) return 'usado';
  if (link.expiresAt.getTime() <= now.getTime()) return 'expirado';
  return 'activo';
}
