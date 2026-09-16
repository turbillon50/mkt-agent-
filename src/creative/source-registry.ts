import { db } from '../db/client';
import { knowledgeSources } from '../db/schema';
import { playbookDe, type RedPublicable } from './social-playbooks';

/** Guarda la fuente oficial y su versión sin duplicarla. */
export async function syncOfficialSocialSources(redes: RedPublicable[]): Promise<void> {
  const now = new Date();
  const validUntil = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
  const unique = [...new Set(redes)];
  if (!unique.length) return;

  await Promise.all(
    unique.map((red) => {
      const p = playbookDe(red);
      const row = {
        id: `official:${red}:publishing`,
        platform: red,
        kind: 'publishing-playbook',
        title: `Reglas oficiales de publicación para ${red}`,
        url: p.fuente,
        authority: 100,
        version: p.version,
        fetchedAt: now,
        validUntil,
        metadata: { objective: p.objetivo, formatHint: p.formatoPista },
        updatedAt: now,
      };
      return db
        .insert(knowledgeSources)
        .values(row)
        .onConflictDoUpdate({
          target: knowledgeSources.id,
          set: {
            title: row.title,
            url: row.url,
            authority: row.authority,
            version: row.version,
            fetchedAt: row.fetchedAt,
            validUntil: row.validUntil,
            metadata: row.metadata,
            updatedAt: row.updatedAt,
          },
        });
    }),
  );
}
