/**
 * Corre el motor en uno o en todos los proyectos zz- y enseña lo que salió.
 *
 *   npx tsx scripts/motor-correr.ts                 → los dos zz-, y los compara
 *   npx tsx scripts/motor-correr.ts <uuid>          → uno solo
 *   npx tsx scripts/motor-correr.ts --rearmar-ficha → vuelve a armar la ficha
 *
 * Es la herramienta con la que se mira la aceptación 1 a ojo, además de la prueba
 * automática (`npm run test:motor`).
 */
import '../src/env';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { campaigns, type Project } from '../src/db/schema';
import { compararCorridas, correrMotor, type CorridaDelMotor } from '../src/motor/correr';
import { valorEnPalabras } from '../src/motor/radar';
import { ETAPA_LABEL } from '../src/motor/publicos';
import { hipotesisSugerida } from '../src/motor/plan';
import { solidezDeFicha } from '../src/motor/ficha';
import { ORG_ZZ } from './zz-proyectos';

function pintar(c: CorridaDelMotor) {
  console.log('');
  console.log('='.repeat(78));
  console.log(`  ${c.proyecto.name}  —  ${c.proyecto.description ?? ''}`);
  console.log('='.repeat(78));

  console.log('\nETAPAS');
  for (const e of c.etapas) console.log(`  [${e.resultado.toUpperCase().padEnd(5)}] ${e.etapa.padEnd(9)} ${e.detalle}`);

  console.log('\nFICHA');
  if (!c.ficha) console.log('  (no se armó)');
  else {
    console.log(`  qué vende : ${c.ficha.queVende ?? '(sin dato)'}`);
    console.log(`  giro      : ${c.ficha.categoria ?? '(sin dato)'}`);
    const precio = c.ficha.precioMin || c.ficha.precioMax
      ? `${c.ficha.precioMin ?? '?'} a ${c.ficha.precioMax ?? '?'} ${c.ficha.moneda ?? ''}`
      : 'NO SE SABE (y no se inventa)';
    console.log(`  precio    : ${precio}`);
    console.log(`  mercados  : ${c.ficha.mercados.map((m) => [m.ciudad, m.pais].filter(Boolean).join(', ')).join(' · ') || '(sin dato)'}`);
    console.log(`  solidez   : ${solidezDeFicha(c.ficha).detalle}`);
    if (c.ficha.preguntasPendientes.length) {
      console.log('  le pregunta al dueño:');
      for (const q of c.ficha.preguntasPendientes) console.log(`    · ${q.pregunta}`);
    }
  }

  console.log('\nLO QUE SE LEYÓ');
  for (const l of c.lecturas) console.log(`  [${l.resultado.padEnd(6)}] ${l.que}: ${l.detalle}`);

  console.log('\nRADAR');
  if (!c.senales.length) console.log('  (nada medido todavía)');
  for (const s of c.senales) {
    if (s.hueco) console.log(`  [hueco] ${s.etiqueta} → se mediría así: ${s.comoMedirlo}`);
    else console.log(`  [${s.calidad.padEnd(5)}] ${s.etiqueta}: ${valorEnPalabras(s)}  (muestra ${s.muestra ?? 'n/d'})`);
  }

  console.log('\nPÚBLICOS');
  for (const p of c.publicos) {
    console.log(`  · ${p.nombre}  [${ETAPA_LABEL[p.etapa]}]`);
    console.log(`      quién  : ${p.segmento}`);
    console.log(`      duele  : ${p.dolor}`);
    console.log(`      oferta : ${p.oferta}`);
    console.log(`      porqué : ${p.porque}`);
    console.log(`      apoyo  : ${p.evidencia.length ? `${p.evidencia.length} medición(es)` : 'SIN medición — propuesta del analista'}`);
  }

  console.log('\nPLAN');
  const porId = new Map(c.publicos.map((p) => [p.id, p]));
  for (const f of c.plan) {
    const pub = f.audienceId ? porId.get(f.audienceId) : undefined;
    console.log(`  · ${f.red.toUpperCase()} × ${pub?.nombre ?? '(sin público)'} → ${f.objetivo}`);
    console.log(`      métrica    : ${f.metrica}${f.frecuenciaSemanal ? ` · ${f.frecuenciaSemanal}/semana` : ''}`);
    console.log(`      porqué     : ${f.porque}`);
    console.log(`      reglas     : ${f.reglasAplicadas.join(' · ')}`);
    console.log(`      hipótesis  : ${hipotesisSugerida(f, pub)}`);
  }

  if (c.descartes.length) {
    console.log('\nLO QUE EL CÓDIGO LE TIRÓ AL MODELO');
    for (const d of c.descartes) console.log(`  ✗ ${d}`);
  } else {
    console.log('\nLO QUE EL CÓDIGO LE TIRÓ AL MODELO: nada');
  }
}

async function main() {
  const rearmarFicha = process.argv.includes('--rearmar-ficha');
  const uno = process.argv.slice(2).find((a) => !a.startsWith('--'));

  let proyectos: Project[];
  if (uno) {
    proyectos = await db.select().from(campaigns).where(eq(campaigns.id, uno)).limit(1);
    if (!proyectos.length) throw new Error(`No existe el proyecto ${uno}`);
  } else {
    proyectos = await db.select().from(campaigns).where(eq(campaigns.orgId, ORG_ZZ));
    if (!proyectos.length) throw new Error('No hay proyectos zz-. Corre: npx tsx scripts/zz-proyectos.ts crear');
  }

  const corridas: CorridaDelMotor[] = [];
  for (const p of proyectos) {
    const c = await correrMotor(p, { rearmarFicha });
    corridas.push(c);
    pintar(c);
  }

  if (corridas.length === 2) {
    console.log('');
    console.log('='.repeat(78));
    console.log('  ¿SALIERON DISTINTAS? (aceptación 1)');
    console.log('='.repeat(78));
    const ps = compararCorridas(corridas[0]!, corridas[1]!);
    for (const p of ps) {
      console.log(`  [${p.sospechoso ? 'PLANTILLA' : '   ok    '}] ${p.que}: ${p.detalle}`);
    }
    const malos = ps.filter((p) => p.sospechoso);
    console.log('');
    console.log(malos.length === 0
      ? '  VEREDICTO: las dos estrategias son distintas. No es plantilla.'
      : `  VEREDICTO: ${malos.length} parecido(s) sospechoso(s). Huele a plantilla.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
