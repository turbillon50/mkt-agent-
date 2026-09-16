import { randomUUID } from 'node:crypto';
import type { Project, ProjectBrandKit } from '../db/schema';
import { generarPiezas } from './engine';
import { guardarLote } from './repo';
import { elegirFormato } from './specs';
import { generateSocialVariant, type SocialVariant } from './social-copy';
import { esRedPublicable, type RedPublicable } from './social-playbooks';
import { syncOfficialSocialSources } from './source-registry';

export interface SocialPackNetworkResult {
  red: RedPublicable;
  variant: SocialVariant;
  formato: { id: string; label: string; ancho: number; alto: number; ratio: string };
  piezas: Array<{ id: string; url: string; angulo: string }>;
}

export interface SocialPackResult {
  packId: string;
  networks: SocialPackNetworkResult[];
  failures: Array<{ red: string; reason: string }>;
}

/**
 * Genera un paquete completo: copy + arte independientes por red. Comparte el
 * brief y la marca, no la ejecución creativa ni el formato.
 */
export async function generateSocialPack(input: {
  project: Project;
  kit: ProjectBrandKit | null;
  redes: RedPublicable[];
  brief: string;
  angle?: string | null;
  cta?: string | null;
  optionsPerNetwork?: number;
}): Promise<SocialPackResult> {
  const redes = [...new Set(input.redes)].filter(esRedPublicable).slice(0, 6);
  if (!redes.length) throw new Error('Elige al menos una red publicable.');
  const packId = randomUUID();
  await syncOfficialSocialSources(redes).catch(() => undefined);

  const runs = await Promise.allSettled(
    redes.map(async (red): Promise<SocialPackNetworkResult> => {
      const formato = elegirFormato(red, null);
      const variant = await generateSocialVariant({
        project: input.project,
        red,
        formato,
        brief: input.brief,
        angle: input.angle,
        requestedCta: input.cta,
      });
      const result = await generarPiezas({
        project: input.project,
        kit: input.kit,
        red,
        formatoPista: formato.id,
        brief: variant.visualBrief,
        titular: variant.headline,
        cta: variant.cta,
        opciones: Math.min(3, Math.max(2, input.optionsPerNetwork ?? 2)),
      });
      const rows = await guardarLote({
        project: input.project,
        kit: input.kit,
        red,
        brief: input.brief,
        resultado: result,
        metadata: {
          socialPackId: packId,
          copy: variant.copy,
          headline: variant.headline,
          cta: variant.cta,
          altText: variant.altText,
          playbookVersion: variant.playbookVersion,
          source: variant.source,
        },
      });
      return {
        red,
        variant,
        formato: {
          id: formato.id,
          label: formato.label,
          ancho: formato.ancho,
          alto: formato.alto,
          ratio: formato.ratio,
        },
        piezas: rows.map((row) => ({
          id: row.id,
          url: row.url ?? '',
          angulo: String((row.metadata as any)?.angulo ?? 'opción'),
        })),
      };
    }),
  );

  const networks: SocialPackNetworkResult[] = [];
  const failures: Array<{ red: string; reason: string }> = [];
  runs.forEach((run, index) => {
    if (run.status === 'fulfilled') networks.push(run.value);
    else {
      failures.push({
        red: redes[index]!,
        reason: run.reason instanceof Error ? run.reason.message : 'No se pudo generar.',
      });
    }
  });
  if (!networks.length) throw new Error(failures[0]?.reason ?? 'No se pudo generar el paquete.');
  return { packId, networks, failures };
}
