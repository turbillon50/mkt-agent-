import { NextRequest, NextResponse } from 'next/server';
import { apiOrg } from '@/lib/org';
import { queueForOrg } from '@/lib/sales';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_STATUSES = ['pending', 'approved', 'auto'];

export async function GET(req: NextRequest) {
  const gate = await apiOrg();
  if (!gate.ok) return gate.res;

  const raw = req.nextUrl.searchParams.get('status');
  const statuses = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_STATUSES;
  const rows = await queueForOrg(gate.ctx.orgId, statuses);
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
