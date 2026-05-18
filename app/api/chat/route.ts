import { NextRequest, NextResponse } from 'next/server';
import { isClerkConfigured } from '@/lib/clerk-config';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Turn = { role: 'user' | 'assistant'; content: string };

const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // ~6MB after base64 decode

function validateDataUrl(s: string): { ok: boolean; reason?: string } {
  if (!s.startsWith('data:image/')) return { ok: false, reason: 'not an image data url' };
  const commaIdx = s.indexOf(',');
  if (commaIdx < 0) return { ok: false, reason: 'malformed data url' };
  const b64 = s.slice(commaIdx + 1);
  const approxBytes = Math.floor(b64.length * 0.75);
  if (approxBytes > MAX_IMAGE_BYTES) return { ok: false, reason: 'image too large' };
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  const image = typeof body?.image === 'string' ? body.image : null;

  if (!prompt && !image) return NextResponse.json({ error: 'prompt or image required' }, { status: 400 });
  if (image) {
    const v = validateDataUrl(image);
    if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 400 });
  }

  let userId: string | null = null;
  let campaign: { name: string; brandVoice?: string | null; brandTopics?: string | null; brandLanguage?: string | null; manifesto?: string | null } | null = null;

  if (isClerkConfigured()) {
    try {
      const { getOrCreateUser } = await import('@/lib/users');
      const user = await getOrCreateUser();
      if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      userId = user.id;
      if (user.activeCampaignId) {
        const { getActiveCampaign } = await import('@/lib/campaigns');
        campaign = await getActiveCampaign(user.id);
      }
    } catch {
      return NextResponse.json({ error: 'auth failed' }, { status: 401 });
    }
  }

  try {
    const { askWithHistoryForCampaign } = await import('@/src/agent/index');
    const { getRecentMessages, saveMessage } = userId
      ? await import('@/lib/conversations')
      : ({ getRecentMessages: async () => [], saveMessage: async () => ({}) } as any);

    const history = userId ? await getRecentMessages(userId) : [];
    const turns: Turn[] = history.map((m: any) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

    const reply = await askWithHistoryForCampaign(turns, prompt || 'Mira esta imagen y dime qué ves.', campaign, userId, image);

    if (userId) {
      await saveMessage({
        userId,
        role: 'user',
        content: prompt || '(imagen)',
        metadata: image ? { hasImage: true } : undefined,
      }).catch(() => undefined);
      await saveMessage({
        userId,
        role: 'assistant',
        content: reply,
        metadata: campaign ? { campaign: campaign.name } : undefined,
      }).catch(() => undefined);
    }

    return NextResponse.json({ reply, campaign: campaign?.name ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'agent error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  if (!isClerkConfigured()) return NextResponse.json({ messages: [] });
  try {
    const { getOrCreateUser } = await import('@/lib/users');
    const user = await getOrCreateUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const { getRecentMessages } = await import('@/lib/conversations');
    const messages = await getRecentMessages(user.id);
    return NextResponse.json({ messages: messages.map((m) => ({ role: m.role, content: m.content })) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ messages: [], error: msg }, { status: 200 });
  }
}
