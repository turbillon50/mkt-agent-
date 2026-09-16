import { NextRequest, NextResponse } from 'next/server';
import { apiProject } from '@/lib/project-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * El correo DEL PROYECTO, por la cuenta de Gmail que el cliente conectó.
 *
 * Esta ruta buscaba la cuenta de Composio con el `userId` de Clerk y además
 * dependía de `configuredEmailToolkits()`, que mira variables de entorno que
 * nadie puso. Resultado medido en la QA: `{"configured":false,"connected":null}`
 * mientras Gmail salía **Conectado** en Conexiones y `GMAIL_SEND_EMAIL` mandaba
 * correo de verdad por abajo (id `1a0aa34f567ccf84`). Hallazgo G.
 *
 * Ahora entra por el adaptador del proyecto (`src/channels/operacion.ts`), que
 * es la única puerta y ya usa `project:<uuid>`.
 */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('project') ?? '';
  if (!projectId) return NextResponse.json({ error: 'Falta el proyecto.' }, { status: 400 });

  const gate = await apiProject(projectId, { section: 'conversaciones', capability: 'ver' });
  if (!gate.ok) return gate.res;

  const { gmail } = await import('@/src/channels/operacion');
  const { CanalNoConectado } = await import('@/src/channels/base');

  try {
    const estado = await gmail.verify(gate.ctx.project);
    if (!estado.conectado) {
      return NextResponse.json({
        configured: true,
        connected: null,
        messages: [],
        motivo: estado.motivo ?? 'Gmail no está conectado en este proyecto.',
      });
    }

    const query = req.nextUrl.searchParams.get('q') ?? undefined;
    const data: any = await gmail.readRows!(gate.ctx.project, { limite: 10, query });
    const crudos = data?.messages ?? data?.response_data?.messages ?? [];

    return NextResponse.json({
      configured: true,
      connected: 'gmail',
      messages: crudos.map((m: any) => ({
        id: String(m.messageId ?? m.id ?? ''),
        from: m.sender ?? m.from ?? null,
        subject: m.subject ?? null,
        snippet: m.preview?.body ?? m.snippet ?? null,
        date: m.messageTimestamp ?? m.date ?? null,
      })),
    });
  } catch (e) {
    if (e instanceof CanalNoConectado) {
      return NextResponse.json({ configured: true, connected: null, messages: [], motivo: e.message });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

/** Manda un correo desde la cuenta del proyecto. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const projectId = String(body?.projectId ?? '');
  if (!projectId) return NextResponse.json({ error: 'Falta el proyecto.' }, { status: 400 });

  const gate = await apiProject(projectId, { section: 'conversaciones', capability: 'operar' });
  if (!gate.ok) return gate.res;

  const to = String(body.to ?? '').trim();
  const subject = String(body.subject ?? '').trim();
  const text = String(body.body ?? '').trim();
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json({ error: 'Pon un correo destino válido' }, { status: 400 });
  }
  if (!subject || !text) {
    return NextResponse.json({ error: 'Falta asunto o cuerpo del correo' }, { status: 400 });
  }

  try {
    const { gmail } = await import('@/src/channels/operacion');
    await gmail.sendEmail!(gate.ctx.project, { to, subject, body: text });
    return NextResponse.json({ ok: true, toolkit: 'gmail' });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 });
  }
}
