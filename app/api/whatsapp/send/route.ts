import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const to = typeof body?.to === 'string' ? body.to.trim() : '';
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!to || !message) {
    return NextResponse.json({ error: 'to and message required' }, { status: 400 });
  }

  try {
    const { sendViaBridge } = await import('@/src/whatsapp/bridge');
    const { insertMessage } = await import('@/src/whatsapp/repo');
    const sent = await sendViaBridge(to, message);
    const row = await insertMessage({
      externalId: sent.id ?? null,
      fromNumber: to,
      toNumber: to,
      body: message,
      direction: 'outbound',
      respondedBy: 'human',
      messageTimestamp: new Date(),
    });
    return NextResponse.json({ ok: true, messageId: row.id, externalId: sent.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'send error';
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
