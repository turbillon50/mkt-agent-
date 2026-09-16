/**
 * La llamada cruda al modelo de imagen de Gemini.
 *
 * Vive en `src/` y NO lleva `import 'server-only'` (corrida 6). Lo llevaba
 * cuando estaba en `lib/`, y eso lo hacía inservible para las pruebas y los
 * scripts de tsx, que corren fuera de Next: `server-only` revienta en cuanto
 * alguien lo importa desde ahí. Es la misma razón por la que `src/composio`,
 * `src/channels` y `src/projects` viven en `src/`.
 *
 * La protección no se pierde: quien lo use desde una pantalla lo importa por
 * `lib/gemini-image`, que sí conserva el candado.
 */
const MODEL = 'gemini-2.5-flash-image';

export type GeneratedImage = {
  dataUrl: string;
  mimeType: string;
};

/**
 * Genera una imagen real con Gemini (gemini-2.5-flash-image / "nano banana").
 * Devuelve un data URL listo para <img src> o para guardar en metadata del chat.
 *
 * `aspectRatio` (corrida 6) le pide a Gemini el lienzo de la red. Lo acepta,
 * pero no lo cumple al píxel: pidiéndole `4:5` devolvió 896 × 1152, que es 7:9
 * (medido 16-sep-2026). Por eso el motor de piezas SIEMPRE recorta después al
 * tamaño exacto de la spec — la red sí cuenta los píxeles.
 */
export async function generateImage(
  prompt: string,
  opts: { aspectRatio?: string } = {},
): Promise<GeneratedImage> {
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
        ...(opts.aspectRatio
          ? { generationConfig: { imageConfig: { aspectRatio: opts.aspectRatio } } }
          : {}),
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
