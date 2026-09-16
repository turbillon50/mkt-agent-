import { NextRequest, NextResponse } from 'next/server';
import { verifyChallenge, verifySignature } from '@/lib/meta-graph';
import { parseWebhook } from '@/lib/whatsapp-cloud';
import { resolveProjectByWabaPhoneId } from '@/lib/projects';
import { handleCloudInbound, handleStatusUpdate } from '@/src/sales/inbound';
import type { Project } from '@/src/db/schema';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = process.env.WHATSAPP_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN;
  const check = verifyChallenge(req.nextUrl.searchParams, token);
  if (!check.ok) return new NextResponse(check.reason, { status: 403 });
  return new NextResponse(check.challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
}

export async function POST(req: NextRequest) {
  const appSecret = process.env.META_APP_SECRET ?? '';
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

  const parsed = parseWebhook(payload);
  // Un webhook puede traer varios phone_number_id; se resuelve una vez cada uno.
  const cache = new Map<string, Project | null>();
  const projectFor = async (phoneNumberId: string): Promise<Project | null> => {
    if (!cache.has(phoneNumberId)) cache.set(phoneNumberId, await resolveProjectByWabaPhoneId(phoneNumberId));
    return cache.get(phoneNumberId) ?? null;
  };

  const inbound: Array<Record<string, unknown>> = [];
  for (const m of parsed.inbound) {
    const project = await projectFor(m.phoneNumberId);
    if (!project) {
      inbound.push({ external_id: m.externalId, error: 'ningún proyecto tiene ese waba_phone_id' });
      continue;
    }
    try {
      inbound.push({ external_id: m.externalId, project: project.slug, ...(await handleCloudInbound(project, m)) });
    } catch (e) {
      inbound.push({ external_id: m.externalId, project: project.slug, error: e instanceof Error ? e.message : 'error' });
    }
  }

  const statuses: Array<Record<string, unknown>> = [];
  for (const s of parsed.statuses) {
    const project = await projectFor(s.phoneNumberId);
    if (!project) continue;
    try {
      statuses.push({ external_id: s.externalId, status: s.status, ...(await handleStatusUpdate(project, s)) });
    } catch (e) {
      statuses.push({ external_id: s.externalId, error: e instanceof Error ? e.message : 'error' });
    }
  }

  // Siempre 200: un error nuestro no debe hacer que Meta reintente en bucle.
  return NextResponse.json({ ok: true, inbound, statuses });
}
