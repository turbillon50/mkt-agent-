import { NextRequest, NextResponse } from 'next/server';
import { apiOrg } from '@/lib/org';
import { updateLeadStatus, deleteLead } from '@/lib/leads';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await apiOrg();
  if (!gate.ok) return gate.res;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const status = String(body.status ?? '').trim();
  if (!status) return NextResponse.json({ error: 'status requerido' }, { status: 400 });
  await updateLeadStatus(gate.ctx.orgId, id, status);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await apiOrg();
  if (!gate.ok) return gate.res;
  const { id } = await params;
  await deleteLead(gate.ctx.orgId, id);
  return NextResponse.json({ ok: true });
}
