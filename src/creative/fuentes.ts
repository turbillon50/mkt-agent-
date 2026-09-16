/**
 * Las FUENTES de las piezas.
 *
 * El hallazgo más caro de la QA del 16-sep: las 18 piezas de MOMENTUM salieron
 * con el titular y el CTA en cajitas vacías (`.notdef`). No era el diseño: el
 * compositor pide `Montserrat, Helvetica, Arial, sans-serif` en un SVG que
 * rasteriza librsvg dentro de `sharp`, y **el runtime de Vercel no trae ni una
 * sola fuente instalada**. librsvg no encuentra nada, ni siquiera el respaldo, y
 * pinta el glifo de "no tengo este carácter" por cada letra.
 *
 * Aquí se arregla de raíz: las fuentes viajan CON el bundle (`assets/fonts/`) y
 * se le dice a fontconfig dónde están antes de que nadie rasterice un SVG.
 *
 * Tres cosas que no son adorno:
 *
 *   · **El `fonts.conf` se escribe en /tmp.** En Vercel el sistema de archivos
 *     es de solo lectura salvo `/tmp`, y fontconfig además necesita un
 *     directorio de caché donde pueda ESCRIBIR. Dejar la caché en el default
 *     (`~/.cache/fontconfig`) hace que reconstruya el índice en cada invocación
 *     —o que falle en silencio y vuelvan las cajitas.
 *   · **Los alias.** El kit de marca del cliente puede pedir cualquier familia
 *     ("Helvetica Neue", "Arial", la que traiga su manual). Sin un alias que
 *     caiga en Montserrat, pedir una familia que no está vuelve al mismo
 *     problema. Aquí `sans-serif`, `Helvetica` y `Arial` resuelven a Montserrat,
 *     y el último recurso es DejaVu Sans, que tiene cobertura de glifos enorme.
 *   · **Se prepara ANTES de tocar sharp.** fontconfig se inicializa UNA vez por
 *     proceso, en la primera rasterización. Si esa primera vez ocurre sin las
 *     variables puestas, ponerlas después ya no sirve de nada: la lambda entera
 *     se queda pintando cajitas. Por eso `compose.ts` importa este módulo en la
 *     línea de ARRIBA de `import sharp`, y además llama a `prepararFuentes()` al
 *     entrar a componer.
 */
import fs from 'node:fs';
import path from 'node:path';

/** La familia que se embarca y con la que se compone cuando el kit no manda otra. */
export const FAMILIA_BASE = 'Montserrat';

/**
 * La pila que se escribe en el `font-family` del SVG, después de la familia que
 * pida el kit. Ya no incluye `sans-serif` a secas como única red: cada nombre de
 * aquí tiene un alias en el `fonts.conf` de abajo.
 */
export const PILA_DE_RESPALDO = 'Montserrat, DejaVu Sans, sans-serif';

/** Los archivos que TIENEN que estar. Si falta uno, se dice cuál. */
const ARCHIVOS = ['Montserrat-Regular.ttf', 'Montserrat-Bold.ttf', 'DejaVuSans.ttf'];

export interface EstadoDeFuentes {
  /** ¿Se pudo dejar fontconfig apuntando a las fuentes de la casa? */
  listo: boolean;
  /** Dónde quedaron las fuentes, o null si no se encontraron. */
  directorio: string | null;
  /** El `fonts.conf` que se escribió. */
  conf: string | null;
  /** Las familias que fontconfig va a poder resolver. */
  familias: string[];
  /** En español, qué falta. Vacío cuando todo está bien. */
  falta: string[];
}

let cache: EstadoDeFuentes | null = null;

/**
 * Dónde viven las fuentes en ESTE entorno.
 *
 * En local es `<repo>/assets/fonts`. En Vercel, `outputFileTracingIncludes` de
 * `next.config.mjs` las copia conservando la ruta relativa, así que sale por el
 * mismo candidato — pero se prueban varios porque el `cwd` de una función
 * serverless no siempre es la raíz del proyecto, y quedarse con un solo
 * candidato es cómo esto vuelve a romperse sin avisar.
 */
function buscarDirectorio(): string | null {
  const candidatos = [
    process.env.GOOSSIP_FONTS_DIR,
    path.join(process.cwd(), 'assets', 'fonts'),
    path.join(process.cwd(), '..', 'assets', 'fonts'),
    // Vercel deja el bundle colgando de /var/task cuando el cwd es otro.
    '/var/task/assets/fonts',
  ].filter(Boolean) as string[];

  for (const dir of candidatos) {
    try {
      if (ARCHIVOS.every((f) => fs.statSync(path.join(dir, f)).size > 10_000)) return dir;
    } catch {
      // Ese candidato no era. Se sigue con el siguiente.
    }
  }
  return null;
}

/** Un directorio donde SÍ se puede escribir, en Vercel y fuera de él. */
function directorioEscribible(): string {
  const base = process.env.TMPDIR || '/tmp';
  const dir = path.join(base, 'goossip-fuentes');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function contenidoDelConf(dirFuentes: string, cache: string): string {
  return `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<!-- Generado por Goossip (src/creative/fuentes.ts). No se edita a mano. -->
<fontconfig>
  <dir>${dirFuentes}</dir>
  <cachedir>${cache}</cachedir>

  <!-- Sin familia declarada, Montserrat. -->
  <match target="pattern">
    <test qual="any" name="family"><string>sans-serif</string></test>
    <edit name="family" mode="prepend" binding="same"><string>Montserrat</string></edit>
  </match>

  <!-- Los nombres que traen los manuales de marca y que este runtime no tiene. -->
  <alias binding="same"><family>Helvetica</family><prefer><family>Montserrat</family></prefer></alias>
  <alias binding="same"><family>Helvetica Neue</family><prefer><family>Montserrat</family></prefer></alias>
  <alias binding="same"><family>Arial</family><prefer><family>Montserrat</family></prefer></alias>
  <alias binding="same"><family>Inter</family><prefer><family>Montserrat</family></prefer></alias>
  <alias binding="same"><family>Poppins</family><prefer><family>Montserrat</family></prefer></alias>

  <!-- El genérico, con el último recurso de cobertura amplia al final. -->
  <alias>
    <family>sans-serif</family>
    <prefer><family>Montserrat</family><family>DejaVu Sans</family></prefer>
  </alias>
  <alias>
    <family>serif</family>
    <prefer><family>DejaVu Sans</family><family>Montserrat</family></prefer>
  </alias>

  <!-- Cualquier familia que NO esté acaba aquí en vez de en cajitas vacías. -->
  <match target="pattern">
    <edit name="family" mode="append_last" binding="weak"><string>Montserrat</string></edit>
  </match>
  <match target="pattern">
    <edit name="family" mode="append_last" binding="weak"><string>DejaVu Sans</string></edit>
  </match>
</fontconfig>
`;
}

/**
 * Deja fontconfig apuntando a las fuentes de la casa. Idempotente y barata: la
 * primera llamada escribe el `fonts.conf`, las demás devuelven lo mismo.
 *
 * Nunca lanza. Si las fuentes no están, la pieza sale igual —fea, pero sale— y
 * el motivo queda en `falta` para que la entrega pueda decirlo con nombre y
 * apellido en vez de "no sé por qué no se ve el texto".
 */
export function prepararFuentes(): EstadoDeFuentes {
  if (cache) return cache;

  const directorio = buscarDirectorio();
  if (!directorio) {
    cache = {
      listo: false,
      directorio: null,
      conf: null,
      familias: [],
      falta: [`no encontré assets/fonts (busqué desde ${process.cwd()})`],
    };
    return cache;
  }

  try {
    const trabajo = directorioEscribible();
    const cacheDir = path.join(trabajo, 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const conf = path.join(trabajo, 'fonts.conf');
    fs.writeFileSync(conf, contenidoDelConf(directorio, cacheDir), 'utf8');

    // Las dos: `FONTCONFIG_FILE` manda el archivo y `FONTCONFIG_PATH` el
    // directorio donde buscarlo. Distintas versiones de fontconfig miran una u
    // otra, y poner las dos cuesta nada.
    process.env.FONTCONFIG_FILE = conf;
    process.env.FONTCONFIG_PATH = trabajo;

    cache = {
      listo: true,
      directorio,
      conf,
      familias: ['Montserrat', 'DejaVu Sans'],
      falta: [],
    };
  } catch (e) {
    cache = {
      listo: false,
      directorio,
      conf: null,
      familias: [],
      falta: [e instanceof Error ? e.message : 'no se pudo escribir el fonts.conf'],
    };
  }

  return cache;
}

/** Solo para las pruebas: olvida lo que se preparó y vuelve a mirar el disco. */
export function olvidarFuentes(): void {
  cache = null;
}

/**
 * El `font-family` completo para un SVG, con la familia del kit al frente.
 *
 * Se usa en `compose.ts`. Que viva aquí y no allá es a propósito: el día que se
 * embarque otra fuente, la pila se cambia en UN lugar.
 */
export function pilaDeFuentes(familiaDelKit?: string | null): string {
  const kit = (familiaDelKit ?? '').trim();
  if (!kit || kit.toLowerCase() === FAMILIA_BASE.toLowerCase()) return PILA_DE_RESPALDO;
  return `${kit}, ${PILA_DE_RESPALDO}`;
}

// Se prepara al IMPORTAR, no solo al llamar. `compose.ts` pone este import
// arriba del de sharp justo para que fontconfig quede listo antes de que se
// cargue librsvg. Ver el comentario de la cabecera.
prepararFuentes();
