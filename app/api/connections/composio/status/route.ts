import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';
import { connectorBySlug } from '@/src/projects/catalog';
import { finishComposioConnection } from '@/src/projects/composio-connections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ¿Ya quedó la conexión de este conector para este proyecto?
 *
 * La pantalla abre la ventana de permisos APARTE y pregunta aquí cada 3 s. La
 * verdad es Composio, no el regreso del navegador: mientras la cuenta no
 * conteste `ACTIVE`, esto dice que no, y la tarjeta no se pinta de verde.
 *
 * Y cuando sí quedó, se cierra la conexión de este lado en el mismo paso
 * —`verified_at` incluido—: si solo contestara `connected: true`, la tarjeta se
 * pintaría verde con una fila que nadie escribió, y al recargar volvería a
 * "Sin conectar".
 */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('project') ?? '';
  // `canal` es como lo llamaba la corrida 4; `toolkit` es el nombre nuevo.
  const toolkit = req.nextUrl.searchParams.get('toolkit') ?? req.nextUrl.searchParams.get('canal') ?? '';

  const connector = connectorBySlug(toolkit);
  if (!connector || connector.via !== 'composio') {
    return NextResponse.json({ error: 'conexión desconocida' }, { status: 400 });
  }

  const gate = await apiProject(projectId, { section: 'conexiones', capability: 'conectar' });
  if (!gate.ok) return gate.res;

  try {
    const r = await finishComposioConnection({
      project: gate.ctx.project,
      toolkit,
      connectedBy: gate.ctx.clerkUserId,
      userId: gate.ctx.user.id,
    });
    return NextResponse.json({ connected: r.ok, estado: r.status });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
