/**
 * Aceptación 3 de la corrida 14: "Prueba automática que falla si un reporte o
 * pantalla muestra un número sin fuente; y una contraprueba corrida a mano que
 * demuestre que el arnés sí reprueba."
 *
 * Las dos mitades están aquí, y la segunda importa más que la primera. Una prueba
 * que solo confirma los casos buenos no demuestra nada: la doctrina (regla 6) dice
 * desconfiar del 100% de aprobación y correr a mano lo que debe fallar. Así que
 * este archivo arma a propósito pantallas defectuosas y exige que el arnés las
 * repruebe, una por una, con el nombre del defecto.
 *
 *   npm run test:procedencia
 */
import assert from 'node:assert/strict';
import {
  auditar,
  afirmacionEnPalabras,
  calidadDe,
  cifraEnPalabras,
  exigirProcedencia,
  fichaDeFuente,
  render,
  senalDeCifra,
  senalHueco,
  PESO_FUENTE,
  type Afirmacion,
  type Cifra,
  type DefectoProcedencia,
} from '../src/motor/procedencia';

const AHORA = new Date('2026-09-30T12:00:00Z');

let pasadas = 0;
const fallidas: string[] = [];
function ok(nombre: string, cond: boolean, detalle?: string) {
  if (cond) { pasadas++; return; }
  fallidas.push(detalle ? `${nombre} — ${detalle}` : nombre);
}

/** La medición real del 30-sep en Workana. Es la que contesta la aceptación 2. */
const WORKANA: Cifra = {
  valor: 85.7,
  unidad: '%',
  fuenteTipo: 'plataforma',
  fuenteNombre: 'Workana — proyectos abiertos de apps, página 1',
  fuenteUrl: 'https://www.workana.com',
  medidoEn: new Date('2026-09-30T00:00:00Z'),
  muestra: 6,
  muestraDe: 7,
  metodo: 'conteo a mano de los presupuestos publicados en la página 1 de proyectos de apps',
};

/* ===========================================================================
   1. Lo que debe PASAR: una afirmación bien armada.
=========================================================================== */
{
  const buena: Afirmacion = {
    plantilla: '{cifra} de los proyectos de apps abiertos en Workana pide menos de {umbral}.',
    cifra: WORKANA,
    parametros: { umbral: 'USD 500' },
  };

  ok('la afirmación bien armada pasa el arnés', auditar('prueba', [buena], AHORA).length === 0,
    JSON.stringify(auditar('prueba', [buena], AHORA)));

  const texto = render(buena);
  ok('el render mete la cifra en la frase', texto.includes('85.7%'), texto);
  ok('el render mete el parámetro declarado', texto.includes('USD 500'), texto);
  ok('el render no deja huecos', !/\{|\}/.test(texto), texto);

  const conCola = afirmacionEnPalabras(buena);
  ok('el renglón completo trae la fuente', conCola.includes('Workana'), conCola);
  ok('el renglón completo trae la fecha', /30 de septiembre de 2026/.test(conCola), conCola);
  ok('el renglón completo trae la muestra', conCola.includes('muestra: 6 de 7'), conCola);
  ok('el renglón completo trae el método', conCola.includes('método:'), conCola);

  // Una frase sin números no necesita cifra: es prosa, no un dato.
  ok('una frase sin números pasa sin cifra',
    auditar('prueba', [{ plantilla: 'Ningún anunciante de la categoría publica su precio.' }], AHORA).length === 0);

  // Un hueco declarado con su propuesta es un estado legítimo.
  ok('un hueco con propuesta de medición pasa',
    auditar('prueba', [{
      plantilla: 'Cuántos compradores buscan en TikTok antes de comprar: {cifra}',
      hueco: { que: 'TikTok no abre esa métrica a terceros', comoMedirlo: 'encuesta de una pregunta en el checkout durante dos semanas' },
    }], AHORA).length === 0);

  // La etiqueta de una medición puede traer el parámetro de la pregunta, pero solo
  // si hay una medición a la que ese número pertenezca.
  {
    const conMedicion: Afirmacion = {
      etiqueta: 'Proyectos cuyo presupuesto no pasa de 500 USD',
      plantilla: '{cifra}',
      cifra: WORKANA,
    };
    ok('etiqueta con números pasa si trae la medición que los respalda',
      auditar('prueba', [conMedicion], AHORA).length === 0,
      JSON.stringify(auditar('prueba', [conMedicion], AHORA)));
    ok('y el render la pone delante del valor',
      render(conMedicion).startsWith('Proyectos cuyo presupuesto no pasa de 500 USD: 85.7%'),
      render(conMedicion));

    const huecoConEtiqueta: Afirmacion = {
      etiqueta: 'Búsquedas mensuales de "departamento Miami" en los últimos 12 meses',
      plantilla: '{cifra}',
      hueco: { que: 'pytrends no está instalado en el servidor', comoMedirlo: 'instalar pytrends-modern y leer Google Trends' },
    };
    ok('etiqueta con números pasa también con un hueco declarado',
      auditar('prueba', [huecoConEtiqueta], AHORA).length === 0);
    ok('y el hueco se rellena diciendo que no hay dato',
      render(huecoConEtiqueta).includes('sin dato'), render(huecoConEtiqueta));

    // EL AGUJERO QUE NO SE ABRE: una etiqueta con números pero sin medición
    // detrás sigue reprobando. Si esto pasara, bastaría meter cualquier cifra
    // inventada en una etiqueta para esquivar el arnés por completo.
    const etiquetaPelona: Afirmacion = {
      etiqueta: 'El mercado creció 30% este año',
      plantilla: 'Eso nos conviene.',
    };
    const d = auditar('prueba', [etiquetaPelona], AHORA);
    ok('CONTRAPRUEBA: etiqueta con números SIN medición detrás reprueba',
      d.some((x) => x.clase === 'numero_sin_fuente'),
      `salió: ${d.map((x) => x.clase).join(',') || 'nada'}`);
  }

  // Las medidas DE LA RED no son una excepción: también se declaran. Antes había
  // una lista de formas permitidas (3:4, 1080x1350, 0-3 s) y se quitó porque una
  // lista de excepciones es el agujero por donde se cuela "el mercado creció 30%"
  // disfrazado de rango. Declaradas, pasan; a mano en la prosa, no.
  const medidasDeRed: Array<[string, Record<string, string>]> = [
    ['La imagen tiene que caber en el centro {recorte} que recorta el perfil.', { recorte: '3:4' }],
    ['El carrusel documento va de {laminas} láminas.', { laminas: '8-12' }],
    ['La propuesta entra en los primeros {ventana}.', { ventana: '0-3 s' }],
    ['El lienzo es de {lienzo}.', { lienzo: '1080x1350' }],
  ];
  for (const [plantilla, parametros] of medidasDeRed) {
    const d = auditar('prueba', [{ plantilla, parametros }], AHORA);
    ok(`medida de red declarada pasa: "${plantilla}"`, d.length === 0, JSON.stringify(d));
    // Y la misma frase con el número a mano tiene que reprobar.
    const aMano = plantilla.replace(/\{(\w+)\}/, (_m, k: string) => parametros[k]!);
    ok(`la misma medida a mano reprueba: "${aMano}"`,
      auditar('prueba', [{ plantilla: aMano }], AHORA).some((x) => x.clase === 'numero_sin_fuente'));
  }
}

/* ===========================================================================
   2. LA CONTRAPRUEBA. Cada pantalla de aquí está mal a propósito y el arnés
      TIENE que reprobarla. Si alguna pasa, la prueba entera no vale.
=========================================================================== */
{
  const malos: Array<{ nombre: string; clase: DefectoProcedencia['clase']; a: Afirmacion }> = [
    {
      nombre: 'número escrito a mano en la prosa (el caso que persigue la aceptación 3)',
      clase: 'numero_sin_fuente',
      a: { plantilla: 'El 85% de los proyectos de apps pide menos de USD 500.' },
    },
    {
      nombre: 'número a mano aunque la afirmación sí traiga otra cifra con fuente',
      clase: 'numero_sin_fuente',
      a: { plantilla: '{cifra} de los proyectos pide poco, y el mercado creció 30% este año.', cifra: WORKANA },
    },
    {
      nombre: 'parámetro no declarado, escrito directo en la prosa',
      clase: 'numero_sin_fuente',
      a: { plantilla: '{cifra} de los proyectos pide menos de USD 500.', cifra: WORKANA },
    },
    {
      nombre: 'cifra sin decir de dónde salió',
      clase: 'cifra_sin_fuente',
      a: { plantilla: 'Competidores activos: {cifra}', cifra: { ...WORKANA, fuenteNombre: '  ' } },
    },
    {
      nombre: 'cifra sin método',
      clase: 'cifra_sin_metodo',
      a: { plantilla: 'Competidores activos: {cifra}', cifra: { ...WORKANA, metodo: '' } },
    },
    {
      nombre: 'cifra con fecha inválida',
      clase: 'cifra_sin_fecha',
      a: { plantilla: 'Competidores activos: {cifra}', cifra: { ...WORKANA, medidoEn: new Date('no-es-fecha') } },
    },
    {
      nombre: 'porcentaje sin tamaño de muestra',
      clase: 'porcentaje_sin_muestra',
      a: { plantilla: '{cifra} de los proyectos pide poco.', cifra: { ...WORKANA, muestra: null, muestraDe: null } },
    },
    {
      nombre: 'hueco que no propone cómo medirse',
      clase: 'hueco_sin_propuesta',
      a: { plantilla: 'Intención de compra: {cifra}', hueco: { que: 'no hay fuente', comoMedirlo: '   ' } },
    },
    {
      nombre: 'hueco de plantilla que se vería como basura en pantalla',
      clase: 'placeholder_sin_rellenar',
      a: { plantilla: 'Competidores en {ciudad}: {cifra}', cifra: { ...WORKANA, unidad: undefined } },
    },
    {
      nombre: 'calidad maquillada a mano (dice alta, le toca baja)',
      clase: 'calidad_mal_calculada',
      a: {
        plantilla: 'Tendencia: {cifra}',
        cifra: { ...WORKANA, fuenteTipo: 'blog', muestra: 3, calidad: 'alta' },
      },
    },
  ];

  for (const m of malos) {
    const d = auditar('contraprueba', [m.a], AHORA);
    ok(`CONTRAPRUEBA reprueba: ${m.nombre}`, d.length > 0, 'el arnés la dejó pasar');
    ok(`CONTRAPRUEBA la clasifica bien: ${m.nombre}`, d.some((x) => x.clase === m.clase),
      `esperaba ${m.clase}, salió ${d.map((x) => x.clase).join(',') || 'nada'}`);
  }

  // El arnés debe reportar TODOS los defectos de una pantalla, no el primero.
  const pantallaFea = auditar('pantalla-fea', malos.map((m) => m.a), AHORA);
  ok('reporta todos los defectos de la pantalla, no solo el primero',
    pantallaFea.length >= malos.length, `${pantallaFea.length} defectos para ${malos.length} afirmaciones malas`);

  // Y `exigirProcedencia` tiene que TRONAR, no advertir.
  let trono = false;
  let mensaje = '';
  try { exigirProcedencia('pantalla-fea', [malos[0]!.a], AHORA); }
  catch (e) { trono = true; mensaje = e instanceof Error ? e.message : String(e); }
  ok('exigirProcedencia truena con la pantalla mala', trono);
  ok('y el error dice qué número fue', mensaje.includes('85'), mensaje);

  let tronoConBuena = false;
  try { exigirProcedencia('pantalla-buena', [{ plantilla: '{cifra} de los proyectos pide menos de {umbral}.', cifra: WORKANA, parametros: { umbral: 'USD 500' } }], AHORA); }
  catch { tronoConBuena = true; }
  ok('exigirProcedencia NO truena con la pantalla buena', !tronoConBuena);
}

/* ===========================================================================
   3. La calidad la calcula el código, y castiga por las tres vías.
=========================================================================== */
{
  const base = { fuenteTipo: 'medicion_propia' as const, medidoEn: new Date('2026-09-29T00:00:00Z'), muestra: 120, muestraDe: 400 };

  ok('medición propia fresca con buena muestra → alta', calidadDe(base, AHORA).calidad === 'alta',
    JSON.stringify(calidadDe(base, AHORA)));

  ok('la misma medición de hace ocho meses ya no es alta',
    calidadDe({ ...base, medidoEn: new Date('2026-01-15T00:00:00Z') }, AHORA).calidad !== 'alta');

  ok('la misma fuente con muestra de 4 ya no es alta',
    calidadDe({ ...base, muestra: 4 }, AHORA).calidad !== 'alta');

  ok('un blog nunca llega a alta', calidadDe({ ...base, fuenteTipo: 'blog' }, AHORA).calidad !== 'alta');

  ok('el modelo es la fuente más débil de todas',
    Math.min(...Object.values(PESO_FUENTE)) === PESO_FUENTE.modelo);

  ok('una medición propia pesa más que un blog', PESO_FUENTE.medicion_propia > PESO_FUENTE.blog);

  ok('el motivo de la calidad se puede enseñar, con los números a la vista',
    /muestra de 120/.test(calidadDe(base, AHORA).motivo), calidadDe(base, AHORA).motivo);

  ok('una medición fechada en el futuro se castiga en vez de creerse',
    calidadDe({ ...base, medidoEn: new Date('2027-01-01T00:00:00Z') }, AHORA).motivo.includes('futuro'));
}

/* ===========================================================================
   4. El puente con la base guarda la calidad ya calculada por código.
=========================================================================== */
{
  const fila = senalDeCifra({ orgId: 'org_x', projectId: 'proj_x', tema: 'precios', clave: 'pct_menos_500', etiqueta: 'Proyectos que piden menos de USD 500' }, WORKANA);
  ok('la señal guarda el valor numérico como texto para numeric', fila.valorNum === '85.7', String(fila.valorNum));
  ok('la señal NO es hueco', fila.hueco === false);
  ok('la señal lleva la calidad calculada, no la que venga de fuera', ['alta', 'media', 'baja'].includes(fila.calidad));
  ok('la señal lleva el motivo de su calidad', (fila.calidadMotivo ?? '').length > 10, fila.calidadMotivo ?? '');
  ok('la señal conserva método y fecha', !!fila.metodo && !!fila.medidoEn);

  const hueco = senalHueco({ orgId: 'org_x', projectId: 'proj_x', tema: 'demanda', clave: 'intencion', etiqueta: 'Intención de compra' }, 'encuesta de una pregunta en el checkout');
  ok('el hueco se guarda como hueco', hueco.hueco === true);
  ok('el hueco no trae valor', !('valorNum' in hueco));
  ok('el hueco trae cómo medirlo', hueco.comoMedirlo.length > 10);

  // Un texto, no un número: también es una respuesta legítima y medida.
  const textual = senalDeCifra(
    { orgId: 'org_x', projectId: 'proj_x', tema: 'precios', clave: 'publican_precio', etiqueta: 'Anunciantes que publican precio' },
    { ...WORKANA, valor: 'ninguno de los revisados publica precio', unidad: undefined },
  );
  ok('una respuesta de texto se guarda en valor_texto', textual.valorTexto?.startsWith('ninguno') === true);
  ok('y deja valor_num vacío', textual.valorNum === null);
}

/* ===========================================================================
   5. Detalles de presentación: en español y sin jerga.
=========================================================================== */
{
  ok('el porcentaje se pega al número', cifraEnPalabras({ ...WORKANA }) === '85.7%', cifraEnPalabras(WORKANA));
  ok('la unidad que no es % va separada',
    cifraEnPalabras({ ...WORKANA, valor: 150, unidad: 'anuncios activos' }) === '150 anuncios activos');
  ok('los miles se separan como en México',
    cifraEnPalabras({ ...WORKANA, valor: 1400, unidad: 'anuncios activos' }).startsWith('1,400'));
  ok('la ficha de fuente dice el peso de la fuente en palabras',
    fichaDeFuente(WORKANA).includes('la plataforma misma'), fichaDeFuente(WORKANA));
  ok('sin muestra, la ficha lo dice en vez de callarlo',
    fichaDeFuente({ ...WORKANA, muestra: null }).includes('sin muestra'));
}

console.log(`\n${pasadas} pasadas · ${fallidas.length} fallidas`);
for (const f of fallidas) console.log(`  ✗ ${f}`);
if (fallidas.length === 0) {
  console.log('\nok — el arnés aprueba lo que tiene fuente y reprueba lo que no,');
  console.log('     y la contraprueba demuestra que sí reprueba (10 pantallas malas, 10 reprobadas).');
}
assert.equal(fallidas.length, 0, `${fallidas.length} fallidas`);
