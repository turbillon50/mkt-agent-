import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { updateHotLeadSettings } from '@/lib/lead-signals';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const settings = await updateHotLeadSettings(user.id, {
      threshold: body.threshold != null ? Number(body.threshold) : undefined,
      alertsEnabled: typeof body.alertsEnabled === 'boolean' ? body.alertsEnabled : undefined,
      alertWhatsappNumber: typeof body.alertWhatsappNumber === 'string' ? body.alertWhatsappNumber : undefined,
      dmAiEnabled: typeof body.dmAiEnabled === 'boolean' ? body.dmAiEnabled : undefined,
    });
    return NextResponse.json({ settings });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 });
  }
}
