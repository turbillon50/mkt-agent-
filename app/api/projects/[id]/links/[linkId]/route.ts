import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';
import { logProjectEvent } from '@/src/projects/events';
import { revokeConnectionLink } from '@/src/projects/links';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Cancelar un enlace antes de que lo usen o de que caduque. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> },
) {
  const { id, linkId } = await params;
  const gate = await apiProject(id, { section: 'equipo', capability: 'administrar' });
  if (!gate.ok) return gate.res;

  const link = await revokeConnectionLink(gate.ctx.orgId, id, linkId);
  if (!link) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await logProjectEvent({
    orgId: gate.ctx.orgId,
    projectId: id,
    type: 'link_revoked',
    actor: gate.ctx.clerkUserId,
    actorEmail: gate.ctx.user.email,
    payload: { canal: link.channel },
  });

  return NextResponse.json({ ok: true });
}
