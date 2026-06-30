import { NextRequest, NextResponse } from 'next/server';
import { processScheduledCampaigns } from '@/lib/mailing';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Cron del mailing: envía las campañas programadas cuya hora ya llegó.
// Protegido con CRON_SECRET igual que los demás crons.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get('authorization');
  const isVercelCron = header === `Bearer ${secret}` || req.headers.get('x-vercel-cron') === '1';
  if (secret && !isVercelCron) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const result = await processScheduledCampaigns();
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'cron error' }, { status: 500 });
  }
}
