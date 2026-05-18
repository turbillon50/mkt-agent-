import { NextRequest, NextResponse } from 'next/server';
import { isClerkConfigured } from '@/lib/clerk-config';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Turn = { role: 'user' | 'assistant'; content: string };

const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // ~6MB after base64 decode

function sniffMime(dataUrl: string): string | null {
  const m = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!m) return null;
  const head = Buffer.from(m[1]!.slice(0, 64), 'base64');
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'image/png';
  if (head.slice(0, 4).toString() === 'RIFF' && head.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  const gif = head.slice(0, 6).toString();
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif';
  if (head[0] === 0x42 && head[1] === 0x4d) return 'image/bmp';
  if (head[0] === 0x00 && head[1] === 0x00 && (head[2] === 0x00 || head[2] === 0x01)) return 'image/x-icon';
  if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) return 'image/heic';
  return null;
}

function normalizeDataUrl(dataUrl: string): string {
  const actual = sniffMime(dataUrl);
  if (!actual) return dataUrl;
  return dataUrl.replace(/^data:[^;]+;base64,/, `data:${actual};base64,`);
}

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
  let image = typeof body?.image === 'string' ? body.image : null;

  if (!prompt && !image) return NextResponse.json({ error: 'prompt or image required' }, { status: 400 });
  if (image) {
    const v = validateDataUrl(image);
    if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 400 });
    // iOS sometimes mislabels screenshots (claims jpeg, bytes are PNG).
    // Sniff the real MIME from the magic bytes and rewrite the prefix.
    image = normalizeDataUrl(image);
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
