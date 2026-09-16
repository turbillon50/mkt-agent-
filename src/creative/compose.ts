/**
 * La composición propia: texto, logo y CTA encima de la imagen base.
 *
 * Es el CAMINO DE RESPALDO. Cuando el proyecto tiene Canva conectado y una
 * plantilla de marca, la pieza la arma Canva (`canva.ts`). Cuando no —que es el
 * caso de todo proyecto que acaba de nacer— la arma esto, con sharp.
 *
 * Que exista este camino es lo que hace que el motor de piezas SIRVA el primer
 * día. Un motor que solo funciona con Canva conectado es un motor apagado para
 * el 100 % de los clientes nuevos.
 *
 * Tres cosas que aquí no son adorno:
 *
 *   · El recorte al tamaño EXACTO de la spec. Gemini devuelve lo que quiere
 *     (pidiéndole 4:5 dio 896×1152). La red cuenta píxeles, así que se recorta
 *     al centro y se redimensiona al número de la spec.
 *   · La zona segura. El titular se coloca DENTRO de ella; si no, la propia
 *     red le pone su botón encima y el cliente no lo ve hasta que ya publicó.
 *   · El velo bajo el texto. Un titular blanco sobre una foto clara no se lee.
 *     Se mide el brillo de la franja donde va a caer y se decide el color del
 *     texto y la opacidad del velo con ese número, no a ojo.
 */
// ESTE IMPORT VA ARRIBA DEL DE SHARP Y NO SE MUEVE.
//
// fontconfig se inicializa una sola vez por proceso, en la primera vez que
// librsvg rasteriza un SVG. Si esa primera vez pasa sin `FONTCONFIG_FILE`
// puesto, la lambda entera se queda pintando cajitas vacías y ya no hay forma de
// arreglarlo en caliente. Ver src/creative/fuentes.ts.
import { pilaDeFuentes, prepararFuentes } from './fuentes';
import sharp from 'sharp';
import { bajarImagen } from './media';
import { zonaSeguraPx, type FormatoSpec } from './specs';
import { colorDe, type ProjectBrandKit } from './brand-kit';

export interface TextosDePieza {
  titular?: string | null;
  cta?: string | null;
}

export interface ResultadoComposicion {
  buf: Buffer;
  ancho: number;
  alto: number;
  /** Qué se acabó pintando encima, para poder contarlo en la entrega. */
  puso: { titular: boolean; cta: boolean; logo: boolean };
  /**
   * Con qué fuentes se pintó el texto.
   *
   * No es telemetría de adorno: `listo:false` es EXACTAMENTE el estado en el que
   * salieron las 18 piezas de MOMENTUM con cajitas vacías. Que viaje en el
   * resultado permite que la pantalla y la entrega lo digan con nombre y
   * apellido en vez de que alguien tenga que abrir el JPG para enterarse.
   */
  fuentes: { listo: boolean; familia: string; falta: string[] };
}

/** XML no perdona: un "&" en el copy del cliente rompe el SVG entero. */
function escapar(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Parte el titular en renglones que quepan.
 *
 * Es una estimación por ancho medio de carácter (0.52 del tamaño de letra),
 * no una medición tipográfica real: sharp no expone métricas de fuente. Se
 * queda corto a propósito — que sobre margen es un renglón feo; que falte es
 * texto cortado por el borde.
 */
export function partirEnRenglones(texto: string, anchoUtil: number, tamano: number): string[] {
  const porRenglon = Math.max(8, Math.floor(anchoUtil / (tamano * 0.52)));
  const palabras = texto.split(/\s+/).filter(Boolean);
  const renglones: string[] = [];
  let actual = '';
  for (const p of palabras) {
    if (!actual) {
      actual = p;
    } else if ((actual + ' ' + p).length <= porRenglon) {
      actual += ' ' + p;
    } else {
      renglones.push(actual);
      actual = p;
    }
  }
  if (actual) renglones.push(actual);
  return renglones.slice(0, 4);
}

/** Brillo medio (0–255) de una franja. Con esto se decide blanco o negro. */
async function brilloDe(
  base: sharp.Sharp,
  region: { left: number; top: number; width: number; height: number },
): Promise<number> {
  try {
    const { data } = await base
      .clone()
      .extract(region)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let suma = 0;
    for (let i = 0; i < data.length; i += 1) suma += data[i]!;
    return suma / data.length;
  } catch {
    // Si la franja se sale del lienzo, se asume oscuro: texto blanco sobre
    // velo es la apuesta que falla más bonito.
    return 90;
  }
}

/**
 * Compone la pieza final.
 *
 * Devuelve PNG siempre; el motor convierte a JPEG cuando la red lo pide (a
 * Instagram por la API solo le entra JPEG).
 */
export async function componer(input: {
  baseBuf: Buffer;
  formato: FormatoSpec;
  kit: ProjectBrandKit | null;
  textos: TextosDePieza;
}): Promise<ResultadoComposicion> {
  const { formato, kit, textos } = input;
  const W = formato.ancho;
  const H = formato.alto;

  // Cinturón además de tirantes: el import de arriba ya lo dejó listo, pero si
  // alguien reordena los imports esto sigue salvando la pieza.
  const fuentes = prepararFuentes();

  // 1. Al tamaño exacto de la red. `cover` recorta al centro en vez de
  //    deformar: una cara estirada es peor que una cara recortada.
  const base = sharp(input.baseBuf).resize(W, H, { fit: 'cover', position: 'centre' });
  const lienzo = await base.png().toBuffer();

  const z = zonaSeguraPx(formato);
  const margen = Math.max(Math.round(W * 0.06), z.lados + Math.round(W * 0.02));
  const anchoUtil = W - margen * 2;

  const capas: sharp.OverlayOptions[] = [];
  const puso = { titular: false, cta: false, logo: false };

  // La familia del kit al frente y, detrás, la pila que fontconfig SÍ puede
  // resolver con las fuentes que viajan en el bundle. Antes esto terminaba en
  // `Helvetica, Arial, sans-serif` y en Vercel eso no existe: librsvg no
  // encontraba nada y pintaba una cajita por letra.
  const familia = pilaDeFuentes(
    kit?.tipografias.find((f) => f.rol === 'titulos')?.familia ??
      kit?.tipografias[0]?.familia ??
      null,
  );

  const titular = (textos.titular ?? '').trim();
  const cta = (textos.cta ?? '').trim();

  // 2. El bloque de texto: abajo, dentro de la zona segura.
  if (titular || cta) {
    const tamTitular = Math.round(W * 0.064);
    const tamCta = Math.round(W * 0.027);
    const renglones = titular ? partirEnRenglones(titular, anchoUtil, tamTitular) : [];
    const altoTitular = renglones.length * Math.round(tamTitular * 1.22);
    const altoCta = cta ? Math.round(tamCta * 2.6) : 0;
    const altoBloque = altoTitular + (altoTitular && altoCta ? Math.round(tamCta * 0.9) : 0) + altoCta;

    // El piso del margen de abajo es 8 %, no 6 %.
    //
    // Se miró la pieza a tamaño real: con 6 % el botón quedaba a unos 60 px del
    // borde en un lienzo de 1350, y en el muro de Instagram eso se lee como un
    // botón "colgando". Los formatos con zona segura declarada (historias,
    // reels) usan la suya, que es mucho mayor.
    const abajo = Math.max(z.abajo, Math.round(H * 0.08));
    const top = Math.max(z.arriba + 8, H - abajo - altoBloque - Math.round(H * 0.02));

    const franja = {
      left: margen,
      top: Math.max(0, top - Math.round(tamTitular * 0.4)),
      width: Math.min(anchoUtil, W - margen),
      height: Math.min(altoBloque + Math.round(tamTitular * 0.8), H - top),
    };
    const brillo = await brilloDe(sharp(lienzo), franja);
    const claro = brillo > 140;
    const colorTexto = claro ? '#0B0B0F' : '#FFFFFF';
    const colorVelo = claro ? '255,255,255' : '0,0,0';

    const primario = colorDe(kit, 'primario') ?? '#0B5FFF';
    const textoCta = claro ? '#FFFFFF' : '#0B0B0F';

    let y = top + tamTitular;
    const lineas = renglones
      .map((r) => {
        const el = `<text x="${margen}" y="${y}" font-family="${escapar(familia)}" font-size="${tamTitular}" font-weight="700" fill="${colorTexto}">${escapar(r)}</text>`;
        y += Math.round(tamTitular * 1.22);
        return el;
      })
      .join('');

    let botones = '';
    if (cta) {
      const anchoBoton = Math.min(anchoUtil, Math.round(cta.length * tamCta * 0.58) + tamCta * 1.7);
      const altoBoton = Math.round(tamCta * 2);
      const yBoton = y + Math.round(tamCta * 0.4);
      botones =
        `<rect x="${margen}" y="${yBoton}" rx="${Math.round(altoBoton / 2)}" width="${anchoBoton}" height="${altoBoton}" fill="${primario}"/>` +
        `<text x="${margen + anchoBoton / 2}" y="${yBoton + altoBoton / 2 + tamCta * 0.36}" text-anchor="middle" font-family="${escapar(familia)}" font-size="${tamCta}" font-weight="600" fill="${textoCta}">${escapar(cta)}</text>`;
      puso.cta = true;
    }

    // El velo es un degradado, no un rectángulo: un bloque opaco recorta la
    // foto en dos y se ve pegado. Con degradado la foto sigue respirando y el
    // texto se lee igual.
    const veloTop = Math.max(0, franja.top - Math.round(H * 0.04));
    const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="velo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(${colorVelo},0)"/>
      <stop offset="45%" stop-color="rgba(${colorVelo},0.55)"/>
      <stop offset="100%" stop-color="rgba(${colorVelo},0.82)"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${veloTop}" width="${W}" height="${H - veloTop}" fill="url(#velo)"/>
  ${lineas}
  ${botones}
</svg>`;
    capas.push({ input: Buffer.from(svg), top: 0, left: 0 });
    if (renglones.length) puso.titular = true;
  }

  // 3. El logo: arriba a la izquierda, dentro de la zona segura.
  if (kit?.logoUrl) {
    const bytes = await bajarImagen(kit.logoUrl);
    if (bytes) {
      try {
        const anchoLogo = Math.round(W * 0.12);
        const logo = await sharp(bytes)
          .resize({ width: anchoLogo, height: Math.round(H * 0.12), fit: 'inside', withoutEnlargement: true })
          .png()
          .toBuffer();
        const meta = await sharp(logo).metadata();
        capas.push({
          input: logo,
          left: margen,
          top: Math.max(z.arriba + Math.round(H * 0.01), Math.round(H * 0.04)),
        });
        puso.logo = true;
        void meta;
      } catch {
        // Un logo que sharp no sabe leer (un SVG raro, un archivo a medias) no
        // tira la pieza entera: sale sin logo y se dice en la nota.
      }
    }
  }

  const buf = capas.length
    ? await sharp(lienzo).composite(capas).png().toBuffer()
    : lienzo;

  return {
    buf,
    ancho: W,
    alto: H,
    puso,
    fuentes: { listo: fuentes.listo, familia, falta: fuentes.falta },
  };
}

/** Instagram por la API solo come JPEG. Esto lo deja en el formato de la red. */
export async function alFormatoDeLaRed(
  buf: Buffer,
  formato: FormatoSpec,
): Promise<{ buf: Buffer; ext: string }> {
  const quiereJpg = formato.archivos.includes('jpg') && !formato.archivos.includes('png');
  if (!quiereJpg) return { buf, ext: 'png' };

  // Se baja la calidad hasta entrar en el tope de peso de la red. Sin esto, un
  // JPEG de 12 MB rebota en Instagram con un error que nadie entiende.
  const topeBytes = (formato.pesoMaxMb ?? 8) * 1024 * 1024;
  for (const q of [92, 85, 78, 70, 60]) {
    const out = await sharp(buf).jpeg({ quality: q, mozjpeg: true }).toBuffer();
    if (out.byteLength <= topeBytes) return { buf: out, ext: 'jpg' };
  }
  return { buf: await sharp(buf).jpeg({ quality: 55, mozjpeg: true }).toBuffer(), ext: 'jpg' };
}
