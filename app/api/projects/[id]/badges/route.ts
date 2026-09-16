import { NextRequest, NextResponse } from 'next/server';
import { resolveProject } from '@/lib/project-access';
import { projectBadges } from '@/src/projects/badges';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Los números del menú lateral para el proyecto activo.
 *
 * `resolveProject` y no `enterProject`: pedir los badges no es entrar al
 * proyecto. Si escribiera el proyecto activo, el menú de una pestaña abierta en
 * el proyecto A le cambiaría el proyecto activo a la pestaña que está en el B.
 *
 * Sin sección: cada rol ve en el menú solo las secciones que le tocan, y el
 * número de una sección que no va a ver simplemente no se pinta.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolution = await resolveProject(id);
  if (!resolution.ok) {
    const status = resolution.problem === 'no_existe' ? 404 : 403;
    return NextResponse.json({ error: 'sin acceso' }, { status });
  }

  const badges = await projectBadges(resolution.ctx.project);
  return NextResponse.json({ badges });
}
