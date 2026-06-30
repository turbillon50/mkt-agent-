import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import {
  fetchRecentEmails,
  sendEmail,
  getConnectedEmailToolkit,
  configuredEmailToolkits,
} from '@/lib/composio';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// GET — estado + correos recientes de la cuenta conectada del usuario.
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Si no hay ningún proveedor configurado, devolvemos honesto que está apagado.
  if (configuredEmailToolkits().length === 0) {
    return NextResponse.json({ configured: false, connected: null, messages: [] });
  }

  try {
    const connected = await getConnectedEmailToolkit(userId);
    if (!connected) {
      return NextResponse.json({ configured: true, connected: null, messages: [] });
    }
    const query = req.nextUrl.searchParams.get('q') ?? undefined;
    const { toolkit, messages } = await fetchRecentEmails(userId, { query, maxResults: 10 });
    return NextResponse.json({ configured: true, connected: toolkit, messages });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

// POST — envía un correo básico desde la cuenta conectada del usuario.
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const to = String(body.to ?? '').trim();
    const subject = String(body.subject ?? '').trim();
    const text = String(body.body ?? '').trim();
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return NextResponse.json({ error: 'Pon un correo destino válido' }, { status: 400 });
    }
    if (!subject || !text) {
      return NextResponse.json({ error: 'Falta asunto o cuerpo del correo' }, { status: 400 });
    }
    const { toolkit } = await sendEmail(userId, { to, subject, body: text });
    return NextResponse.json({ ok: true, toolkit });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
