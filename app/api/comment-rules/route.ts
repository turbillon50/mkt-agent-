import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { listRules, createRule } from '@/lib/comment-rules';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const rules = await listRules(user.id);
    return NextResponse.json({ rules });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const rule = await createRule(user.id, {
      name: String(body.name ?? ''),
      platform: body.platform ? String(body.platform) : undefined,
      keywords: Array.isArray(body.keywords) ? body.keywords.map((k: unknown) => String(k)) : [],
      replyMessage: String(body.replyMessage ?? ''),
      paymentLink: body.paymentLink ?? null,
    });
    return NextResponse.json({ rule });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 });
  }
}
