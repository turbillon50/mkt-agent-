import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { randomUUID } from 'crypto';

const RELAY_URL = 'http://178.105.135.26/brain/exec';
const RELAY_SECRET = process.env.RELAY_SECRET || '';
const PUBLIC_BASE = 'https://mcp.mindcontextia.one/media';

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const dataUrl: string | undefined = body?.dataUrl;
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    return NextResponse.json({ error: 'dataUrl inválido.' }, { status: 400 });
  }

  const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!match) {
    return NextResponse.json({ error: 'Formato de imagen no reconocido.' }, { status: 400 });
  }
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const b64 = match[2];
  const filename = `${randomUUID()}.${ext}`;

  if (!RELAY_SECRET) {
    return NextResponse.json({ error: 'RELAY_SECRET no configurado.' }, { status: 500 });
  }

  // Escribe el archivo por chunks (los comandos del relay tienen limite de tamaño)
  const chunkSize = 60000;
  const chunks: string[] = [];
  for (let i = 0; i < b64.length; i += chunkSize) {
    chunks.push(b64.slice(i, i + chunkSize));
  }

  const tmpName = `/tmp/${filename}.b64`;
  await relayExec(`rm -f ${tmpName}`);
  for (const chunk of chunks) {
    await relayExec(`cat >> ${tmpName} << 'B64EOF'\n${chunk}\nB64EOF`);
  }
  const decodeCmd = `base64 -d ${tmpName} > /var/www/html/tmp-media/${filename} && chmod 644 /var/www/html/tmp-media/${filename} && rm -f ${tmpName} && echo OK`;
  const out = await relayExec(decodeCmd);

  if (!out.includes('OK')) {
    return NextResponse.json({ error: 'No se pudo guardar la imagen.' }, { status: 500 });
  }

  return NextResponse.json({ url: `${PUBLIC_BASE}/${filename}` });
}

async function relayExec(cmd: string): Promise<string> {
  const res = await fetch(RELAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: RELAY_SECRET, cmd }),
  });
  const data = (await res.json().catch(() => ({}))) as { stdout?: string; stderr?: string };
  return (data.stdout || '') + (data.stderr || '');
}

