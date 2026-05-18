import { NextRequest, NextResponse } from 'next/server';
import { isClerkConfigured } from '@/lib/clerk-config';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Turn = { role: 'user' | 'assistant'; content: string };

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 });

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
    } catch (e) {
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

    const reply = await askWithHistoryForCampaign(turns, prompt, campaign, userId);

    if (userId) {
      await saveMessage({ userId, role: 'user', content: prompt }).catch(() => undefined);
      await saveMessage({ userId, role: 'assistant', content: reply, metadata: campaign ? { campaign: campaign.name } : undefined }).catch(() => undefined);
    }

    return NextResponse.json({ reply, campaign: campaign?.name ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'agent error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
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
