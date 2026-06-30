import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { listFunnels, createFunnel, listEmailLog, funnelEnrollmentSummary } from '@/lib/automations';
import { isResendConfigured, resendFrom } from '@/lib/resend';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const [funnels, log, summary] = await Promise.all([
      listFunnels(user.id),
      listEmailLog(user.id, 30),
      funnelEnrollmentSummary(user.id),
    ]);
    return NextResponse.json({
      funnels,
      log,
      summary,
      mailer: { configured: isResendConfigured(), from: isResendConfigured() ? resendFrom() : null },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const funnel = await createFunnel(user.id, {
      name: String(body.name ?? '').trim(),
      triggerStatus: String(body.triggerStatus ?? 'new').trim(),
      steps: body.steps,
    });
    return NextResponse.json({ funnel });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 });
  }
}
