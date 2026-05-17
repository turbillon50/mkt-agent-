import { NextResponse } from 'next/server';
import { isClerkConfigured } from '@/lib/clerk-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (isClerkConfigured()) {
    const { auth } = await import('@clerk/nextjs/server');
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const { getBridgeStatus } = await import('@/src/whatsapp/bridge');
    const data = await getBridgeStatus();
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'bridge error';
    return NextResponse.json({ connected: false, jid: null, hasQR: false, uptimeSec: 0, error: msg }, { status: 502 });
  }
}
