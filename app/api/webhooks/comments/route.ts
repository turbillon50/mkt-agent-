import { NextRequest, NextResponse } from 'next/server';
import { processIncomingComment } from '@/lib/comment-rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Webhook publico (FEATURE #1): la red social / Composio nos manda cada
// comentario nuevo. Normalizamos formas distintas de payload, corremos las
// reglas activas y devolvemos la respuesta a entregar. Los webhooks no deben
// fallar duro: ante payload invalido respondemos 200 {matched:false}.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: true, matched: false });
  }

  const text = String(body.text ?? body.comment ?? body.message ?? '');
  const from = String(body.from ?? body.username ?? body.author ?? '');
  const platform = String(body.platform ?? 'instagram');
  const postUrl = body.postUrl ?? body.permalink ?? null;

  if (!text.trim()) return NextResponse.json({ ok: true, matched: false });

  try {
    const result = await processIncomingComment({
      platform,
      text,
      from,
      postUrl: postUrl ? String(postUrl) : null,
    });
    return NextResponse.json({ ok: true, matched: result.matched, reply: result.reply });
  } catch {
    // Nunca tronar el webhook por un fallo interno.
    return NextResponse.json({ ok: true, matched: false });
  }
}
