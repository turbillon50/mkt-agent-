import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';
import { composioUserId } from '@/src/projects/connections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ¿Ya quedó la conexión de este canal en Composio para este proyecto?
 * La verdad es Composio, no el regreso del navegador: la pantalla de
 * Conexiones abre la ventana de permisos aparte y pregunta aquí cada 3 s.
 */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('project') ?? '';
  const canal = req.nextUrl.searchParams.get('canal') ?? '';
  if (canal !== 'linkedin') {
    return NextResponse.json({ error: 'canal desconocido' }, { status: 400 });
  }
  const gate = await apiProject(projectId, { section: 'conexiones', capability: 'conectar' });
  if (!gate.ok) return gate.res;
  try {
    const { isConnected } = await import('@/lib/composio');
    const connected = await isConnected(composioUserId(projectId), 'linkedin');
    return NextResponse.json({ connected });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
