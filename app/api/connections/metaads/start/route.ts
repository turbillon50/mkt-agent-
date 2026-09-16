import { NextRequest, NextResponse } from 'next/server';
import { metaOAuthConfigured, signState } from '@/lib/meta-oauth';
import { metaAdsAuthorizeUrl } from '@/lib/meta-ads';
import { apiProject } from '@/lib/project-access';
import { channelAvailable } from '@/src/projects/connections';
import { logProjectEvent } from '@/src/projects/events';
import { resolveConnectionLink } from '@/src/projects/links';
import { appOrigin } from '../../meta/start/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Arranca la conexión de Meta Ads con la app propia de Goossip.
 *
 * Dos puertas al mismo baile, las mismas que Composio y que el Meta de páginas:
 *   · POST `{project}` — alguien del proyecto con permiso de conectar. Devuelve
 *     la URL, y la pantalla abre la ventana APARTE (patrón de la corrida 5): si
 *     Facebook manda a la persona a iniciar sesión, quien conecta no pierde su
 *     lugar en Goossip.
 *   · GET `?link=<token>` — alguien de FUERA con un enlace de un solo uso. El
 *     enlace ES su permiso. No se quema aquí sino en el callback, cuando el
 *     permiso ya está dado: gastarlo al arrancar dejaría al cliente sin enlace
 *     y sin conexión si abandona la pantalla de Facebook.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const projectId = String(body?.project ?? '');

  if (!metaOAuthConfigured() || !channelAvailable('metaads')) {
    return NextResponse.json({ error: 'Meta Ads no está disponible por ahora.' }, { status: 503 });
  }

  const gate = await apiProject(projectId, { section: 'conexiones', capability: 'conectar' });
  if (!gate.ok) return gate.res;

  const state = signState({
    projectId,
    via: 'ads',
    back: `/projects/${projectId}/conexiones`,
  });

  await logProjectEvent({
    orgId: gate.ctx.orgId,
    projectId,
    type: 'channel_connected',
    actor: gate.ctx.clerkUserId,
    actorEmail: gate.ctx.user.email,
    payload: { canal: 'metaads', paso: 'permiso solicitado' },
  }).catch(() => undefined);

  return NextResponse.json({ redirectUrl: metaAdsAuthorizeUrl(appOrigin(req), state) });
}

/** La entrada de quien llega con un enlace de un solo uso. */
export async function GET(req: NextRequest) {
  const origin = appOrigin(req);
  if (!metaOAuthConfigured() || !channelAvailable('metaads')) {
    return NextResponse.json({ error: 'Meta Ads no está disponible por ahora.' }, { status: 503 });
  }

  const token = req.nextUrl.searchParams.get('link');
  if (!token) return NextResponse.json({ error: 'falta el enlace' }, { status: 400 });

  const resolution = await resolveConnectionLink(token);
  if (!resolution.ok) return NextResponse.redirect(new URL(`/conectar/${token}`, origin));

  const state = signState({
    projectId: resolution.project.id,
    link: token,
    via: 'ads',
    back: `/conectar/${token}/listo`,
  });
  return NextResponse.redirect(metaAdsAuthorizeUrl(origin, state));
}
