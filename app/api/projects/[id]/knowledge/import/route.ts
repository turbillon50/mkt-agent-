import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { knowledge } from '@/src/db/schema';
import { apiProject } from '@/lib/project-access';
import { adapterFor } from '@/src/channels';
import { remember } from '@/src/memory/index';
import { logProjectEvent } from '@/src/projects/events';
import { activeAccountFor } from '@/src/projects/composio-connections';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/** De dónde se puede importar hoy: las cuatro fuentes con documentos de verdad. */
const FUENTES = ['notion', 'googledrive', 'googlesheets', 'airtable'] as const;
type Fuente = (typeof FUENTES)[number];

/**
 * Trae documentos de una fuente conectada a la base de conocimiento del
 * proyecto, con sus embeddings.
 *
 * Reusa el pipeline que ya existía (`knowledge` + `remember`): la búsqueda
 * semántica del vendedor no distingue de dónde vino el texto, y tener dos
 * caminos para guardar conocimiento es como se terminan con dos memorias que
 * dicen cosas distintas.
 *
 * Idempotente por `source`: volver a importar la misma página de Notion
 * actualiza la fila en vez de crear una segunda. Quien aprieta "Importar" dos
 * veces no quiere dos copias del mismo precio.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await apiProject(id, { section: 'conocimiento', capability: 'operar' });
  if (!gate.ok) return gate.res;
  const { orgId, project, clerkUserId, user } = gate.ctx;

  const body = await req.json().catch(() => ({}));
  const fuente = String(body?.fuente ?? '') as Fuente;
  if (!FUENTES.includes(fuente)) {
    return NextResponse.json({ error: 'fuente desconocida' }, { status: 400 });
  }

  const adapter = adapterFor(fuente);
  if (!adapter?.readDocs) {
    return NextResponse.json({ error: 'de ahí todavía no se puede importar' }, { status: 400 });
  }
  const cuenta = await activeAccountFor(project, fuente);
  if (!cuenta) {
    return NextResponse.json(
      { error: 'Conecta esa cuenta en Conexiones antes de importar.' },
      { status: 400 },
    );
  }

  try {
    const docs = await adapter.readDocs(project, {
      query: String(body?.query ?? ''),
      spreadsheetId: body?.spreadsheetId,
      folderId: body?.folderId,
      baseId: body?.baseId,
      table: body?.table,
      max: Math.min(Number(body?.max ?? 10), 25),
    });

    let nuevos = 0;
    let actualizados = 0;
    for (const doc of docs) {
      const contenido = doc.contenido.trim().slice(0, 20000);
      if (contenido.length < 20) continue;

      const existente = await db
        .select({ id: knowledge.id })
        .from(knowledge)
        .where(and(eq(knowledge.orgId, orgId), eq(knowledge.source, doc.fuente)))
        .limit(1);

      if (existente[0]) {
        await db
          .update(knowledge)
          .set({ content: contenido, title: doc.titulo, campaignId: id })
          .where(eq(knowledge.id, existente[0].id));
        await remember({
          refType: 'knowledge',
          refId: existente[0].id,
          content: contenido,
          metadata: { title: doc.titulo, source: doc.fuente },
        }).catch(() => undefined);
        actualizados += 1;
        continue;
      }

      const [row] = await db
        .insert(knowledge)
        .values({
          orgId,
          campaignId: id,
          title: doc.titulo,
          content: contenido,
          source: doc.fuente,
        })
        .returning({ id: knowledge.id });
      if (row) {
        await remember({
          refType: 'knowledge',
          refId: row.id,
          content: contenido,
          metadata: { title: doc.titulo, source: doc.fuente },
        }).catch(() => undefined);
        nuevos += 1;
      }
    }

    await logProjectEvent({
      orgId,
      projectId: id,
      type: 'project_updated',
      actor: clerkUserId,
      actorEmail: user.email,
      payload: { accion: 'importar conocimiento', fuente, nuevos, actualizados },
    });

    return NextResponse.json({ ok: true, encontrados: docs.length, nuevos, actualizados });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo importar.' },
      { status: 400 },
    );
  }
}
