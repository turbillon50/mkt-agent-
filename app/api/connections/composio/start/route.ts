import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';
import { channelAvailable, composioUserId } from '@/src/projects/connections';
import { logProjectEvent } from '@/src/projects/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Canales que lleva Composio (hoy LinkedIn).
 *
 * Se conectan a nombre del PROYECTO (`project:<id>`), no del usuario: la cuenta
 * del cliente no se puede ir con quien la enganchó.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const projectId = String(body?.project ?? '');
  const canal = String(body?.canal ?? '');

  if (canal !== 'linkedin') {
    return NextResponse.json({ error: 'canal desconocido' }, { status: 400 });
  }
  if (!channelAvailable('linkedin')) {
    return NextResponse.json({ error: 'LinkedIn no está disponible por ahora.' }, { status: 503 });
  }

  const gate = await apiProject(projectId, { section: 'conexiones', capability: 'conectar' });
  if (!gate.ok) return gate.res;

  try {
    const { startConnection } = await import('@/lib/composio');
    const { redirectUrl } = await startConnection(composioUserId(projectId), 'linkedin');
    if (!redirectUrl) throw new Error('No se pudo abrir la ventana de LinkedIn.');

    await logProjectEvent({
      orgId: gate.ctx.orgId,
      projectId,
      type: 'channel_connected',
      actor: gate.ctx.clerkUserId,
      actorEmail: gate.ctx.user.email,
      payload: { canal: 'linkedin', paso: 'permiso solicitado' },
    });

    return NextResponse.json({ redirectUrl });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo conectar.' },
      { status: 400 },
    );
  }
}
