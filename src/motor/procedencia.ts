/**
 * La procedencia de una cifra, y el arnés que no deja soltar un número huérfano.
 *
 * El principio 2 del issue #63 dice: "Todo número con fecha, fuente, tamaño de
 * muestra y método". Eso se defiende en tres niveles, y los tres hacen falta:
 *
 *   1. La BASE (migración 0023): `market_signals` no acepta un valor sin
 *      fuente, fecha y método. Es el candado que no se puede olvidar de llamar.
 *   2. El CÓDIGO (este archivo): la calidad del dato la calcula una función, no
 *      el modelo. Un modelo al que le preguntas si su dato es bueno dice que sí.
 *   3. La PANTALLA y el REPORTE (`auditar`): un texto que muestra un número que
 *      no viene de una cifra con procedencia es un defecto, y revienta la prueba.
 *
 * El nivel 3 es el que pide la aceptación 3, y la única forma de que sea EXACTO
 * en vez de adivinanza es que las cifras nunca se escriban a mano dentro de la
 * prosa. Se escriben aparte y la prosa las llama por nombre:
 *
 *     afirmacion({
 *       plantilla: '{cifra} de los proyectos de apps en Workana pide menos de {umbral}.',
 *       cifra: ...,                       // la medición, con su fuente
 *       parametros: { umbral: 'USD 500' } // el parámetro de la pregunta, declarado
 *     })
 *
 * Después de sustituir los huecos, en el texto literal no debe quedar NI UN
 * dígito. Si queda, es un número que nadie puede rastrear y `auditar` lo reprueba.
 * Así el arnés no depende de heurísticas ni de adivinar si un "2026" era una
 * fecha o un dato: si no pasó por una cifra declarada, no pasa.
 */
import type { CalidadDato, FuenteTipo, MarketSignal } from '../db/schema';

/* ---------------------------------------------------------------------------
   Qué tan fuerte es cada tipo de fuente.

   Esto es un JUICIO EDITORIAL explícito, y por eso está escrito en una tabla que
   se puede discutir, en vez de repartido por el código. Una medición propia gana
   porque se puede reauditar; un blog de agencia pierde porque casi siempre es una
   cifra copiada de otro blog sin muestra ni fecha.
--------------------------------------------------------------------------- */
export const PESO_FUENTE: Record<FuenteTipo, number> = {
  medicion_propia: 100,
  oficial: 90,
  plataforma: 75,
  prensa: 45,
  blog: 20,
  /** El modelo no es una fuente: es una hipótesis con buena redacción. */
  modelo: 5,
};

export const FUENTE_LABEL: Record<FuenteTipo, string> = {
  medicion_propia: 'medición propia',
  oficial: 'fuente oficial',
  plataforma: 'la plataforma misma',
  prensa: 'prensa',
  blog: 'blog o agencia',
  modelo: 'propuesta de la IA, sin medir',
};

/** Cuántos días antes de que una lectura de mercado deje de ser "de hoy". */
export const DIAS_FRESCA = 30;
export const DIAS_VIEJA = 180;

/** Debajo de esto, un porcentaje dice más del azar que del mercado. */
export const MUESTRA_MINIMA_SERIA = 30;

export interface Cifra {
  /** El valor. Texto cuando no es medible en número (p. ej. "ninguno publica precio"). */
  valor: number | string;
  unidad?: string;
  fuenteTipo: FuenteTipo;
  fuenteNombre: string;
  fuenteUrl?: string | null;
  /** Cuándo se midió. No cuándo se guardó: cuándo se MIDIÓ. */
  medidoEn: Date;
  muestra?: number | null;
  muestraDe?: number | null;
  metodo: string;
  /** La calcula `calidadDe`. Si viene puesta a mano, `auditar` la recalcula. */
  calidad?: CalidadDato;
  calidadMotivo?: string | null;
  senalId?: string;
}

/* ---------------------------------------------------------------------------
   La calidad, calculada por código.

   Se castiga por tres vías independientes porque fallan por separado: una cifra
   puede venir de la plataforma misma (fuerte) con muestra de 3 (débil), o ser una
   medición propia impecable de hace ocho meses (ya no describe el mercado de hoy).
--------------------------------------------------------------------------- */
export interface VeredictoCalidad {
  calidad: CalidadDato;
  /** En español y con los números a la vista: es lo que se enseña en pantalla. */
  motivo: string;
  puntos: number;
}

export function calidadDe(c: {
  fuenteTipo: FuenteTipo;
  medidoEn: Date;
  muestra?: number | null;
  muestraDe?: number | null;
}, ahora: Date = new Date()): VeredictoCalidad {
  const razones: string[] = [];
  let puntos = PESO_FUENTE[c.fuenteTipo];
  razones.push(FUENTE_LABEL[c.fuenteTipo]);

  const dias = Math.floor((ahora.getTime() - c.medidoEn.getTime()) / 86_400_000);
  if (dias < 0) {
    // Una medición del futuro es un reloj mal puesto, no un dato fresco.
    puntos -= 40;
    razones.push('fecha de medición en el futuro: revisar el reloj del worker');
  } else if (dias <= DIAS_FRESCA) {
    razones.push(dias <= 1 ? 'medido hoy' : `medido hace ${dias} días`);
  } else if (dias <= DIAS_VIEJA) {
    puntos -= 25;
    razones.push(`medido hace ${dias} días: ya no es de hoy`);
  } else {
    puntos -= 50;
    razones.push(`medido hace ${dias} días: viejo, hay que volver a medir`);
  }

  if (c.muestra == null) {
    // No toda cifra tiene muestra (un total oficial no la necesita), pero un
    // porcentaje sin muestra sí es un problema, y eso lo ve `auditar`.
    razones.push('sin tamaño de muestra');
    puntos -= 10;
  } else if (c.muestra < 10) {
    puntos -= 35;
    razones.push(`muestra de ${c.muestra}: alcanza para una pista, no para una conclusión`);
  } else if (c.muestra < MUESTRA_MINIMA_SERIA) {
    puntos -= 15;
    razones.push(`muestra de ${c.muestra}: chica`);
  } else {
    razones.push(`muestra de ${c.muestra}`);
  }

  if (c.muestraDe != null && c.muestra != null && c.muestraDe > 0) {
    const cobertura = c.muestra / c.muestraDe;
    if (cobertura >= 0.8) razones.push('cubre casi todo el universo conocido');
    else if (cobertura < 0.05) {
      puntos -= 10;
      razones.push(`solo cubre el ${(cobertura * 100).toFixed(1)}% del universo conocido`);
    }
  }

  const calidad: CalidadDato = puntos >= 75 ? 'alta' : puntos >= 45 ? 'media' : 'baja';
  return { calidad, motivo: razones.join(' · '), puntos };
}

/* ---------------------------------------------------------------------------
   Cómo se le enseña una cifra a una persona.

   Siempre con su cola: valor, de dónde, cuándo, de cuántos y cómo. Sin la cola no
   se imprime, porque una cifra pelona es exactamente lo que el issue prohíbe.
--------------------------------------------------------------------------- */
export function cifraEnPalabras(c: Cifra): string {
  const v = typeof c.valor === 'number' ? formatearNumero(c.valor) : c.valor;
  return c.unidad ? `${v}${c.unidad === '%' ? '' : ' '}${c.unidad}` : v;
}

export function fichaDeFuente(c: Cifra): string {
  const partes = [`fuente: ${c.fuenteNombre} (${FUENTE_LABEL[c.fuenteTipo]})`];
  partes.push(`medido el ${fecha(c.medidoEn)}`);
  if (c.muestra != null) {
    partes.push(c.muestraDe != null ? `muestra: ${c.muestra} de ${c.muestraDe}` : `muestra: ${c.muestra}`);
  } else {
    partes.push('sin muestra');
  }
  partes.push(`método: ${c.metodo}`);
  return partes.join(' · ');
}

export function formatearNumero(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString('es-MX');
  return n.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function fecha(d: Date): string {
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/* ---------------------------------------------------------------------------
   Afirmaciones: prosa y cifras separadas, a propósito.
--------------------------------------------------------------------------- */
export interface Afirmacion {
  /**
   * El texto, con `{cifra}` donde va el número y `{nombre}` donde va un
   * parámetro declarado. Sin dígitos sueltos: los pone `render`.
   */
  plantilla: string;
  cifra?: Cifra;
  /**
   * Los números que son PARÁMETRO de la pregunta y no resultado de medir
   * ("menos de USD 500"). Se declaran para que se vean distintos de un hallazgo.
   */
  parametros?: Record<string, string>;
  /** Cuando no hay dato: se dice, y se dice cómo se mediría. */
  hueco?: { que: string; comoMedirlo: string };
}

export const SIN_DATO = 'sin dato';

export function render(a: Afirmacion): string {
  let t = a.plantilla;
  if (a.cifra) t = t.split('{cifra}').join(cifraEnPalabras(a.cifra));
  // En un hueco, `{cifra}` es justo el lugar donde el dato NO está. Se rellena
  // diciéndolo, no se deja el hueco crudo: en pantalla se vería como una falla.
  else if (a.hueco) t = t.split('{cifra}').join(SIN_DATO);
  for (const [k, v] of Object.entries(a.parametros ?? {})) t = t.split(`{${k}}`).join(v);
  return t;
}

/** El renglón completo como se enseña: la frase y, pegada, de dónde salió. */
export function afirmacionEnPalabras(a: Afirmacion): string {
  const frase = render(a);
  if (a.hueco) return `${frase} No hay dato: ${a.hueco.que}. Cómo medirlo: ${a.hueco.comoMedirlo}.`;
  if (!a.cifra) return frase;
  return `${frase} (${fichaDeFuente(a.cifra)})`;
}

/* ---------------------------------------------------------------------------
   El arnés (aceptación 3).

   Reprueba, por este orden:
     · una cifra sin fuente, sin método o sin fecha;
     · un porcentaje sin tamaño de muestra — un "85%" de nada no es nada;
     · un dígito escrito a mano en la prosa, que es un número sin rastro;
     · un hueco que no propone cómo medirse;
     · un `{hueco}` sin rellenar, que en pantalla se vería como basura.

   Devuelve TODOS los defectos, no el primero: si una pantalla tiene ocho números
   huérfanos, el reporte debe decir ocho, no "hay un problema".
--------------------------------------------------------------------------- */
export interface DefectoProcedencia {
  /** Dónde: qué bloque o pantalla. */
  donde: string;
  clase:
    | 'numero_sin_fuente'
    | 'cifra_sin_fuente'
    | 'cifra_sin_metodo'
    | 'cifra_sin_fecha'
    | 'porcentaje_sin_muestra'
    | 'hueco_sin_propuesta'
    | 'placeholder_sin_rellenar'
    | 'calidad_mal_calculada';
  detalle: string;
}

const DIGITO = /\d/;

/*
 * Aquí hubo una lista de excepciones — "las medidas de red se pueden escribir a
 * mano porque son reglas de la plataforma, no datos del mercado": 3:4, 1080x1350,
 * 0-3 s. Se quitó, y vale la pena dejar escrito por qué.
 *
 * Una lista de excepciones es un agujero que crece. En cuanto existe, el primer
 * "8-12 láminas" que no matchea obliga a ampliarla, y ampliarla es el camino por
 * el que se cuela un "el mercado creció 30%" disfrazado de rango. Además la
 * premisa era falsa: una medida de red SÍ tiene fuente, y muy buena — la spec
 * oficial de la plataforma, que este repo ya guarda con URL y versión en
 * `SOCIAL_PLAYBOOKS[red].fuente` / `.version`.
 *
 * Así que no hay excepciones. Un número de red se declara como los demás: en
 * `parametros` cuando solo enmarca la frase, o como `cifra` con
 * `fuenteTipo: 'oficial'` apuntando a la spec cuando es una afirmación. Ver
 * `cifraDeSpec` en `src/motor/estudio.ts`. El arnés queda exacto y sin huecos.
 */

export function auditar(donde: string, afirmaciones: Afirmacion[], ahora: Date = new Date()): DefectoProcedencia[] {
  const defectos: DefectoProcedencia[] = [];

  for (const [i, a] of afirmaciones.entries()) {
    const ubi = `${donde}[${i}]`;

    // ¿Quedó un hueco de plantilla sin rellenar?
    const renderizado = render(a);
    const sobrantes = renderizado.match(/\{[a-zA-Z_][\w]*\}/g);
    if (sobrantes) {
      defectos.push({
        donde: ubi,
        clase: 'placeholder_sin_rellenar',
        detalle: `quedó sin rellenar: ${sobrantes.join(', ')} en "${a.plantilla}"`,
      });
    }

    // Los dígitos que quedan en la prosa una vez quitados los huecos declarados.
    let literal = a.plantilla.split('{cifra}').join('');
    for (const k of Object.keys(a.parametros ?? {})) literal = literal.split(`{${k}}`).join('');
    if (DIGITO.test(literal)) {
      const cuales = literal.match(/\d[\d.,]*/g) ?? [];
      defectos.push({
        donde: ubi,
        clase: 'numero_sin_fuente',
        detalle:
          `número escrito a mano en la prosa (${cuales.join(', ')}): ` +
          `si es un hallazgo va en \`cifra\`, si es parámetro de la pregunta va en \`parametros\`. ` +
          `Plantilla: "${a.plantilla}"`,
      });
    }

    if (a.hueco) {
      if (!a.hueco.comoMedirlo?.trim()) {
        defectos.push({
          donde: ubi,
          clase: 'hueco_sin_propuesta',
          detalle: `dice que no hay dato ("${a.hueco.que}") pero no propone cómo medirlo`,
        });
      }
      continue; // un hueco no lleva cifra; eso ya lo revisó el bloque de arriba
    }

    const c = a.cifra;
    if (!c) continue; // una frase sin números ni huecos es legítima

    if (!c.fuenteNombre?.trim()) {
      defectos.push({ donde: ubi, clase: 'cifra_sin_fuente', detalle: `la cifra "${cifraEnPalabras(c)}" no dice de dónde salió` });
    }
    if (!c.metodo?.trim()) {
      defectos.push({ donde: ubi, clase: 'cifra_sin_metodo', detalle: `la cifra "${cifraEnPalabras(c)}" no dice cómo se midió` });
    }
    if (!(c.medidoEn instanceof Date) || Number.isNaN(c.medidoEn.getTime())) {
      defectos.push({ donde: ubi, clase: 'cifra_sin_fecha', detalle: `la cifra "${cifraEnPalabras(c)}" no dice cuándo se midió` });
    }

    // Un porcentaje es una razón: sin denominador no significa nada.
    const esPorcentaje = c.unidad === '%' || /por ?ciento/i.test(c.unidad ?? '');
    if (esPorcentaje && c.muestra == null) {
      defectos.push({
        donde: ubi,
        clase: 'porcentaje_sin_muestra',
        detalle: `"${cifraEnPalabras(c)}" es un porcentaje sin tamaño de muestra: no se puede defender`,
      });
    }

    // La calidad la manda el código. Si alguien la escribió a mano y no coincide,
    // es un número maquillado y se reprueba.
    if (c.calidad && c.medidoEn instanceof Date && !Number.isNaN(c.medidoEn.getTime())) {
      const real = calidadDe(c, ahora).calidad;
      if (real !== c.calidad) {
        defectos.push({
          donde: ubi,
          clase: 'calidad_mal_calculada',
          detalle: `la cifra se presenta como calidad "${c.calidad}" y por fuente/fecha/muestra le toca "${real}"`,
        });
      }
    }
  }

  return defectos;
}

/** Atajo para las pruebas y para los reportes: o está limpio, o truena diciendo qué. */
export function exigirProcedencia(donde: string, afirmaciones: Afirmacion[], ahora?: Date): void {
  const d = auditar(donde, afirmaciones, ahora);
  if (d.length === 0) return;
  const lista = d.map((x) => `  · [${x.clase}] ${x.donde}: ${x.detalle}`).join('\n');
  throw new Error(`${d.length} número(s) sin procedencia en ${donde}:\n${lista}`);
}

/* ---------------------------------------------------------------------------
   Puente con la base: una señal guardada se vuelve una cifra que se puede enseñar.
--------------------------------------------------------------------------- */
export function cifraDeSenal(s: MarketSignal): Cifra | null {
  if (s.hueco) return null;
  if (!s.fuenteTipo || !s.fuenteNombre || !s.medidoEn || !s.metodo) return null;
  return {
    valor: s.valorNum != null ? Number(s.valorNum) : (s.valorTexto ?? ''),
    unidad: s.unidad ?? undefined,
    fuenteTipo: s.fuenteTipo,
    fuenteNombre: s.fuenteNombre,
    fuenteUrl: s.fuenteUrl,
    medidoEn: s.medidoEn,
    muestra: s.muestra,
    muestraDe: s.muestraDe,
    metodo: s.metodo,
    calidad: s.calidad,
    calidadMotivo: s.calidadMotivo,
    senalId: s.id,
  };
}

/** Y al revés: una cifra medida, lista para guardarse con su calidad ya calculada. */
export function senalDeCifra(base: { orgId: string; projectId: string; tema: string; clave: string; etiqueta: string; pregunta?: string; radarRunId?: string }, c: Cifra) {
  const v = calidadDe(c);
  return {
    orgId: base.orgId,
    projectId: base.projectId,
    tema: base.tema,
    clave: base.clave,
    etiqueta: base.etiqueta,
    pregunta: base.pregunta ?? null,
    valorNum: typeof c.valor === 'number' ? String(c.valor) : null,
    valorTexto: typeof c.valor === 'string' ? c.valor : null,
    unidad: c.unidad ?? null,
    fuenteTipo: c.fuenteTipo,
    fuenteNombre: c.fuenteNombre,
    fuenteUrl: c.fuenteUrl ?? null,
    medidoEn: c.medidoEn,
    muestra: c.muestra ?? null,
    muestraDe: c.muestraDe ?? null,
    metodo: c.metodo,
    calidad: v.calidad,
    calidadMotivo: v.motivo,
    hueco: false,
    crudo: {},
    radarRunId: base.radarRunId ?? null,
  };
}

/** Un hueco declarado, listo para guardarse. Es un dato: dice que no sabemos. */
export function senalHueco(base: { orgId: string; projectId: string; tema: string; clave: string; etiqueta: string; pregunta?: string; radarRunId?: string }, comoMedirlo: string, motivo?: string) {
  return {
    orgId: base.orgId,
    projectId: base.projectId,
    tema: base.tema,
    clave: base.clave,
    etiqueta: base.etiqueta,
    pregunta: base.pregunta ?? null,
    hueco: true,
    comoMedirlo,
    calidad: 'baja' as CalidadDato,
    calidadMotivo: motivo ?? 'no hay dato todavía',
    crudo: {},
    radarRunId: base.radarRunId ?? null,
  };
}
