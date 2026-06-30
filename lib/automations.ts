import 'server-only';
import { and, eq, lte, desc, sql, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  funnels,
  funnelEnrollments,
  emailLog,
  leads,
  users,
  type Funnel,
  type FunnelStep,
  type Lead,
} from '@/src/db/schema';
import { isResendConfigured, sendEmail, renderTemplate, emailHtml } from './resend';

// ── Embudo de automatización con correos (addendum 681 punto 7) ──────────
// Flujo: un lead llega a cierto status (new/contacted/qualified) → si hay un
// funnel activo con ese trigger y el lead tiene email → se inscribe → el cron
// dispara la secuencia de correos vía Resend, paso a paso, respetando delays.

function normalizeSteps(input: unknown): FunnelStep[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((s: any) => ({
      delayHours: Math.max(0, Math.floor(Number(s?.delayHours) || 0)),
      subject: String(s?.subject ?? '').trim(),
      body: String(s?.body ?? '').trim(),
    }))
    .filter((s) => s.subject && s.body)
    .slice(0, 10);
}

export type FunnelWithStats = Funnel & {
  activeCount: number;
  completedCount: number;
  sentCount: number;
};

export async function listFunnels(userId: string): Promise<FunnelWithStats[]> {
  const rows = await db.select().from(funnels).where(eq(funnels.userId, userId)).orderBy(desc(funnels.createdAt));
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const enr = await db
    .select({ funnelId: funnelEnrollments.funnelId, status: funnelEnrollments.status })
    .from(funnelEnrollments)
    .where(inArray(funnelEnrollments.funnelId, ids));
  const sent = await db
    .select({ funnelId: emailLog.funnelId })
    .from(emailLog)
    .where(and(inArray(emailLog.funnelId, ids), eq(emailLog.status, 'sent')));

  return rows.map((f) => ({
    ...f,
    activeCount: enr.filter((e) => e.funnelId === f.id && e.status === 'active').length,
    completedCount: enr.filter((e) => e.funnelId === f.id && e.status === 'completed').length,
    sentCount: sent.filter((s) => s.funnelId === f.id).length,
  }));
}

export async function createFunnel(
  userId: string,
  input: { name: string; triggerStatus: string; steps: unknown },
): Promise<Funnel> {
  const steps = normalizeSteps(input.steps);
  if (steps.length === 0) throw new Error('El embudo necesita al menos un paso con asunto y cuerpo.');
  const [row] = await db
    .insert(funnels)
    .values({
      userId,
      name: input.name.trim() || 'Embudo sin nombre',
      triggerStatus: input.triggerStatus.trim() || 'new',
      steps,
    })
    .returning();
  if (!row) throw new Error('No se pudo crear el embudo.');
  return row;
}

export async function updateFunnel(
  userId: string,
  id: string,
  patch: { name?: string; triggerStatus?: string; enabled?: boolean; steps?: unknown },
): Promise<void> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name != null) set.name = patch.name.trim();
  if (patch.triggerStatus != null) set.triggerStatus = patch.triggerStatus.trim();
  if (patch.enabled != null) set.enabled = patch.enabled;
  if (patch.steps != null) {
    const steps = normalizeSteps(patch.steps);
    if (steps.length === 0) throw new Error('El embudo necesita al menos un paso.');
    set.steps = steps;
  }
  await db.update(funnels).set(set).where(and(eq(funnels.userId, userId), eq(funnels.id, id)));
}

export async function deleteFunnel(userId: string, id: string): Promise<void> {
  await db.delete(funnels).where(and(eq(funnels.userId, userId), eq(funnels.id, id)));
}

/**
 * Inscribe un lead en todos los embudos activos cuyo trigger coincida con el
 * status actual del lead. Sólo si el lead tiene email (sin email no hay a quién
 * enviarle — nada inventado). Idempotente: el índice único evita duplicar.
 */
export async function enrollLeadIfMatches(userId: string, lead: Lead): Promise<number> {
  if (!lead.email) return 0;
  const matching = await db
    .select()
    .from(funnels)
    .where(and(eq(funnels.userId, userId), eq(funnels.enabled, true), eq(funnels.triggerStatus, lead.status)));

  let enrolled = 0;
  for (const f of matching) {
    const steps = (f.steps ?? []) as FunnelStep[];
    if (steps.length === 0) continue;
    const firstDelay = steps[0].delayHours ?? 0;
    const nextRunAt = new Date(Date.now() + firstDelay * 3600 * 1000);
    const res = await db
      .insert(funnelEnrollments)
      .values({ funnelId: f.id, leadId: lead.id, userId, currentStep: 0, status: 'active', nextRunAt })
      .onConflictDoNothing({ target: [funnelEnrollments.funnelId, funnelEnrollments.leadId] })
      .returning();
    if (res.length > 0) enrolled++;
  }
  return enrolled;
}

/** Disparador desde leads.ts cuando cambia el status (o se crea el lead). */
export async function onLeadStatusChanged(userId: string, leadId: string): Promise<void> {
  try {
    const [lead] = await db.select().from(leads).where(and(eq(leads.userId, userId), eq(leads.id, leadId))).limit(1);
    if (lead) await enrollLeadIfMatches(userId, lead);
  } catch {
    // nunca tronar el flujo principal de leads por una falla de automatización
  }
}

export type ProcessResult = {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  details: Array<{ lead: string; subject: string; ok: boolean; error?: string }>;
};

/**
 * Procesa las inscripciones cuyo correo ya toca (next_run_at <= now). Envía el
 * paso actual vía Resend, lo registra en email_log y avanza al siguiente paso
 * (o cierra la inscripción). Lo llama el cron /api/cron/automations.
 */
export async function processDueEnrollments(limit = 50): Promise<ProcessResult> {
  const result: ProcessResult = { processed: 0, sent: 0, failed: 0, skipped: 0, details: [] };
  if (!isResendConfigured()) {
    result.skipped = -1; // señal: Resend apagado
    return result;
  }

  const now = new Date();
  const due = await db
    .select()
    .from(funnelEnrollments)
    .where(and(eq(funnelEnrollments.status, 'active'), lte(funnelEnrollments.nextRunAt, now)))
    .orderBy(funnelEnrollments.nextRunAt)
    .limit(limit);

  for (const enr of due) {
    result.processed++;
    const [funnel] = await db.select().from(funnels).where(eq(funnels.id, enr.funnelId)).limit(1);
    const [lead] = await db.select().from(leads).where(eq(leads.id, enr.leadId)).limit(1);
    const [user] = await db.select().from(users).where(eq(users.id, enr.userId)).limit(1);

    if (!funnel || !funnel.enabled || !lead || !lead.email) {
      await db
        .update(funnelEnrollments)
        .set({ status: 'stopped', nextRunAt: null, updatedAt: new Date() })
        .where(eq(funnelEnrollments.id, enr.id));
      result.skipped++;
      continue;
    }

    const steps = (funnel.steps ?? []) as FunnelStep[];
    const step = steps[enr.currentStep];
    if (!step) {
      await db
        .update(funnelEnrollments)
        .set({ status: 'completed', nextRunAt: null, updatedAt: new Date() })
        .where(eq(funnelEnrollments.id, enr.id));
      continue;
    }

    const vars = {
      nombre: lead.fullName,
      empresa: lead.company ?? lead.fullName,
      remitente: user?.brandName ?? funnel.name,
    };
    const subject = renderTemplate(step.subject, vars);
    const bodyText = renderTemplate(step.body, vars);
    const send = await sendEmail({
      to: lead.email,
      subject,
      html: emailHtml(bodyText, user?.brandName),
      text: bodyText,
    });

    await db.insert(emailLog).values({
      userId: enr.userId,
      leadId: lead.id,
      funnelId: funnel.id,
      toEmail: lead.email,
      subject,
      step: enr.currentStep,
      provider: 'resend',
      status: send.ok ? 'sent' : 'failed',
      error: send.error,
      externalId: send.id,
    });

    result.details.push({ lead: lead.fullName ?? lead.email, subject, ok: send.ok, error: send.error ?? undefined });
    if (send.ok) result.sent++;
    else result.failed++;

    // Avanza al siguiente paso aunque falle el envío (no reintenta en bucle).
    const nextStep = enr.currentStep + 1;
    if (nextStep < steps.length) {
      const nextRunAt = new Date(Date.now() + (steps[nextStep].delayHours ?? 0) * 3600 * 1000);
      await db
        .update(funnelEnrollments)
        .set({ currentStep: nextStep, nextRunAt, updatedAt: new Date() })
        .where(eq(funnelEnrollments.id, enr.id));
    } else {
      await db
        .update(funnelEnrollments)
        .set({ status: 'completed', nextRunAt: null, updatedAt: new Date() })
        .where(eq(funnelEnrollments.id, enr.id));
    }
  }

  return result;
}

export async function listEmailLog(userId: string, limit = 30) {
  return db.select().from(emailLog).where(eq(emailLog.userId, userId)).orderBy(desc(emailLog.sentAt)).limit(limit);
}

export async function funnelEnrollmentSummary(userId: string) {
  const rows = await db
    .select({ status: funnelEnrollments.status, count: sql<number>`count(*)::int` })
    .from(funnelEnrollments)
    .where(eq(funnelEnrollments.userId, userId))
    .groupBy(funnelEnrollments.status);
  const out = { active: 0, completed: 0, stopped: 0 };
  for (const r of rows) {
    if (r.status === 'active') out.active = r.count;
    else if (r.status === 'completed') out.completed = r.count;
    else if (r.status === 'stopped') out.stopped = r.count;
  }
  return out;
}
