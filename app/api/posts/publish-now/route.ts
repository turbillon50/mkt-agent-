import { NextRequest, NextResponse } from 'next/server';
import { isClerkConfigured } from '@/lib/clerk-config';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Publicar de verdad, ahora mismo.
 *
 * CORRIDA 6: ya no hay camino alterno. Antes esta ruta tenía dos mitades —la
 * del proyecto por Composio y la de las "cuentas de la casa" con tokens del
 * entorno, que se encendía con `META_OWN_APP=true` y que además daba al `admin`
 * un atajo para publicar en la página de Goossip desde cualquier proyecto—.
 * Esa segunda mitad se fue entera.
 *
 * Por qué se fue y no se dejó apagada: era la única forma que le quedaba a un
 * click en la app de salir por una cuenta que no es la del cliente, y el
 * pendiente que Luis dictó para esta corrida es exactamente ese. Una bandera
 * apagada sigue siendo una bandera que alguien enciende. El código de
 * `src/posters/*` sigue existiendo para el modo de una sola marca del CLI, que
 * es otro producto y no toca a los clientes.
 *
 * Regla que se cumple sola ahora: la identidad de canal siempre es
 * `composioUserId(project.id)`, porque `publishTo` no sabe salir por otro lado.
 */
const TOOLKIT_DE: Record<string, string> = {
  meta: 'facebook',
  facebook: 'facebook',
  instagram: 'instagram',
  linkedin: 'linkedin',
  twitter: 'twitter',
  tiktok: 'tiktok',
  youtube: 'youtube',
};

export async function POST(req: NextRequest) {
  if (!isClerkConfigured()) {
    return NextResponse.json({ error: 'No hay sesión en este entorno.' }, { status: 401 });
  }

  let orgId: string;
  let activeProjectId: string | null;
  let quien: string | null;

  try {
    const { apiOrg } = await import('@/lib/org');
    const gate = await apiOrg();
    if (!gate.ok) return gate.res;
    orgId = gate.ctx.orgId;
    activeProjectId = gate.ctx.activeProjectId ?? null;
    quien = gate.ctx.user.email ?? gate.ctx.clerkUserId;
  } catch {
    return NextResponse.json({ error: 'auth failed' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const red = typeof body?.platform === 'string' ? TOOLKIT_DE[body.platform] : null;
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  const topic = typeof body?.topic === 'string' ? body.topic : null;
  const piezaId = typeof body?.piezaId === 'string' ? body.piezaId : null;

  if (!red) return NextResponse.json({ error: 'Esa red no existe.' }, { status: 400 });
  if (!text) return NextResponse.json({ error: 'El texto está vacío.' }, { status: 400 });

  // El proyecto puede venir en el cuerpo (desde una pantalla de proyecto) o ser
  // el activo. En los dos casos se vuelve a pasar por la puerta de permisos: un
  // id en el cuerpo lo cambia cualquiera desde el navegador.
  const projectId = typeof body?.projectId === 'string' && body.projectId ? body.projectId : activeProjectId;
  if (!projectId) {
    return NextResponse.json(
      { error: 'Entra a un proyecto para publicar: las cuentas son del proyecto.' },
      { status: 400 },
    );
  }

  const { apiProject } = await import('@/lib/project-access');
  const gate = await apiProject(projectId, { capability: 'operar' });
  if (!gate.ok) return gate.res;
  const project = gate.ctx.project;

  try {
    const { getPieza, piezaAprobadaDe } = await import('@/src/creative/repo');
    const { esRed } = await import('@/src/creative/specs');

    const pieza = piezaId
      ? await getPieza(orgId, project.id, piezaId)
      : esRed(red)
        ? await piezaAprobadaDe(orgId, project.id, red)
        : null;

    const media = pieza?.url ?? (typeof body?.imageUrl === 'string' ? body.imageUrl : null);

    if (pieza && pieza.red !== red) {
      return NextResponse.json(
        { error: `Esa pieza es de ${pieza.red}; no se puede publicar como ${red}.` },
        { status: 400 },
      );
    }

    if (red === 'instagram' && !media) {
      return NextResponse.json(
        { error: 'Instagram no deja publicar sin imagen. Hazle la pieza primero.' },
        { status: 400 },
      );
    }

    const { publishForProject } = await import('@/src/publishing/service');
    const out = await publishForProject({
      orgId,
      project,
      platform: red,
      text,
      topic,
      media,
      pieceId: pieza?.id ?? null,
      actor: quien,
      metadata: { origin: 'publish-now' },
    });

    return NextResponse.json({
      ok: true,
      externalUrl: out.url,
      postId: out.postId,
      attemptId: out.attemptId,
      cuenta: `la cuenta de ${project.name}`,
      conImagen: Boolean(media) && out.mediaPublicada !== false,
      advertencia: out.advertencia ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo publicar.' },
      { status: 400 },
    );
  }
}
