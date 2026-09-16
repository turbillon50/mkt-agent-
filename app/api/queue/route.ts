import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { queueForUser } from '@/lib/sales';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_STATUSES = ['pending', 'approved', 'auto'];

export async function GET(req: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const raw = req.nextUrl.searchParams.get('status');
  const statuses = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_STATUSES;
  const rows = await queueForUser(user.id, statuses);
  return NextResponse.json({
    actions: rows.map((r) => ({
      ...r.action,
      projectName: r.projectName,
      leadName: r.leadName,
      leadPhone: r.leadPhone,
      leadGrade: r.leadGrade,
    })),
  });
}
