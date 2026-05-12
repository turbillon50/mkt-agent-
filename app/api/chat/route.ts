import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 });

  try {
    const { ask } = await import('@/src/agent/index');
    const reply = await ask(prompt);
    return NextResponse.json({ reply });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'agent error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
