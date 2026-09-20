/**
 * Búsqueda por OBJETIVO, no por ocurrencia.
 *
 * El buscador de la corrida 7 pedía una frase: "restaurantes en Tulum". Funciona
 * y se queda. Lo que no resuelve es la pregunta que de verdad tiene el vendedor
 * el primer día — *¿a quién le vendo yo?* — y ahí es donde se queda mirando la
 * caja vacía. Un proyecto inmobiliario no le vende a restaurantes: le vende a
 * desarrolladoras, notarías y corredores. Eso ya lo sabemos por el `kind` del
 * proyecto, así que se lo damos hecho y él lo edita.
 *
 * Los giros son PALABRAS, no tipos de la taxonomía de Google. Es deliberado:
 * `includedType` de Places es una lista cerrada que no tiene "desarrolladora
 * inmobiliaria" ni "notaría", y traducir a ojo mete negocios que nadie pidió.
 * La búsqueda por texto sí las entiende porque es la misma que usa la gente en
 * la app de Maps.
 *
 * Este archivo lo importa el navegador: **nada de base de datos ni `process.env`
 * aquí dentro.**
 */
import type { ProjectKind } from '../sales/types';

export interface Objetivo {
  id: string;
  label: string;
  /** Lo que se le pregunta a Google, un giro por búsqueda. */
  giros: string[];
  /** Por qué este objetivo le sirve a este tipo de proyecto. Sale en la UI. */
  porque: string;
}

/**
 * Los presets por tipo de proyecto.
 *
 * El primero de cada lista es el que viene marcado: uno solo, y no los siete.
 * Cada giro marcado multiplica las llamadas a Google por el número de
 * cuadrantes, y arrancar con siete marcados sería gastarle a alguien 63
 * búsquedas de su tope de 50 en el primer clic, antes de que entienda qué
 * compró.
 */
export const OBJETIVOS_POR_TIPO: Record<ProjectKind, Objetivo[]> = {
  real_estate: [
    {
      id: 'desarrolladoras',
      label: 'Desarrolladoras y constructoras',
      giros: ['desarrolladora inmobiliaria', 'constructora'],
      porque: 'Los que tienen inventario que vender y presupuesto de marketing.',
    },
    {
      id: 'inmobiliarias',
      label: 'Inmobiliarias y corredores',
      giros: ['inmobiliaria', 'agencia de bienes raíces', 'corredor de bienes raíces'],
      porque: 'Compiten entre ellos por los mismos ojos: son quienes más pauta compran.',
    },
    {
      id: 'notarias',
      label: 'Notarías y jurídico',
      giros: ['notaría pública', 'despacho jurídico inmobiliario'],
      porque: 'Cierran cada operación de la zona y conocen a todos los que venden.',
    },
    {
      id: 'arquitectos',
      label: 'Arquitectos y diseño',
      giros: ['despacho de arquitectura', 'estudio de diseño de interiores'],
      porque: 'Venden proyecto; viven de enseñarlo bien.',
    },
    {
      id: 'coworkings',
      label: 'Coworkings y oficinas',
      giros: ['coworking', 'oficinas en renta'],
      porque: 'Ocupación mes a mes: cada semana sin campaña es un escritorio vacío.',
    },
  ],
  marketplace: [
    {
      id: 'restaurantes',
      label: 'Restaurantes y cafeterías',
      giros: ['restaurante', 'cafetería'],
      porque: 'Rotación alta y decisión rápida: el dueño contesta él mismo.',
    },
    {
      id: 'tiendas',
      label: 'Tiendas y boutiques',
      giros: ['boutique de ropa', 'tienda de regalos', 'joyería'],
      porque: 'Inventario que se fotografía solo.',
    },
    {
      id: 'hoteles',
      label: 'Hoteles y hospedaje',
      giros: ['hotel', 'hostal', 'casa de huéspedes'],
      porque: 'Temporada alta y baja: el calendario les manda y lo saben.',
    },
    {
      id: 'servicios_locales',
      label: 'Servicios a domicilio',
      giros: ['lavandería', 'taller mecánico', 'estética canina'],
      porque: 'Zona chica, competencia a la vuelta, todo se juega en Maps.',
    },
  ],
  servicios: [
    {
      id: 'salud',
      label: 'Clínicas y consultorios',
      giros: ['clínica dental', 'consultorio médico', 'clínica de fisioterapia'],
      porque: 'Cita agendada = venta cerrada; el embudo es cortito.',
    },
    {
      id: 'bienestar',
      label: 'Gimnasios y spas',
      giros: ['gimnasio', 'spa', 'estudio de yoga'],
      porque: 'Se vive de la mensualidad: enero y septiembre valen el año.',
    },
    {
      id: 'educacion',
      label: 'Escuelas y academias',
      giros: ['escuela privada', 'academia de idiomas', 'escuela de música'],
      porque: 'Ciclo escolar con fecha fija: la campaña se planea con meses.',
    },
    {
      id: 'profesionales',
      label: 'Despachos profesionales',
      giros: ['despacho contable', 'despacho jurídico', 'agencia de seguros'],
      porque: 'Venden confianza y casi ninguno tiene quién le lleve las redes.',
    },
    {
      id: 'belleza',
      label: 'Belleza y estética',
      giros: ['salón de belleza', 'barbería', 'clínica estética'],
      porque: 'Antes y después: el contenido se produce solo.',
    },
  ],
  mlm: [
    {
      id: 'bienestar_mlm',
      label: 'Bienestar y nutrición',
      giros: ['tienda naturista', 'nutriólogo', 'gimnasio'],
      porque: 'El público de la red vive alrededor de estos mostradores.',
    },
    {
      id: 'belleza_mlm',
      label: 'Belleza',
      giros: ['salón de belleza', 'spa'],
      porque: 'Punto de venta y de reclutamiento a la vez.',
    },
    {
      id: 'emprendedores',
      label: 'Negocios chicos',
      giros: ['tienda de abarrotes', 'papelería', 'boutique de ropa'],
      porque: 'Dueños que ya venden y buscan un ingreso extra.',
    },
  ],
  otro: [
    {
      id: 'general',
      label: 'Negocios de la zona',
      giros: ['negocio local'],
      porque: 'Sin tipo de proyecto definido, se barre a lo ancho y tú filtras.',
    },
    {
      id: 'restaurantes_otro',
      label: 'Restaurantes y cafeterías',
      giros: ['restaurante', 'cafetería'],
      porque: 'El giro más denso de cualquier centro urbano.',
    },
    {
      id: 'servicios_otro',
      label: 'Servicios profesionales',
      giros: ['despacho contable', 'despacho jurídico'],
      porque: 'Poca competencia digital, ticket alto.',
    },
  ],
};

export function objetivosDe(kind: ProjectKind | string | null | undefined): Objetivo[] {
  const k = (kind ?? 'otro') as ProjectKind;
  return OBJETIVOS_POR_TIPO[k] ?? OBJETIVOS_POR_TIPO.otro;
}

// ---------------------------------------------------------------------------
// Los filtros
// ---------------------------------------------------------------------------

export interface FiltrosBarrido {
  radioM: number;
  /** Rating mínimo. 0 = sin filtro. */
  ratingMin: number;
  /** Reseñas mínimas. 0 = sin filtro. */
  minResenas: number;
  /** Solo los que NO tienen sitio web. El mejor prospecto de una agencia. */
  sinSitio: boolean;
  /** Solo los que publican WhatsApp en su sitio. Se sabe al leer el sitio. */
  conWhatsapp: boolean;
  /** Solo los abiertos en este momento. */
  abiertosAhora: boolean;
  /**
   * Pedirle a Google el horario de cada negocio.
   *
   * Está aparte y apagado por omisión porque **cuesta más**: el horario vive en
   * `places.regularOpeningHours`, que en Places API (New) es del tramo
   * Enterprise, mientras que todo lo demás que pedimos es Pro. Encenderlo sube
   * la factura de la misma búsqueda. A cambio el resumen puede decir "3 abiertos
   * 24 h", que para quien vende a hoteles y farmacias es el dato.
   *
   * Ojo con no confundirlo con `abiertosAhora`: ese es un PARÁMETRO de la
   * llamada (`openNow`), lo resuelve Google y no cuesta un centavo de más.
   */
  horarios: boolean;
}

export const FILTROS_POR_OMISION: FiltrosBarrido = {
  radioM: 3000,
  ratingMin: 0,
  minResenas: 0,
  sinSitio: false,
  conWhatsapp: false,
  abiertosAhora: false,
  horarios: false,
};

export function filtrosDesde(crudo: unknown): FiltrosBarrido {
  const o = (crudo ?? {}) as Record<string, unknown>;
  const num = (v: unknown, omision: number, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : omision;
  };
  return {
    radioM: Math.round(num(o.radioM, FILTROS_POR_OMISION.radioM, 300, 50_000)),
    ratingMin: num(o.ratingMin, 0, 0, 5),
    minResenas: Math.round(num(o.minResenas, 0, 0, 10_000)),
    sinSitio: o.sinSitio === true,
    conWhatsapp: o.conWhatsapp === true,
    abiertosAhora: o.abiertosAhora === true,
    horarios: o.horarios === true,
  };
}

/** Lo que Google nos dio de un lugar, en lo que le toca a los filtros. */
export interface LugarFiltrable {
  website?: string | null;
  rating?: number | null;
  ratingsCount?: number | null;
}

/**
 * Los filtros que se aplican AQUÍ y no allá.
 *
 * `ratingMin`, `abiertosAhora` y el giro los resuelve Google en la misma
 * llamada (`minRating`, `openNow`, `textQuery`) y así se le piden, porque
 * filtrar en el servidor de Google es gratis y filtrar aquí ya se pagó la
 * llamada. Los dos que Google no sabe contestar son **"sin sitio web"** —no hay
 * parámetro— y **"con WhatsApp"**, que ni siquiera está en Maps: vive en el
 * sitio del negocio y solo se sabe después de leerlo.
 *
 * `minResenas` se repite aquí aunque Google no lo tenga: es local y barato.
 */
export function pasaFiltros(l: LugarFiltrable, f: FiltrosBarrido): boolean {
  if (f.sinSitio && l.website) return false;
  if (f.ratingMin > 0 && (l.rating ?? 0) < f.ratingMin) return false;
  if (f.minResenas > 0 && (l.ratingsCount ?? 0) < f.minResenas) return false;
  return true;
}

/** Cómo se lee el filtro en la UI y en la narración. */
export function filtrosEnPalabras(f: FiltrosBarrido): string[] {
  const out: string[] = [`radio ${(f.radioM / 1000).toFixed(f.radioM % 1000 === 0 ? 0 : 1)} km`];
  if (f.sinSitio) out.push('sin sitio web');
  if (f.conWhatsapp) out.push('con WhatsApp en su sitio');
  if (f.ratingMin > 0) out.push(`rating ${f.ratingMin}+`);
  if (f.minResenas > 0) out.push(`${f.minResenas}+ reseñas`);
  if (f.abiertosAhora) out.push('abiertos ahora');
  if (f.horarios) out.push('con horarios');
  return out;
}
