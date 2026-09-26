import { NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { listHotLeads, getHotLeadSettings, signalSummary } from '@/lib/lead-signals';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const [hot, settings, summary] = await Promise.all([
      listHotLeads(user.id),
      getHotLeadSettings(user.id),
      signalSummary(user.id),
    ]);
    return NextResponse.json({ hot, settings, summary });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
