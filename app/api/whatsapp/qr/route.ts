import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const { getBridgeQR } = await import('@/src/whatsapp/bridge');
    const data = await getBridgeQR();
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'bridge error';
    return NextResponse.json({ qr: null, error: msg }, { status: 502 });
  }
}
