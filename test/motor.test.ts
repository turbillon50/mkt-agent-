/**
 * Pruebas del motor de análisis (corrida 14): medición, aprendizaje y las dos
 * aceptaciones que se pueden comprobar sin salir a la red.
 *
 *   npm run test:motor
 *
 * Lo que NO hace, a propósito: no llama al modelo ni sale a internet. Esas dos
 * cosas se verifican corriendo el motor de verdad (`scripts/motor-correr.ts`) y
 * quedan documentadas en el reporte con sus números. Una suite que depende de un
 * modelo y de la red no es una suite: es una ruleta que un día se pone roja sola
 * y enseña a la gente a ignorar el rojo.
 *
 * Crea y BORRA su propio proyecto de prueba. No toca los zz- ni nada real.
 */
import assert from 'node:assert/strict';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../src/db/client';
import {
  audiences,
  campaigns,
  channelPlan,
  lessons,
  marketSignals,
  organizations,
  postHypotheses,
  projectBrief,
  projectMembers,
  radarRuns,
  users,
  type Project,
} from '../src/db/schema';
import {
  capacidadDe,
  cruceConVentas,
  guardarLeccion,
  reporteEnPalabras,
  reporteSemanal,
  resolverHipotesis,
  CAPACIDAD_METRICA,
} from '../src/motor/medicion';
import { crearHipotesis, hipotesisSugerida, cifraDeSpec, cifraDeLienzo, METRICA_DE_OBJETIVO, OBJETIVO_LABEL } from '../src/motor/plan';
import { auditar, calidadDe } from '../src/motor/procedencia';
import { consultasDeFicha, pctBajoUmbral, medianaDe, valorEnPalabras } from '../src/motor/radar';
import { armarPantalla, auditarPantalla, limpiarNumero } from '../src/motor/pantalla';
import { contextoDeFicha, precioDeTexto } from '../src/motor/ficha';
import { compararCorridas, type CorridaDelMotor } from '../src/motor/correr';

const SUFIJO = Date.now().toString(36);
const ORG = `org_motortest_${SUFIJO}`;

let pasadas = 0;
const fallidas: string[] = [];
function ok(nombre: string, cond: boolean, detalle?: string) {
  if (cond) { pasadas++; return; }
  fallidas.push(detalle ? `${nombre} — ${detalle}` : nombre);
}

const creados: { proyectos: string[]; usuarios: string[] } = { proyectos: [], usuarios: [] };

async function montarProyecto(nombre: string): Promise<Project> {
  await db.insert(organizations).values({ id: ORG, name: `Motor ${SUFIJO}` }).onConflictDoNothing();
  const [u] = await db
    .insert(users)
    .values({ clerkId: `user_motor_${SUFIJO}_${nombre}`, email: `${nombre}-${SUFIJO}@motor.local` })
    .returning();
  creados.usuarios.push(u!.id);
  const [p] = await db
    .insert(campaigns)
    .values({ orgId: ORG, userId: u!.id, name: nombre, slug: `${nombre.toLowerCase()}-${SUFIJO}`, kind: 'servicios' })
    .returning();
  creados.proyectos.push(p!.id);
  // El dueño, como manda la 0014. Un dato de prueba cumple las mismas reglas.
  await db.insert(projectMembers).values({ orgId: ORG, projectId: p!.id, userId: u!.id, role: 'dueño', status: 'activo' });
  return p!;
}

async function limpiar() {
  if (creados.proyectos.length) {
    await db.delete(postHypotheses).where(inArray(postHypotheses.projectId, creados.proyectos));
    await db.delete(lessons).where(inArray(lessons.projectId, creados.proyectos));
    await db.delete(channelPlan).where(inArray(channelPlan.projectId, creados.proyectos));
    await db.delete(audiences).where(inArray(audiences.projectId, creados.proyectos));
    await db.delete(marketSignals).where(inArray(marketSignals.projectId, creados.proyectos));
    await db.delete(radarRuns).where(inArray(radarRuns.projectId, creados.proyectos));
    await db.delete(projectBrief).where(inArray(projectBrief.projectId, creados.proyectos));
    await db.delete(projectMembers).where(inArray(projectMembers.projectId, creados.proyectos));
    await db.delete(campaigns).where(inArray(campaigns.id, creados.proyectos));
  }
  if (creados.usuarios.length) await db.delete(users).where(inArray(users.id, creados.usuarios));
  await db.delete(organizations).where(eq(organizations.id, ORG));
}

/* ======================================================================
   1. La base impone la procedencia. Los casos que DEBEN fallar.
====================================================================== */
async function pruebaCandadosDeLaBase(proyecto: Project) {
  console.log('\n— los candados de la base —');

  const malos: Array<[string, () => Promise<unknown>]> = [
    ['un número sin fuente', () => db.insert(marketSignals).values({
      orgId: ORG, projectId: proyecto.id, tema: 'x', clave: 'x', etiqueta: 'X', valorNum: '42',
    } as never)],
    ['un número con fuente pero sin método', () => db.insert(marketSignals).values({
      orgId: ORG, projectId: proyecto.id, tema: 'x', clave: 'x', etiqueta: 'X', valorNum: '42',
      fuenteTipo: 'plataforma', fuenteNombre: 'W', medidoEn: new Date(),
    } as never)],
    ['un hueco sin cómo medirlo', () => db.insert(marketSignals).values({
      orgId: ORG, projectId: proyecto.id, tema: 'x', clave: 'x', etiqueta: 'X', hueco: true,
    } as never)],
    ['un público con tamaño sin señal que lo respalde', () => db.insert(audiences).values({
      orgId: ORG, projectId: proyecto.id, nombre: 'a', segmento: 's', dolor: 'd', oferta: 'o',
      etapa: 'descubre', porque: 'pq', tamanoEstimado: 5000,
    } as never)],
    ['un veredicto resuelto sin el número que lo resolvió', () => db.insert(postHypotheses).values({
      orgId: ORG, projectId: proyecto.id, red: 'instagram', hipotesis: 'h', metrica: 'm', veredicto: 'se_cumplio',
    } as never)],
  ];

  for (const [nombre, intento] of malos) {
    let rechazado = false;
    try { await intento(); } catch { rechazado = true; }
    ok(`la base rechaza ${nombre}`, rechazado, 'SE COLÓ');
  }

  // Y el dato bien formado SÍ entra: si no, el candado estaría de más apretado.
  let entro = false;
  try {
    await db.insert(marketSignals).values({
      orgId: ORG, projectId: proyecto.id, tema: 'precios', clave: 'pct', etiqueta: 'Proyectos que no pasan de 500 USD',
      valorNum: '84', unidad: '%', fuenteTipo: 'plataforma', fuenteNombre: 'Workana',
      medidoEn: new Date('2026-09-30'), muestra: 25, muestraDe: 35, metodo: 'conteo a mano', calidad: 'media',
    });
    entro = true;
  } catch (e) { fallidas.push(`el dato bien formado no entró: ${(e as Error).message.slice(0, 120)}`); }
  ok('el dato bien formado entra', entro);
}

/* ======================================================================
   2. La medición: veredicto por código, y lo que una red no da se dice.
====================================================================== */
async function pruebaMedicion(proyecto: Project) {
  console.log('\n— medición y aprendizaje —');

  const [publico] = await db.insert(audiences).values({
    orgId: ORG, projectId: proyecto.id, nombre: 'Gerente que compara', segmento: 's', dolor: 'd',
    oferta: 'o', etapa: 'compara', porque: 'pq',
  }).returning();

  const filas = await db.insert(channelPlan).values([
    { orgId: ORG, projectId: proyecto.id, red: 'facebook', audienceId: publico!.id, objetivo: 'conversion',
      metrica: METRICA_DE_OBJETIVO.conversion.metrica, metaUnidad: 'conversaciones', porque: 'pq' },
    { orgId: ORG, projectId: proyecto.id, red: 'linkedin', audienceId: publico!.id, objetivo: 'consideracion',
      metrica: METRICA_DE_OBJETIVO.consideracion.metrica, metaUnidad: 'acciones', porque: 'pq' },
  ]).returning();

  const hGana = await crearHipotesis(proyecto, { planId: filas[0]!.id, hipotesis: 'Un caso real trae conversaciones.', metaValor: 10 });
  const hPierde = await crearHipotesis(proyecto, { planId: filas[0]!.id, hipotesis: 'El carrusel se guarda mucho.', metaValor: 50 });
  const hLinkedIn = await crearHipotesis(proyecto, { planId: filas[1]!.id, hipotesis: 'La comparativa abre conversación.', metaValor: 5 });
  const hSinMeta = await crearHipotesis(proyecto, { planId: filas[0]!.id, hipotesis: 'Probemos a ver qué pasa.' });

  ok('la hipótesis hereda la métrica del plan', hGana?.metrica === METRICA_DE_OBJETIVO.conversion.metrica);
  ok('la hipótesis nace pendiente', hGana?.veredicto === 'pendiente');

  const r1 = await resolverHipotesis(hGana!, { valor: 14, fuente: 'Insights de la página', metodo: 'conversaciones que reporta la API' });
  ok('por arriba de la meta se cumple', r1?.veredicto === 'se_cumplio', r1?.veredicto);
  ok('y dice los dos números', /10/.test(r1?.veredictoPorque ?? '') && /14/.test(r1?.veredictoPorque ?? ''), r1?.veredictoPorque ?? '');
  ok('el resultado guarda su fuente', !!r1?.resultadoFuente && !!r1?.resultadoEn);

  const r2 = await resolverHipotesis(hPierde!, { valor: 31, fuente: 'Insights', metodo: 'guardados que reporta la API' });
  ok('por debajo de la meta NO se cumple', r2?.veredicto === 'no_se_cumplio', r2?.veredicto);
  ok('y dice cuánto faltó', /19/.test(r2?.veredictoPorque ?? ''), r2?.veredictoPorque ?? '');

  // Sin meta no hay veredicto: "salió 340" no es ni éxito ni fracaso.
  const r4 = await resolverHipotesis(hSinMeta!, { valor: 340, fuente: 'Insights', metodo: 'lo que reporta la API' });
  ok('sin meta no se inventa un veredicto', r4?.veredicto === 'sin_datos', r4?.veredicto);
  ok('y explica por qué', /sin una meta/i.test(r4?.veredictoPorque ?? ''), r4?.veredictoPorque ?? '');

  // LinkedIn: no es cero, es que no se puede leer.
  const r3 = await resolverHipotesis(hLinkedIn!, null);
  ok('sin datos queda en sin_datos', r3?.veredicto === 'sin_datos');
  ok('y lo explica sin decir que salió cero',
    /no se pueden leer/i.test(r3?.veredictoPorque ?? '') && !/\b0\b/.test(r3?.veredictoPorque ?? ''),
    r3?.veredictoPorque ?? '');

  // Lecciones: de lo bueno y de lo malo; de lo que no se sabe, no.
  ok('se guarda la lección de lo que funcionó', Boolean(await guardarLeccion(proyecto, r1!, publico)));
  ok('se guarda la lección de lo que NO funcionó', Boolean(await guardarLeccion(proyecto, r2!, publico)));
  ok('NO se guarda lección de lo que no se pudo medir', (await guardarLeccion(proyecto, r3!, publico)) === null);

  const guardadas = await db.select().from(lessons).where(eq(lessons.projectId, proyecto.id));
  ok('las lecciones apuntan a su hipótesis', guardadas.every((l) => l.refType === 'hipotesis' && !!l.refId));
  ok('hay lección de fracaso, no solo de éxito', guardadas.some((l) => /NO funcionó/.test(l.leccion)));
}

/* ======================================================================
   3. Lo que cada red puede medir, y el reporte semanal.
====================================================================== */
async function pruebaCapacidadYReporte(proyecto: Project) {
  console.log('\n— capacidad por red y reporte semanal —');

  ok('LinkedIn se declara como que no lo da la red', capacidadDe('linkedin').estado === 'no_lo_da_la_red');
  ok('y dice el permiso exacto que haría falta', /r_organization_social/.test(capacidadDe('linkedin').queFalta ?? ''));
  ok('Meta Ads se declara sin permiso', capacidadDe('metaads').estado === 'sin_permiso');
  ok('y dice el paso exacto en el Administrador Comercial',
    /Ver rendimiento|ads_read/.test(capacidadDe('metaads').queFalta ?? ''));
  ok('toda red no disponible dice qué falta',
    Object.values(CAPACIDAD_METRICA).every((c) => c.estado === 'disponible' || !!c.queFalta));
  ok('una red desconocida no truena y dice qué hacer', !!capacidadDe('pinterest').queFalta);

  const cruce = await cruceConVentas(proyecto, new Date(Date.now() - 7 * 86_400_000));
  ok('el cruce con ventas trae su método', cruce.metodo.length > 40);
  ok('el cruce separa lo que no dice de dónde vino', typeof cruce.sinOrigen === 'number');

  const rep = await reporteSemanal(proyecto);
  ok('el reporte separa lo que ganó de lo que no', rep.gano.length > 0 && rep.noGano.length > 0,
    `ganó ${rep.gano.length}, no ganó ${rep.noGano.length}`);
  ok('el reporte lista lo que no se pudo medir', rep.sinDatos.length > 0);
  ok('y para eso dice qué falta', rep.sinDatos.some((s) => !!s.queFalta));
  ok('el reporte propone algo', rep.propongo.length > 0);

  // EL ARNÉS, sobre el reporte: ningún número sin fuente.
  const defectos = auditar('reporte semanal', rep.afirmaciones);
  ok('ningún número del reporte va sin fuente', defectos.length === 0,
    defectos.map((d) => `${d.clase}: ${d.detalle}`).join(' | '));

  const texto = reporteEnPalabras(rep);
  ok('el reporte se lee en español normal', /GANÓ ESTO/.test(texto) && /PROPONGO/.test(texto));
  ok('el reporte dice cómo se contó el dinero', /Cómo se contó/.test(texto));
  ok('el reporte no enseña jerga de base', !/jsonb|uuid|sales_leads\b.*select/i.test(texto));
}

/* ======================================================================
   4. Cosas puras: no tocan la base ni la red.
====================================================================== */
function pruebasPuras() {
  console.log('\n— cálculo puro —');

  // pctBajoUmbral: la decisión de método que cambia el número.
  const obs = [
    { titulo: 'a', max: 250, moneda: 'USD' },
    { titulo: 'b', max: 500, moneda: 'USD' },
    { titulo: 'c', max: 3000, moneda: 'USD' },
    { titulo: 'd', min: 15, max: 45, moneda: 'USD', porHora: true },
    { titulo: 'e', moneda: 'USD' },
    { titulo: 'f', max: 400, moneda: 'MXN' },
  ];
  const r = pctBajoUmbral(obs, 500, 'USD');
  ok('los proyectos por hora NO cuentan como presupuesto bajo', r.descartados.porHora === 1);
  ok('los que no publican presupuesto se descartan y se cuentan', r.descartados.sinPresupuesto === 1);
  ok('otra moneda no se convierte a ojo', r.descartados.otraMoneda === 1);
  ok('la muestra son solo los comparables', r.muestra === 3, String(r.muestra));
  ok('el corte "no pasa de" incluye el filo', r.bajoUmbral === 2, String(r.bajoUmbral));
  ok('el corte estricto lo excluye', r.bajoUmbralEstricto === 1, String(r.bajoUmbralEstricto));
  ok('se reporta cuántos están en el filo', r.enElFilo === 1);
  ok('el método dice que se reportan los dos cortes', /los dos/.test(r.metodo));
  ok('sin nada comparable el porcentaje es nulo, no cero', pctBajoUmbral([], 500, 'USD').pct === null);

  ok('la mediana de un impar', medianaDe([1, 2, 3]) === 2);
  ok('la mediana de un par promedia', medianaDe([1, 2, 3, 4]) === 2.5);
  ok('la mediana de nada es nula', medianaDe([]) === null);

  // El formato: los ceros de la escala de numeric no son precisión.
  ok('numeric no ensucia el porcentaje',
    valorEnPalabras({ valorNum: '28.6000', unidad: '%', valorTexto: null } as never) === '28.6%');
  ok('la unidad que no es % va separada',
    valorEnPalabras({ valorNum: '36.0000', unidad: 'propuestas', valorTexto: null } as never) === '36 propuestas');
  ok('limpiarNumero quita la cola de ceros', limpiarNumero('2.0000') === '2');

  // Las cifras de spec: la deuda que dejó el arnés al quitar las excepciones.
  const c = cifraDeSpec('linkedin', 'caracteres');
  ok('la spec de red es una cifra oficial', c.fuenteTipo === 'oficial');
  ok('con su URL', (c.fuenteUrl ?? '').startsWith('https://'));
  ok('y con la fecha en que se leyó', c.medidoEn instanceof Date && !Number.isNaN(c.medidoEn.getTime()));
  ok('una spec pasa el arnés', auditar('spec', [{ plantilla: 'Caben {cifra}.', cifra: c }]).length === 0);
  ok('el lienzo también trae fuente', cifraDeLienzo('instagram').fuenteTipo === 'oficial');

  // Los objetivos se enseñan en palabras, no como llave de columna.
  ok('los objetivos tienen nombre en español',
    Object.values(OBJETIVO_LABEL).every((v) => /^[A-ZÁÉÍÓÚÑ]/.test(v) && !/_/.test(v)));
  ok('ningún objetivo se enseña como su llave', !Object.values(OBJETIVO_LABEL).includes('retencion' as never));

  // La frase de la hipótesis, que se partía en dos.
  const frase = hipotesisSugerida(
    { red: 'facebook', objetivo: 'conversion' } as never,
    { nombre: 'Listo para comprar', etapa: 'compra', dolor: 'me preocupa el costo.', oferta: 'Asesoría paso a paso.' } as never,
  );
  ok('la hipótesis no repite la etiqueta de la etapa', !/\(Listo para comprar\)/.test(frase), frase);
  ok('la hipótesis no se parte con un punto', !/\.\s+(ofreciéndole|entonces)/.test(frase), frase);

  // El precio: leerlo mal es un error de tres ceros.
  ok('millones no se confunde con mil', precioDeTexto('1.5 millones de pesos')?.min === 1_500_000);
  ok('los separadores de miles se leen bien', precioDeTexto('USD 3,000-8,000')?.max === 8000);
  ok('sin moneda no hay precio', precioDeTexto('como 50 mil') === null);

  // La calidad la calcula el código.
  const base = { fuenteTipo: 'medicion_propia' as const, medidoEn: new Date(), muestra: 120 };
  ok('medición propia fresca con muestra buena es alta', calidadDe(base).calidad === 'alta');
  ok('un blog nunca es alta', calidadDe({ ...base, fuenteTipo: 'blog' }).calidad !== 'alta');

  // Las consultas del radar salen de la ficha: eso es lo que lo hace agnóstico.
  const deApps = consultasDeFicha({ categoria: 'desarrollo de apps a la medida', mercados: [{ ciudad: 'CDMX', pais: 'México' }] } as never, 'X');
  const deDeptos = consultasDeFicha({ categoria: 'departamentos de preventa', mercados: [{ ciudad: 'Miami', pais: 'EE. UU.' }] } as never, 'Y');
  ok('las consultas salen de la ficha, no de una lista fija',
    deApps.every((c) => !deDeptos.some((d) => d.texto === c.texto)),
    `${deApps.map((c) => c.texto).join(' | ')} vs ${deDeptos.map((c) => c.texto).join(' | ')}`);
  ok('cada consulta dice por qué se hace', deApps.every((c) => c.porque.length > 15));
  ok('sin ficha se busca por el nombre y se dice que es pobre',
    /pobre/.test(consultasDeFicha(null, 'Z')[0]?.porque ?? ''));

  // El contexto que leen las etapas incluye lo que NO se sabe.
  const ctx = contextoDeFicha({
    queVende: 'x', precioMin: null, precioMax: null, moneda: null, mercados: [], idiomas: [],
    origenes: {}, preguntasPendientes: [], estado: 'borrador',
  } as never);
  ok('el contexto avisa que el precio no se sabe', /NO SE SABE/.test(ctx) && /No inventes/.test(ctx), ctx.slice(0, 120));

  // El comparador de la aceptación 1 tiene que ACUSAR, no tranquilizar.
  const corridaA = {
    proyecto: { name: 'A' }, publicos: [{ oferta: 'La misma oferta', dolor: 'El mismo dolor' }], plan: [{ porque: 'El mismo porqué', red: 'instagram' }],
  } as unknown as CorridaDelMotor;
  const corridaB = {
    proyecto: { name: 'B' }, publicos: [{ oferta: 'La misma oferta', dolor: 'El mismo dolor' }], plan: [{ porque: 'El mismo porqué', red: 'instagram' }],
  } as unknown as CorridaDelMotor;
  const iguales = compararCorridas(corridaA, corridaB);
  ok('dos corridas idénticas se marcan como plantilla',
    iguales.filter((p) => p.sospechoso).length >= 3,
    JSON.stringify(iguales.map((p) => [p.que, p.sospechoso])));

  const corridaC = {
    proyecto: { name: 'C' }, publicos: [{ oferta: 'Otra oferta distinta', dolor: 'Otro dolor' }], plan: [{ porque: 'Otro porqué', red: 'linkedin' }],
  } as unknown as CorridaDelMotor;
  ok('dos corridas distintas NO se marcan como plantilla',
    compararCorridas(corridaA, corridaC).every((p) => !p.sospechoso));
  ok('coincidir de red NO es por sí solo sospechoso',
    compararCorridas(corridaA, corridaC).find((p) => p.que === 'mismo juego de redes')?.sospechoso === false);
}

/* ======================================================================
   5. La pantalla: nada de lo que muestra puede ir sin fuente.
====================================================================== */
async function pruebaPantalla(proyecto: Project) {
  console.log('\n— la pantalla —');

  const senales = await db.select().from(marketSignals).where(eq(marketSignals.projectId, proyecto.id));
  const publicos = await db.select().from(audiences).where(eq(audiences.projectId, proyecto.id));
  const plan = await db.select().from(channelPlan).where(eq(channelPlan.projectId, proyecto.id));

  const e = armarPantalla({
    proyecto, ficha: null, senales, corrida: null, publicos, plan, hipotesisDe: hipotesisSugerida,
  });

  ok('la pantalla no enseña ningún número sin fuente', auditarPantalla(e).length === 0,
    JSON.stringify(auditarPantalla(e)));
  ok('sin ficha, el precio dice que no se sabe y no se inventa',
    e.ficha.precioDesconocido && /no se inventa/i.test(e.ficha.precio), e.ficha.precio);
  ok('sin radar, lo dice en vez de dejarlo vacío',
    senales.length > 0 || /todavía no ha medido/.test(e.radar.vacioLeyenda ?? ''));
  ok('el plan enseña el objetivo en palabras, no la llave',
    e.plan.filas.every((f) => !/^(descubrimiento|consideracion|conversion|retencion)$/.test(f.objetivo)),
    e.plan.filas.map((f) => f.objetivo).join(','));
  ok('cada renglón del plan trae su hipótesis', e.plan.filas.every((f) => f.hipotesis.length > 40));
  ok('cada renglón del plan dice por qué esa métrica', e.plan.filas.every((f) => f.metricaPorque.length > 20));
  ok('los públicos sin medición se marcan', e.publicos.filas.every((f) => f.sinApoyo === (f.apoyos === 0)));
  ok('se dicen las etapas del comprador sin cubrir', Array.isArray(e.publicos.etapasSinCubrir));
}

async function main() {
  console.log('Pruebas de la corrida 14 — el motor de análisis');

  try {
    const proyecto = await montarProyecto('Motor');
    await pruebaCandadosDeLaBase(proyecto);
    await pruebaMedicion(proyecto);
    await pruebaCapacidadYReporte(proyecto);
    pruebasPuras();
    await pruebaPantalla(proyecto);
  } catch (e) {
    fallidas.push(`explotó: ${e instanceof Error ? e.message : String(e)}`);
    console.error(e);
  } finally {
    await limpiar().catch((e) => console.error('limpiando:', e));
  }

  console.log(`\n${pasadas} pasadas · ${fallidas.length} fallidas`);
  for (const f of fallidas) console.log(`  ✗ ${f}`);
  assert.equal(fallidas.length, 0, `${fallidas.length} fallidas`);
}

void main();
