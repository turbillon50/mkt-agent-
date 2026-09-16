/**
 * Higgsfield: foto de producto, avatar/UGC y reel corto.
 *
 * Gemini hace la imagen base de una pieza de muro. Higgsfield es para lo otro:
 * el producto sobre fondo de estudio, la persona sosteniendo el producto, el
 * video vertical de 5 segundos. Son trabajos distintos y por eso son dos
 * motores y no uno.
 *
 * Cómo se habla con él, medido el 16-sep-2026 contra la API de verdad:
 *
 *   GET  https://fnf.higgsfield.ai/agents/models      → 117 modelos con su esquema
 *   POST https://fnf.higgsfield.ai/agents/jobs        → ["<uuid>"]
 *   GET  https://fnf.higgsfield.ai/agents/jobs/<uuid> → status + result_url
 *   GET  https://fnf.higgsfield.ai/agents/workspaces  → créditos del espacio
 *
 * Los modelos que usa esta corrida, con el nombre exacto del catálogo:
 *   · `marketing_studio_2_image` con `type: 'product_shots'` → foto de producto
 *   · `marketing_studio_2_image` con `type: 'product_shots_people'` → UGC
 *   · `marketing_studio_2_image` con `type: 'ads'` → anuncio con CTA
 *   · `seedance_2_0` → video corto
 *   · `nano_banana_2_lite` → imagen rápida y barata, la que se usa para probar
 *
 * La llave: `HIGGSFIELD_ACCESS_TOKEN`. Es un token de sesión de la cuenta de la
 * casa, no una llave por cliente — Higgsfield no tiene cuentas por proyecto y
 * no se va a inventar una. Sin la variable, los adaptadores dicen que no está
 * disponible y el motor sigue con Gemini: no truena nada.
 *
 * La guía de PROMPT no está aquí: sale de la memoria de diseño, que es donde se
 * ingirieron las nueve skills de Higgsfield de la casa (1092 pedazos). Este
 * archivo solo sabe hablar con la API.
 */
import { buscarDiseno } from '../design/knowledge';

const BASE = process.env.HIGGSFIELD_BASE_URL || 'https://fnf.higgsfield.ai';

export function higgsfieldToken(): string | null {
  const v = (process.env.HIGGSFIELD_ACCESS_TOKEN ?? '').trim();
  if (!v || v.startsWith('[') || v.startsWith('<')) return null;
  return v;
}

export function higgsfieldListo(): boolean {
  return higgsfieldToken() !== null;
}

export class HiggsfieldApagado extends Error {
  constructor() {
    super('Higgsfield no está configurado en este entorno.');
    this.name = 'HiggsfieldApagado';
  }
}

async function llamar<T>(ruta: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = higgsfieldToken();
  if (!token) throw new HiggsfieldApagado();
  const res = await fetch(`${BASE}${ruta}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    cache: 'no-store',
  });
  const texto = await res.text();
  let json: any = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg = json?.detail ?? json?.message ?? texto.slice(0, 200);
    throw new Error(`Higgsfield ${res.status}: ${msg}`);
  }
  return json as T;
}

export interface CreditosHiggsfield {
  creditos: number;
  plan: string | null;
}

export async function creditos(): Promise<CreditosHiggsfield | null> {
  try {
    const ws = await llamar<Array<{ credits?: number; plan_type?: string }>>('/agents/workspaces');
    const primero = ws?.[0];
    if (!primero) return null;
    return { creditos: Number(primero.credits ?? 0), plan: primero.plan_type ?? null };
  } catch {
    return null;
  }
}

export interface TrabajoHiggsfield {
  id: string;
  status: string;
  resultUrl: string | null;
}

const ESPERA_MAX_MS = 180_000;
const CADA_MS = 5_000;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function crearTrabajo(
  jobSetType: string,
  params: Record<string, unknown>,
): Promise<string> {
  const ids = await llamar<string[]>('/agents/jobs', {
    method: 'POST',
    body: { job_set_type: jobSetType, params },
  });
  const id = Array.isArray(ids) ? ids[0] : (ids as unknown as { id?: string })?.id;
  if (!id) throw new Error('Higgsfield no devolvió el trabajo.');
  return String(id);
}

export async function esperarTrabajo(id: string): Promise<TrabajoHiggsfield> {
  const hasta = Date.now() + ESPERA_MAX_MS;
  let ultimo = 'queued';
  while (Date.now() < hasta) {
    const j = await llamar<{ status: string; result_url: string | null }>(`/agents/jobs/${id}`);
    ultimo = j.status;
    if (j.status === 'completed') return { id, status: j.status, resultUrl: j.result_url ?? null };
    // 'failed', 'canceled', 'nsfw': no se reintenta a ciegas. Reintentar un
    // trabajo que el proveedor rechazó gasta créditos del cliente para volver
    // a fallar igual.
    if (['failed', 'canceled', 'cancelled', 'nsfw', 'error'].includes(j.status)) {
      return { id, status: j.status, resultUrl: null };
    }
    await dormir(CADA_MS);
  }
  return { id, status: `${ultimo} (se acabó la espera)`, resultUrl: null };
}

// ---------------------------------------------------------------------------
// Los tres encargos que Goossip sabe pedirle
// ---------------------------------------------------------------------------

export type EncargoHiggsfield = 'producto' | 'ugc' | 'anuncio' | 'video';

const MODELO: Record<EncargoHiggsfield, { jobSetType: string; tipo?: string }> = {
  producto: { jobSetType: 'marketing_studio_2_image', tipo: 'product_shots' },
  ugc: { jobSetType: 'marketing_studio_2_image', tipo: 'product_shots_people' },
  anuncio: { jobSetType: 'marketing_studio_2_image', tipo: 'ads' },
  video: { jobSetType: 'seedance_2_0' },
};

export const ENCARGO_LABEL: Record<EncargoHiggsfield, string> = {
  producto: 'Foto de producto',
  ugc: 'Persona con el producto',
  anuncio: 'Anuncio con llamada a la acción',
  video: 'Video corto',
};

/**
 * La guía de prompt sale de las skills ingeridas, no de aquí.
 *
 * Es la diferencia entre "Goossip usa Higgsfield" y "Goossip sabe usar
 * Higgsfield": el cómo redactar un `product_shots` está escrito en
 * `higgsfield-product-photoshoot`, y esa carpeta está en la memoria de diseño.
 */
export async function guiaDePrompt(encargo: EncargoHiggsfield): Promise<string> {
  const consulta = {
    producto: 'cómo redactar el prompt de una foto de producto con Higgsfield product photoshoot',
    ugc: 'cómo redactar un prompt UGC de Marketing Studio con una persona usando el producto',
    anuncio: 'cómo redactar un anuncio con Marketing Studio de Higgsfield con hook y CTA',
    video: 'cómo redactar el prompt de un video corto vertical con Seedance',
  }[encargo];

  const hits = await buscarDiseno(consulta, { k: 3, category: 'higgsfield' }).catch(() => []);
  return hits
    .map((h) => h.content.replace(/\s+/g, ' ').slice(0, 500))
    .join(' · ')
    .slice(0, 1500);
}

export interface PedidoHiggsfield {
  encargo: EncargoHiggsfield;
  prompt: string;
  aspectRatio?: string;
  /** Id de un medio ya subido a Higgsfield (la foto del producto del cliente). */
  imagenId?: string | null;
  /** Soul del cliente, si lo entrenó. */
  soulId?: string | null;
}

export interface PiezaHiggsfield {
  url: string;
  modelo: string;
  prompt: string;
  jobId: string;
}

/**
 * Pide la pieza y espera. Devuelve `null` con el motivo cuando no se puede —
 * sin token, sin créditos, el modelo rechazó — para que el motor siga adelante
 * en vez de dejar al usuario sin nada.
 */
export async function pedirAHiggsfield(
  p: PedidoHiggsfield,
): Promise<{ pieza: PiezaHiggsfield } | { error: string }> {
  if (!higgsfieldListo()) {
    return { error: 'Higgsfield no está configurado en este entorno.' };
  }

  const m = MODELO[p.encargo];
  const guia = await guiaDePrompt(p.encargo);
  const prompt = guia ? `${p.prompt}\n\nCómo se hace esto bien: ${guia}` : p.prompt;

  const params: Record<string, unknown> = { prompt };
  if (m.tipo) params.type = m.tipo;
  if (p.aspectRatio) params.aspect_ratio = p.aspectRatio;
  if (p.imagenId) params.product_image = { id: p.imagenId };
  if (p.soulId) params.character_photo = { id: p.soulId };

  try {
    const id = await crearTrabajo(m.jobSetType, params);
    const t = await esperarTrabajo(id);
    if (!t.resultUrl) {
      return { error: `Higgsfield no entregó la pieza (${t.status}).` };
    }
    return {
      pieza: { url: t.resultUrl, modelo: m.jobSetType, prompt, jobId: id },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Higgsfield falló.' };
  }
}
