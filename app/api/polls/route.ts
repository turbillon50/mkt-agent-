import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { listPolls, createPoll } from '@/lib/polls';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const polls = await listPolls(user.id);
    return NextResponse.json({ polls });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const rawOptions = Array.isArray(body.options) ? body.options : [];
    const poll = await createPoll(user.id, {
      question: String(body.question ?? ''),
      description: body.description ?? null,
      options: rawOptions.map((o: { label?: unknown; description?: unknown }) => ({
        label: String(o?.label ?? ''),
        description: o?.description != null ? String(o.description) : null,
      })),
    });
    return NextResponse.json({ poll });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 });
  }
}
