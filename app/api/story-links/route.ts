import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { listStoryLinks, createStoryLink } from '@/lib/story-links';
import type { StoryRule } from '@/src/db/schema';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const storyLinks = await listStoryLinks(user.id);
    return NextResponse.json({ storyLinks });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const rules: StoryRule[] = Array.isArray(body.rules)
      ? body.rules.map((r: Partial<StoryRule>) => ({
          param: String(r?.param ?? ''),
          value: String(r?.value ?? ''),
          url: String(r?.url ?? ''),
        }))
      : [];
    const storyLink = await createStoryLink(user.id, {
      name: String(body.name ?? ''),
      defaultUrl: String(body.defaultUrl ?? ''),
      rules,
    });
    return NextResponse.json({ storyLink });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 });
  }
}
