import { NextRequest, NextResponse } from 'next/server';
import { apiOrg, apiOrgManager } from '@/lib/org';
import { listCampaigns } from '@/lib/campaigns';
import { createProject } from '@/lib/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Ruta vieja: aquí "campaign" es el PROYECTO (ver 0012). Se queda viva porque
 * hay integraciones apuntándole, pero ya no tiene un camino propio de alta.
 *
 * Por qué se cambió en la corrida 4: `lib/campaigns.createCampaign` insertaba
 * la fila y se acababa ahí — sin fila de dueño en `project_members` y sin
 * evento en la bitácora. Medido en la base el 16-sep: el proyecto "goossip"
 * (creado 07:13, diez minutos después de mergear la corrida 3) tenía **0
 * miembros y 0 eventos**. No se notaba porque quien manda en la organización es
 * dueño implícito de todos sus proyectos; se habría notado el día que ese
 * proyecto pasara a manos de alguien que NO es org:admin: nadie podría entrar.
 *
 * Un solo camino de alta, el de `createProject`, y el agujero se cierra solo.
 */

export async function GET() {
  const gate = await apiOrg();
  if (!gate.ok) return gate.res;
  const items = await listCampaigns(gate.ctx.orgId);
  return NextResponse.json({ campaigns: items, activeCampaignId: gate.ctx.activeProjectId });
}

export async function POST(req: NextRequest) {
  const gate = await apiOrgManager();
  if (!gate.ok) return gate.res;
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? '').trim();
  if (name.length < 2) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const campaign = await createProject(
    gate.ctx.orgId,
    gate.ctx.user.id,
    {
      name,
      description: body?.description ?? null,
      brandLanguage: body?.brandLanguage ?? 'es',
      audience: body?.audience ?? null,
    },
    { clerkUserId: gate.ctx.clerkUserId, email: gate.ctx.user.email },
  );
  return NextResponse.json({ campaign });
}
