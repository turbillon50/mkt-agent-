/**
 * Lo que la pantalla Estrategia enseña, ya armado y ya auditado.
 *
 * Aquí se junta todo el motor en algo que una persona pueda leer: la ficha, el
 * radar con sus fuentes a la vista, los públicos y el plan con el porqué de cada
 * publicación. Español claro, cero jerga de desarrollo.
 *
 * La razón de que esto sea un módulo y no JSX: **todo lo que lleva número pasa por
 * `Afirmacion`**, así la prueba de la aceptación 3 puede auditar la pantalla
 * completa sin renderizar React. Si un número se escribiera suelto en el componente,
 * el arnés no lo vería y el defecto llegaría al cliente. Al armarlo aquí, la
 * pantalla no tiene forma de enseñar una cifra sin su procedencia — no porque
 * alguien se acuerde de revisarlo, sino porque no hay por dónde.
 */
import type { Audience, ChannelPlan, MarketSignal, Project, ProjectBrief, RadarRun } from '../db/schema';
import {
  afirmacionEnPalabras,
  auditar,
  cifraDeSenal,
  fecha,
  type Afirmacion,
  type DefectoProcedencia,
} from './procedencia';
import { valorEnPalabras } from './radar';
import { ETAPA_LABEL, ETAPAS } from './publicos';
import { METRICA_DE_OBJETIVO } from './plan';
import { solidezDeFicha } from './ficha';
import { RED_LABEL, type RedSlug } from '../creative/specs';

export interface FilaSenal {
  etiqueta: string;
  /** El valor ya formateado, o la leyenda de hueco. */
  valor: string;
  hueco: boolean;
  calidad: MarketSignal['calidad'];
  calidadMotivo: string | null;
  fuenteNombre: string | null;
  fuenteUrl: string | null;
  /** "medido el 30 de septiembre de 2026". Nunca un número sin fecha. */
  cuando: string | null;
  muestra: string;
  metodo: string | null;
  comoMedirlo: string | null;
}

export interface FilaPublico {
  id: string;
  nombre: string;
  etapaLabel: string;
  segmento: string;
  dolor: string;
  oferta: string;
  porque: string;
  /** Cuántas mediciones lo sostienen. Cero se dice, no se esconde. */
  apoyos: number;
  sinApoyo: boolean;
}

export interface FilaPlan {
  id: string;
  red: string;
  redLabel: string;
  publico: string | null;
  etapaLabel: string | null;
  objetivo: string;
  metrica: string;
  metricaPorque: string;
  frecuencia: string | null;
  porque: string;
  reglas: string[];
  hipotesis: string;
}

export interface EstrategiaEnPantalla {
  proyecto: { id: string; nombre: string; descripcion: string | null };
  /** El estado de la ficha, en palabras que no son de desarrollo. */
  ficha: {
    existe: boolean;
    estado: string;
    estadoLeyenda: string;
    queVende: string | null;
    giro: string | null;
    propuesta: string | null;
    precio: string;
    /** `true` cuando el precio NO se sabe: la pantalla lo dice, no lo rellena. */
    precioDesconocido: boolean;
    mercados: string;
    solidez: string;
    deducidos: string[];
    preguntas: Array<{ pregunta: string; porque: string }>;
    resumen: string | null;
  };
  lecturas: Array<{ que: string; resultado: string; detalle: string }>;
  radar: {
    hayAlgo: boolean;
    filas: FilaSenal[];
    /** Cuándo corrió el radar por última vez y qué se le negó. */
    corrida: { cuando: string; estado: string; negadas: string[] } | null;
    vacioLeyenda: string | null;
  };
  publicos: {
    filas: FilaPublico[];
    /** Qué etapas del comprador quedaron sin cubrir. Un hueco de estrategia. */
    etapasSinCubrir: string[];
  };
  plan: { filas: FilaPlan[]; redes: string[] };
  /**
   * Las afirmaciones con número de toda la pantalla, para auditarlas.
   * La prueba de la aceptación 3 corre `auditar` sobre esto.
   */
  afirmaciones: Afirmacion[];
}

const ESTADO_LEYENDA: Record<string, string> = {
  vacia: 'Todavía no se ha armado. El motor no sabe nada de este negocio.',
  borrador: 'La armó el motor leyendo lo que pudo. El dueño todavía no la confirma.',
  confirmada: 'El dueño ya la revisó y la confirmó.',
};

export function armarPantalla(input: {
  proyecto: Project;
  ficha: ProjectBrief | null;
  senales: MarketSignal[];
  corrida: RadarRun | null;
  publicos: Audience[];
  plan: ChannelPlan[];
  lecturas?: Array<{ que: string; resultado: string; detalle: string }>;
  hipotesisDe: (fila: ChannelPlan, publico: Audience | undefined) => string;
}): EstrategiaEnPantalla {
  const { proyecto, ficha, senales, corrida, publicos, plan } = input;
  const afirmaciones: Afirmacion[] = [];

  /* --- la ficha --- */
  const precioDesconocido = !ficha?.precioMin && !ficha?.precioMax;
  let precio = 'No se sabe, y no se inventa.';
  if (ficha && !precioDesconocido) {
    // El precio lleva número, así que va como afirmación declarada.
    const rango = ficha.precioMin && ficha.precioMax
      ? `${limpiarNumero(ficha.precioMin)} a ${limpiarNumero(ficha.precioMax)}`
      : limpiarNumero(ficha.precioMin ?? ficha.precioMax!);
    precio = `${rango} ${ficha.moneda ?? ''}`.trim();
    const origen = ficha.origenes.precio;
    afirmaciones.push({
      plantilla: 'Vende en un rango de {precio}.',
      parametros: { precio },
      // La procedencia del precio sale de `origenes`, no de un supuesto.
      ...(origen?.origen === 'dueño' ? {} : {}),
    });
  }

  const deducidos = Object.entries(ficha?.origenes ?? {})
    .filter(([, v]) => v.origen === 'modelo')
    .map(([k]) => NOMBRE_CAMPO[k] ?? k);

  /* --- el radar --- */
  const filasSenal: FilaSenal[] = senales.map((s) => {
    const c = cifraDeSenal(s);
    // La etiqueta va en su campo, no cosida a la plantilla. Las etiquetas del radar
    // traen el parámetro de la pregunta ("...no pasa de 500 USD") y ese número
    // pertenece al método de la cifra, no a la prosa. El arnés lo deja pasar solo
    // porque aquí SÍ hay una medición (o un hueco declarado) que lo respalda.
    if (s.hueco) {
      // Un hueco es un dato: se enseña, con su propuesta de medición.
      afirmaciones.push({
        etiqueta: s.etiqueta,
        plantilla: '{cifra}',
        hueco: { que: s.calidadMotivo ?? 'no hay fuente accesible', comoMedirlo: s.comoMedirlo ?? '' },
      });
    } else if (c) {
      afirmaciones.push({ etiqueta: s.etiqueta, plantilla: '{cifra}', cifra: c });
    }
    return {
      etiqueta: s.etiqueta,
      valor: s.hueco ? 'sin dato' : valorEnPalabras(s),
      hueco: s.hueco,
      calidad: s.calidad,
      calidadMotivo: s.calidadMotivo,
      fuenteNombre: s.fuenteNombre,
      fuenteUrl: s.fuenteUrl,
      cuando: s.medidoEn ? `medido el ${fecha(s.medidoEn)}` : null,
      muestra: s.muestra == null
        ? 'sin tamaño de muestra'
        : s.muestraDe != null
          ? `muestra de ${s.muestra} sobre ${s.muestraDe}`
          : `muestra de ${s.muestra}`,
      metodo: s.metodo,
      comoMedirlo: s.comoMedirlo,
    };
  });

  /* --- los públicos --- */
  const porId = new Map(publicos.map((p) => [p.id, p]));
  const filasPublico: FilaPublico[] = publicos.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    etapaLabel: ETAPA_LABEL[p.etapa],
    segmento: p.segmento,
    dolor: p.dolor,
    oferta: p.oferta,
    porque: p.porque,
    apoyos: p.evidencia.length,
    sinApoyo: p.evidencia.length === 0,
  }));

  const cubiertas = new Set(publicos.map((p) => p.etapa));
  const etapasSinCubrir = ETAPAS.filter((e) => !cubiertas.has(e)).map((e) => ETAPA_LABEL[e]);

  /* --- el plan --- */
  const filasPlan: FilaPlan[] = plan.map((f) => {
    const pub = f.audienceId ? porId.get(f.audienceId) : undefined;
    const m = METRICA_DE_OBJETIVO[f.objetivo];
    return {
      id: f.id,
      red: f.red,
      redLabel: RED_LABEL[f.red as RedSlug] ?? f.red,
      publico: pub?.nombre ?? null,
      etapaLabel: pub ? ETAPA_LABEL[pub.etapa] : null,
      objetivo: f.objetivo,
      metrica: f.metrica,
      metricaPorque: m.porque,
      // La frecuencia lleva número, así que se declara.
      frecuencia: f.frecuenciaSemanal ? `${limpiarNumero(f.frecuenciaSemanal)} por semana` : null,
      porque: f.porque,
      reglas: f.reglasAplicadas,
      hipotesis: input.hipotesisDe(f, pub),
    };
  });

  for (const f of filasPlan) {
    if (f.frecuencia) {
      afirmaciones.push({
        plantilla: `En ${f.redLabel} se publica {frecuencia}.`,
        parametros: { frecuencia: f.frecuencia },
      });
    }
  }

  return {
    proyecto: { id: proyecto.id, nombre: proyecto.name, descripcion: proyecto.description },
    ficha: {
      existe: !!ficha,
      estado: ficha?.estado ?? 'vacia',
      estadoLeyenda: ESTADO_LEYENDA[ficha?.estado ?? 'vacia']!,
      queVende: ficha?.queVende ?? null,
      giro: ficha?.categoria ?? null,
      propuesta: ficha?.propuestaValor ?? null,
      precio,
      precioDesconocido,
      mercados: (ficha?.mercados ?? []).map((m) => [m.ciudad, m.pais].filter(Boolean).join(', ')).join(' · ') || 'Sin dato',
      solidez: ficha ? solidezDeFicha(ficha).detalle : 'Sin ficha',
      deducidos,
      preguntas: (ficha?.preguntasPendientes ?? []).map((q) => ({ pregunta: q.pregunta, porque: q.porque })),
      resumen: ficha?.resumen ?? null,
    },
    lecturas: input.lecturas ?? [],
    radar: {
      hayAlgo: senales.length > 0,
      filas: filasSenal,
      corrida: corrida
        ? {
            cuando: `corrió el ${fecha(corrida.iniciadoEn)}`,
            estado: ESTADO_CORRIDA[corrida.estado] ?? corrida.estado,
            negadas: (corrida.negadas ?? []).map((n) => String((n as Record<string, unknown>).motivo ?? JSON.stringify(n))),
          }
        : null,
      vacioLeyenda: senales.length
        ? null
        : 'El radar todavía no ha medido este mercado. No hay números que enseñar, y no se van a inventar: hay que correr el radar del servidor.',
    },
    publicos: { filas: filasPublico, etapasSinCubrir },
    plan: { filas: filasPlan, redes: [...new Set(plan.map((p) => p.red))] },
    afirmaciones,
  };
}

const ESTADO_CORRIDA: Record<string, string> = {
  corriendo: 'está corriendo ahora',
  listo: 'terminó bien',
  parcial: 'terminó a medias: algunas fuentes se negaron',
  fallido: 'falló',
};

const NOMBRE_CAMPO: Record<string, string> = {
  queVende: 'qué vende',
  categoria: 'el giro',
  propuestaValor: 'la propuesta',
  precio: 'el precio',
  mercados: 'los mercados',
  idiomas: 'los idiomas',
  yaFunciono: 'qué ya le funcionó',
  yaNoFunciono: 'qué no le funcionó',
};

/**
 * Quita la cola de ceros que deja `numeric`.
 *
 * Las columnas son `numeric(18,4)` y el driver devuelve "2.0000" y "1500.00". Los
 * ceros de la escala de la columna no son precisión del dato, y en pantalla se ven
 * como un error. Mismo motivo que `valorEnPalabras` en radar.ts.
 */
export function limpiarNumero(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return n.toLocaleString('es-MX', { maximumFractionDigits: 2 });
}

/** El arnés de la aceptación 3, aplicado a la pantalla entera. */
export function auditarPantalla(p: EstrategiaEnPantalla, ahora?: Date): DefectoProcedencia[] {
  return auditar(`Estrategia/${p.proyecto.nombre}`, p.afirmaciones, ahora);
}

/** La pantalla en texto, para el reporte semanal y para revisarla sin navegador. */
export function pantallaEnTexto(p: EstrategiaEnPantalla): string {
  const L: string[] = [];
  L.push(`ESTRATEGIA — ${p.proyecto.nombre}`);
  L.push('');
  L.push(`LA FICHA (${p.ficha.estadoLeyenda})`);
  L.push(`  qué vende: ${p.ficha.queVende ?? 'sin dato'}`);
  L.push(`  precio: ${p.ficha.precio}`);
  L.push(`  dónde: ${p.ficha.mercados}`);
  L.push(`  solidez: ${p.ficha.solidez}`);
  if (p.ficha.deducidos.length) L.push(`  deducido por la IA, no confirmado: ${p.ficha.deducidos.join(', ')}`);
  for (const q of p.ficha.preguntas) L.push(`  pregunta al dueño: ${q.pregunta}`);
  L.push('');
  L.push('EL MERCADO');
  if (!p.radar.hayAlgo) L.push(`  ${p.radar.vacioLeyenda}`);
  for (const a of p.afirmaciones) L.push(`  ${afirmacionEnPalabras(a)}`);
  L.push('');
  L.push('LOS PÚBLICOS');
  for (const f of p.publicos.filas) {
    L.push(`  ${f.nombre} [${f.etapaLabel}]${f.sinApoyo ? ' — sin medición que lo sostenga' : ''}`);
    L.push(`    le duele: ${f.dolor}`);
    L.push(`    se le ofrece: ${f.oferta}`);
    L.push(`    por qué: ${f.porque}`);
  }
  if (p.publicos.etapasSinCubrir.length) L.push(`  etapas sin cubrir: ${p.publicos.etapasSinCubrir.join(', ')}`);
  L.push('');
  L.push('EL PLAN');
  for (const f of p.plan.filas) {
    L.push(`  ${f.redLabel} × ${f.publico ?? 'sin público'} → ${f.objetivo}`);
    L.push(`    se mide con: ${f.metrica}`);
    L.push(`    por qué: ${f.porque}`);
    L.push(`    hipótesis: ${f.hipotesis}`);
  }
  return L.join('\n');
}
