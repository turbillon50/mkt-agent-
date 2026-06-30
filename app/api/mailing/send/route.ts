import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { sendCampaignNow, scheduleCampaign } from '@/lib/mailing';
import { isResendConfigured } from '@/lib/resend';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Envia AHORA o PROGRAMA una campaña existente.
export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const campaignId = String(body.campaignId ?? '').trim();
    if (!campaignId) return NextResponse.json({ error: 'falta campaignId' }, { status: 400 });

    if (body.scheduleAt) {
      await scheduleCampaign(user.id, campaignId, String(body.scheduleAt));
      return NextResponse.json({ ok: true, scheduled: true });
    }

    if (!isResendConfigured()) {
      return NextResponse.json(
        { error: 'El motor de correo (Resend) no está configurado. Pídele a Luis que inyecte RESEND_API_KEY.' },
        { status: 400 },
      );
    }
    const report = await sendCampaignNow(user.id, campaignId, {
      dedupeHours: typeof body.dedupeHours === 'number' ? body.dedupeHours : undefined,
    });
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 });
  }
}
