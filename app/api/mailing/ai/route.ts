import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { improveSubject, improveBody, generateFromPrompt } from '@/lib/ai-email';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// IA para correos: mejorar asunto, mejorar cuerpo, o generar desde un prompt.
export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? '');

    if (action === 'subject') {
      const subject = await improveSubject({ subject: body.subject, body: body.body });
      return NextResponse.json({ subject });
    }
    if (action === 'body') {
      if (!String(body.body ?? '').trim()) return NextResponse.json({ error: 'No hay cuerpo que mejorar.' }, { status: 400 });
      const improved = await improveBody({ subject: body.subject, body: String(body.body) });
      return NextResponse.json({ body: improved });
    }
    if (action === 'generate') {
      if (!String(body.prompt ?? '').trim()) return NextResponse.json({ error: 'Describe qué correo quieres.' }, { status: 400 });
      const result = await generateFromPrompt(String(body.prompt));
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: 'acción inválida' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'la IA falló' }, { status: 500 });
  }
}
