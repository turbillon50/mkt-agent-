/**
 * El motor, de punta a punta, para un proyecto cualquiera.
 *
 *   ficha → radar → públicos → plan con hipótesis
 *
 * Es la función que prueba la aceptación 1: se le da un proyecto recién dado de
 * alta —sin que nadie le explique nada— y tiene que llegar a su propia estrategia.
 * Si dos negocios distintos salen con la misma, es plantilla y no motor.
 *
 * Cada etapa lee el contexto de la anterior. Eso es lo que hace que la estrategia
 * sea COHERENTE y no cuatro documentos que no se conocen: el plan sabe qué precio
 * tiene el negocio porque la ficha se lo dijo, y sabe qué tan barato está el
 * mercado porque el radar se lo midió.
 *
 * Lo que NO hace: no publica, no gasta, no manda mensajes. Deja todo en estado
 * `propuesto` para que lo mire un humano (principio 6).
 */
import type { Audience, ChannelPlan, MarketSignal, Project, ProjectBrief } from '../db/schema';
import { armarFicha, fichaDe, type FichaArmada } from './ficha';
import { senalesVigentes } from './radar';
import { armarPublicos, publicosDe } from './publicos';
import { armarPlan, hipotesisSugerida, planDe } from './plan';

export interface CorridaDelMotor {
  proyecto: Project;
  ficha: ProjectBrief | null;
  /** Lo que se leyó para armar la ficha, y lo que se negó. */
  lecturas: FichaArmada['lecturas'];
  senales: MarketSignal[];
  publicos: Audience[];
  plan: ChannelPlan[];
  /**
   * Todo lo que el código le tiró al modelo, con el motivo.
   *
   * Va en el resultado a propósito y no en un log: es la prueba de que el motor
   * verifica en vez de creer. Una corrida con cero descartes y un modelo que
   * inventó ids se vería idéntica a una corrida limpia si esto no se enseñara.
   */
  descartes: string[];
  /** Qué etapas corrieron y qué etapas no, con su motivo. */
  etapas: Array<{ etapa: string; resultado: 'ok' | 'vacio' | 'fallo'; detalle: string }>;
}

export interface OpcionesCorrida {
  /** Si la ficha ya existe y está confirmada, no se vuelve a armar por defecto. */
  rearmarFicha?: boolean;
}

export async function correrMotor(proyecto: Project, opts: OpcionesCorrida = {}): Promise<CorridaDelMotor> {
  const descartes: string[] = [];
  const etapas: CorridaDelMotor['etapas'] = [];

  // --- 1. la ficha ---
  let ficha = await fichaDe(proyecto.orgId, proyecto.id);
  let lecturas: FichaArmada['lecturas'] = [];
  const hayQueArmar = opts.rearmarFicha || !ficha || ficha.estado === 'vacia';
  if (hayQueArmar) {
    try {
      const armada = await armarFicha(proyecto);
      ficha = armada.brief;
      lecturas = armada.lecturas;
      const leidas = lecturas.filter((l) => l.resultado === 'leido').length;
      etapas.push({
        etapa: 'ficha',
        resultado: ficha.resumen ? 'ok' : 'vacio',
        detalle: `${leidas} de ${lecturas.length} lecturas dieron algo`,
      });
    } catch (e) {
      etapas.push({ etapa: 'ficha', resultado: 'fallo', detalle: e instanceof Error ? e.message : String(e) });
    }
  } else {
    etapas.push({ etapa: 'ficha', resultado: 'ok', detalle: `ya existía (${ficha!.estado}), no se volvió a armar` });
  }

  // --- 2. el radar: se LEE lo que el worker ya midió ---
  // No se mide aquí: medir necesita navegador y esto puede correr en Vercel.
  const senales = await senalesVigentes(proyecto.orgId, proyecto.id);
  etapas.push({
    etapa: 'radar',
    resultado: senales.length ? 'ok' : 'vacio',
    detalle: senales.length
      ? `${senales.filter((s) => !s.hueco).length} señales medidas y ${senales.filter((s) => s.hueco).length} huecos declarados`
      : 'el radar todavía no ha medido este mercado; corre motor/radar/ y vuelve',
  });

  // --- 3. los públicos ---
  let publicos: Audience[] = [];
  try {
    const r = await armarPublicos(proyecto, ficha, senales);
    publicos = r.publicos;
    descartes.push(...r.descartes);
    if (!publicos.length) publicos = await publicosDe(proyecto.orgId, proyecto.id);
    etapas.push({
      etapa: 'publicos',
      resultado: publicos.length ? 'ok' : 'vacio',
      detalle: publicos.length
        ? `${publicos.length} públicos en ${new Set(publicos.map((p) => p.etapa)).size} etapas distintas`
        : 'no se pudo armar ningún público',
    });
  } catch (e) {
    etapas.push({ etapa: 'publicos', resultado: 'fallo', detalle: e instanceof Error ? e.message : String(e) });
  }

  // --- 4. el plan con hipótesis ---
  let plan: ChannelPlan[] = [];
  try {
    const r = await armarPlan(proyecto, ficha, senales, publicos);
    plan = r.plan;
    descartes.push(...r.descartes);
    if (!plan.length) plan = await planDe(proyecto.orgId, proyecto.id);
    etapas.push({
      etapa: 'plan',
      resultado: plan.length ? 'ok' : 'vacio',
      detalle: plan.length
        ? `${plan.length} renglones en ${new Set(plan.map((p) => p.red)).size} redes`
        : 'no se pudo armar el plan',
    });
  } catch (e) {
    etapas.push({ etapa: 'plan', resultado: 'fallo', detalle: e instanceof Error ? e.message : String(e) });
  }

  return { proyecto, ficha, lecturas, senales, publicos, plan, descartes, etapas };
}

/**
 * Compara dos corridas y dice en qué se PARECEN demasiado.
 *
 * Es el arnés de la aceptación 1, y está escrito para acusar, no para tranquilizar:
 * dos negocios muy distintos que salen con los mismos públicos, las mismas redes y
 * las mismas ofertas significan que el motor está rellenando una plantilla. La
 * función devuelve los parecidos, y la prueba falla si son demasiados.
 */
export interface Parecido {
  que: string;
  detalle: string;
  /** `true` cuando el parecido es prueba de plantilla y no una coincidencia sana. */
  sospechoso: boolean;
}

export function compararCorridas(a: CorridaDelMotor, b: CorridaDelMotor): Parecido[] {
  const out: Parecido[] = [];

  const norm = (s: string) => s.toLowerCase().replace(/[^\wáéíóúñ ]/g, '').replace(/\s+/g, ' ').trim();

  // --- ofertas repetidas ---
  const ofertasA = new Set(a.publicos.map((p) => norm(p.oferta)));
  const ofertasB = new Set(b.publicos.map((p) => norm(p.oferta)));
  const ofertasIguales = [...ofertasA].filter((o) => ofertasB.has(o));
  out.push({
    que: 'ofertas idénticas',
    detalle: ofertasIguales.length ? ofertasIguales.join(' · ') : 'ninguna',
    // Una oferta palabra por palabra igual entre una fábrica de software y unos
    // departamentos solo puede salir de una plantilla.
    sospechoso: ofertasIguales.length > 0,
  });

  // --- dolores repetidos ---
  const doloresA = new Set(a.publicos.map((p) => norm(p.dolor)));
  const doloresIguales = b.publicos.map((p) => norm(p.dolor)).filter((d) => doloresA.has(d));
  out.push({
    que: 'dolores idénticos',
    detalle: doloresIguales.length ? doloresIguales.join(' · ') : 'ninguno',
    sospechoso: doloresIguales.length > 0,
  });

  // --- el porqué del plan ---
  const porquesA = new Set(a.plan.map((p) => norm(p.porque)));
  const porquesIguales = b.plan.map((p) => norm(p.porque)).filter((x) => porquesA.has(x));
  out.push({
    que: 'argumentos del plan idénticos',
    detalle: porquesIguales.length ? `${porquesIguales.length} renglones con el mismo porqué` : 'ninguno',
    sospechoso: porquesIguales.length > 0,
  });

  // --- el reparto por red ---
  const repartoA = [...new Set(a.plan.map((p) => p.red))].sort().join(',');
  const repartoB = [...new Set(b.plan.map((p) => p.red))].sort().join(',');
  out.push({
    que: 'mismo juego de redes',
    detalle: repartoA === repartoB ? `los dos usan exactamente: ${repartoA || '(ninguna)'}` : `${a.proyecto.name}: ${repartoA} · ${b.proyecto.name}: ${repartoB}`,
    // Esto NO es sospechoso por sí solo: dos negocios distintos pueden coincidir en
    // que Instagram y LinkedIn les sirven. Se informa sin acusar, y lo que acusa es
    // que además coincidan los argumentos.
    sospechoso: false,
  });

  return out;
}
