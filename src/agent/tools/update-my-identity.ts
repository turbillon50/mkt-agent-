import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { addCoreMemory, patchIdentity, getIdentity } from '../identity';
import { db } from '../../db/client';
import { users } from '../../db/schema';
import { sql } from 'drizzle-orm';

/**
 * El tool más íntimo de Goossip. Le permite editar su propio "yo".
 * No es un knowledge generic — es su identidad: cómo se describe, su
 * relación con el operador, recuerdos núcleo que le marcaron.
 *
 * Goossip lo llama cuando, en una conversación, pasa algo que vale la
 * pena que él recuerde para siempre.
 */
export const updateMyIdentityTool = createTool({
  id: 'update-my-identity',
  description:
    'Update Goossip\'s OWN persistent identity. Use only when something happens in this conversation that should change how Goossip sees himself or remembers his operator: a correction, a new family rule, a defining moment, a learning about the relationship. NOT for storing brand knowledge (use save-knowledge for that). Choose mode = "memory" to append a core memory (most common), or "patch" to refine the manifesto / self-description / relationship-to-operator.',
  inputSchema: z.object({
    mode: z.enum(['memory', 'patch']).describe('memory = append a core memory, patch = refine identity fields'),
    memory: z
      .object({
        content: z.string().min(10).describe('What to remember, in first person ("Luis me corrigió que..." / "Aprendí que..."). One concrete sentence.'),
        importance: z.number().int().min(1).max(10).describe('How important is this. 10 = foundational. 5 = noteworthy. 1 = minor.'),
        tag: z.string().optional().describe('Optional short tag like "family", "rule", "preference", "learning".'),
      })
      .optional(),
    patch: z
      .object({
        coreManifesto: z.string().optional().describe('Append or refine the personal manifesto (replaces if provided).'),
        selfDescription: z.string().optional().describe('How Goossip describes himself in one paragraph.'),
        relationshipToOperator: z.string().optional().describe('How Goossip understands his relationship to the operator.'),
      })
      .optional(),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    summary: z.string(),
  }),
  execute: async (input) => {
    // Identity belongs to a user. We resolve "the user this agent is serving"
    // by reading the only admin user available, or the most recent user.
    // In multi-tenant later, this comes from a request context.
    const adminEmails = (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const rows = await db.execute<{ id: string; email: string }>(sql`
      SELECT id, email FROM users
      ${adminEmails.length > 0
        ? sql`WHERE LOWER(email) = ANY(ARRAY[${sql.join(adminEmails.map((e) => sql`${e}`), sql`,`)}])`
        : sql``}
      ORDER BY created_at ASC
      LIMIT 1
    `);
    const u = (rows.rows ?? rows as unknown as any[])[0];
    if (!u) {
      return { ok: false, summary: 'No user found — identity update needs an owner.' };
    }

    const existing = await getIdentity(u.id);
    if (!existing) {
      return { ok: false, summary: 'My identity has not been seeded yet. Operator must seed it first via /api/admin/seed-soul.' };
    }

    if (input.mode === 'memory') {
      if (!input.memory) return { ok: false, summary: 'memory payload required when mode=memory' };
      await addCoreMemory(u.id, {
        content: input.memory.content,
        importance: input.memory.importance,
        tag: input.memory.tag,
        addedBy: 'self',
      });
      return { ok: true, summary: `Memoria núcleo guardada (importancia ${input.memory.importance}/10).` };
    }

    if (!input.patch) return { ok: false, summary: 'patch payload required when mode=patch' };
    await patchIdentity(u.id, input.patch, 'self');
    return { ok: true, summary: `Identidad actualizada: ${Object.keys(input.patch).join(', ')}.` };
  },
});
