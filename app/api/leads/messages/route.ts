import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { generateOutreachMessages } from '@/lib/leads';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const leadIds = Array.isArray(body.leadIds) ? body.leadIds.filter((x: unknown) => typeof x === 'string') : [];
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() || undefined : undefined;
    if (leadIds.length === 0) return NextResponse.json({ error: 'Selecciona al menos un prospecto' }, { status: 400 });
    if (leadIds.length > 15) {
      return NextResponse.json({ error: 'Máximo 15 a la vez (para no saturar).' }, { status: 400 });
    }

    let brand: { name: string; voice?: string | null } | null = null;
    if (user.activeCampaignId) {
      const { getActiveCampaign } = await import('@/lib/campaigns');
      const campaign = await getActiveCampaign(user.id);
      if (campaign) brand = { name: campaign.name, voice: campaign.brandVoice };
    }

    const updated = await generateOutreachMessages(user.id, leadIds, prompt, brand);
    return NextResponse.json({ leads: updated });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
