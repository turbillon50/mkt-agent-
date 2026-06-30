import 'server-only';

const MODEL = 'gemini-2.5-flash-image';

export type GeneratedImage = {
  dataUrl: string;
  mimeType: string;
};

/**
 * Genera una imagen real con Gemini (gemini-2.5-flash-image / "nano banana").
 * Devuelve un data URL listo para <img src> o para guardar en metadata del chat.
 */
export async function generateImage(prompt: string): Promise<GeneratedImage> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no está configurada.');
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini image error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p: any) => p?.inlineData?.data);

  if (!imagePart) {
    const textPart = parts.find((p: any) => typeof p?.text === 'string');
    throw new Error(
      textPart?.text
        ? `Gemini no generó imagen, respondió: ${textPart.text.slice(0, 200)}`
        : 'Gemini no devolvió ninguna imagen.',
    );
  }

  const mimeType = imagePart.inlineData.mimeType || 'image/png';
  const base64 = imagePart.inlineData.data as string;
  return { dataUrl: `data:${mimeType};base64,${base64}`, mimeType };
}
