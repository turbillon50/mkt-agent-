import { auth } from '@clerk/nextjs/server';
import { getGoogleAdsConnection, listCampaigns } from '@/lib/composio';
import { NextResponse } from 'next/server';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const connection = await getGoogleAdsConnection(userId);
    if (!connection || !connection.customerId) {
      return NextResponse.json({ connected: false, campaigns: [] });
    }
    const campaigns = await listCampaigns(connection.connectionId, connection.customerId);
    return NextResponse.json({ connected: true, customerId: connection.customerId, campaigns });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
