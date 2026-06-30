import { NextRequest, NextResponse } from 'next/server';
import { getLandingBySlug, registerSubmission, landingUrl } from '@/lib/campaign-landings';
import { capturePublicLead } from '@/lib/public-leads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const whatsapp = String(body.whatsapp ?? '').trim();

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Pon un correo válido.' }, { status: 400 });
    }

    const landing = await getLandingBySlug(slug);
    if (!landing || !landing.published) {
      return NextResponse.json({ error: 'no encontrada' }, { status: 404 });
    }

    await capturePublicLead({
      userId: landing.userId,
      source: 'landing_campana',
      publicUrl: landingUrl(slug),
      email,
      name: name || null,
      phone: whatsapp || null,
      campaignId: landing.campaignId,
    });

    await registerSubmission(slug);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 });
  }
}
