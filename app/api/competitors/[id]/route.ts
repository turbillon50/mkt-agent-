import { NextRequest, NextResponse } from 'next/server';
import { apiOrg } from '@/lib/org';
import { deleteLink } from '@/lib/competitors';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await apiOrg();
  if (!gate.ok) return gate.res;
  const { id } = await params;
  await deleteLink(gate.ctx.orgId, id);
  return NextResponse.json({ ok: true });
}
