import { NextRequest, NextResponse } from 'next/server';
import { isClerkConfigured } from '@/lib/clerk-config';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (isClerkConfigured()) {
    try {
      const { getOrCreateUser } = await import('@/lib/users');
      const user = await getOrCreateUser();
      if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    } catch {
      return NextResponse.json({ error: 'auth failed' }, { status: 401 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const platform = body?.platform === 'linkedin' ? 'linkedin' : body?.platform === 'twitter' ? 'twitter' : null;
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  const topic = typeof body?.topic === 'string' ? body.topic : undefined;

  if (!platform) return NextResponse.json({ error: 'platform inválido' }, { status: 400 });
  if (!text) return NextResponse.json({ error: 'texto vacío' }, { status: 400 });

  try {
    const { getPoster } = await import('@/src/posters/index');
    const { db } = await import('@/src/db/client');
    const { posts } = await import('@/src/db/schema');

    const poster = getPoster(platform);
    const out = await poster.post(text);

    const [row] = await db
      .insert(posts)
      .values({
        platform,
        text,
        topic: topic ?? null,
        externalId: out.id,
        externalUrl: out.url,
        publishedAt: new Date(),
      })
      .returning({ id: posts.id });

    return NextResponse.json({ ok: true, externalUrl: out.url ?? null, postId: row?.id ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'No se pudo publicar.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
