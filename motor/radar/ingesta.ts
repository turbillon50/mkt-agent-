/**
 * Worker de ingesta del radar: toma lo que midió un worker con navegador y lo
 * guarda como señales de mercado del proyecto.
 *
 *   npx tsx motor/radar/ingesta.ts --proyecto <uuid> --workana /tmp/workana.json
 *   npx tsx motor/radar/ingesta.ts --proyecto <uuid> --workana ... --umbral 500 --moneda USD
 *
 * Corre EN EL SERVIDOR, no en Vercel: la app solo lee lo que este worker escribe.
 * Por eso vive en `motor/` y no en `src/` — nada del build de la app lo importa,
 * y Playwright (que sí necesita el paso anterior) no entra al bundle.
 *
 * Todo lo que escribe pasa por `guardarSenal`, que calcula la calidad por código y
 * deja que la base rechace cualquier cifra sin fuente, fecha o método. Si este
 * worker intentara guardar un número huérfano, revienta aquí — que es donde tiene
 * que reventar, y no en una pantalla enfrente de un cliente.
 */
import '../../src/env';
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { db } from '../../src/db/client';
import { campaigns } from '../../src/db/schema';
import {
  abrirCorrida,
  cerrarCorrida,
  guardarHueco,
  guardarSenal,
  pctBajoUmbral,
  type ObservacionPrecio,
} from '../../src/motor/radar';
import type { Cifra } from '../../src/motor/procedencia';

interface MedicionWorkana {
  fuente: string;
  fuente_tipo: string;
  fuente_url: string;
  medido_en: string;
  filtro_publicacion?: string;
  subcategorias?: string[];
  consultas?: Array<Record<string, unknown>>;
  observaciones: Array<{
    titulo: string;
    url?: string | null;
    min?: number | null;
    max?: number | null;
    moneda?: string | null;
    por_hora?: boolean;
    propuestas?: number | null;
    publicado?: string | null;
    subcategoria?: string;
  }>;
  negadas?: Array<Record<string, unknown>>;
}

function arg(nombre: string, porDefecto?: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : porDefecto;
}

async function main() {
  const projectId = arg('proyecto');
  const rutaWorkana = arg('workana');
  const umbral = Number(arg('umbral', '500'));
  const moneda = (arg('moneda', 'USD') ?? 'USD').toUpperCase();

  if (!projectId) throw new Error('Falta --proyecto <uuid>.');
  if (!rutaWorkana) throw new Error('Falta --workana <ruta del json>.');

  const [proyecto] = await db.select().from(campaigns).where(eq(campaigns.id, projectId)).limit(1);
  if (!proyecto) throw new Error(`No existe el proyecto ${projectId}.`);

  const m: MedicionWorkana = JSON.parse(readFileSync(rutaWorkana, 'utf8'));
  const medidoEn = new Date(m.medido_en);
  if (Number.isNaN(medidoEn.getTime())) throw new Error(`La medición no trae fecha válida: ${m.medido_en}`);

  const corrida = await abrirCorrida({
    orgId: proyecto.orgId,
    projectId,
    tipo: 'precios_plataforma',
    worker: 'motor/radar/workana.py + motor/radar/ingesta.ts',
    consultas: m.consultas ?? [],
  });

  const base = {
    orgId: proyecto.orgId,
    projectId,
    tema: 'precios_mercado',
    radarRunId: corrida.id,
  };

  let hallazgos = 0;
  let huecos = 0;

  try {
    const obs: ObservacionPrecio[] = m.observaciones.map((o) => ({
      titulo: o.titulo,
      url: o.url,
      min: o.min,
      max: o.max,
      moneda: o.moneda,
      porHora: o.por_hora,
      propuestas: o.propuestas,
      publicado: o.publicado,
    }));

    const r = pctBajoUmbral(obs, umbral, moneda);
    const fuente: Pick<Cifra, 'fuenteTipo' | 'fuenteNombre' | 'fuenteUrl' | 'medidoEn'> = {
      fuenteTipo: 'plataforma',
      fuenteNombre: `${m.fuente} — proyectos abiertos (${(m.subcategorias ?? []).join(', ')})`,
      fuenteUrl: m.fuente_url,
      medidoEn,
    };

    if (r.pct == null) {
      // No hay con qué contar. Se dice, y se dice cómo se mediría.
      await guardarHueco(
        { ...base, clave: `pct_no_pasa_de_${umbral}_${moneda}`, etiqueta: `Proyectos cuyo presupuesto no pasa de ${umbral} ${moneda}` },
        `volver a correr motor/radar/workana.py con más subcategorías y pausas más largas; hoy ninguna observación traía presupuesto fijo comparable en ${moneda}`,
        'ninguna observación entró a la cuenta',
      );
      huecos++;
    } else {
      // Los DOS cortes se guardan como señales distintas. Guardar solo el que
      // conviene es la forma más fácil de mentir con un número verdadero.
      await guardarSenal(
        { ...base, clave: `pct_no_pasa_de_${umbral}_${moneda}`, etiqueta: `Proyectos cuyo presupuesto no pasa de ${umbral} ${moneda}`, pregunta: `¿Qué porcentaje de los proyectos abiertos tiene presupuesto que no pasa de ${umbral} ${moneda}?` },
        { ...fuente, valor: r.pct, unidad: '%', muestra: r.muestra, muestraDe: r.observados, metodo: r.metodo },
        { observaciones: m.observaciones, resumen: r },
      );
      hallazgos++;

      await guardarSenal(
        { ...base, clave: `pct_menos_de_${umbral}_${moneda}_estricto`, etiqueta: `Proyectos con presupuesto estrictamente menor a ${umbral} ${moneda}`, pregunta: `¿Y con el corte estricto?` },
        { ...fuente, valor: r.pctEstricto!, unidad: '%', muestra: r.muestra, muestraDe: r.observados, metodo: `${r.metodo}; este es el corte ESTRICTO (tope < ${umbral})` },
        { enElFilo: r.enElFilo },
      );
      hallazgos++;
    }

    if (r.mediana != null) {
      await guardarSenal(
        { ...base, clave: `mediana_tope_${moneda}`, etiqueta: `Mediana del tope de presupuesto` },
        { ...fuente, valor: r.mediana, unidad: moneda, muestra: r.muestra, muestraDe: r.observados, metodo: `mediana del tope publicado de los ${r.muestra} proyectos con presupuesto fijo en ${moneda}` },
      );
      hallazgos++;
    }

    if (r.propuestasMediana != null) {
      await guardarSenal(
        { ...base, tema: 'competencia', clave: 'propuestas_mediana', etiqueta: 'Propuestas que recibe un proyecto abierto (mediana)' },
        { ...fuente, valor: r.propuestasMediana, unidad: 'propuestas', muestra: r.muestra, muestraDe: r.observados, metodo: `mediana de las propuestas que la plataforma muestra en cada proyecto abierto` },
      );
      hallazgos++;
    }

    // Cuántos cobran por hora en vez de por proyecto: dice cómo compra el mercado.
    if (r.observados > 0) {
      await guardarSenal
        ({ ...base, clave: 'pct_por_hora', etiqueta: 'Proyectos publicados por hora en vez de precio fijo' },
        { ...fuente, valor: Math.round((r.descartados.porHora / r.observados) * 1000) / 10, unidad: '%', muestra: r.observados, muestraDe: r.observados, metodo: `de ${r.observados} proyectos observados, ${r.descartados.porHora} se publicaron por hora` });
      hallazgos++;
    }

    const negadas = m.negadas ?? [];
    await cerrarCorrida(corrida.id, negadas.length ? 'parcial' : 'listo', { hallazgos, huecos, negadas });

    console.log(`ok — ${hallazgos} señales, ${huecos} huecos, ${negadas.length} consultas negadas.`);
    console.log(`   corrida ${corrida.id} · proyecto ${proyecto.name}`);
    if (r.pct != null) {
      console.log(`   no pasa de ${umbral} ${moneda}: ${r.pct}% (${r.bajoUmbral}/${r.muestra}) · estricto: ${r.pctEstricto}% (${r.bajoUmbralEstricto}/${r.muestra}) · en el filo: ${r.enElFilo}`);
    }
  } catch (e) {
    await cerrarCorrida(corrida.id, 'fallido', { hallazgos, huecos, error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
