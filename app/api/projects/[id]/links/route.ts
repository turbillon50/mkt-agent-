import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';
import { logProjectEvent } from '@/src/projects/events';
import {
  createConnectionLink,
  LINK_TTL_HOURS,
  linkState,
  listConnectionLinks,
} from '@/src/projects/links';
import { channelSpec, isConnectionChannel } from '@/src/projects/types';
import { channelAvailable } from '@/src/projects/connections';
import { appOrigin } from '@/app/api/connections/meta/start/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await apiProject(id, { section: 'equipo' });
  if (!gate.ok) return gate.res;

  const links = await listConnectionLinks(gate.ctx.orgId, id);
  return NextResponse.json({
    // El token NO se devuelve: solo existe en claro el instante en que se crea.
    // Quien lo perdió genera otro; nadie lo "recupera" desde el panel.
    links: links.map((l) => ({
      id: l.id,
      canal: l.channel,
      canalLabel: channelSpec(l.channel).label,
      nota: l.note,
      estado: linkState(l),
      expira: l.expiresAt.toISOString(),
      usadoEn: l.usedAt?.toISOString() ?? null,
      usadoPor: l.usedBy,
      creado: l.createdAt.toISOString(),
    })),
    horas: LINK_TTL_HOURS,
    base: appOrigin(req),
  });
}

/**
 * Genera el enlace de "conéctame tu Facebook".
 *
 * El token en claro se devuelve UNA vez, aquí. Después solo vive su hash.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await apiProject(id, { section: 'equipo', capability: 'administrar' });
  if (!gate.ok) return gate.res;
  const { orgId, clerkUserId, user } = gate.ctx;

  const body = await req.json().catch(() => ({}));
  const canal = String(body?.canal ?? 'meta');
  if (!isConnectionChannel(canal)) {
    return NextResponse.json({ error: 'canal desconocido' }, { status: 400 });
  }
  const spec = channelSpec(canal);
  if (!spec.shareable || !channelAvailable(canal)) {
    return NextResponse.json(
      { error: `${spec.label} no se puede conectar por enlace.` },
      { status: 400 },
    );
  }

  const { link, token } = await createConnectionLink({
    orgId,
    projectId: id,
    channel: canal,
    createdBy: clerkUserId,
    note: String(body?.nota ?? '').trim().slice(0, 140) || null,
  });

  await logProjectEvent({
    orgId,
    projectId: id,
    type: 'link_created',
    actor: clerkUserId,
    actorEmail: user.email,
    payload: { canal, expira: link.expiresAt.toISOString() },
  });

  return NextResponse.json({
    url: new URL(`/conectar/${token}`, appOrigin(req)).toString(),
    id: link.id,
    canal,
    canalLabel: spec.label,
    expira: link.expiresAt.toISOString(),
    horas: LINK_TTL_HOURS,
  });
}
