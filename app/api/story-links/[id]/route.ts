import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { updateStoryLink, deleteStoryLink } from '@/lib/story-links';
import type { StoryRule } from '@/src/db/schema';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const rules: StoryRule[] | undefined = Array.isArray(body.rules)
      ? body.rules.map((r: Partial<StoryRule>) => ({
          param: String(r?.param ?? ''),
          value: String(r?.value ?? ''),
          url: String(r?.url ?? ''),
        }))
      : undefined;
    await updateStoryLink(user.id, id, {
      name: typeof body.name === 'string' ? body.name : undefined,
      defaultUrl: typeof body.defaultUrl === 'string' ? body.defaultUrl : undefined,
      rules,
      active: typeof body.active === 'boolean' ? body.active : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  await deleteStoryLink(user.id, id);
  return NextResponse.json({ ok: true });
}
