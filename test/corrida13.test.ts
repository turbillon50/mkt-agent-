/**
 * Pruebas de la corrida 13 — las correcciones de la QA de capacidades.
 *
 *   npx tsx test/corrida13.test.ts
 *
 * NO tocan la base ni salen a internet: todo lo que se mide aquí es lógica que
 * se puede romper en un refactor sin que nadie se entere hasta que un cliente lo
 * sufre. Lo que necesita red (publicar en Facebook, los DMs, el deploy) se mide
 * en el guion de QA, no aquí.
 *
 * Qué se prueba y por qué cada una está:
 *
 *  1. LAS FUENTES. Que fontconfig quede apuntando a las fuentes del bundle y que
 *     el texto se pinte con GLIFOS DE VERDAD. La prueba no mira "¿hay tinta?"
 *     —una fila de cajitas `.notdef` también tiene tinta— sino que una "W" mida
 *     más ancho que una "i". Con la fuente rota miden lo mismo, porque la cajita
 *     del glifo faltante es siempre igual. Es el hallazgo A y es el más caro.
 *  2. LA VERDAD DEL ASISTENTE. Que si la herramienta publicó, la respuesta lo
 *     diga con su URL, aunque el modelo haya escrito que falló. Es el hallazgo
 *     de la fila 14: publicó `urn:li:share:7505967549709213696` y contestó que
 *     había fallado por contenido duplicado.
 *  3. EL AVISO AL DUEÑO. Que un teléfono o un correo torcido NO se guarden, para
 *     que `notify_owner` no muera después con un error de Twilio que nadie
 *     relaciona con el campo que alguien tecleó mal.
 *  4. UN CASO QUE DEBE FALLAR, a mano. Desconfiar del 100 %: se corre a
 *     propósito una composición con la pila de fuentes VIEJA y se verifica que
 *     la prueba 1 la habría cazado. Una prueba que pasa siempre no prueba nada.
 */
import '../src/env';
import { componer } from '../src/creative/compose';
import { pilaDeFuentes, prepararFuentes, FAMILIA_BASE } from '../src/creative/fuentes';
import { elegirFormato } from '../src/creative/specs';
import { garantizarVerdad, SIN_ENLACE } from '../src/agent/verdad';
import { correoValido, telefonoValido } from '../src/sales/aviso-al-dueno';
import { sanitizeRules } from '../src/sales/projects';

let pasadas = 0;
const fallidas: string[] = [];

function ok(cond: boolean, que: string): void {
  if (cond) {
    pasadas += 1;
    console.log(`  ✓ ${que}`);
  } else {
    fallidas.push(que);
    console.log(`  ✗ ${que}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Las fuentes
// ---------------------------------------------------------------------------

/**
 * Ancho real de la tinta de un texto, medido sobre el píxel.
 *
 * Se compone una pieza con ese texto y se cuenta la columna más a la izquierda y
 * la más a la derecha que tengan tinta. Es la única forma honesta de distinguir
 * un glifo de una cajita vacía sin leer la fuente a mano.
 */
async function anchoDeTinta(texto: string): Promise<number> {
  const sharp = (await import('sharp')).default;
  const formato = elegirFormato('instagram', 'cuadrado');

  // Lienzo negro liso: cualquier píxel claro es texto, no foto.
  const base = await sharp({
    create: { width: formato.ancho, height: formato.alto, channels: 3, background: '#000000' },
  })
    .png()
    .toBuffer();

  const r = await componer({ baseBuf: base, formato, kit: null, textos: { titular: texto } });

  const { data, info } = await sharp(r.buf)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let min = info.width;
  let max = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      // 200 y no 128: el velo degradado sube el fondo hasta gris medio. Solo el
      // texto, que es blanco puro, pasa de aquí.
      if (data[y * info.width + x]! > 200) {
        if (x < min) min = x;
        if (x > max) max = x;
      }
    }
  }
  return max < 0 ? 0 : max - min;
}

async function pruebaFuentes(): Promise<void> {
  console.log('\n1. Las fuentes de las piezas');

  const estado = prepararFuentes();
  ok(estado.listo, `fontconfig listo (${estado.falta.join(', ') || 'sin faltantes'})`);
  ok(estado.directorio !== null, `las fuentes viven en ${estado.directorio}`);
  ok(
    estado.familias.includes(FAMILIA_BASE),
    `${FAMILIA_BASE} está entre las familias que se pueden resolver`,
  );
  ok(
    Boolean(process.env.FONTCONFIG_FILE) && Boolean(process.env.FONTCONFIG_PATH),
    'FONTCONFIG_FILE y FONTCONFIG_PATH quedaron puestas',
  );

  // La pila del SVG ya no termina en Helvetica/Arial, que en Vercel no existen.
  const pila = pilaDeFuentes(null);
  ok(pila.includes(FAMILIA_BASE), `la pila del SVG arranca con ${FAMILIA_BASE}: "${pila}"`);
  ok(
    pilaDeFuentes('Poppins').startsWith('Poppins,'),
    'la familia que pide el kit va al frente y la nuestra detrás',
  );

  // EL corazón: glifos de verdad, no cajitas.
  const anchoW = await anchoDeTinta('WWWW');
  const anchoI = await anchoDeTinta('iiii');
  ok(anchoW > 0 && anchoI > 0, `se pintó texto (W: ${anchoW} px · i: ${anchoI} px)`);
  ok(
    anchoW > anchoI * 1.5,
    `una W es mucho más ancha que una i (${anchoW} vs ${anchoI}) — son glifos, no cajitas .notdef`,
  );

  // Acentos y ñ: Montserrat los tiene, y el copy en español los usa en todos
  // los titulares. Un respaldo sin ellos deja huecos justo en las palabras del
  // cliente.
  const conAcentos = await anchoDeTinta('ñÁÉÍ');
  ok(conAcentos > 0, `los acentos y la ñ se pintan (${conAcentos} px de tinta)`);

  // El resultado lo DICE, para que la entrega no tenga que abrir el JPG.
  const formato = elegirFormato('instagram', 'cuadrado');
  const sharp = (await import('sharp')).default;
  const base = await sharp({
    create: { width: formato.ancho, height: formato.alto, channels: 3, background: '#111111' },
  })
    .png()
    .toBuffer();
  const pieza = await componer({
    baseBuf: base,
    formato,
    kit: null,
    textos: { titular: 'Departamentos en Tulum', cta: 'Agenda tu visita' },
  });
  ok(pieza.fuentes.listo === true, 'la composición reporta `fuentes.listo: true`');
  ok(pieza.puso.titular && pieza.puso.cta, 'puso titular y CTA');
  ok(
    pieza.ancho === formato.ancho && pieza.alto === formato.alto,
    `la pieza mide lo que pide la red: ${pieza.ancho}×${pieza.alto}`,
  );
}

// ---------------------------------------------------------------------------
// 2. La verdad del Asistente
// ---------------------------------------------------------------------------

function pruebaVerdadDelAsistente(): void {
  console.log('\n2. El Asistente dice lo que hizo la herramienta');

  const URL = 'https://www.linkedin.com/feed/update/urn:li:share:7505967549709213696/';

  // El caso EXACTO de la QA: publicó y narró un fallo por contenido duplicado.
  const mentira =
    'No se pudo publicar: LinkedIn lo rechazó por contenido duplicado. ¿Quieres que lo reescriba?';
  const corregida = garantizarVerdad(mentira, URL);
  ok(corregida.includes(URL), 'la respuesta corregida trae la URL real del post');
  ok(
    !/no se pudo publicar/i.test(corregida.split('\n')[0]!),
    'la primera línea ya no dice que falló',
  );
  ok(
    !corregida.includes('contenido duplicado') || corregida.includes('no es cierto'),
    'si se menciona el fallo inventado, se marca como no cierto',
  );

  // Dijo la verdad y puso el enlace: no se le toca una coma.
  const buena = `Ya quedó, aquí está: ${URL}`;
  ok(garantizarVerdad(buena, URL) === buena, 'una respuesta correcta se deja intacta');

  // Le faltó el enlace pero no mintió: se le agrega, sin borrar lo suyo.
  const sinEnlace = 'Listo, ya lo publiqué en LinkedIn.';
  const conEnlace = garantizarVerdad(sinEnlace, URL);
  ok(
    conEnlace.startsWith(sinEnlace) && conEnlace.includes(URL),
    'a una respuesta veraz sin enlace se le agrega el enlace y se conserva el texto',
  );

  // Se publicó pero la red no dio enlace (Instagram). No es lo mismo que fallar.
  const igual = garantizarVerdad('No se pudo publicar en Instagram.', SIN_ENLACE);
  ok(
    /ya qued[óo] publicado/i.test(igual),
    'publicado sin enlace se reporta como publicado, no como fallo',
  );

  // Y lo contrario: si NO se publicó, no se inventa que sí.
  const noPublico = 'No se pudo publicar: Instagram no deja publicar sin imagen.';
  ok(
    garantizarVerdad(noPublico, null) === noPublico,
    'sin publicación, la respuesta del modelo se respeta tal cual',
  );
}

// ---------------------------------------------------------------------------
// 3. El aviso al dueño
// ---------------------------------------------------------------------------

function pruebaAvisoAlDueno(): void {
  console.log('\n3. Las dos vías del aviso al dueño');

  ok(telefonoValido('+5219980000000'), 'un E.164 válido pasa');
  ok(!telefonoValido('9980000000'), 'un número sin lada de país NO pasa');
  ok(!telefonoValido('+0123456'), 'un número que empieza en 0 NO pasa');
  ok(correoValido('luis@vmomentums.info'), 'un correo válido pasa');
  ok(!correoValido('luis@'), 'un correo a medias NO pasa');

  // El saneador de Ajustes: perdona la forma de escribirlo, no el dato malo.
  const limpias = sanitizeRules({
    owner_phone: '52 1 998 000 0000',
    owner_email: '  LUIS@VMOMENTUMS.INFO ',
  });
  ok(
    limpias.owner_phone === '+5219980000000',
    `un teléfono con espacios se normaliza a E.164 (quedó ${limpias.owner_phone})`,
  );
  ok(
    limpias.owner_email === 'luis@vmomentums.info',
    `el correo se guarda en minúsculas y sin espacios (quedó ${limpias.owner_email})`,
  );

  const basura = sanitizeRules({ owner_phone: 'márcame al celular', owner_email: 'no tengo' });
  ok(basura.owner_phone === undefined, 'un teléfono que no es teléfono no se guarda');
  ok(basura.owner_email === undefined, 'un correo que no es correo no se guarda');
}

// ---------------------------------------------------------------------------
// 4. El caso que DEBE fallar
// ---------------------------------------------------------------------------

/**
 * Desconfiar del 100 %.
 *
 * Se rasteriza el MISMO texto con la pila vieja (`Helvetica, Arial, sans-serif`)
 * contra un fontconfig que apunta a un directorio VACÍO — que es exactamente el
 * runtime de Vercel del 16-sep. Si de ahí sale tinta con la misma forma que la
 * buena, la prueba 1 no estaba midiendo nada.
 *
 * Corre en un proceso aparte porque fontconfig se inicializa UNA vez por
 * proceso: dentro de este ya está el bueno cargado y cambiar la variable no
 * haría nada. Esa es justo la razón por la que el arreglo tiene que ocurrir
 * antes de cargar sharp.
 */
async function pruebaCasoQueDebeFallar(): Promise<void> {
  console.log('\n4. El caso que debe fallar (fontconfig sin fuentes)');

  const { execFileSync } = await import('node:child_process');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const os = await import('node:os');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'goossip-sinfuentes-'));
  fs.mkdirSync(path.join(dir, 'vacio'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'cache'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'fonts.conf'),
    `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>${dir}/vacio</dir><cachedir>${dir}/cache</cachedir></fontconfig>`,
  );

  /**
   * El guion va DENTRO del repo, no en /tmp.
   *
   * Node resuelve `sharp` subiendo por los `node_modules` desde el archivo que
   * hace el import, no desde el `cwd`. Con el guion en /tmp no encuentra nada y
   * el `execFileSync` truena — y la prueba se saltaba en silencio dando
   * "28 pasadas · 0 fallidas". Una prueba que se salta sola es peor que no
   * tenerla: dice que todo está bien sin haber medido nada.
   */
  const guion = path.join(process.cwd(), `.corrida13-medir-${process.pid}.mjs`);
  fs.writeFileSync(
    guion,
    `
const sharp = (await import('sharp')).default;
async function ancho(t) {
  const svg = '<svg width="1080" height="300" xmlns="http://www.w3.org/2000/svg">'
    + '<rect width="1080" height="300" fill="#000"/>'
    + '<text x="40" y="200" font-family="Montserrat, Helvetica, Arial, sans-serif" font-size="90" font-weight="700" fill="#fff">' + t + '</text></svg>';
  const { data, info } = await sharp(Buffer.from(svg)).greyscale().raw().toBuffer({ resolveWithObject: true });
  let min = info.width, max = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[y * info.width + x] > 200) { if (x < min) min = x; if (x > max) max = x; }
  }
  return max < 0 ? 0 : max - min;
}
console.log(JSON.stringify({ W: await ancho('WWWW'), i: await ancho('iiii') }));
`,
  );

  let medido: { W: number; i: number } | null = null;
  try {
    const salida = execFileSync(process.execPath, [guion], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FONTCONFIG_FILE: path.join(dir, 'fonts.conf'),
        FONTCONFIG_PATH: dir,
      },
      encoding: 'utf8',
    });
    medido = JSON.parse(salida.trim().split('\n').pop()!);
  } catch (e) {
    console.log(`     ${e instanceof Error ? e.message.split('\n')[0] : e}`);
  }

  // Si no se pudo medir, la prueba FALLA. Saltársela en silencio es cómo esto
  // devolvía "0 fallidas" sin haber comprobado absolutamente nada.
  ok(medido !== null, 'el control sin fuentes se pudo correr de verdad');

  if (medido) {
    console.log(`     sin fuentes → W: ${medido.W} px · i: ${medido.i} px`);
    // Con cajitas `.notdef` los dos anchos son IGUALES (o no hay tinta). Que la
    // prueba 1 exija W > 1.5·i es lo que hace que esto no pase desapercibido.
    ok(
      medido.W === 0 || Math.abs(medido.W - medido.i) < medido.i * 0.2,
      `sin fuentes, una W y una i miden lo mismo o no se pinta nada (${medido.W} vs ${medido.i}): la prueba 1 SÍ discrimina`,
    );
  }

  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(guion, { force: true });
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('Corrida 13 — correcciones de la QA de capacidades\n');
  try {
    await pruebaFuentes();
    pruebaVerdadDelAsistente();
    pruebaAvisoAlDueno();
    await pruebaCasoQueDebeFallar();
  } catch (e) {
    fallidas.push(`explotó: ${e instanceof Error ? e.message : String(e)}`);
    console.error(e);
  }

  console.log(`\n${pasadas} pasadas · ${fallidas.length} fallidas`);
  for (const f of fallidas) console.log(`  ✗ ${f}`);
  process.exit(fallidas.length > 0 ? 1 : 0);
}

void main();
