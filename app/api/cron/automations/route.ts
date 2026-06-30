import { NextRequest, NextResponse } from 'next/server';
import { processDueEnrollments } from '@/lib/automations';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

// Cron del embudo (addendum 681 punto 7): cada corrida procesa las
// inscripciones cuyo correo ya toca y dispara el siguiente paso vía Resend.
// Protegido con CRON_SECRET igual que /api/cron/run.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get('authorization');
  const isVercelCron = header === `Bearer ${secret}` || req.headers.get('x-vercel-cron') === '1';
  if (secret && !isVercelCron) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const result = await processDueEnrollments(80);
    if (result.skipped === -1) {
      return NextResponse.json({ ok: true, skipped: 'RESEND_API_KEY no configurada' });
    }
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'cron error' }, { status: 500 });
  }
}
