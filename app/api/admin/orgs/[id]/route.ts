import { NextRequest, NextResponse } from 'next/server';
import { apiAppAdmin } from '@/lib/org';
import { orgDetail } from '@/lib/app-admin';
import { deleteOrg, setOrgPlan, setOrgStatus } from '@/src/orgs/repo';
import { isOrgPlan, isOrgStatus } from '@/src/orgs/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await apiAppAdmin();
  if (!gate.ok) return gate.res;
  const { id } = await params;
  const detail = await orgDetail(id);
  if (!detail) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(detail);
}

/** Cambiar plan o suspender/reactivar. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await apiAppAdmin();
  if (!gate.ok) return gate.res;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  let touched = false;
  if (body?.plan !== undefined) {
    if (!isOrgPlan(body.plan)) return NextResponse.json({ error: 'plan inválido' }, { status: 400 });
    await setOrgPlan(id, body.plan);
    touched = true;
  }
  if (body?.status !== undefined) {
    if (!isOrgStatus(body.status)) return NextResponse.json({ error: 'estado inválido' }, { status: 400 });
    await setOrgStatus(id, body.status);
    touched = true;
  }
  if (!touched) return NextResponse.json({ error: 'nada que cambiar' }, { status: 400 });

  const detail = await orgDetail(id);
  if (!detail) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(detail);
}

/**
 * Borrar la organización. CONFIRMACIÓN DOBLE de verdad: además del tap en la
 * UI, el cuerpo tiene que traer el slug (o el id) escrito a mano. Un DELETE
 * suelto no borra el tenant de nadie.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await apiAppAdmin();
  if (!gate.ok) return gate.res;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const detail = await orgDetail(id);
  if (!detail) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const typed = String(body?.confirm ?? '').trim();
  const expected = detail.org.slug ?? detail.org.id;
  if (typed !== expected) {
    return NextResponse.json(
      { error: `Para borrar escribe exactamente "${expected}".`, expected },
      { status: 400 },
    );
  }

  // Primero Clerk (es la fuente de verdad), luego el espejo. Si Clerk falla, no
  // se borra nada aquí: quedarnos sin espejo y con la org viva sería peor.
  try {
    const { clerkClient } = await import('@clerk/nextjs/server');
    const client = await clerkClient();
    await client.organizations.deleteOrganization(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    // Si en Clerk ya no existe, seguimos y limpiamos el espejo.
    if (!/not.?found|404/i.test(msg)) {
      return NextResponse.json({ error: `Clerk no la pudo borrar: ${msg}` }, { status: 502 });
    }
  }

  await deleteOrg(id);
  return NextResponse.json({ ok: true, borrada: id });
}
