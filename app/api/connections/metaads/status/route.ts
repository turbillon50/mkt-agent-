import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';
import { listProjectAccounts, verificacionFresca } from '@/src/projects/connections';
import type { MetaAdsMeta } from '@/src/projects/connections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ¿Ya volvió de Facebook la ventana de Meta Ads?
 *
 * La pantalla abre el permiso APARTE y pregunta aquí cada 3 s, igual que con
 * Composio. La diferencia es que aquí hay DOS metas, y la de en medio importa:
 *
 *   volvio    — Facebook ya dio el permiso y tenemos las cuentas. Se cierra la
 *               ventana y se le enseña al usuario cuál elegir. NO es verde.
 *   connected — ya eligió cuenta y Meta la confirmó (`verified_at` fresco). Eso
 *               sí es verde.
 *
 * Sin el paso de en medio, la ventana se quedaría abierta mirando a Facebook
 * mientras la respuesta que falta la tiene que dar el usuario en Goossip.
 *
 * Nunca devuelve el token: lo que sale son ids públicos, nombres y booleanos.
 */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('project') ?? '';

  const gate = await apiProject(projectId, { section: 'conexiones', capability: 'conectar' });
  if (!gate.ok) return gate.res;

  const cuentas = await listProjectAccounts(gate.ctx.orgId, projectId);
  const fila = cuentas.find((c) => c.platform === 'metaads') ?? null;
  if (!fila) return NextResponse.json({ volvio: false, connected: false, cuentas: [] });

  const meta = (fila.metadata ?? {}) as MetaAdsMeta;
  const candidatas = meta.candidates ?? [];
  const connected =
    fila.status === 'connected' && Boolean(fila.externalId) && verificacionFresca(fila.verifiedAt);

  return NextResponse.json({
    volvio: connected || candidatas.length > 0,
    connected,
    cuenta: fila.externalId ?? null,
    cuentas: candidatas.map((c) => ({
      id: c.id,
      accountId: c.accountId,
      name: c.name,
      business: c.business,
      currency: c.currency,
      status: c.status,
    })),
  });
}
