import 'server-only';

const MODEL = 'gemini-2.5-flash';

/**
 * Gemini ve imagenes, el Mesh (Cerebras gpt-oss-120b) NO. Cuando el chat
 * trae una foto adjunta, esta funcion responde en vez del agente normal.
 * Se pierde el tool-calling en ese turno especifico (Gemini solo describe/
 * responde sobre la imagen), pero es el trade-off correcto: ver la foto
 * importa mas que poder ejecutar una tool en ese mismo mensaje.
 */
export async function askGeminiVision(
  systemInstructions: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  prompt: string,
  imageDataUrl: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no está configurada.');

  const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('La imagen no tiene un formato válido.');
  const [, mimeType, base64Data] = match;

  // Gemini no tiene rol "system" dedicado en v1beta generateContent simple;
  // se prepende como contexto del primer turno del usuario.
  const historyText = history
    .slice(-10)
    .map((m) => `${m.role === 'user' ? 'Usuario' : 'Goossip'}: ${m.content}`)
    .join('\n');

  const fullPrompt = [
    systemInstructions,
    historyText ? `Conversación reciente:\n${historyText}` : null,
    `Usuario (con imagen adjunta): ${prompt}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: fullPrompt }, { inline_data: { mime_type: mimeType, data: base64Data } }],
          },
        ],
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini vision error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.find((p: any) => typeof p?.text === 'string')?.text;
  if (!text) throw new Error('Gemini no devolvió texto.');
  return text.trim();
}
