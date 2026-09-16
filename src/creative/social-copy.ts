import type { Project } from '../db/schema';
import { config, type Platform } from '../config';
import { chatJSON } from '../openrouter';
import { generatePost } from '../generator';
import { playbookDe, type RedPublicable } from './social-playbooks';
import type { FormatoSpec } from './specs';

export interface SocialVariant {
  red: RedPublicable;
  copy: string;
  headline: string;
  cta: string;
  altText: string;
  visualBrief: string;
  playbookVersion: string;
  source: string;
}

function platformFor(red: RedPublicable): Platform {
  if (red === 'facebook') return 'meta';
  if (red === 'tiktok' || red === 'youtube') return 'instagram';
  return red;
}

function projectBrand(project: Project) {
  return {
    name: project.name,
    voice: project.brandVoice,
    topics: (project.brandTopics ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
    language: project.brandLanguage,
  };
}

/** Copy, texto en arte y dirección visual nacen juntos, pero son propios de la red. */
export async function generateSocialVariant(input: {
  project: Project;
  red: RedPublicable;
  formato: FormatoSpec;
  brief: string;
  angle?: string | null;
  requestedCta?: string | null;
  contexto?: string;
}): Promise<SocialVariant> {
  const p = playbookDe(input.red);
  const language = input.project.brandLanguage || 'es-MX';
  const voice = input.project.brandVoice || 'clara, humana y experta';
  const maxHeadline = Math.min(input.formato.limites?.titulo ?? 54, 64);

  const prompt = [
    `Crea una variante NATIVA para ${input.red}; no recicles el copy de otra red.`,
    `Marca: ${input.project.name}. Idioma: ${language}. Voz: ${voice}.`,
    input.contexto || '',
    `Brief: ${input.brief}`,
    input.angle ? `Ángulo pedido: ${input.angle}` : '',
    `Objetivo de la red: ${p.objetivo}`,
    `Estructura: ${p.estructuraCopy}`,
    `Tono: ${p.tono}`,
    `Formato visual: ${input.formato.label}, ${input.formato.ancho}x${input.formato.alto}.`,
    `Copy máximo: ${p.caracteresMax} caracteres. Hashtags máximo: ${p.hashtagsMax}.`,
    `Headline máximo: ${maxHeadline} caracteres. Debe funcionar sobre el arte.`,
    `CTA: ${input.requestedCta || p.cta}`,
    'No inventes cifras, premios, disponibilidad, precios, testimonios ni características no incluidas en el brief.',
    'No cambies el giro del negocio por una asociación superficial del brief. La verdad del proyecto manda.',
    'El visualBrief debe describir una escena concreta, distintiva y ejecutable de alta calidad; debe decir sujeto, entorno, encuadre, luz y espacio negativo, sin texto generado dentro de la imagen.',
    'Devuelve JSON estricto: {"copy":"...","headline":"...","cta":"...","altText":"...","visualBrief":"..."}.',
  ].filter(Boolean).join('\n');

  const out = await chatJSON<Partial<SocialVariant>>([
    {
      role: 'system',
      content: `Eres director creativo y social media lead de ${input.project.name}. Entregas conceptos distintos y publicables por red.`,
    },
    { role: 'user', content: prompt },
  ], {
    temperature: 0.82,
    maxTokens: Math.max(config.openrouter.minMaxTokens, 1000),
    model: config.openrouter.modelDraft,
  }).catch(() => null);

  const fallbackCopy = out?.copy?.trim()
    ? null
    : await generatePost({
      platform: platformFor(input.red),
      topic: input.brief,
      angle: input.angle ?? undefined,
      brand: projectBrand(input.project),
      projectId: input.project.id,
    });

  const copy = (out?.copy?.trim() || fallbackCopy || input.brief).slice(0, p.caracteresMax).trim();
  const headline = (out?.headline?.trim() || input.brief).slice(0, maxHeadline).trim();
  const cta = (out?.cta?.trim() || input.requestedCta || p.cta).slice(0, 80).trim();
  const visualBrief =
    out?.visualBrief?.trim() ||
    `${input.brief}. Dirección nativa para ${input.red}: ${p.angulos[0].direccion}.`;

  return {
    red: input.red,
    copy,
    headline,
    cta,
    altText: (out?.altText?.trim() || `Pieza de ${input.project.name}: ${input.brief}`).slice(0, 1000),
    visualBrief,
    playbookVersion: p.version,
    source: p.fuente,
  };
}
