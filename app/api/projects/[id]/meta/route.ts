import { NextRequest, NextResponse } from 'next/server';
import { listLeadForms, subscribePageToLeads } from '@/lib/meta-oauth';
import { apiProject } from '@/lib/project-access';
import { updateProject } from '@/lib/projects';
import { seal } from '@/lib/secret-box';
import {
  metaPageToken,
  pendingMeta,
  projectConnections,
  saveConnection,
} from '@/src/projects/connections';
import { logProjectEvent } from '@/src/projects/events';
import { sanitizeChannels } from '@/src/sales/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Los dos pasos que quedan después de dar el permiso en Facebook:
 *
 *   { accion: 'pagina',       pageId }   → a cuál de tus páginas se conecta
 *   { accion: 'formularios',  formIds }  → de qué formularios llegan los leads
 *
 * Están juntos porque son el mismo trámite partido en dos pantallas, y separado
 * de `[channel]` porque ahí vive el conectar/desconectar genérico.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await apiProject(id, { section: 'conexiones', capability: 'conectar' });
  if (!gate.ok) return gate.res;
  const { orgId, project, clerkUserId, user } = gate.ctx;

  const body = await req.json().catch(() => ({}));
  const accion = String(body?.accion ?? '');

  try {
    if (accion === 'pagina') {
      const pageId = String(body?.pageId ?? '').trim();
      if (!pageId) return NextResponse.json({ error: 'Elige una página.' }, { status: 400 });

      const { candidates, userToken } = await pendingMeta(orgId, id);
      const elegida = candidates.find((c) => c.id === pageId);
      if (!elegida || !userToken) {
        return NextResponse.json(
          { error: 'La conexión caducó. Vuelve a conectar Facebook.' },
          { status: 400 },
        );
      }

      // El token de la PÁGINA se pide en el momento con el del usuario: es el
      // que lee los leads, y es distinto por página.
      const { listPages } = await import('@/lib/meta-oauth');
      const pages = await listPages(userToken);
      const page = pages.find((p) => p.id === pageId);
      if (!page) {
        return NextResponse.json(
          { error: 'Ya no administras esa página en Facebook.' },
          { status: 400 },
        );
      }

      const [forms, suscripcion] = await Promise.all([
        listLeadForms(page.id, page.accessToken).catch(() => []),
        subscribePageToLeads(page.id, page.accessToken),
      ]);

      await saveConnection({
        orgId,
        projectId: id,
        channel: 'meta',
        connectedBy: clerkUserId,
        userId: user.id,
        label: page.name,
        externalHandle: page.instagram?.username ?? null,
        externalId: page.id,
        metadata: {
          page_id: page.id,
          page_name: page.name,
          page_token: seal(page.accessToken),
          instagram: page.instagram,
          available_forms: forms,
          suscrita: suscripcion.ok,
          // Elegida la página, la lista de candidatas ya no sirve de nada.
          candidates: [],
        },
      });

      await updateProject(orgId, id, {
        channels: sanitizeChannels({ ...(project.channels ?? {}), meta_page_id: page.id }),
      });

      await logProjectEvent({
        orgId,
        projectId: id,
        type: 'channel_connected',
        actor: clerkUserId,
        actorEmail: user.email,
        payload: { canal: 'meta', pagina: page.name, formularios: forms.length },
      });

      return NextResponse.json(await freshConnections(id));
    }

    if (accion === 'formularios') {
      const formIds = Array.isArray(body?.formIds)
        ? body.formIds.map((f: unknown) => String(f ?? '').trim()).filter(Boolean)
        : [];

      const token = await metaPageToken(project);
      const pageId = (project.channels ?? {}).meta_page_id;
      const disponibles = token && pageId ? await listLeadForms(pageId, token).catch(() => []) : [];
      // Solo se aceptan formularios que la página TIENE. Un id escrito a mano
      // ataría este proyecto a leads de otra cuenta.
      const validos = disponibles.filter((f) => formIds.includes(f.id));

      await updateProject(orgId, id, {
        channels: sanitizeChannels({
          ...(project.channels ?? {}),
          meta_form_ids: validos.map((f) => f.id),
        }),
      });
      await saveConnection({
        orgId,
        projectId: id,
        channel: 'meta',
        connectedBy: clerkUserId,
        userId: user.id,
        metadata: {
          forms: validos.map((f) => ({ id: f.id, name: f.name })),
          available_forms: disponibles,
        },
      });
      await logProjectEvent({
        orgId,
        projectId: id,
        type: 'channel_connected',
        actor: clerkUserId,
        actorEmail: user.email,
        payload: { canal: 'meta', formularios: validos.map((f) => f.name) },
      });

      return NextResponse.json(await freshConnections(id));
    }

    return NextResponse.json({ error: 'acción desconocida' }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo guardar.' },
      { status: 400 },
    );
  }
}

async function freshConnections(id: string) {
  const fresh = await apiProject(id, { section: 'conexiones' });
  if (!fresh.ok) return { ok: true };
  return { ok: true, ...(await projectConnections(fresh.ctx.project)) };
}
