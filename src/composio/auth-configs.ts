/**
 * Los auth configs de Composio, una vez por toolkit.
 *
 * Idempotente de verdad y en dos niveles: primero mira la tabla, después mira
 * lo que YA existe en la cuenta de Composio, y solo si no hay ninguno crea uno.
 * El segundo nivel importa porque la cuenta de Goossip ya traía 40 auth configs
 * de antes de esta corrida (gmail, slack, notion, hubspot…): crearlos otra vez
 * dejaría dos "apps" por toolkit y nadie sabría cuál autorizó el cliente.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { composioAuthConfigs, type ComposioAuthConfig } from '../db/schema';
import {
  createManagedAuthConfig,
  getToolkit,
  listAuthConfigs,
  toolkitIsManaged,
  type AuthConfigSummary,
} from './client';
import { defaultLogo, managedComposioSlugs } from '../projects/catalog';

export type { ComposioAuthConfig };

export async function listStoredAuthConfigs(): Promise<Map<string, ComposioAuthConfig>> {
  const rows = await db.select().from(composioAuthConfigs);
  return new Map(rows.map((r) => [r.toolkit, r]));
}

export async function storedAuthConfig(toolkit: string): Promise<ComposioAuthConfig | null> {
  const rows = await db
    .select()
    .from(composioAuthConfigs)
    .where(eq(composioAuthConfigs.toolkit, toolkit))
    .limit(1);
  return rows[0] ?? null;
}

async function save(row: {
  toolkit: string;
  authConfigId: string;
  managed: boolean;
  logo: string | null;
  name: string | null;
}): Promise<ComposioAuthConfig> {
  const now = new Date();
  const [saved] = await db
    .insert(composioAuthConfigs)
    .values({ ...row, updatedAt: now })
    .onConflictDoUpdate({
      target: composioAuthConfigs.toolkit,
      set: {
        authConfigId: row.authConfigId,
        managed: row.managed,
        logo: row.logo,
        name: row.name,
        updatedAt: now,
      },
    })
    .returning();
  return saved;
}

export interface EnsureResult {
  toolkit: string;
  authConfigId: string | null;
  /** `existente` = ya estaba en la tabla · `adoptado` = ya estaba en Composio · `creado` = nuevo. */
  accion: 'existente' | 'adoptado' | 'creado' | 'sin_managed' | 'error';
  detalle?: string;
}

/**
 * Deja listo el auth config de un toolkit. Devuelve el id o null si ese toolkit
 * no tiene auth administrada por Composio — en ese caso NO se inventa nada: la
 * tarjeta sale "Próximamente".
 */
export async function ensureAuthConfig(
  toolkitSlug: string,
  cache?: { stored?: Map<string, ComposioAuthConfig>; remote?: AuthConfigSummary[] },
): Promise<EnsureResult> {
  const stored = cache?.stored?.get(toolkitSlug) ?? (await storedAuthConfig(toolkitSlug));
  if (stored) {
    return { toolkit: toolkitSlug, authConfigId: stored.authConfigId, accion: 'existente' };
  }

  const toolkit = await getToolkit(toolkitSlug);
  if (!toolkit) {
    return { toolkit: toolkitSlug, authConfigId: null, accion: 'error', detalle: 'no está en el catálogo de Composio' };
  }
  if (!toolkitIsManaged(toolkit)) {
    return {
      toolkit: toolkitSlug,
      authConfigId: null,
      accion: 'sin_managed',
      detalle: `auth schemes: ${(toolkit.auth_schemes ?? []).join(', ') || 'ninguno'}`,
    };
  }

  const logo = toolkit.meta?.logo ?? defaultLogo(toolkitSlug);
  const remote = cache?.remote ?? (await listAuthConfigs());
  const existente = remote.find(
    (a) => a.toolkit?.slug === toolkitSlug && a.is_composio_managed && a.status !== 'DISABLED',
  );
  if (existente) {
    await save({
      toolkit: toolkitSlug,
      authConfigId: existente.id,
      managed: true,
      logo,
      name: toolkit.name,
    });
    return { toolkit: toolkitSlug, authConfigId: existente.id, accion: 'adoptado' };
  }

  const id = await createManagedAuthConfig(toolkitSlug, `goossip-${toolkitSlug}`);
  await save({ toolkit: toolkitSlug, authConfigId: id, managed: true, logo, name: toolkit.name });
  return { toolkit: toolkitSlug, authConfigId: id, accion: 'creado' };
}

/** Todo el catálogo de una pasada. Lo corre el script y también la primera visita. */
export async function ensureCatalogAuthConfigs(
  slugs: string[] = managedComposioSlugs(),
): Promise<EnsureResult[]> {
  const stored = await listStoredAuthConfigs();
  const faltan = slugs.filter((s) => !stored.has(s));
  // La lista de Composio se pide UNA vez, no una por toolkit: son 40+ filas
  // paginadas y pedirlas 17 veces es pagar 17 veces por la misma respuesta.
  const remote = faltan.length > 0 ? await listAuthConfigs() : [];

  const out: EnsureResult[] = [];
  for (const slug of slugs) {
    try {
      out.push(await ensureAuthConfig(slug, { stored, remote }));
    } catch (e) {
      out.push({
        toolkit: slug,
        authConfigId: null,
        accion: 'error',
        detalle: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return out;
}
