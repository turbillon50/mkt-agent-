import { NextRequest, NextResponse } from 'next/server';
import { authorizeUrl, metaOAuthConfigured, signState } from '@/lib/meta-oauth';
import { apiProject } from '@/lib/project-access';
import { resolveConnectionLink } from '@/src/projects/links';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Arranca la conexión de Facebook e Instagram.
 *
 * Dos puertas de entrada al mismo baile:
 *   · `?project=<id>` — alguien del proyecto con permiso de conectar.
 *   · `?link=<token>` — alguien de fuera, con un enlace de un solo uso. Esa
 *     persona no pertenece a la organización y no tiene por qué: el enlace ES
 *     su permiso, y solo para este proyecto y este canal.
 *
 * El enlace NO se quema aquí. Si se gastara al arrancar, abandonar el flujo a
 * medias dejaría al cliente sin enlace y sin conexión.
 */
export async function GET(req: NextRequest) {
  if (!metaOAuthConfigured()) {
    return NextResponse.json({ error: 'Facebook no está disponible por ahora.' }, { status: 503 });
  }

  const origin = appOrigin(req);
  const projectId = req.nextUrl.searchParams.get('project');
  const link = req.nextUrl.searchParams.get('link');

  if (link) {
    const resolution = await resolveConnectionLink(link);
    if (!resolution.ok) {
      return NextResponse.redirect(new URL(`/conectar/${link}`, origin));
    }
    const state = signState({
      projectId: resolution.project.id,
      link,
      back: `/conectar/${link}/listo`,
    });
    return NextResponse.redirect(authorizeUrl(origin, state));
  }

  if (!projectId) return NextResponse.json({ error: 'falta el proyecto' }, { status: 400 });

  const gate = await apiProject(projectId, { section: 'conexiones', capability: 'conectar' });
  if (!gate.ok) return gate.res;

  const state = signState({
    projectId,
    back: `/projects/${projectId}/conexiones`,
  });
  return NextResponse.redirect(authorizeUrl(origin, state));
}

/**
 * El origen público de esta instalación. `NEXT_PUBLIC_APP_URL` manda porque es
 * lo que hay que dar de alta en Meta; detrás de un proxy, `req.nextUrl.origin`
 * puede traer el host interno y Meta rechazaría el `redirect_uri`.
 */
export function appOrigin(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured && /^https?:\/\//i.test(configured)) return configured.replace(/\/$/, '');
  const forwardedHost = req.headers.get('x-forwarded-host');
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  if (forwardedHost) return `${proto}://${forwardedHost}`;
  return req.nextUrl.origin;
}
