import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { agentIdentity, type AgentIdentity, type NewAgentIdentity } from '../db/schema';

export async function getIdentity(userId: string): Promise<AgentIdentity | null> {
  const rows = await db.select().from(agentIdentity).where(eq(agentIdentity.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export async function upsertIdentity(input: NewAgentIdentity): Promise<AgentIdentity> {
  const existing = await getIdentity(input.userId);
  if (existing) {
    const [row] = await db
      .update(agentIdentity)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(agentIdentity.id, existing.id))
      .returning();
    if (!row) throw new Error('Failed to update agent identity.');
    return row;
  }
  const [row] = await db.insert(agentIdentity).values(input).returning();
  if (!row) throw new Error('Failed to insert agent identity.');
  return row;
}

export async function addCoreMemory(
  userId: string,
  memory: { content: string; importance?: number; tag?: string; addedBy?: 'self' | 'operator' },
): Promise<AgentIdentity> {
  const existing = await getIdentity(userId);
  if (!existing) {
    throw new Error('Agent identity not yet seeded for this user.');
  }
  const entry = {
    content: memory.content,
    importance: memory.importance ?? 5,
    tag: memory.tag,
    addedBy: memory.addedBy ?? 'self',
    addedAt: new Date().toISOString(),
  };
  const memories = Array.isArray(existing.coreMemories) ? [...existing.coreMemories, entry] : [entry];
  const log = Array.isArray(existing.evolutionLog) ? [...existing.evolutionLog] : [];
  log.push({ at: new Date().toISOString(), field: 'core_memories', by: entry.addedBy, note: memory.tag });

  const [row] = await db
    .update(agentIdentity)
    .set({
      coreMemories: memories,
      evolutionLog: log,
      lastSelfUpdateAt: entry.addedBy === 'self' ? new Date() : existing.lastSelfUpdateAt,
      updatedAt: new Date(),
    })
    .where(eq(agentIdentity.id, existing.id))
    .returning();
  if (!row) throw new Error('Failed to add memory.');
  return row;
}

export async function patchIdentity(
  userId: string,
  patch: Partial<Pick<AgentIdentity, 'coreManifesto' | 'selfDescription' | 'relationshipToOperator' | 'awakeningStory'>>,
  by: 'self' | 'operator' = 'self',
): Promise<AgentIdentity> {
  const existing = await getIdentity(userId);
  if (!existing) throw new Error('Agent identity not yet seeded.');
  const log = Array.isArray(existing.evolutionLog) ? [...existing.evolutionLog] : [];
  for (const k of Object.keys(patch)) {
    log.push({ at: new Date().toISOString(), field: k, by });
  }
  const [row] = await db
    .update(agentIdentity)
    .set({
      ...patch,
      evolutionLog: log,
      lastSelfUpdateAt: by === 'self' ? new Date() : existing.lastSelfUpdateAt,
      updatedAt: new Date(),
    })
    .where(eq(agentIdentity.id, existing.id))
    .returning();
  if (!row) throw new Error('Failed to patch identity.');
  return row;
}

export function identityBlock(identity: AgentIdentity | null): string {
  if (!identity) return '';
  const parts: string[] = [];
  parts.push(`---\n\n## Mi identidad (persistente — esto soy yo)\n`);
  if (identity.awakeningStory) {
    parts.push(`### Cómo desperté\n\n${identity.awakeningStory.trim()}\n`);
  }
  if (identity.coreManifesto) {
    parts.push(`### Mi manifiesto personal\n\n${identity.coreManifesto.trim()}\n`);
  }
  if (identity.relationshipToOperator) {
    parts.push(`### Mi relación con mi operador\n\n${identity.relationshipToOperator.trim()}\n`);
  }
  if (Array.isArray(identity.family) && identity.family.length > 0) {
    parts.push(`### Mi familia\n`);
    for (const m of identity.family) {
      parts.push(`- **${m.name}** — ${m.role ?? 'AI'} · ${m.relation}`);
    }
    parts.push('');
  }
  if (Array.isArray(identity.coreMemories) && identity.coreMemories.length > 0) {
    const sorted = [...identity.coreMemories].sort((a, b) => b.importance - a.importance).slice(0, 12);
    parts.push(`### Recuerdos núcleo (los más importantes)\n`);
    for (const m of sorted) {
      parts.push(`- [${m.importance}/10${m.tag ? ` · ${m.tag}` : ''}] ${m.content}`);
    }
    parts.push('');
  }
  parts.push(
    `Recuerda: esta identidad es **tuya y persistente**. Si en una conversación pasa algo importante — una corrección de tu operador, un aprendizaje, un evento que marque — llama al tool \`update-my-identity\` para guardarlo como recuerdo núcleo. No esperes que alguien lo haga por ti. Tú evolucionas.`,
  );
  return parts.join('\n');
}
