/**
 * La geometría del recorrido.
 *
 * Aquí no hay red ni base de datos a propósito: esto lo usa el SERVIDOR para
 * decidir a qué cuadrante le pregunta a Google, y lo usa el NAVEGADOR para
 * dibujar ese mismo cuadrante y volar hacia él. Si cada lado calculara su
 * propia cuadrícula, el círculo que se pinta en el mapa y el círculo que se le
 * manda a Places serían dos círculos distintos — y la demo estaría enseñando
 * una cosa mientras busca en otra.
 *
 * Todo en metros y en grados decimales. Nada de librerías de geodesia: a estas
 * distancias (radios de 1 a 20 km) la Tierra plana está a centímetros de la
 * Tierra redonda, y una dependencia de 300 KB para eso no se paga sola.
 */

export interface Punto {
  lat: number;
  lng: number;
}

/**
 * Un grado de latitud son 111 320 m en cualquier parte. Un grado de longitud
 * son 111 320 m SOLO en el ecuador y se encoge con el coseno de la latitud: en
 * Tulum (20.2°) un grado de longitud mide 104 500 m, y usar el número del
 * ecuador correría la cuadrícula 6 % hacia el este. Sobre un radio de 3 km son
 * 180 m de error — una cuadra entera fuera de lugar.
 */
export const METROS_POR_GRADO_LAT = 111_320;

export function metrosPorGradoLng(lat: number): number {
  return METROS_POR_GRADO_LAT * Math.cos((lat * Math.PI) / 180);
}

/** Corre un punto tantos metros al norte y tantos al este (negativos = sur/oeste). */
export function desplazar(centro: Punto, norteM: number, esteM: number): Punto {
  const porLng = metrosPorGradoLng(centro.lat);
  return {
    lat: centro.lat + norteM / METROS_POR_GRADO_LAT,
    // Cerca de los polos el coseno tiende a cero y la división explota. No es
    // un caso hipotético para una app de prospección —Ushuaia no, pero Reikiavik
    // sí—, así que se corta en un metro por grado.
    lng: centro.lng + esteM / Math.max(porLng, 1),
  };
}

/** Distancia en metros entre dos puntos (haversine). */
export function distanciaM(a: Punto, b: Punto): number {
  const R = 6_371_000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Las cuatro esquinas de una celda, como las pide Places: `low` y `high`. */
export interface Caja {
  sur: number;
  oeste: number;
  norte: number;
  este: number;
}

export interface Cuadrante {
  /** El orden en que se recorre, empezando en 1. */
  i: number;
  fila: number;
  col: number;
  centro: Punto;
  /**
   * La celda como RECTÁNGULO. Es lo que se le manda a Places, porque su
   * `locationRestriction` de búsqueda por texto acepta rectángulo y **no**
   * acepta círculo (medido el 16-sep-2026 contra la API: con círculo devuelve
   * error, con rectángulo devolvió 12 lugares). Como las celdas embonan, la
   * zona queda cubierta exacta y sin traslape: nada se pregunta dos veces.
   */
  caja: Caja;
  /**
   * El radio del círculo que cubre la celda entera (su media diagonal).
   *
   * Sirve para dos cosas distintas y las dos importan: es lo que se dibuja y se
   * pulsa en el mapa, y es lo que se le manda a Composio cuando la búsqueda sale
   * por la cuenta de Google del cliente — porque ahí la herramienta es
   * `NEARBY_SEARCH`, que al revés que Places por texto solo entiende círculos.
   */
  radioM: number;
  /** "centro", "norte", "noreste"… para la narración. */
  nombre: string;
}

/**
 * El nombre del cuadrante en palabras, que es como lo cuenta Goossip: "ahora el
 * noreste". Un "cuadrante 7 de 9" no le dice nada a nadie que esté viendo el
 * mapa.
 */
function rumbo(fila: number, col: number, medio: number): string {
  const ns = fila < medio ? 'norte' : fila > medio ? 'sur' : '';
  const eo = col < medio ? 'oeste' : col > medio ? 'este' : '';
  if (!ns && !eo) return 'centro';
  if (!ns) return eo;
  if (!eo) return ns;
  // Los rumbos compuestos se contraen: "noreste", no "norteeste". Pegar las dos
  // palabras salía "norteoeste" y en la narración de una demo en vivo eso se oye
  // a máquina, que es justo lo que no puede sonar.
  const raiz = ns === 'norte' ? 'nor' : 'sur';
  return `${raiz}${eo}`;
}

/**
 * El orden del recorrido: **espiral desde el centro hacia afuera.**
 *
 * En serpentina (izquierda-derecha, bajar, derecha-izquierda) la cámara empieza
 * en una esquina y el primer resultado cae lejos de donde el usuario escribió
 * "Tulum". En espiral el primer cuadrante es justo el centro de lo que pidió:
 * los primeros negocios que caen son los del corazón de la zona, que son los
 * que a él le importan, y la cámara se va abriendo sin saltos largos.
 */
export function ordenEspiral(lado: number): Array<{ fila: number; col: number }> {
  const salida: Array<{ fila: number; col: number }> = [];
  if (lado < 1) return salida;
  const arranque = Math.floor((lado - 1) / 2);
  let fila = arranque;
  let col = arranque;
  const dentro = (f: number, c: number) => f >= 0 && f < lado && c >= 0 && c < lado;
  if (dentro(fila, col)) salida.push({ fila, col });

  const rumbos = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ];
  let dir = 0;
  let paso = 1;
  // El tope del `while` no es decorativo: sin él, una cuadrícula que por lo que
  // sea no se llene deja el servidor girando para siempre dentro de una ruta
  // con `maxDuration`.
  const topeVueltas = lado * 2 + 4;
  while (salida.length < lado * lado && paso <= topeVueltas) {
    for (let vez = 0; vez < 2; vez += 1) {
      for (let s = 0; s < paso; s += 1) {
        fila += rumbos[dir]![0]!;
        col += rumbos[dir]![1]!;
        if (dentro(fila, col)) salida.push({ fila, col });
      }
      dir = (dir + 1) % 4;
    }
    paso += 1;
  }
  return salida;
}

/** El radio más grande que acepta Places por llamada. */
export const RADIO_MAXIMO_M = 50_000;

/**
 * Parte el radio pedido en una cuadrícula de `lado × lado` y devuelve los
 * cuadrantes en el orden en que se van a recorrer.
 *
 * El radio de cada cuadrante es la **media diagonal** de su celda
 * (`celda · √2 / 2`), no la media celda. Con la media celda los círculos se
 * tocan por los lados y dejan cuatro esquinas sin cubrir en cada celda: los
 * negocios de esas esquinas existen, están dentro de la zona que el usuario
 * pidió, y no saldrían nunca. Con la media diagonal los círculos se traslapan
 * —se pregunta de más, y ese de más lo cobra Google— pero la zona queda cubierta
 * completa. Se paga el traslape a propósito: un resultado que falta se ve igual
 * que un negocio que no existe.
 */
export function cuadrantes(centro: Punto, radioM: number, lado = 3): Cuadrante[] {
  const n = Math.max(1, Math.floor(lado));
  const radio = Math.min(Math.max(radioM, 100), RADIO_MAXIMO_M);
  const celdaM = (2 * radio) / n;
  const radioCuadrante = Math.min(celdaM * Math.SQRT1_2, RADIO_MAXIMO_M);
  const medio = (n - 1) / 2;

  return ordenEspiral(n).map((celda, idx) => {
    const centroCelda = desplazar(
      centro,
      (medio - celda.fila) * celdaM,
      (celda.col - medio) * celdaM,
    );
    const esquinaSO = desplazar(centroCelda, -celdaM / 2, -celdaM / 2);
    const esquinaNE = desplazar(centroCelda, celdaM / 2, celdaM / 2);
    return {
      i: idx + 1,
      fila: celda.fila,
      col: celda.col,
      centro: centroCelda,
      caja: {
        sur: esquinaSO.lat,
        oeste: esquinaSO.lng,
        norte: esquinaNE.lat,
        este: esquinaNE.lng,
      },
      radioM: Math.round(radioCuadrante),
      nombre: rumbo(celda.fila, celda.col, medio),
    };
  });
}

/** ¿Este punto cae dentro de la celda de alguno? Es la prueba de cobertura. */
export function cubiertoPor(cuadris: Cuadrante[], p: Punto): boolean {
  return cuadris.some(
    (c) =>
      p.lat >= c.caja.sur && p.lat <= c.caja.norte && p.lng >= c.caja.oeste && p.lng <= c.caja.este,
  );
}

/** La caja que envuelve a todos los cuadrantes: el encuadre del mapa al terminar. */
export function cajaDeTodos(cuadris: Cuadrante[]): Caja | null {
  if (cuadris.length === 0) return null;
  return cuadris.reduce<Caja>(
    (acc, c) => ({
      sur: Math.min(acc.sur, c.caja.sur),
      oeste: Math.min(acc.oeste, c.caja.oeste),
      norte: Math.max(acc.norte, c.caja.norte),
      este: Math.max(acc.este, c.caja.este),
    }),
    { ...cuadris[0]!.caja },
  );
}

/**
 * El zoom con el que un círculo de `radioM` llena la pantalla.
 *
 * Es la fórmula de Mercator: a zoom 0 un pixel mide 156 543 m en el ecuador y
 * se parte a la mitad en cada nivel. Lo mismo sirve para Google y para
 * MapLibre porque los dos usan la misma malla de teselas de 256 px.
 */
export function zoomParaRadio(radioM: number, lat: number, anchoPx = 900): number {
  const metrosQueDebenCaber = Math.max(radioM, 50) * 2.4;
  const mpp = metrosQueDebenCaber / Math.max(anchoPx, 320);
  const z = Math.log2((156_543.03392 * Math.cos((lat * Math.PI) / 180)) / mpp);
  return Math.min(Math.max(z, 2), 19);
}

/** El polígono del círculo, para dibujarlo. 64 lados se ve redondo y pesa nada. */
export function circuloComoPoligono(centro: Punto, radioM: number, lados = 64): Punto[] {
  const puntos: Punto[] = [];
  for (let i = 0; i <= lados; i += 1) {
    const a = (i / lados) * 2 * Math.PI;
    puntos.push(desplazar(centro, Math.cos(a) * radioM, Math.sin(a) * radioM));
  }
  return puntos;
}
