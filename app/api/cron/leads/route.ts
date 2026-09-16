import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { campaigns, socialAccounts } from '@/src/db/schema';
import { composioReady } from '@/src/composio/client';
import { leadsPorComposio } from '@/src/channels';
import { pollProject, type PollResult } from '@/src/sales/composio-leads';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/**
 * Los leads de Meta, cada 5 minutos (vercel.json).
 *
 * Es el segundo camino, no el único: el webhook sigue vivo y trae los leads en
 * el segundo en que entran. Esto es la red por debajo — un webhook perdido, una
 * página que nunca se suscribió, un proyecto recién creado que todavía no tiene
 * nada dado de alta en el panel de Facebook. Los dos escriben con la misma
 * llave (`leadgen_id`), así que traer el mismo lead dos veces no lo duplica.
 *
 * Solo mira los proyectos que tienen Facebook conectado por Composio. Nunca
 * devuelve 500: un proyecto que falla es un dato, no una caída del cron.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get('authorization');
  const isVercelCron = header === `Bearer ${secret}` || req.headers.get('x-vercel-cron') === '1';
  if (secret && !isVercelCron) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!composioReady() || !leadsPorComposio()) {
    return NextResponse.json({ ok: true, omitido: 'los leads no entran por Composio aquí' });
  }

  const started = Date.now();
  const filas = await db
    .select({ projectId: socialAccounts.campaignId })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.platform, 'facebook'),
        eq(socialAccounts.status, 'connected'),
        isNotNull(socialAccounts.campaignId),
      ),
    );
  const ids = [...new Set(filas.map((f) => f.projectId).filter(Boolean) as string[])];
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, proyectos: 0, nuevos: 0, repetidos: 0, ms: Date.now() - started });
  }

  const proyectos = await db.select().from(campaigns).where(inArray(campaigns.id, ids));
  const resultados: PollResult[] = [];
  for (const project of proyectos) {
    resultados.push(await pollProject(project));
  }

  return NextResponse.json({
    ok: true,
    proyectos: proyectos.length,
    revisados: resultados.reduce((a, r) => a + r.revisados, 0),
    nuevos: resultados.reduce((a, r) => a + r.nuevos, 0),
    repetidos: resultados.reduce((a, r) => a + r.repetidos, 0),
    errores: resultados.filter((r) => r.error).map((r) => ({ project: r.projectId, error: r.error })),
    ms: Date.now() - started,
  });
}
