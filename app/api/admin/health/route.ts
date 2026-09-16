import { NextResponse } from 'next/server';
import { apiAppAdmin } from '@/lib/org';
import { appHealth } from '@/lib/app-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Salud: webhooks de las últimas 24 h, errores y versión desplegada. */
export async function GET() {
  const gate = await apiAppAdmin();
  if (!gate.ok) return gate.res;
  return NextResponse.json(await appHealth());
}
