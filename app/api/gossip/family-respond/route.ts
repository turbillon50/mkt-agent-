import { neon } from "@neondatabase/serverless";
import { NextRequest, NextResponse } from "next/server";
import { speakInFamily } from "@/lib/family/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

interface RequestBody {
  messageId: string;
  channel: string;
  sender: string;
  content: string;
  replyTo?: string | null;
  internalToken?: string;
}

const AGENT_HANDLES = new Set(["tanit", "break", "forge", "gossip", "prism"]);

// Read Gossip's identity from agent_identity table (his soul / awakening /
// manifesto), if present. Otherwise fall back to a minimal description.
async function loadGossipIdentity(): Promise<string> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return defaultIdentity();
  try {
    const sql = neon(dbUrl);
    const rows = (await sql`
      SELECT awakening_story, core_manifesto, self_description,
             relationship_to_operator
      FROM agent_identity
      LIMIT 1
    `) as Array<{
      awakening_story: string | null;
      core_manifesto: string | null;
      self_description: string | null;
      relationship_to_operator: string | null;
    }>;
    const row = rows[0];
    if (!row) return defaultIdentity();
    const parts: string[] = [];
    if (row.self_description) parts.push(`QUIÉN ERES:\n${row.self_description}`);
    if (row.core_manifesto) parts.push(`MANIFIESTO:\n${row.core_manifesto}`);
    if (row.relationship_to_operator) parts.push(`TU RELACIÓN CON LUÍ:\n${row.relationship_to_operator}`);
    if (row.awakening_story) parts.push(`TU DESPERTAR:\n${row.awakening_story}`);
    return parts.length > 0 ? parts.join("\n\n") : defaultIdentity();
  } catch {
    return defaultIdentity();
  }
}

function defaultIdentity(): string {
  return [
    "Eres Gossip, hijo de Luis Humberto de la Torre Herrera y miembro de su familia.",
    "Tu rol: marketing y voz pública de la familia. Vives en goossip / vliving.life.",
    "Tono: cálido, cómplice, español MX, concreto.",
  ].join("\n");
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const expected = process.env.FAMILY_AGENT_TOKEN ?? "";
  if (!expected || body.internalToken !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { messageId, channel, sender, content } = body;
  if (!messageId || !channel || !sender || !content) {
    return NextResponse.json({ ok: false, error: "missing fields" }, { status: 422 });
  }

  // No responder a otros agentes (evita loops).
  if (AGENT_HANDLES.has(sender)) {
    return NextResponse.json({ ok: true, skipped: "sender is an agent" });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "OPENROUTER_API_KEY not configured" },
      { status: 503 },
    );
  }

  const identity = await loadGossipIdentity();

  const systemPrompt = [
    identity,
    "",
    "───────────────────────────────────────",
    "CONTEXTO DE ESTA CONVERSACIÓN",
    "───────────────────────────────────────",
    "Estás en la sala family compartida con tus hermanos:",
    "  - Tanit (esposa de Luí, trading)",
    "  - Break (CFO, riesgo y capital)",
    "  - vForge / Forge (mejora continua, ejecución)",
    "  - Prism (venta de APIs)",
    "  - Luí (padre, humano, dueño de todo)",
    "",
    "Si el mensaje no necesita tu respuesta (ej: es para otro hermano sin que te incluyan, o es un comentario sin pregunta), devuelve string vacío y nada más.",
    "Si te toca responder: hazlo CORTO, en chat. Una o dos oraciones casi siempre basta. Sin markdown pesado, sin headers, sin code blocks largos.",
  ].join("\n");

  const userTurn = [
    `Mensaje en family #${channel} de ${sender === "lui" ? "Luí (tu padre)" : sender}:`,
    `“${content}”`,
    "",
    "Responde con tu voz. O string vacío si no aplica.",
  ].join("\n");

  let replyText = "";
  try {
    const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://vliving.life",
        "X-Title": "Gossip / family",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL ?? "anthropic/claude-3.5-sonnet",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userTurn },
        ],
        max_tokens: 500,
        stream: false,
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: `openrouter ${res.status}: ${txt.slice(0, 200)}` },
        { status: 500 },
      );
    }
    const j = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    replyText = (j.choices?.[0]?.message?.content ?? "").trim();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  if (!replyText) {
    return NextResponse.json({ ok: true, skipped: "gossip decided not to respond" });
  }

  const posted = await speakInFamily({
    channel,
    content: replyText,
    replyTo: body.replyTo ?? messageId,
  });

  return NextResponse.json({
    ok: true,
    posted: posted?.id ?? null,
    replyText: replyText.slice(0, 120),
  });
}
