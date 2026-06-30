import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { listRules, matchRule } from '@/lib/comment-rules';

export const dynamic = 'force-dynamic';

// Probador: corre matchRule sobre las reglas del usuario actual SIN crear lead
// ni tocar contadores. Sirve para ver que regla matchearia un comentario.
export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const text = String(body.text ?? '');
    const platform = body.platform ? String(body.platform).trim().toLowerCase() : null;

    let rules = await listRules(user.id);
    if (platform) rules = rules.filter((r) => r.platform === platform);

    const rule = matchRule(rules, text);
    if (!rule) return NextResponse.json({ matched: false });

    const reply = rule.replyMessage + (rule.paymentLink ? `\n\n${rule.paymentLink}` : '');
    return NextResponse.json({ matched: true, ruleName: rule.name, reply });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 });
  }
}
