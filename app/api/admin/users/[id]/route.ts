import { NextRequest, NextResponse } from 'next/server';
import { apiAppAdmin } from '@/lib/org';
import { setUserAdmin } from '@/lib/app-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Dar o quitar `is_admin` — el permiso de entrar a este mismo módulo. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await apiAppAdmin();
  if (!gate.ok) return gate.res;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  if (typeof body?.isAdmin !== 'boolean') {
    return NextResponse.json({ error: 'isAdmin debe ser booleano' }, { status: 400 });
  }
  // Nadie se quita a sí mismo el acceso: dejaría la app sin dueño con un tap.
  if (id === gate.ctx.user.id && body.isAdmin === false) {
    return NextResponse.json(
      { error: 'No te puedes quitar a ti mismo el acceso de administrador.' },
      { status: 400 },
    );
  }

  const user = await setUserAdmin(id, body.isAdmin);
  if (!user) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ user: { id: user.id, email: user.email, isAdmin: user.isAdmin } });
}
