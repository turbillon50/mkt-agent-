import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { membershipPlans, type MembershipPlan } from '@/src/db/schema';

// ── (4) Suscripciones / Membresías VIP ───────────────────────────────────
// El influencer crea planes VIP (mensual / anual / único). Por ahora NO hay
// pasarela de pago real: se genera un link de WhatsApp (wa.me) con el detalle
// del plan para cerrar la venta de forma manual, con botón de copiar.
//
// TODO: integrar Stripe/MercadoPago aquí. Cuando exista pasarela, este lib
// generará un checkout real (sesión de pago) en lugar — o además — del link
// de WhatsApp. La columna conceptual `paymentProvider` ('whatsapp' por defecto,
// luego 'stripe' | 'mercadopago') indicará qué flujo usa cada plan.

export type Membership = MembershipPlan & { whatsappLink: string | null };

/** Arma el link de WhatsApp (wa.me) con el detalle del plan para cierre manual. */
export function whatsappCheckoutLink(plan: MembershipPlan): string | null {
  const digits = (plan.whatsappNumber ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const benefits = Array.isArray(plan.benefits) ? plan.benefits.filter(Boolean) : [];
  const benefitsText = benefits.length ? benefits.join(', ') : 'sin beneficios listados';
  const message = `Hola, quiero suscribirme al plan ${plan.name} (${plan.price} ${plan.currency}/${plan.interval}). Beneficios: ${benefitsText}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** Decora un plan con su link de WhatsApp ya armado. */
export function withWhatsappLink(plan: MembershipPlan): Membership {
  return { ...plan, whatsappLink: whatsappCheckoutLink(plan) };
}

export async function listPlans(userId: string): Promise<Membership[]> {
  const rows = await db
    .select()
    .from(membershipPlans)
    .where(eq(membershipPlans.userId, userId))
    .orderBy(desc(membershipPlans.createdAt));
  return rows.map(withWhatsappLink);
}

export type CreatePlanInput = {
  name: string;
  description?: string | null;
  price: string;
  currency?: string | null;
  interval?: string | null;
  benefits: string[];
  whatsappNumber?: string | null;
};

const INTERVALS = ['mensual', 'anual', 'único'];

function cleanBenefits(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((b) => (typeof b === 'string' ? b.trim() : ''))
    .filter((b) => b.length > 0);
}

export async function createPlan(userId: string, input: CreatePlanInput): Promise<Membership> {
  const name = (input.name ?? '').trim();
  if (!name) throw new Error('El plan necesita un nombre.');
  const price = (input.price ?? '').trim();
  if (!price) throw new Error('El plan necesita un precio.');
  const interval = INTERVALS.includes((input.interval ?? '').trim()) ? (input.interval as string).trim() : 'mensual';

  const [row] = await db
    .insert(membershipPlans)
    .values({
      userId,
      name,
      description: input.description?.trim() || null,
      price,
      currency: (input.currency?.trim() || 'MXN').toUpperCase().slice(0, 8),
      interval,
      benefits: cleanBenefits(input.benefits),
      whatsappNumber: input.whatsappNumber?.trim() || null,
    })
    .returning();
  if (!row) throw new Error('No se pudo crear el plan.');
  return withWhatsappLink(row);
}

export type UpdatePlanInput = Partial<{
  name: string;
  description: string | null;
  price: string;
  currency: string | null;
  interval: string | null;
  benefits: string[];
  whatsappNumber: string | null;
  active: boolean;
}>;

export async function updatePlan(userId: string, id: string, patch: UpdatePlanInput): Promise<void> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name != null) set.name = patch.name.trim();
  if (patch.description !== undefined) set.description = patch.description?.trim() || null;
  if (patch.price != null) set.price = patch.price.trim();
  if (patch.currency != null) set.currency = patch.currency.trim().toUpperCase().slice(0, 8);
  if (patch.interval != null && INTERVALS.includes(patch.interval.trim())) set.interval = patch.interval.trim();
  if (patch.benefits !== undefined) set.benefits = cleanBenefits(patch.benefits);
  if (patch.whatsappNumber !== undefined) set.whatsappNumber = patch.whatsappNumber?.trim() || null;
  if (patch.active != null) set.active = patch.active;
  await db.update(membershipPlans).set(set).where(and(eq(membershipPlans.userId, userId), eq(membershipPlans.id, id)));
}

export async function deletePlan(userId: string, id: string): Promise<void> {
  await db.delete(membershipPlans).where(and(eq(membershipPlans.userId, userId), eq(membershipPlans.id, id)));
}
