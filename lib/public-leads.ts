import 'server-only';
import { db } from '@/src/db/client';
import { leads, type Lead } from '@/src/db/schema';
import { onLeadStatusChanged } from './automations';

// Captura un lead desde una pagina publica (landing, referido, votacion).
// Centraliza el insert para respetar el unico (user_id, source_url): el
// sourceUrl incluye el email para que cada contacto sea un lead distinto y
// los reenvios actualicen el mismo registro (no duplican). Dispara los
// embudos por status y deja registrado el origen.
export type CapturePublicLeadInput = {
  userId: string;
  source: string; // 'landing_campana' | 'referido' | 'votacion' | 'comentario'
  publicUrl: string; // url de la pagina publica (para trazar el origen)
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  company?: string | null;
  campaignId?: string | null;
  summary?: string | null;
};

export async function capturePublicLead(input: CapturePublicLeadInput): Promise<Lead | null> {
  const email = input.email?.trim().toLowerCase() || null;
  const name = input.name?.trim() || null;
  if (!email && !name) return null; // sin nada para identificar, no creamos lead

  // sourceUrl unico por contacto: respeta el indice (user_id, source_url).
  const key = email || name || Math.random().toString(36).slice(2);
  const sourceUrl = `${input.publicUrl}#${encodeURIComponent(key)}`;

  const [row] = await db
    .insert(leads)
    .values({
      userId: input.userId,
      campaignId: input.campaignId ?? null,
      sourceUrl,
      platform: 'web',
      source: input.source,
      fullName: name,
      email,
      phone: input.phone?.trim() || null,
      company: input.company?.trim() || null,
      summary: input.summary?.trim() || null,
      status: 'new',
    })
    .onConflictDoUpdate({
      target: [leads.userId, leads.sourceUrl],
      set: {
        ...(name ? { fullName: name } : {}),
        ...(input.phone ? { phone: input.phone.trim() } : {}),
        updatedAt: new Date(),
      },
    })
    .returning();

  if (row) {
    try {
      await onLeadStatusChanged(input.userId, row.id);
    } catch {
      /* nunca tronar la captura por una falla de automatizacion */
    }
    try {
      // Toda captura pública es una señal de compra para hot-leads (#7).
      const { recordSignal } = await import('./lead-signals');
      await recordSignal({ userId: input.userId, leadId: row.id, type: input.source, weight: 2 });
    } catch {
      /* señales son best-effort */
    }
  }
  return row ?? null;
}
