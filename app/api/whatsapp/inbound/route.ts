import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = process.env.WHATSAPP_BRIDGE_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'bad payload' }, { status: 400 });
  }

  const externalId = String(body.messageId ?? body.externalId ?? '').trim();
  const from = String(body.from ?? '').trim();
  const text = String(body.body ?? body.text ?? '').trim();
  const timestamp = Number(body.timestamp ?? Math.floor(Date.now() / 1000));
  const pushName = typeof body.pushName === 'string' ? body.pushName : undefined;

  if (!externalId || !from || !text) {
    return NextResponse.json({ error: 'missing fields (messageId, from, body)' }, { status: 400 });
  }

  try {
    const { handleInbound } = await import('@/src/whatsapp/handler');
    const result = await handleInbound({ externalId, from, body: text, timestamp, pushName });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'handler error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
