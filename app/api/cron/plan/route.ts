import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get('authorization');
  const isVercelCron = header === `Bearer ${secret}` || req.headers.get('x-vercel-cron') === '1';
  if (secret && !isVercelCron) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const { buildPlan } = await import('@/src/planner');
    const result = await buildPlan();
    return NextResponse.json({ ok: true, planId: result.planId, items: result.items.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'cron plan error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
