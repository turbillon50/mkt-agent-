import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { campaigns } from '@/src/db/schema';
import { evaluateProject } from '@/src/rules';
import { runQueue } from '@/src/sales/runner';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Corre cada minuto (vercel.json). Dos pasos:
 *   1. las reglas barren los leads y ENCOLAN lo que toca;
 *   2. el runner ejecuta lo `approved` y lo `auto` con rate limit.
 *
 * Nunca devuelve 500 por una falla de un proyecto: si el cron se cae, se
 * detiene toda la operación. Los errores se reportan por proyecto.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get('authorization');
  const isVercelCron = header === `Bearer ${secret}` || req.headers.get('x-vercel-cron') === '1';
  if (secret && !isVercelCron) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const projects = await db.select().from(campaigns).where(eq(campaigns.status, 'active'));

  let enqueued = 0;
  const errors: Array<{ project: string; error: string }> = [];
  for (const project of projects) {
    try {
      const hits = await evaluateProject(project);
      enqueued += hits.length;
    } catch (e) {
      errors.push({ project: project.slug, error: e instanceof Error ? e.message : 'error' });
    }
  }

  let run;
  try {
    run = await runQueue();
  } catch (e) {
    errors.push({ project: '*', error: e instanceof Error ? e.message : 'runner error' });
    run = { considered: 0, executed: 0, skipped: 0, failed: 0, byKind: {}, waiting: [] };
  }

  return NextResponse.json({
    ok: errors.length === 0,
    proyectos: projects.length,
    encoladas: enqueued,
    ...run,
    errores: errors,
    ms: Date.now() - started,
  });
}
