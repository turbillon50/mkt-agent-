import { NextRequest, NextResponse } from 'next/server';
import { apiAppAdmin } from '@/lib/org';
import { orgList } from '@/lib/app-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Organizaciones de TODA la app. Puerta: `users.is_admin`. */
export async function GET(req: NextRequest) {
  const gate = await apiAppAdmin();
  if (!gate.ok) return gate.res;
  const search = req.nextUrl.searchParams.get('q') ?? undefined;
  return NextResponse.json({ orgs: await orgList(search) });
}
