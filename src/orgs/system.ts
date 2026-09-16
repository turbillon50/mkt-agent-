/**
 * Organización de las tareas de SISTEMA.
 *
 * El agente social heredado (crons `/api/cron/run` y `/api/cron/plan`, el CLI
 * `npm run cli` y las herramientas de Mastra que corren fuera de una petición)
 * no tiene sesión y por lo tanto no tiene org en el token. Pero desde la
 * migración 0013 `posts`, `knowledge` y `plan_items` llevan `org_id NOT NULL`.
 *
 * Resolución, en este orden:
 *   1. `GOOSSIP_SYSTEM_ORG_ID` en env — la vía explícita.
 *   2. Si el espejo tiene UNA sola organización, esa.
 *   3. Si hay varias y nadie eligió, se REVIENTA con un mensaje claro en vez de
 *      escribir en la org equivocada. Escribir en el tenant de otro es peor que
 *      no escribir.
 */
import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { organizations } from '../db/schema';

let cached: string | null = null;

export async function systemOrgId(): Promise<string> {
  const fromEnv = (process.env.GOOSSIP_SYSTEM_ORG_ID ?? '').trim();
  if (fromEnv) return fromEnv;
  if (cached) return cached;

  const rows = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(sql`${organizations.status} = 'active'`)
    .limit(2);

  if (rows.length === 1) {
    cached = rows[0].id;
    return cached;
  }
  if (rows.length === 0) {
    throw new Error(
      'No hay ninguna organización activa. Crea una desde /onboarding o define GOOSSIP_SYSTEM_ORG_ID.',
    );
  }
  throw new Error(
    'Hay más de una organización: define GOOSSIP_SYSTEM_ORG_ID para decir en cuál escriben las tareas de sistema.',
  );
}

/** Solo para pruebas: olvida la org resuelta. */
export function resetSystemOrgCache(): void {
  cached = null;
}
