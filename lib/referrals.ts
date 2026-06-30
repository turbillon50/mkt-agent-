import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { referrals, type Referral } from '@/src/db/schema';
import { appUrl, referralCode } from './public-links';

// ── (5) Embajadores gamificados (referidos) ──────────────────────────────
// Cada embajador tiene un codigo unico y un link publico vliving.life/ref/[code].
// El link cuenta visitas; cuando un visitante deja sus datos se cuenta un lead
// generado; las ventas se suman manual desde el panel (boton +1 venta). El nivel
// (bronce/plata/oro) sube segun las ventas generadas — ranking por ventas.

/** Nivel del embajador segun ventas: bronce (<3), plata (3-9), oro (>=10). */
export function computeLevel(sales: number): string {
  if (sales >= 10) return 'oro';
  if (sales >= 3) return 'plata';
  return 'bronce';
}

/** Link publico del embajador. */
export function refUrl(code: string): string {
  return `${appUrl()}/ref/${code}`;
}

/** Lista de embajadores ordenada por ventas (ranking). */
export async function listReferrals(userId: string): Promise<Referral[]> {
  return db
    .select()
    .from(referrals)
    .where(eq(referrals.userId, userId))
    .orderBy(desc(referrals.salesGenerated), desc(referrals.createdAt));
}

export async function getReferralByCode(code: string): Promise<Referral | null> {
  const [row] = await db.select().from(referrals).where(eq(referrals.code, code)).limit(1);
  return row ?? null;
}

export type CreateReferralInput = {
  name?: string | null;
  leadId?: string | null;
};

export async function createReferral(userId: string, input: CreateReferralInput): Promise<Referral> {
  const name = input.name?.trim() || null;
  const leadId = input.leadId?.trim() || null;

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = referralCode(name);
    try {
      const [row] = await db
        .insert(referrals)
        .values({ userId, leadId, code, name })
        .returning();
      if (row) return row;
    } catch (e) {
      lastErr = e; // probable choque del unique de code: reintentamos
    }
  }
  throw new Error(lastErr instanceof Error ? lastErr.message : 'No se pudo crear el embajador.');
}

export type UpdateReferralInput = Partial<{
  addSale: boolean;
  name: string;
}>;

export async function updateReferral(userId: string, id: string, patch: UpdateReferralInput): Promise<void> {
  if (patch.addSale) {
    const [row] = await db
      .select({ salesGenerated: referrals.salesGenerated })
      .from(referrals)
      .where(and(eq(referrals.userId, userId), eq(referrals.id, id)))
      .limit(1);
    if (!row) throw new Error('Embajador no encontrado.');
    const nextSales = row.salesGenerated + 1;
    await db
      .update(referrals)
      .set({ salesGenerated: nextSales, level: computeLevel(nextSales), updatedAt: new Date() })
      .where(and(eq(referrals.userId, userId), eq(referrals.id, id)));
    return;
  }

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name != null) set.name = patch.name.trim() || null;
  await db.update(referrals).set(set).where(and(eq(referrals.userId, userId), eq(referrals.id, id)));
}

export async function deleteReferral(userId: string, id: string): Promise<void> {
  await db.delete(referrals).where(and(eq(referrals.userId, userId), eq(referrals.id, id)));
}

/** Cuenta una visita al link publico y devuelve la referral (o null si no existe). */
export async function registerVisit(code: string): Promise<Referral | null> {
  const [row] = await db
    .update(referrals)
    .set({ visits: sql`${referrals.visits} + 1` })
    .where(eq(referrals.code, code))
    .returning();
  return row ?? null;
}

/** Cuenta un lead generado por el embajador. */
export async function registerReferredLead(code: string): Promise<boolean> {
  const rows = await db
    .update(referrals)
    .set({ leadsGenerated: sql`${referrals.leadsGenerated} + 1` })
    .where(eq(referrals.code, code))
    .returning({ id: referrals.id });
  return rows.length > 0;
}
