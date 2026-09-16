import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { getProject } from '@/lib/projects';
import { activeProject } from '@/lib/sales';
import { listLeadsByProject } from '@/src/sales/repo';
import { enqueue } from '@/src/sales/queue';
import { LEAD_STAGES, resolveRules, type LeadGrade, type LeadStage } from '@/src/sales/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SEGMENT = 200;

/**
 * "Enviar plantilla a segmento": NO manda nada aquí. Encola una acción por
 * lead y el runner las ejecuta con rate limit. Así una lista de 200 no tumba
 * el número de WhatsApp ni se va sin que el dueño la vea.
 */
export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const project = body?.projectId ? await getProject(user.id, body.projectId) : await activeProject(user);
  if (!project) return NextResponse.json({ error: 'Primero crea un proyecto.' }, { status: 400 });

  const template = String(body?.template ?? resolveRules(project.rules).first_contact_template ?? '').trim();
  if (!template) {
    return NextResponse.json(
      { error: 'Falta el nombre de la plantilla aprobada de WhatsApp.' },
      { status: 400 },
    );
  }

  const stages = Array.isArray(body?.stages)
    ? (body.stages as string[]).filter((s): s is LeadStage => LEAD_STAGES.includes(s as LeadStage))
    : [];
  const grades = Array.isArray(body?.grades)
    ? (body.grades as string[]).filter((g): g is LeadGrade => ['A', 'B', 'C'].includes(g))
    : [];

  const all = await listLeadsByProject(project.id, { stages: stages.length > 0 ? stages : undefined });
  const targets = all
    .filter((l) => l.phone)
    .filter((l) => (grades.length > 0 ? grades.includes(l.grade) : true))
    .slice(0, MAX_SEGMENT);

  // Entran como `pending` a propósito: un envío masivo se revisa antes de salir.
  let enqueued = 0;
  for (const lead of targets) {
    const action = await enqueue({
      campaignId: project.id,
      leadId: lead.id,
      kind: 'send_template',
      priority: 5,
      status: 'pending',
      reason: `plantilla "${template}" a segmento (${stages.join(',') || 'todas las etapas'}${grades.length ? ` · grados ${grades.join(',')}` : ''})`,
      payload: {
        template,
        to: lead.phone,
        language: String(body?.language ?? 'es_MX'),
        header_image_url: String(body?.headerImageUrl ?? '').trim() || null,
      },
      createdBy: `user:${user.id}`,
    });
    if (action) enqueued++;
  }

  return NextResponse.json({
    ok: true,
    segmento: targets.length,
    encoladas: enqueued,
    repetidas: targets.length - enqueued,
    nota: 'Quedan en la cola como pendientes; apruébalas en Automatizaciones y el runner las manda con rate limit.',
  });
}
