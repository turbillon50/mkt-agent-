/**
 * Canva, por Composio, con la cuenta del PROYECTO.
 *
 * El camino real, con los slugs medidos contra el catálogo de Composio el
 * 16-sep-2026 (`GET /api/v3/tools?toolkit_slug=canva` → 32 tools):
 *
 *   1. `CANVA_ACCESS_USER_SPECIFIC_BRAND_TEMPLATES_LIST` — qué plantillas de
 *      marca tiene el proyecto.
 *   2. `CANVA_RETRIEVE_BRAND_TEMPLATE_DATASET_DEFINITION` — qué huecos tiene
 *      esa plantilla y de qué tipo son (texto / imagen).
 *   3. `CANVA_INITIATE_CANVA_DESIGN_AUTOFILL_JOB` — se rellenan los huecos con
 *      la imagen base, el titular y el CTA.
 *   4. `CANVA_RETRIEVE_DESIGN_AUTOFILL_JOB_STATUS` — se espera a que termine.
 *   5. `CANVA_INITIATES_CANVA_DESIGN_EXPORT_JOB` + `CANVA_GET_DESIGN_EXPORT_JOB_RESULT`
 *      — se exporta a PNG y sale la URL.
 *
 * Lo que NO se inventa: el autofill de plantillas de marca es una función de
 * Canva Enterprise. Un proyecto con Canva conectado pero sin plantillas de
 * marca cae al camino propio (`compose.ts`), y eso no es un error: es lo que
 * el issue manda hacer. `porQueNo()` devuelve el motivo en español para que la
 * pantalla lo pueda decir en vez de callarlo.
 */
import type { Project } from '../db/schema';
import { cuerpo, run, CanalNoConectado } from '../channels/base';
import { activeAccountFor } from '../projects/composio-connections';
import type { FormatoSpec } from './specs';

export interface PlantillaCanva {
  id: string;
  titulo: string;
}

/** Cuánto se espera a que Canva termine un trabajo, y cada cuánto se pregunta. */
const ESPERA_MAX_MS = 45_000;
const CADA_MS = 2_000;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function canvaConectado(project: Project): Promise<boolean> {
  return Boolean(await activeAccountFor(project, 'canva').catch(() => null));
}

export async function listarPlantillas(project: Project): Promise<PlantillaCanva[]> {
  const data = cuerpo<any>(await run(project, 'canva', 'CANVA_ACCESS_USER_SPECIFIC_BRAND_TEMPLATES_LIST', {}));
  const items = data?.items ?? data?.brand_templates ?? [];
  return (Array.isArray(items) ? items : [])
    .map((t: any) => ({ id: String(t?.id ?? ''), titulo: String(t?.title ?? 'Plantilla') }))
    .filter((t: PlantillaCanva) => t.id);
}

export interface RellenoCanva {
  plantillaId: string;
  /** Nombre del hueco → qué va dentro. */
  campos: Record<string, { type: 'text'; text: string } | { type: 'image'; asset_id: string }>;
}

/**
 * Arma la pieza en Canva y devuelve la URL de la exportación.
 *
 * Devuelve `null` —no lanza— cuando Canva simplemente no está disponible para
 * este proyecto: el motor sigue por el camino propio y el usuario recibe su
 * pieza igual. Solo lanza cuando Canva SÍ estaba y falló de verdad, que es
 * información que sí hay que enseñar.
 */
export async function armarConCanva(
  project: Project,
  input: {
    formato: FormatoSpec;
    titular?: string | null;
    cta?: string | null;
    /** El asset de Canva con la imagen base ya subida, si lo hay. */
    assetId?: string | null;
    plantillaId?: string | null;
  },
): Promise<{ url: string; disenoId: string } | null> {
  let plantillaId = input.plantillaId ?? null;

  try {
    if (!plantillaId) {
      const plantillas = await listarPlantillas(project);
      if (plantillas.length === 0) return null;
      plantillaId = plantillas[0]!.id;
    }
  } catch (e) {
    if (e instanceof CanalNoConectado) return null;
    return null;
  }

  // Los huecos de la plantilla. Sin la definición del dataset no se puede
  // rellenar: mandar nombres inventados hace que Canva conteste 400.
  let huecos: Record<string, { type?: string }> = {};
  try {
    const def = cuerpo<any>(
      await run(project, 'canva', 'CANVA_RETRIEVE_BRAND_TEMPLATE_DATASET_DEFINITION', {
        brandTemplateId: plantillaId,
      }),
    );
    huecos = def?.dataset ?? def?.data?.dataset ?? {};
  } catch {
    return null;
  }

  const campos: RellenoCanva['campos'] = {};
  for (const [nombre, spec] of Object.entries(huecos)) {
    const tipo = (spec as any)?.type;
    if (tipo === 'image' && input.assetId) {
      campos[nombre] = { type: 'image', asset_id: input.assetId };
    } else if (tipo === 'text') {
      // El primer hueco de texto se lleva el titular, el segundo el CTA. Es
      // una convención, y se documenta como tal: Canva no dice para qué sirve
      // cada hueco, solo cómo se llama.
      const yaHayTitular = Object.values(campos).some((c) => c.type === 'text');
      const valor = yaHayTitular ? input.cta : input.titular;
      if (valor) campos[nombre] = { type: 'text', text: valor };
    }
  }
  if (Object.keys(campos).length === 0) return null;

  let jobId: string;
  try {
    const job = cuerpo<any>(
      await run(project, 'canva', 'CANVA_INITIATE_CANVA_DESIGN_AUTOFILL_JOB', {
        brand_template_id: plantillaId,
        data: campos,
      }),
    );
    jobId = String(job?.job?.id ?? job?.id ?? '');
    if (!jobId) return null;
  } catch {
    return null;
  }

  const disenoId = await esperarAutofill(project, jobId);
  if (!disenoId) return null;

  const url = await exportar(project, disenoId);
  return url ? { url, disenoId } : null;
}

async function esperarAutofill(project: Project, jobId: string): Promise<string | null> {
  const hasta = Date.now() + ESPERA_MAX_MS;
  while (Date.now() < hasta) {
    const r = cuerpo<any>(
      await run(project, 'canva', 'CANVA_RETRIEVE_DESIGN_AUTOFILL_JOB_STATUS', { jobId }),
    ).catch?.(() => null) ?? null;
    const job = (r as any)?.job ?? r;
    const estado = job?.status;
    if (estado === 'success') return String(job?.result?.design?.id ?? '') || null;
    if (estado === 'failed') return null;
    await dormir(CADA_MS);
  }
  return null;
}

async function exportar(project: Project, disenoId: string): Promise<string | null> {
  let jobId: string;
  try {
    const job = cuerpo<any>(
      await run(project, 'canva', 'CANVA_INITIATES_CANVA_DESIGN_EXPORT_JOB', {
        design_id: disenoId,
        format: { type: 'png' },
      }),
    );
    jobId = String(job?.job?.id ?? job?.id ?? '');
    if (!jobId) return null;
  } catch {
    return null;
  }

  const hasta = Date.now() + ESPERA_MAX_MS;
  while (Date.now() < hasta) {
    try {
      const r = cuerpo<any>(
        await run(project, 'canva', 'CANVA_GET_DESIGN_EXPORT_JOB_RESULT', { exportId: jobId }),
      );
      const job = r?.job ?? r;
      if (job?.status === 'success') {
        const urls = job?.urls ?? job?.result?.urls ?? [];
        return Array.isArray(urls) && urls[0] ? String(urls[0]) : null;
      }
      if (job?.status === 'failed') return null;
    } catch {
      return null;
    }
    await dormir(CADA_MS);
  }
  return null;
}

/**
 * Por qué esta pieza no la armó Canva, dicho para el usuario. Nunca jerga: el
 * cliente no tiene que saber qué es un dataset ni un autofill job.
 */
export async function porQueNo(project: Project): Promise<string> {
  if (!(await canvaConectado(project))) {
    return 'Canva no está conectado en este proyecto, así que la pieza la armó Goossip.';
  }
  try {
    const plantillas = await listarPlantillas(project);
    if (plantillas.length === 0) {
      return 'Canva está conectado pero este proyecto no tiene plantillas de marca, así que la pieza la armó Goossip.';
    }
  } catch {
    return 'Canva está conectado pero no contestó, así que la pieza la armó Goossip.';
  }
  return 'La pieza la armó Goossip.';
}
