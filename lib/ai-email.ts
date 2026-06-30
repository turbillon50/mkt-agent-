import 'server-only';
import { chat } from '@/src/openrouter';

// ── IA para correos (tarea 681 punto 5) ──────────────────────────────────
// Reusa el mismo motor que genera los posts (src/openrouter -> Mesh). No
// reinventa nada: solo prompts orientados a email marketing en español.
// Devuelve siempre texto limpio; si la IA falla, el caller maneja el error.

const SYS = `Eres un redactor experto en email marketing en español (México), cálido y profesional. Escribes correos que se abren y se contestan: asuntos cortos y honestos (sin clickbait barato, sin MAYÚSCULAS gritando, sin emojis de relleno), cuerpos claros y humanos. Respetas las variables de personalización con doble llave tal cual aparecen: {{nombre}}, {{empresa}}, {{remitente}}. Nunca inventas datos, cifras ni promesas. No uses la palabra "delve" ni guiones largos.`;

function clean(s: string): string {
  return s
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^(asunto|subject)\s*:\s*/i, '')
    .trim();
}

export type AiEmailAction = 'subject' | 'body' | 'generate';

/** Sugiere un mejor asunto a partir del cuerpo (o del asunto actual). */
export async function improveSubject(input: { subject?: string; body?: string }): Promise<string> {
  const ctx = [
    input.subject ? `Asunto actual: ${input.subject}` : '',
    input.body ? `Cuerpo del correo:\n${input.body.slice(0, 1200)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const out = await chat(
    [
      { role: 'system', content: SYS },
      {
        role: 'user',
        content: `${ctx}\n\nDame UN solo asunto mejorado (máx 60 caracteres) con mejor probabilidad de apertura. Responde SOLO el asunto, sin comillas ni prefijos.`,
      },
    ],
    { temperature: 0.7, maxTokens: 200 },
  );
  return clean(out).slice(0, 120);
}

/** Mejora la redacción del cuerpo conservando intención y variables. */
export async function improveBody(input: { subject?: string; body: string }): Promise<string> {
  const out = await chat(
    [
      { role: 'system', content: SYS },
      {
        role: 'user',
        content: `${input.subject ? `Asunto: ${input.subject}\n\n` : ''}Mejora este correo: redacción más clara y cálida, mismo idioma, conserva EXACTAMENTE las variables {{nombre}} {{empresa}} {{remitente}} si aparecen. No lo alargues de más. Responde SOLO el cuerpo del correo, sin asunto ni explicaciones.\n\n---\n${input.body}`,
      },
    ],
    { temperature: 0.7, maxTokens: 900 },
  );
  return clean(out);
}

/** Genera asunto + cuerpo desde un prompt corto del usuario. */
export async function generateFromPrompt(prompt: string): Promise<{ subject: string; body: string }> {
  const out = await chat(
    [
      { role: 'system', content: SYS },
      {
        role: 'user',
        content: `Escribe un correo de marketing a partir de esta idea: "${prompt}". Usa {{nombre}} para saludar y {{empresa}} si aplica. Cierra con una llamada a la acción clara. Responde EN JSON válido y nada más, con esta forma exacta: {"subject": "...", "body": "..."} (el body con saltos de línea reales como \\n).`,
      },
    ],
    { temperature: 0.8, maxTokens: 1000 },
  );
  const match = out.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      const subject = clean(String(parsed.subject ?? '')).slice(0, 140);
      const body = String(parsed.body ?? '').trim();
      if (subject || body) return { subject, body };
    } catch {
      /* cae al fallback de abajo */
    }
  }
  // Fallback: si no vino JSON, usa la primera línea como asunto.
  const lines = clean(out).split('\n');
  return { subject: clean(lines[0] ?? prompt).slice(0, 140), body: lines.slice(1).join('\n').trim() || clean(out) };
}
