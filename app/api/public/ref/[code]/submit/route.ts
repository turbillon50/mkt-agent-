import { NextRequest, NextResponse } from 'next/server';
import { getReferralByCode, registerReferredLead, refUrl } from '@/lib/referrals';
import { capturePublicLead } from '@/lib/public-leads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const whatsapp = String(body.whatsapp ?? '').trim();

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Pon un correo válido.' }, { status: 400 });
    }

    const referral = await getReferralByCode(code);
    if (!referral) {
      return NextResponse.json({ error: 'no encontrada' }, { status: 404 });
    }

    await capturePublicLead({
      userId: referral.userId,
      source: 'referido',
      publicUrl: refUrl(code),
      email,
      name: name || null,
      phone: whatsapp || null,
    });

    await registerReferredLead(code);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 });
  }
}
