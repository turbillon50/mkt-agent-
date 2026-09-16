import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { getProject } from '@/lib/projects';
import { activeProject, ownedLead } from '@/lib/sales';
import { draftReply, sellerMode } from '@/src/agent/seller';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Banco de pruebas del vendedor: redacta contra un mensaje de ejemplo SIN
 * mandar nada ni tocar la cola. Es con lo que se mide "respuestas de prueba".
 */
export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const text = String(body?.message ?? '').trim();
  if (!text) return NextResponse.json({ error: 'Falta el mensaje.' }, { status: 400 });

  const project = body?.projectId ? await getProject(user.id, body.projectId) : await activeProject(user);
  if (!project) return NextResponse.json({ error: 'Primero crea un proyecto.' }, { status: 400 });

  const lead = body?.leadId ? (await ownedLead(user, body.leadId))?.lead ?? null : null;

  const t0 = Date.now();
  const draft = await draftReply({ project, lead, inbound: text });
  return NextResponse.json({
    modo: sellerMode(project),
    intencion: draft.intent,
    escala: draft.escalate,
    motivo_escalacion: draft.escalationReason,
    respuesta: draft.reply,
    etapa_sugerida: draft.suggestedStage,
    fuentes_mcp: draft.sources.map((s) => ({ fuente: s.source, herramienta: s.tool })),
    del_modelo: draft.fromModel,
    ms: Date.now() - t0,
  });
}
