import { NextRequest, NextResponse } from 'next/server';
import { apiAppAdmin } from '@/lib/org';
import { globalQueue } from '@/lib/app-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Cola global: lo pendiente de todas las organizaciones, con filtro. */
export async function GET(req: NextRequest) {
  const gate = await apiAppAdmin();
  if (!gate.ok) return gate.res;
  const sp = req.nextUrl.searchParams;
  const rows = await globalQueue({
    orgId: sp.get('orgId') ?? undefined,
    status: sp.get('status') ?? undefined,
  });
  return NextResponse.json({
    actions: rows.map((r) => ({
      id: r.action.id,
      kind: r.action.kind,
      status: r.action.status,
      reason: r.action.reason,
      createdBy: r.action.createdBy,
      createdAt: r.action.createdAt,
      scheduledFor: r.action.scheduledFor,
      project: r.projectName,
      org: r.orgName,
      orgId: r.orgId,
      lead: r.leadName,
    })),
  });
}
