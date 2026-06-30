import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { updateLead, deleteLead } from '@/lib/leads';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: { status?: string; email?: string | null; notes?: string | null } = {};
  if (typeof body.status === 'string' && body.status.trim()) patch.status = body.status.trim();
  if (body.email !== undefined) {
    const email = String(body.email ?? '').trim();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'Correo inválido' }, { status: 400 });
    }
    patch.email = email || null;
  }
  if (body.notes !== undefined) patch.notes = String(body.notes ?? '');
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nada que actualizar' }, { status: 400 });
  }
  await updateLead(user.id, id, patch);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  await deleteLead(user.id, id);
  return NextResponse.json({ ok: true });
}
