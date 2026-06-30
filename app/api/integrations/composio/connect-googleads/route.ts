import { auth } from '@clerk/nextjs/server';
import { startGoogleAdsConnection } from '@/lib/composio';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { customerId } = (await req.json()) as { customerId?: string };
    if (!customerId) {
      return NextResponse.json({ error: 'customerId requerido' }, { status: 400 });
    }

    const { redirectUrl } = await startGoogleAdsConnection(userId, customerId);
    return NextResponse.json({ redirectUrl }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
