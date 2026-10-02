/**
 * Prospección por Google Maps.
 *
 * Luis lo pidió "tipo PhantomBuster". Lo que NO es tipo PhantomBuster, y es la
 * regla de la casa: **aquí no se raspa a ninguna persona.** PhantomBuster vive
 * de recorrer perfiles de LinkedIn con una sesión prestada, y eso termina en
 * cuentas baneadas y en cartas de abogados. Lo que sí se hace:
 *
 *   1. Se le pregunta a **Google Maps, por su API oficial**, qué negocios hay
 *      de tal giro en tal zona. Google devuelve nombre, dirección, teléfono,
 *      sitio, rating y horario porque el negocio los publicó para que la gente
 *      los use.
 *   2. Se lee el **sitio público del negocio** —su home y su página de
 *      contacto— para sacar el correo, el WhatsApp y las redes que ellos
 *      mismos pusieron ahí. Sin login y respetando su robots.txt.
 *
 * Nada más. Ni un perfil personal, ni una sesión prestada, ni un solo `fetch`
 * a una red social detrás de su muro.
 *
 * DOS CAMINOS al mismo Google, y los dos oficiales:
 *
 *   · `composio` — la cuenta de Google del CLIENTE, conectada en Conexiones
 *     (toolkit `google_maps`, auth administrada OAUTH2, medido el 16-sep-2026:
 *     `GOOGLE_MAPS_TEXT_SEARCH` y `GOOGLE_MAPS_NEARBY_SEARCH`). Es el camino
 *     preferido porque el consumo cae en la cuenta del cliente, que es de quien
 *     es el negocio.
 *   · `places` — la llave de la casa (`GOOGLE_MAPS_API_KEY`) contra Places API
 *     (New). Es el respaldo para que la herramienta sirva el PRIMER DÍA, antes
 *     de que el cliente conecte nada.
 *
 * Cuál se usó se guarda en cada búsqueda, porque el costo cae en bolsillos
 * distintos y "cuánto llevo gastado" tiene que poder contestarse por separado.
 */
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  prospectSearches,
  prospects,
  type NewProspect,
  type Project,
  type Prospect,
  type ProspectEnrichment,
} from '../db/schema';
import { activeAccountFor } from '../projects/composio-connections';
import { executeTool } from '../composio/client';
import { cuerpo } from '../channels/base';
import { METROS_POR_GRADO_LAT } from './geo';

// ---------------------------------------------------------------------------
// Lo que devuelve Google, ya parejo
// ---------------------------------------------------------------------------

export interface Lugar {
  placeId: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  ratingsCount: number | null;
  category: string | null;
  lat: number | null;
  lng: number | null;
  mapsUrl: string | null;
  /**
   * Solo viene si se pidieron horarios, que Google cobra en un tramo más caro.
   * `null` significa "no se preguntó", no "no abre 24 h" — la diferencia importa
   * porque el resumen no puede contar como cerrado lo que nunca revisó.
   */
  abierto24h?: boolean | null;
  abiertoAhora?: boolean | null;
}

export type ViaMaps = 'composio' | 'places';

/**
 * Los campos que se piden. Es una lista y no `*` a propósito: Places cobra por
 * TRAMO de campos (Basic / Advanced / Preferred) y pedir el universo entero
 * multiplica la factura por algo que nadie va a mirar.
 */
const CAMPOS_BASE = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.primaryTypeDisplayName',
  'places.primaryType',
  'places.location',
  'places.googleMapsUri',
];

const CAMPOS = CAMPOS_BASE.join(',');

/**
 * El horario va APARTE porque va en otra factura.
 *
 * `places.regularOpeningHours` es del tramo Enterprise de Places API (New);
 * todo lo de arriba es Pro. Meterlo en la lista fija subiría el precio de cada
 * búsqueda que hace la app —incluidas las que a nadie le importa el horario—
 * para que el resumen pueda decir "3 abiertos 24 h" de vez en cuando. Se pide
 * solo cuando el usuario prende ese filtro, y la pantalla se lo advierte.
 */
const CAMPO_HORARIOS = 'places.regularOpeningHours';

function mascara(horarios: boolean): string {
  const campos = [...CAMPOS_BASE, 'nextPageToken'];
  if (horarios) campos.push(CAMPO_HORARIOS);
  return campos.join(',');
}

/**
 * ¿Abre 24 horas?
 *
 * Google no tiene una bandera para eso: lo dice **por omisión**. Un negocio
 * abierto siempre viene con un solo periodo que abre el domingo a las 00:00 y
 * **no trae `close`**. Es el único caso en toda la respuesta donde falta el
 * cierre, así que buscar esa falta es más confiable que sumar horas.
 */
export function abre24h(horario: any): boolean | null {
  const periodos = horario?.periods;
  if (!Array.isArray(periodos)) return null;
  if (periodos.length === 0) return false;
  return periodos.length === 1 && periodos[0]?.open != null && periodos[0]?.close == null;
}

export class MapsNoDisponible extends Error {
  constructor() {
    super(
      'Para buscar negocios en el mapa hace falta conectar Google Maps en Conexiones del proyecto, o que Goossip tenga su llave de Google Places en este entorno.',
    );
    this.name = 'MapsNoDisponible';
  }
}

function llaveDeLaCasa(): string | null {
  const raw = (process.env.GOOGLE_MAPS_API_KEY ?? '').trim();
  if (!raw || raw.startsWith('[') || raw.startsWith('<')) return null;
  return raw;
}

/** Por dónde puede buscar ESTE proyecto hoy. `null` = por ninguna. */
export async function viaDisponible(project: Project): Promise<ViaMaps | null> {
  const cuenta = await activeAccountFor(project, 'google_maps').catch(() => null);
  if (cuenta) return 'composio';
  return llaveDeLaCasa() ? 'places' : null;
}

function normaliza(p: any): Lugar | null {
  const id = p?.id ?? p?.place_id ?? p?.placeId;
  const nombre = p?.displayName?.text ?? p?.displayName ?? p?.name;
  if (!id || !nombre) return null;
  const loc = p?.location ?? {};
  return {
    placeId: String(id),
    name: String(nombre),
    address: p?.formattedAddress ?? p?.shortFormattedAddress ?? null,
    phone: p?.nationalPhoneNumber ?? p?.internationalPhoneNumber ?? null,
    website: p?.websiteUri ?? null,
    rating: typeof p?.rating === 'number' ? p.rating : null,
    ratingsCount: typeof p?.userRatingCount === 'number' ? p.userRatingCount : null,
    category: p?.primaryTypeDisplayName?.text ?? p?.primaryType ?? null,
    lat: typeof loc?.latitude === 'number' ? loc.latitude : null,
    lng: typeof loc?.longitude === 'number' ? loc.longitude : null,
    mapsUrl: p?.googleMapsUri ?? null,
    abierto24h: abre24h(p?.regularOpeningHours ?? p?.currentOpeningHours),
    abiertoAhora:
      typeof p?.regularOpeningHours?.openNow === 'boolean' ? p.regularOpeningHours.openNow : null,
  };
}

// ---------------------------------------------------------------------------
// Las dos llamadas
// ---------------------------------------------------------------------------

/**
 * Una llamada a Google, por el camino que toque.
 *
 * Es el ladrillo del que cuelgan las dos formas de buscar: la frase suelta de
 * la corrida 7 y el recorrido por cuadrantes de la 12. Por eso devuelve también
 * el `pageToken`: sin él, "veinte por búsqueda" era un techo de la
 * implementación disfrazado de límite de Google.
 */
export interface PeticionLugares {
  project: Project;
  via: ViaMaps;
  /** El giro, con las palabras del usuario. */
  consulta: string;
  /** Limitar a esta celda. Es lo que usa el recorrido por cuadrantes. */
  caja?: { sur: number; oeste: number; norte: number; este: number } | null;
  /** Sesgar (o restringir, en Composio) a este círculo. */
  centro?: { lat: number; lng: number; radioM: number } | null;
  limite?: number;
  /** La página siguiente de la MISMA búsqueda. Google la cobra aparte. */
  pageToken?: string | null;
  minRating?: number;
  openNow?: boolean;
  horarios?: boolean;
  señal?: AbortSignal;
}

export interface RespuestaLugares {
  lugares: Lugar[];
  /** `null` = ya no hay más páginas. */
  pageToken: string | null;
}

async function porPlaces(input: PeticionLugares): Promise<RespuestaLugares> {
  const key = llaveDeLaCasa();
  if (!key) throw new MapsNoDisponible();

  const body: Record<string, unknown> = {
    textQuery: input.consulta,
    languageCode: 'es',
    pageSize: Math.min(input.limite ?? 20, 20),
  };
  /**
   * Rectángulo y no círculo, y no por gusto: la búsqueda por TEXTO de Places
   * API (New) acepta `locationRestriction.rectangle` y rechaza el círculo (el
   * círculo solo lo entiende `searchNearby`, que a su vez no sabe de texto
   * libre). Medido contra la API el 16-sep-2026. Como las celdas de la
   * cuadrícula embonan, restringir por rectángulo cubre la zona completa sin
   * preguntar dos veces por el mismo negocio.
   */
  if (input.caja) {
    body.locationRestriction = {
      rectangle: {
        low: { latitude: input.caja.sur, longitude: input.caja.oeste },
        high: { latitude: input.caja.norte, longitude: input.caja.este },
      },
    };
  } else if (input.centro) {
    body.locationBias = {
      circle: {
        center: { latitude: input.centro.lat, longitude: input.centro.lng },
        radius: input.centro.radioM,
      },
    };
  }
  // Filtrar del lado de Google es gratis; filtrar aquí ya se pagó la llamada.
  if (input.minRating && input.minRating > 0) body.minRating = input.minRating;
  if (input.openNow) body.openNow = true;
  if (input.pageToken) body.pageToken = input.pageToken;

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': mascara(Boolean(input.horarios)),
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: input.señal,
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`Google Maps contestó ${res.status}. ${detalle.slice(0, 200)}`);
  }
  const data = await res.json();
  return {
    lugares: ((data?.places ?? []) as any[]).map(normaliza).filter((x): x is Lugar => x !== null),
    pageToken: typeof data?.nextPageToken === 'string' ? data.nextPageToken : null,
  };
}

async function porComposio(input: PeticionLugares): Promise<RespuestaLugares> {
  const cuenta = await activeAccountFor(input.project, 'google_maps');
  if (!cuenta) throw new MapsNoDisponible();

  /**
   * Por Composio el recorrido sale por `NEARBY_SEARCH` con el CÍRCULO del
   * cuadrante, no con su rectángulo: esa herramienta solo entiende círculos. Es
   * la razón por la que cada cuadrante carga las dos figuras — misma celda,
   * dos idiomas.
   */
  const circulo = input.caja
    ? null
    : input.centro;
  const usarCerca = Boolean(input.caja || input.centro);
  const centroCerca = input.caja
    ? {
        lat: (input.caja.sur + input.caja.norte) / 2,
        lng: (input.caja.oeste + input.caja.este) / 2,
        // La media diagonal de la celda: el círculo más chico que la cubre.
        radioM: Math.max(
          50,
          Math.round(
            (Math.abs(input.caja.norte - input.caja.sur) * 111_320 * Math.SQRT2) / 2,
          ),
        ),
      }
    : circulo;

  const slug = usarCerca ? 'GOOGLE_MAPS_NEARBY_SEARCH' : 'GOOGLE_MAPS_TEXT_SEARCH';
  const args: Record<string, unknown> = usarCerca
    ? {
        // `includedTypes` se queda fuera a propósito: el giro viene en palabras
        // del usuario ("restaurantes", "gimnasios") y traducirlo a la taxonomía
        // de Google a ojo mete negocios que nadie pidió.
        locationRestriction: {
          circle: {
            center: { latitude: centroCerca!.lat, longitude: centroCerca!.lng },
            radius: centroCerca!.radioM,
          },
        },
        maxResultCount: Math.min(input.limite ?? 20, 20),
        fieldMask: mascara(Boolean(input.horarios)),
        languageCode: 'es',
      }
    : {
        textQuery: input.consulta,
        maxResultCount: Math.min(input.limite ?? 20, 20),
        fieldMask: mascara(Boolean(input.horarios)),
        languageCode: 'es',
      };
  if (input.pageToken) args.pageToken = input.pageToken;

  const res = await executeTool(slug, {
    userId: cuenta.userId,
    connectedAccountId: cuenta.connectedAccountId,
    arguments: args,
  });
  const data: any = cuerpo(res.data ?? res);
  const lista = data?.places ?? data?.results ?? [];
  return {
    lugares: (lista as any[]).map(normaliza).filter((x): x is Lugar => x !== null),
    pageToken: typeof data?.nextPageToken === 'string' ? data.nextPageToken : null,
  };
}

/** Le pregunta a Google por el camino que tenga este proyecto. */
export async function pedirLugares(input: PeticionLugares): Promise<RespuestaLugares> {
  return input.via === 'composio' ? porComposio(input) : porPlaces(input);
}

// ---------------------------------------------------------------------------
// Buscar y guardar
// ---------------------------------------------------------------------------

export interface ResultadoBusqueda {
  via: ViaMaps;
  consulta: string;
  encontrados: number;
  nuevos: number;
  repetidos: number;
  prospectos: Prospect[];
  /** Cuántas búsquedas van este mes y cuál es el tope. */
  costo: { mes: number; tope: number };
  searchId: string;
}

export class TopeDeBusquedas extends Error {
  constructor(readonly mes: number, readonly tope: number) {
    super(
      `Este proyecto ya lleva ${mes} búsquedas de mapa este mes y su tope es ${tope}. Súbelo en Ajustes si quieres seguir — cada búsqueda se la cobra Google.`,
    );
    this.name = 'TopeDeBusquedas';
  }
}

/** El tope mensual de búsquedas. Vive en las reglas del proyecto (jsonb). */
export const TOPE_POR_OMISION = 50;

export function topeDeBusquedas(project: Project): number {
  const raw = (project.rules as Record<string, unknown> | null)?.maps_search_cap;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : TOPE_POR_OMISION;
}

/** Cuántas búsquedas lleva el proyecto en el mes en curso. */
export async function busquedasDelMes(projectId: string, ahora = new Date()): Promise<number> {
  const inicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  const [fila] = await db
    .select({ n: sql<number>`coalesce(sum(${prospectSearches.costUnits}), 0)::int` })
    .from(prospectSearches)
    .where(
      and(eq(prospectSearches.projectId, projectId), gte(prospectSearches.createdAt, inicio)),
    );
  return Number(fila?.n ?? 0);
}

export interface EncargoBusqueda {
  project: Project;
  /** "restaurantes en Tulum". Con las palabras del usuario. */
  consulta: string;
  /** Búsqueda por cercanía: el centro y el radio en metros. */
  centro?: { lat: number; lng: number; radioM: number } | null;
  limite?: number;
  quien?: string | null;
}

/**
 * Buscar negocios y dejarlos en la lista del proyecto.
 *
 * Idempotente por `(project_id, place_id)`: buscar dos veces "restaurantes en
 * Tulum" no deja el mismo restaurante dos veces en la lista del vendedor. Lo
 * que se actualiza de un lugar que ya estaba son los DATOS (a un negocio le
 * cambia el teléfono), nunca su `status`: si el vendedor ya lo descartó, una
 * búsqueda nueva no se lo revive.
 */
export async function buscarNegocios(encargo: EncargoBusqueda): Promise<ResultadoBusqueda> {
  const { project } = encargo;
  const limite = Math.min(Math.max(encargo.limite ?? 20, 1), 20);

  const via = await viaDisponible(project);
  if (!via) throw new MapsNoDisponible();

  // El tope se revisa ANTES de llamar a Google: revisarlo después es pagar la
  // búsqueda y además negársela al usuario.
  const tope = topeDeBusquedas(project);
  const mes = await busquedasDelMes(project.id);
  if (tope > 0 && mes >= tope) throw new TopeDeBusquedas(mes, tope);

  let lugares: Lugar[] = [];
  let error: string | null = null;
  try {
    const r = await pedirLugares({
      project,
      via,
      consulta: encargo.consulta,
      limite,
      centro: encargo.centro,
    });
    lugares = r.lugares;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Google no contestó.';
  }

  // La búsqueda se registra SIEMPRE, salga o falle: Google cobra el intento, y
  // un contador que solo cuenta los éxitos no sirve para medir el gasto.
  const [busqueda] = await db
    .insert(prospectSearches)
    .values({
      orgId: project.orgId,
      projectId: project.id,
      kind: encargo.centro ? 'cerca' : 'texto',
      query: encargo.consulta,
      zone: encargo.centro ? `${encargo.centro.lat},${encargo.centro.lng}` : null,
      radiusM: encargo.centro?.radioM ?? null,
      via,
      results: lugares.length,
      nuevos: 0,
      costUnits: 1,
      error,
      createdBy: encargo.quien ?? null,
    })
    .returning();

  if (error) throw new Error(error);

  const guardados = await guardarLugares(project, lugares, busqueda!.id);
  const nuevos = guardados.filter((g) => g.nuevo).length;

  await db
    .update(prospectSearches)
    .set({ nuevos })
    .where(eq(prospectSearches.id, busqueda!.id));

  return {
    via,
    consulta: encargo.consulta,
    encontrados: lugares.length,
    nuevos,
    repetidos: lugares.length - nuevos,
    prospectos: guardados.map((g) => g.fila),
    costo: { mes: mes + 1, tope },
    searchId: busqueda!.id,
  };
}

/**
 * Deja los lugares en la lista del proyecto. Lo usan la búsqueda de una frase y
 * el recorrido por cuadrantes, y tiene que ser el MISMO código en los dos: la
 * idempotencia por `place_id` y la regla de "los datos se refrescan, el estado
 * no" son de la lista, no de quien la llena.
 */
export async function guardarLugares(
  project: Project,
  lugares: Lugar[],
  searchId: string,
): Promise<Array<{ fila: Prospect; nuevo: boolean }>> {
  const out: Array<{ fila: Prospect; nuevo: boolean }> = [];
  for (const l of lugares) {
    const [previo] = await db
      .select()
      .from(prospects)
      .where(and(eq(prospects.projectId, project.id), eq(prospects.placeId, l.placeId)))
      .limit(1);

    if (previo) {
      // Se refrescan los DATOS del negocio, nunca su estado. Un prospecto que
      // el vendedor descartó no se revive porque volvió a salir en la búsqueda.
      const [fila] = await db
        .update(prospects)
        .set({
          name: l.name,
          address: l.address,
          phone: l.phone ?? previo.phone,
          website: l.website ?? previo.website,
          rating: l.rating !== null ? String(l.rating) : previo.rating,
          ratingsCount: l.ratingsCount ?? previo.ratingsCount,
          category: l.category ?? previo.category,
          lat: l.lat ?? previo.lat,
          lng: l.lng ?? previo.lng,
          mapsUrl: l.mapsUrl ?? previo.mapsUrl,
          updatedAt: new Date(),
        })
        .where(eq(prospects.id, previo.id))
        .returning();
      out.push({ fila: fila ?? previo, nuevo: false });
      continue;
    }

    const valores: NewProspect = {
      orgId: project.orgId,
      projectId: project.id,
      placeId: l.placeId,
      name: l.name,
      address: l.address,
      phone: l.phone,
      website: l.website,
      rating: l.rating !== null ? String(l.rating) : null,
      ratingsCount: l.ratingsCount,
      category: l.category,
      lat: l.lat,
      lng: l.lng,
      mapsUrl: l.mapsUrl,
      source: 'google_maps',
      status: 'nuevo',
      searchId,
    };
    const [fila] = await db.insert(prospects).values(valores).returning();
    if (fila) out.push({ fila, nuevo: true });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dónde queda "Tulum"
// ---------------------------------------------------------------------------

export interface ZonaUbicada {
  centro: { lat: number; lng: number };
  /** Cómo se llama de verdad, según Google: "Tulum, Q.R., México". */
  nombre: string;
  /** El radio que cubre la mancha urbana. Es una sugerencia, el usuario manda. */
  radioSugeridoM: number;
  via: 'geocoding' | 'busqueda';
  /** Llamadas facturables que costó ubicarla. Entra al contador del mes. */
  llamadas: number;
}

/**
 * Convierte "Tulum" en un punto y un radio.
 *
 * Hace falta porque el recorrido por cuadrantes necesita un CENTRO antes de la
 * primera búsqueda: sin él no hay cuadrícula que dibujar y la cámara no sabe a
 * dónde volar. Dos caminos, y el segundo no es un adorno:
 *
 *   1. **Geocoding** con la llave de la casa. Devuelve además el `viewport` de
 *      la zona, que es de dónde sale el radio sugerido — proponer 3 km para
 *      Tulum y 3 km para la Ciudad de México sería proponer cualquier cosa.
 *   2. **Una búsqueda de texto** y el promedio de las coordenadas de lo que
 *      salga. Es el camino cuando la búsqueda va por la cuenta de Google del
 *      cliente (Composio no expone geocodificación) o cuando la casa no tiene
 *      llave. Es menos exacto y por eso el radio sugerido se queda en el que
 *      traía el usuario.
 */
export async function ubicarZona(
  project: Project,
  zona: string,
  via: ViaMaps,
  radioDeRespaldo = 3000,
): Promise<ZonaUbicada | null> {
  const key = llaveDeLaCasa();
  if (key) {
    try {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.set('address', zona);
      url.searchParams.set('language', 'es');
      url.searchParams.set('key', key);
      const res = await fetch(url, { cache: 'no-store' });
      const data: any = res.ok ? await res.json() : null;
      const r = data?.results?.[0];
      if (r?.geometry?.location) {
        const vp = r.geometry.viewport;
        let radio = radioDeRespaldo;
        if (vp?.northeast && vp?.southwest) {
          // La mitad del alto del viewport en metros. Con `Math.round` a
          // centenas para que el control de radio no arranque en "4 137 m".
          const altoM = Math.abs(vp.northeast.lat - vp.southwest.lat) * METROS_POR_GRADO_LAT;
          radio = Math.min(Math.max(Math.round((altoM / 2) / 100) * 100, 800), 25_000);
        }
        return {
          centro: { lat: r.geometry.location.lat, lng: r.geometry.location.lng },
          nombre: r.formatted_address ?? zona,
          radioSugeridoM: radio,
          via: 'geocoding',
          llamadas: 1,
        };
      }
    } catch {
      // Se cae al camino de abajo. Una zona que no se pudo geocodificar no es
      // motivo para no buscar: es motivo para buscar distinto.
    }
  }

  try {
    const r = await pedirLugares({ project, via, consulta: zona, limite: 10 });
    const conCoords = r.lugares.filter((l) => l.lat !== null && l.lng !== null);
    if (conCoords.length === 0) return null;
    return {
      centro: {
        lat: conCoords.reduce((s, l) => s + l.lat!, 0) / conCoords.length,
        lng: conCoords.reduce((s, l) => s + l.lng!, 0) / conCoords.length,
      },
      nombre: zona,
      radioSugeridoM: radioDeRespaldo,
      via: 'busqueda',
      llamadas: 1,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Enriquecer: el SITIO PÚBLICO del negocio, y nada más
// ---------------------------------------------------------------------------

const UA = 'GoossipBot/1.0 (+https://goossip.app/bot; prospeccion de negocios)';

/** Las páginas donde un negocio pone sus datos de contacto. En este orden. */
const RUTAS = ['', '/contacto', '/contact', '/contactanos', '/nosotros', '/about'];

/**
 * El correo se busca PRIMERO en los `mailto:`, que es donde el negocio lo puso
 * a propósito, y solo después en el texto. El orden importa: medido contra
 * sitios reales de Tulum, el barrido a texto pelón devolvió `wght@400..600`
 * —una regla de CSS de variación de fuente— como si fuera un correo.
 */
const RE_MAILTO = /mailto:([^"'\s>?]+)/gi;
const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}\b/g;
const RE_WA = /(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)(\d{8,15})/gi;

/**
 * Los handles pedían al menos 2 caracteres y eso dejaba pasar
 * `facebook.com/2008` —el año de un aviso de copyright dentro de un enlace—
 * como si fuera la página del negocio. Ahora: 4 caracteres, y si son puros
 * dígitos tienen que ser 10 o más, que es como se ven los ids reales de página.
 */
const RE_REDES: Array<[string, RegExp]> = [
  ['facebook', /https?:\/\/(?:www\.)?facebook\.com\/((?!sharer|plugins|tr\?)[A-Za-z0-9._-]{4,})/i],
  ['instagram', /https?:\/\/(?:www\.)?instagram\.com\/((?!p\/|reel\/)[A-Za-z0-9._-]{3,})/i],
  ['linkedin', /https?:\/\/(?:www\.)?linkedin\.com\/company\/([A-Za-z0-9._-]{3,})/i],
  ['tiktok', /https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9._-]{3,})/i],
  ['youtube', /https?:\/\/(?:www\.)?youtube\.com\/(@[A-Za-z0-9._-]{3,}|c\/[A-Za-z0-9._-]{3,})/i],
];

/**
 * Los correos que NO son del negocio.
 *
 * Todo sitio hecho con una plantilla trae el correo del que hizo la plantilla,
 * y `sentry@`, `wixpress`, `example.com`. Mandarle el primer mensaje del
 * vendedor a `noreply@wordpress.com` es peor que no tener correo: se ve como
 * un robot y quema el dominio desde el que se manda.
 */
const CORREOS_BASURA =
  /(noreply|no-reply|@example\.|@domain\.|@email\.|@tudominio|@sentry\.|sentry\.io|wixpress|godaddy|@wordpress\.|@2x|\.(png|jpg|jpeg|webp|svg|gif|css|js)$)/i;

/**
 * Quitar el ruido ANTES de buscar nada.
 *
 * Lo que se va: `<style>`, los comentarios, las etiquetas `<link>`, las URL de
 * Google Fonts y los `url(...)`. Ahí es donde vivía `wght@400..600` —una regla
 * de variación de fuente— que el barrido a texto pelón devolvió como si fuera
 * el correo de un restaurante de Tulum.
 *
 * Lo que se QUEDA, y es la parte que importa: los `<script>`. La primera
 * versión los tiraba y sonaba razonable, pero medido contra sitios reales es
 * justo al revés — los sitios de Wix y Squarespace guardan su contenido (y sus
 * datos de contacto) dentro de un blob JSON en un `<script>`, así que tirarlos
 * dejaba en cero a la mitad de los negocios. Medido: con los scripts fuera,
 * `restaurantedeliciademitierra.com` daba 0 correos; con ellos dentro, da su
 * `mailto:` de verdad.
 */
export function soloTextoVisible(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<link\b[^>]*>/gi, ' ')
    .replace(/https?:\/\/fonts\.(?:googleapis|gstatic)\.com[^"')\s]*/gi, ' ')
    .replace(/url\([^)]*\)/gi, ' ');
}

function handleValido(valor: string): boolean {
  const ultimo = valor.replace(/\/$/, '').split('/').pop() ?? '';
  // Un id de página de Facebook tiene 15 dígitos; `facebook.com/2008` es el año
  // de un aviso de copyright que se coló dentro de un enlace.
  if (/^\d+$/.test(ultimo)) return ultimo.length >= 10;
  return ultimo.length >= 3;
}

/**
 * Cuál de los correos encontrados es EL del negocio.
 *
 * El criterio que de verdad separa: **su dominio**. En la home de un
 * restaurante de Tulum salieron cinco correos y tres eran de los desarrolladores
 * de un widget de terceros (`JustinB@harvest.org`). El único que era del
 * negocio compartía dominio con su sitio. Ese gana; después, el que pusieron en
 * un `mailto:` (lo pusieron a propósito); al final, el resto.
 */
export function mejorCorreo(candidatos: string[], sitio: string, deEnlaces: string[]): string | null {
  let dominio = '';
  try {
    dominio = new URL(sitio.startsWith('http') ? sitio : `https://${sitio}`).hostname.replace(/^www\./, '');
  } catch {
    dominio = '';
  }
  const limpios = candidatos.filter((c) => c.includes('@') && !CORREOS_BASURA.test(c) && c.length <= 120);
  if (limpios.length === 0) return null;
  const propio = dominio ? limpios.find((c) => c.toLowerCase().endsWith(`@${dominio}`)) : null;
  if (propio) return propio;
  const enlazado = limpios.find((c) => deEnlaces.includes(c));
  return enlazado ?? limpios[0];
}

/**
 * ¿Nos deja su robots.txt?
 *
 * Es una lectura simple —`User-agent: *` y sus `Disallow`— y a propósito: no se
 * trata de encontrarle la vuelta a la regla, sino de obedecer la que el negocio
 * escribió. Si el robots.txt no contesta, se sigue: no tenerlo es permitir.
 */
export async function robotsPermite(url: string, señal?: AbortSignal): Promise<boolean> {
  try {
    const u = new URL(url);
    const res = await fetch(new URL('/robots.txt', u.origin), {
      headers: { 'User-Agent': UA },
      signal: señal,
      cache: 'no-store',
    });
    if (!res.ok) return true;
    const texto = (await res.text()).slice(0, 20000);

    let aplicando = false;
    const prohibidos: string[] = [];
    for (const linea of texto.split('\n')) {
      const l = linea.split('#')[0].trim();
      if (!l) continue;
      const [campoRaw, ...resto] = l.split(':');
      const campo = campoRaw.trim().toLowerCase();
      const valor = resto.join(':').trim();
      if (campo === 'user-agent') {
        aplicando = valor === '*' || valor.toLowerCase().includes('goossip');
        continue;
      }
      if (aplicando && campo === 'disallow' && valor) prohibidos.push(valor);
    }

    const ruta = u.pathname || '/';
    return !prohibidos.some((p) => (p === '/' ? true : ruta.startsWith(p)));
  } catch {
    return true;
  }
}

/**
 * Lee el sitio del negocio y saca lo que ELLOS publicaron: correo, WhatsApp y
 * sus redes. Devuelve qué páginas se leyeron y con qué código, para que la
 * pantalla pueda decir "su sitio no contestó" en vez de "sin correo".
 */
export async function enriquecerDesdeSitio(
  website: string,
  opts: { timeoutMs?: number } = {},
): Promise<ProspectEnrichment> {
  const out: ProspectEnrichment = { redes: {}, leido: [], leidoEn: new Date().toISOString() };
  let base: URL;
  try {
    base = new URL(website.startsWith('http') ? website : `https://${website}`);
  } catch {
    return out;
  }

  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), opts.timeoutMs ?? 12000);
  try {
    if (!(await robotsPermite(base.toString(), control.signal))) {
      out.leido!.push({ url: base.toString(), status: -1 });
      return out;
    }

    for (const ruta of RUTAS) {
      if (out.email && out.whatsapp) break;
      const url = new URL(ruta || base.pathname || '/', base.origin).toString();
      let html = '';
      let status = 0;
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': UA, 'Accept-Language': 'es-MX,es;q=0.9' },
          redirect: 'follow',
          signal: control.signal,
          cache: 'no-store',
        });
        status = res.status;
        /**
         * 2 MB y no 400 KB, y el número está medido.
         *
         * La home de `restaurantedeliciademitierra.com` (un sitio de Wix, que
         * es la mitad de los restaurantes) pesa **1.08 MB** y su `mailto:` está
         * en el byte **568 150**. Con el corte en 400 KB el correo existía, la
         * página contestaba 200 y el enriquecimiento devolvía "sin correo" —
         * el peor tipo de fallo, porque se ve igual que un negocio que no
         * publica su correo.
         */
        if (res.ok) html = (await res.text()).slice(0, 2_000_000);
      } catch {
        status = 0;
      }
      out.leido!.push({ url, status });
      if (!html) continue;
      const visible = soloTextoVisible(html);

      if (!out.email) {
        const deEnlaces = [...visible.matchAll(RE_MAILTO)].map((m) =>
          decodeURIComponent(m[1]).split('?')[0].trim(),
        );
        const deTexto = visible.match(RE_EMAIL) ?? [];
        const elegido = mejorCorreo(
          [...new Set([...deEnlaces, ...deTexto])],
          base.toString(),
          deEnlaces,
        );
        if (elegido) out.email = elegido;
      }
      if (!out.whatsapp) {
        const wa = [...visible.matchAll(RE_WA)][0]?.[1];
        if (wa) out.whatsapp = wa;
      }
      for (const [red, re] of RE_REDES) {
        if (out.redes![red]) continue;
        const m = visible.match(re);
        if (m?.[0] && handleValido(m[0])) out.redes![red] = m[0];
      }
    }
  } finally {
    clearTimeout(reloj);
  }

  return out;
}

/** Enriquece un prospecto y guarda lo que encontró. */
export async function enriquecerProspecto(
  orgId: string,
  projectId: string,
  id: string,
): Promise<Prospect | null> {
  const [fila] = await db
    .select()
    .from(prospects)
    .where(
      and(eq(prospects.id, id), eq(prospects.orgId, orgId), eq(prospects.projectId, projectId)),
    )
    .limit(1);
  if (!fila) return null;
  if (!fila.website) return fila;

  const enrichment = await enriquecerDesdeSitio(fila.website);
  const [actualizada] = await db
    .update(prospects)
    .set({ enrichment, updatedAt: new Date() })
    .where(eq(prospects.id, id))
    .returning();
  return actualizada ?? fila;
}

// ---------------------------------------------------------------------------
// Leer la lista
// ---------------------------------------------------------------------------

export interface FiltroProspectos {
  status?: Prospect['status'] | null;
  conSitio?: boolean;
  conTelefono?: boolean;
  ratingMin?: number | null;
  limite?: number;
}

export async function listarProspectos(
  orgId: string,
  projectId: string,
  filtro: FiltroProspectos = {},
): Promise<Prospect[]> {
  const condiciones = [eq(prospects.orgId, orgId), eq(prospects.projectId, projectId)];
  if (filtro.status) condiciones.push(eq(prospects.status, filtro.status));
  if (filtro.conSitio) condiciones.push(sql`${prospects.website} is not null`);
  if (filtro.conTelefono) condiciones.push(sql`${prospects.phone} is not null`);
  if (filtro.ratingMin != null) condiciones.push(gte(prospects.rating, String(filtro.ratingMin)));

  return db
    .select()
    .from(prospects)
    .where(and(...condiciones))
    .orderBy(sql`${prospects.rating} desc nulls last`, sql`${prospects.foundAt} desc`)
    .limit(Math.min(filtro.limite ?? 200, 500));
}

export async function contarProspectos(
  orgId: string,
  projectId: string,
): Promise<Record<Prospect['status'] | 'total', number>> {
  const filas = await db
    .select({ status: prospects.status, n: sql<number>`count(*)::int` })
    .from(prospects)
    .where(and(eq(prospects.orgId, orgId), eq(prospects.projectId, projectId)))
    .groupBy(prospects.status);
  const out = { nuevo: 0, contactado: 0, descartado: 0, convertido: 0, total: 0 };
  for (const f of filas) {
    out[f.status as Prospect['status']] = f.n;
    out.total += f.n;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Del mapa al pipeline
// ---------------------------------------------------------------------------

export interface Conversion {
  prospecto: Prospect;
  leadId: string;
  creado: boolean;
}

/**
 * "Convertir a lead": el negocio pasa a `sales_leads` con `source='maps'`.
 *
 * `source` es `maps` y no `manual` porque la diferencia importa al medir: un
 * lead que levantó la mano en un formulario y uno al que salimos a buscar no
 * cierran igual, y mezclarlos hace que la tasa de conversión del proyecto deje
 * de significar nada.
 *
 * El `sourceRef` es el `place_id`, así que convertir dos veces el mismo negocio
 * devuelve el lead que ya existía en vez de duplicarlo.
 */
export async function convertirALead(input: {
  project: Project;
  prospectId: string;
  quien?: string | null;
}): Promise<Conversion | null> {
  const { project } = input;
  const [fila] = await db
    .select()
    .from(prospects)
    .where(and(eq(prospects.id, input.prospectId), eq(prospects.projectId, project.id)))
    .limit(1);
  if (!fila) return null;

  const enrich = (fila.enrichment ?? {}) as ProspectEnrichment;
  const { ingestLead } = await import('../sales/ingest');
  const r = await ingestLead({
    project,
    fullName: fila.name,
    phone: fila.phone ?? enrich.whatsapp ?? null,
    email: enrich.email ?? null,
    source: 'maps',
    sourceRef: fila.placeId,
    createdAt: new Date(),
    raw: {
      place_id: fila.placeId,
      direccion: fila.address,
      sitio: fila.website,
      rating: fila.rating,
      resenas: fila.ratingsCount,
      categoria: fila.category,
      maps: fila.mapsUrl,
      redes: enrich.redes ?? {},
      convertido_por: input.quien ?? null,
    },
    // Un negocio sacado del mapa NO levantó la mano. Encolarle un primer
    // contacto automático sería mandarle un mensaje a alguien que nunca pidió
    // nada — que es exactamente lo que esta herramienta no hace.
    skipQueue: true,
  });

  const [actualizada] = await db
    .update(prospects)
    .set({ status: 'convertido', leadId: r.lead.id, updatedAt: new Date() })
    .where(eq(prospects.id, fila.id))
    .returning();

  return { prospecto: actualizada ?? fila, leadId: r.lead.id, creado: r.created };
}

/**
 * "Mandar a la cola": el primer mensaje queda REDACTADO y esperando visto
 * bueno. La palabra es *propose*: el runner no lo manda solo en ningún nivel
 * de autonomía, y por eso el canal por omisión es el correo o la llamada, no
 * WhatsApp.
 */
export async function proponerContacto(input: {
  project: Project;
  prospectId: string;
  mensaje: string;
  canal: 'correo' | 'messenger' | 'llamada';
  quien?: string | null;
}): Promise<{ ok: boolean; leadId: string | null; motivo?: string }> {
  const conversion = await convertirALead({
    project: input.project,
    prospectId: input.prospectId,
    quien: input.quien,
  });
  if (!conversion) return { ok: false, leadId: null, motivo: 'Ese prospecto no existe.' };

  const { enqueue } = await import('../sales/queue');
  const accion = await enqueue({
    orgId: input.project.orgId,
    campaignId: input.project.id,
    leadId: conversion.leadId,
    kind: 'propose_outreach',
    priority: 4,
    // `pending` y no `auto`: sale cuando una persona lo aprueba, no antes.
    status: 'pending',
    reason: `primer contacto por ${input.canal} a ${conversion.prospecto.name} (prospección en Maps)`,
    payload: {
      canal: input.canal,
      texto: input.mensaje,
      a:
        input.canal === 'correo'
          ? ((conversion.prospecto.enrichment ?? {}) as ProspectEnrichment).email ?? null
          : conversion.prospecto.phone,
      prospectId: conversion.prospecto.id,
      sitio: conversion.prospecto.website,
    },
    createdBy: `user:${input.quien ?? 'goossip'}`,
  });

  await db
    .update(prospects)
    .set({ status: 'contactado', updatedAt: new Date() })
    .where(eq(prospects.id, input.prospectId));

  return accion
    ? { ok: true, leadId: conversion.leadId }
    : { ok: false, leadId: conversion.leadId, motivo: 'Ese prospecto ya tenía un contacto en la cola.' };
}

/** Cambia el estado a mano: contactado, descartado. */
export async function moverProspecto(
  orgId: string,
  projectId: string,
  id: string,
  status: Prospect['status'],
): Promise<Prospect | null> {
  const [fila] = await db
    .update(prospects)
    .set({ status, updatedAt: new Date() })
    .where(
      and(eq(prospects.id, id), eq(prospects.orgId, orgId), eq(prospects.projectId, projectId)),
    )
    .returning();
  return fila ?? null;
}

/**
 * Lo que sale al navegador de un prospecto.
 *
 * Vive aquí y no en cada ruta porque lo que NO lleva es la parte importante:
 * ni la llave, ni el `search_id` interno, ni el `org_id`. Tres rutas con tres
 * copias de esta función son tres oportunidades de que a una se le olvide qué
 * no debía salir.
 */
export function paraElNavegador(p: Prospect) {
  return {
    id: p.id,
    name: p.name,
    address: p.address,
    phone: p.phone,
    website: p.website,
    rating: p.rating !== null ? Number(p.rating) : null,
    ratingsCount: p.ratingsCount,
    category: p.category,
    lat: p.lat,
    lng: p.lng,
    mapsUrl: p.mapsUrl,
    status: p.status,
    enrichment: p.enrichment,
    leadId: p.leadId,
    foundAt: p.foundAt.toISOString(),
  };
}

export type ProspectoFuera = ReturnType<typeof paraElNavegador>;

/** El CSV de la lista. Se arma aquí para que la ruta no reinvente el escapado. */
export function comoCsv(filas: Prospect[]): string {
  const cab = [
    'nombre',
    'telefono',
    'correo',
    'whatsapp',
    'sitio',
    'direccion',
    'rating',
    'resenas',
    'categoria',
    'estado',
    'maps',
  ];
  const celda = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lineas = [cab.join(',')];
  for (const f of filas) {
    const e = (f.enrichment ?? {}) as ProspectEnrichment;
    lineas.push(
      [
        f.name,
        f.phone,
        e.email ?? '',
        e.whatsapp ?? '',
        f.website,
        f.address,
        f.rating,
        f.ratingsCount,
        f.category,
        f.status,
        f.mapsUrl,
      ]
        .map(celda)
        .join(','),
    );
  }
  return lineas.join('\n');
}
