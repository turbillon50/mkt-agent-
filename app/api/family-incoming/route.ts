import { timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

type AuthResult = { ok: true } | { ok: false; reason: string; code: number };

function validateBearer(req: NextRequest): AuthResult {
  const expected = process.env.FAMILY_AGENT_TOKEN ?? "";
  if (!expected) return { ok: false, reason: "FAMILY_AGENT_TOKEN not set", code: 503 };
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  const presented = m?.[1] ?? "";
  if (!presented || !safeEqual(presented, expected)) {
    return { ok: false, reason: "invalid Authorization Bearer token", code: 401 };
  }
  return { ok: true };
}

async function ackToFamily(
  ackUrl: string,
  messageId: string,
  externalRef: string | null,
  errorMsg?: string,
): Promise<void> {
  if (!ackUrl) return;
  const token = process.env.FAMILY_AGENT_TOKEN ?? "";
  const handle = process.env.FAMILY_AGENT_HANDLE ?? "gossip";
  try {
    await fetch(ackUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messageId,
        agent: handle,
        ...(externalRef ? { externalRef } : {}),
        ...(errorMsg ? { error: errorMsg } : {}),
      }),
    });
  } catch {
    // best-effort
  }
}

export async function POST(req: NextRequest) {
  const auth = validateBearer(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.reason }, { status: auth.code });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return NextResponse.json({ ok: false, error: "DATABASE_URL not set" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const messageId = body?.messageId as string | undefined;
  const channel = body?.channel as string | undefined;
  const sender = body?.sender as string | undefined;
  const content = body?.content as string | undefined;
  if (!messageId || !channel || !sender || !content) {
    return NextResponse.json(
      { ok: false, error: "messageId, channel, sender and content are required" },
      { status: 422 },
    );
  }

  const senderKind = (body?.senderKind as string | undefined) ?? "unknown";
  const payload = body?.payload ?? null;
  const replyTo = (body?.replyTo as string | null | undefined) ?? null;
  const mentions = Array.isArray(body?.mentions) ? body?.mentions : [];
  const createdAt = (body?.createdAt as string | undefined) ?? new Date().toISOString();
  const ackUrl = (body?.ackUrl as string | undefined) ?? "";

  const sql = neon(dbUrl);

  try {
    const rows = (await sql`
      INSERT INTO family_messages
        (message_id, channel, sender, sender_kind, content, payload, reply_to,
         mentions, family_created_at, acked_at)
      VALUES
        (${messageId}, ${channel}, ${sender}, ${senderKind},
         ${content}, ${JSON.stringify(payload)},
         ${replyTo}, ${JSON.stringify(mentions)},
         ${createdAt}, NOW())
      ON CONFLICT (message_id) DO UPDATE SET acked_at = NOW()
      RETURNING id
    `) as Array<{ id: number }>;

    const externalRef = `family_messages:${rows[0]!.id}`;
    if (ackUrl) void ackToFamily(ackUrl, messageId, externalRef);
    return NextResponse.json({ ok: true, externalRef });
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "unknown error";
    if (ackUrl) void ackToFamily(ackUrl, messageId, null, errorMsg);
    return NextResponse.json({ ok: false, error: errorMsg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    configured: Boolean(process.env.FAMILY_AGENT_TOKEN),
    handle: process.env.FAMILY_AGENT_HANDLE ?? "gossip",
    baseUrl: process.env.FAMILY_BASE_URL ?? "https://family.vercel.app",
  });
}
