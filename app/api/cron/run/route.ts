import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get('authorization');
  const isVercelCron = header === `Bearer ${secret}` || req.headers.get('x-vercel-cron') === '1';
  if (secret && !isVercelCron) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const { publicarProgramadas, runOnce } = await import('@/src/runner');
    /**
     * Primero lo PROGRAMADO y después lo automático.
     *
     * El orden importa: lo programado es lo que una persona ya aprobó y le puso
     * hora, así que sale sí o sí. Lo automático solo sale en los proyectos que
     * subieron a nivel 2 y activaron la red, y no debería adelantarse a lo que
     * el cliente planeó para esa hora.
     */
    const programadas = await publicarProgramadas({ dryRun: false });
    const result = await runOnce({ dryRun: false });
    return NextResponse.json({ ok: true, programadas, result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'cron run error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
