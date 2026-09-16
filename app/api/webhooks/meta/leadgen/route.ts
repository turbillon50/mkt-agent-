import { NextRequest, NextResponse } from 'next/server';
import { fetchLeadgen, parseLeadgenWebhook, verifyChallenge, verifySignature } from '@/lib/meta-graph';
import { resolveProjectByMeta } from '@/lib/projects';
import { ingestLead } from '@/src/sales/ingest';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** Handshake de Meta al dar de alta el webhook. */
export async function GET(req: NextRequest) {
  const check = verifyChallenge(req.nextUrl.searchParams, process.env.META_VERIFY_TOKEN);
  if (!check.ok) return new NextResponse(check.reason, { status: 403 });
  return new NextResponse(check.challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
}

export async function POST(req: NextRequest) {
  const appSecret = process.env.META_APP_SECRET ?? '';
  // Hay que leer el cuerpo CRUDO: la firma es sobre los bytes exactos.
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get('x-hub-signature-256'), appSecret)) {
    return NextResponse.json({ error: 'firma inválida' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'json inválido' }, { status: 400 });
  }

  const changes = parseLeadgenWebhook(payload);
  const results: Array<Record<string, unknown>> = [];

  for (const change of changes) {
    const t0 = Date.now();
    const project = await resolveProjectByMeta(change.pageId, change.formId);
    if (!project) {
      // 200 a propósito: si devolvemos error, Meta reintenta en bucle un lead
      // que nunca vamos a poder colocar. Queda registrado en la respuesta.
      results.push({ leadgen_id: change.leadgenId, error: 'ningún proyecto tiene esa página o formulario' });
      continue;
    }

    try {
      const fields = await fetchLeadgen(project.slug, change.leadgenId);
      const r = await ingestLead({
        project,
        fullName: fields.fullName || null,
        phone: fields.phone || null,
        email: fields.email,
        source: 'meta_leadgen',
        sourceRef: change.leadgenId,
        createdAt: fields.createdAt,
        raw: { ...fields.raw, form_id: fields.formId ?? change.formId, page_id: change.pageId },
      });
      results.push({
        leadgen_id: change.leadgenId,
        project: project.slug,
        lead_id: r.lead.id,
        creado: r.created,
        grado: r.lead.grade,
        puntaje: r.lead.score,
        encolado: r.enqueued,
        lookup: r.lookup,
        ms: Date.now() - t0,
      });
    } catch (e) {
      results.push({
        leadgen_id: change.leadgenId,
        project: project.slug,
        error: e instanceof Error ? e.message : 'error',
        ms: Date.now() - t0,
      });
    }
  }

  return NextResponse.json({ ok: true, recibidos: changes.length, resultados: results });
}
