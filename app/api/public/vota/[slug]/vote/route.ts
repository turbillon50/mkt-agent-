import { NextRequest, NextResponse } from 'next/server';
import { vote } from '@/lib/polls';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const optionId = String(body.optionId ?? '').trim();
    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();

    if (!optionId) return NextResponse.json({ error: 'Selecciona una opción.' }, { status: 400 });
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Pon un correo válido.' }, { status: 400 });
    }

    const result = await vote(slug, { optionId, name: name || null, email });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 });
  }
}
