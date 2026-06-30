import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { deleteLink } from '@/lib/competitors';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  await deleteLink(user.id, id);
  return NextResponse.json({ ok: true });
}
