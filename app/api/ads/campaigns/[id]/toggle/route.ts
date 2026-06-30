import { auth } from '@clerk/nextjs/server';
import { getGoogleAdsConnection, setCampaignStatus } from '@/lib/composio';
import { NextResponse } from 'next/server';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { status } = (await req.json()) as { status?: 'ENABLED' | 'PAUSED' };
    if (status !== 'ENABLED' && status !== 'PAUSED') {
      return NextResponse.json({ error: 'status invalido' }, { status: 400 });
    }

    const connection = await getGoogleAdsConnection(userId);
    if (!connection || !connection.customerId) {
      return NextResponse.json({ error: 'No tienes Google Ads conectado' }, { status: 400 });
    }

    await setCampaignStatus(connection.connectionId, connection.customerId, id, status);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
