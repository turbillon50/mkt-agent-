/**
 * El mapa, detrás de una sola puerta.
 *
 * La Sala no sabe —ni tiene por qué saber— si abajo está el SDK de Google o
 * MapLibre con teselas de OpenStreetMap. Pide *vuela a este cuadrante*, *pulsa
 * aquí*, *cae un marcador ahí*, y el motor que esté puesto lo hace. Eso es lo
 * que permite que el recorrido animado se vea igual con llave y sin llave, que
 * es el encargo.
 *
 * **Cuál se usa y por qué.** Si existe `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` se usa
 * Google, porque es literalmente lo que pidió Luis ("que se vea Google Maps").
 * Si no existe —y hoy no existe: medido con `vercel env ls` el 16-sep-2026, el
 * proyecto no tiene esa variable en ningún entorno— se usa MapLibre con teselas
 * de OpenStreetMap, que son libres y no piden llave.
 *
 * Ojo con la diferencia que sí importa y que no se ve en la pantalla: la llave
 * del render (`NEXT_PUBLIC_…`) viaja al navegador y cualquiera la lee; la del
 * servidor (`GOOGLE_MAPS_API_KEY`, la que paga las búsquedas) nunca sale de
 * Node. Son dos llaves distintas con dos restricciones distintas —la pública se
 * amarra por dominio referente, la privada por IP— y confundirlas es publicar
 * la que cobra.
 *
 * El módulo se carga con `import()` desde la Sala: son ~250 KB de MapLibre que
 * no tienen por qué pesar en el resto de la app.
 */
/*
 * El CSS de MapLibre se importa aquí y no en la Sala: este módulo entero entra
 * por `import()`, así que su hoja de estilo viaja en el mismo trozo y no pesa
 * en ninguna otra pantalla. Sin él el lienzo del mapa no queda posicionado y
 * las teselas salen apiladas una debajo de la otra.
 */
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  circuloComoPoligono,
  zoomParaRadio,
  type Caja,
  type Cuadrante,
  type Punto,
} from '@/src/prospeccion/geo';

export interface MarcadorEntrada {
  id: string;
  punto: Punto;
  titulo: string;
  /** Tiñe el marcador: el que no tiene sitio web es el que se quiere ver. */
  tono: 'nuevo' | 'oportunidad' | 'convertido' | 'apagado';
}

export interface Motor {
  nombre: 'google' | 'maplibre';
  /** Cómo se llama lo que se está viendo, para decirlo en la pantalla. */
  fuente: string;
  volarA(centro: Punto, radioM: number, ms: number): Promise<void>;
  encuadrar(caja: Caja, ms: number): void;
  /** Dibuja la celda del cuadrante y deja el pulso. Devuelve cómo borrarlo. */
  pulsar(cuadrante: Cuadrante): () => void;
  marcar(m: MarcadorEntrada): void;
  quitarMarcador(id: string): void;
  destacar(id: string | null): void;
  /** El mapa mide mal si nació escondido o si cambió la caja de alrededor. */
  remedir(): void;
  destruir(): void;
}

export function llaveDelNavegador(): string | null {
  const raw = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '').trim();
  // Vercel devuelve el literal `[SENSITIVE]` para las variables marcadas como
  // sensibles, y `'[SENSITIVE]'.length > 0` es `true`: sin este corte el mapa
  // intentaría cargar el SDK con esa cadena y se quedaría en gris para siempre.
  if (!raw || raw.startsWith('[') || raw.startsWith('<')) return null;
  return raw;
}

const TONOS: Record<MarcadorEntrada['tono'], string> = {
  nuevo: '#2563eb',
  oportunidad: '#f59e0b',
  convertido: '#16a34a',
  apagado: '#94a3b8',
};

/**
 * Espera a que la caja tenga tamaño de verdad antes de meterle un mapa.
 *
 * Esto NO es una precaución teórica: medido en WebKit el 16-sep-2026, cuando el
 * efecto de React corre, el contenedor de la Sala reporta **1438 × 0**. El ancho
 * ya está resuelto y el alto todavía no, porque cuelga de un `flex-1` cuya
 * cadena de padres se termina de acomodar un cuadro después. MapLibre toma esa
 * medida UNA vez al nacer, se queda con altura cero y a partir de ahí no dibuja
 * nada aunque las teselas lleguen —y llegaban, catorce con HTTP 200 sobre un
 * mapa en blanco, que es el peor síntoma posible: todo "funciona" y no se ve.
 *
 * Se espera por cuadros y no con un `setTimeout(300)` porque el número que
 * funciona en este servidor no es el que funciona en la laptop de nadie.
 */
async function esperarCaja(el: HTMLElement, msMaximo = 5000): Promise<void> {
  const t0 = Date.now();
  while (el.clientWidth < 40 || el.clientHeight < 40) {
    if (Date.now() - t0 > msMaximo) return;
    await new Promise((sigue) => requestAnimationFrame(() => sigue(null)));
  }
}

/**
 * Y después de nacer, que se entere de los cambios.
 *
 * Entrar a modo Presentación, plegar el menú o girar el teléfono cambian la
 * caja de abajo. Sin esto el mapa se queda pintando en el tamaño viejo:
 * teselas cortadas y marcadores corridos de su calle.
 */
function vigilarCaja(el: HTMLElement, alCambiar: () => void): () => void {
  if (typeof ResizeObserver === 'undefined') return () => undefined;
  let pedido = 0;
  const observador = new ResizeObserver(() => {
    cancelAnimationFrame(pedido);
    pedido = requestAnimationFrame(alCambiar);
  });
  observador.observe(el);
  return () => {
    cancelAnimationFrame(pedido);
    observador.disconnect();
  };
}

function elementoMarcador(m: MarcadorEntrada): HTMLElement {
  const el = document.createElement('div');
  el.className = 'goossip-pin';
  el.dataset.id = m.id;
  el.title = m.titulo;
  el.style.setProperty('--pin', TONOS[m.tono]);
  el.innerHTML = '<span class="goossip-pin-punto"></span>';
  return el;
}

// ---------------------------------------------------------------------------
// MapLibre + OpenStreetMap
// ---------------------------------------------------------------------------

async function motorMapLibre(el: HTMLElement, centro: Punto, radioM: number): Promise<Motor> {
  const maplibregl = (await import('maplibre-gl')).default;
  await esperarCaja(el);

  const mapa = new maplibregl.Map({
    container: el,
    style: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          // La atribución no es opcional: es la condición de la licencia con la
          // que OpenStreetMap regala las teselas.
          attribution: '© OpenStreetMap',
        },
      },
      layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
    },
    center: [centro.lng, centro.lat],
    zoom: zoomParaRadio(radioM, centro.lat, el.clientWidth || 900),
    attributionControl: { compact: true },
  });
  mapa.dragRotate.disable();
  mapa.touchZoomRotate.disableRotation();

  await new Promise<void>((listo) => {
    if (mapa.loaded()) listo();
    else mapa.once('load', () => listo());
  });

  const marcadores = new Map<string, any>();
  let contador = 0;
  const dejarDeVigilar = vigilarCaja(el, () => mapa.resize());

  return {
    nombre: 'maplibre',
    fuente: 'OpenStreetMap',
    volarA(destino, radio, ms) {
      return new Promise<void>((listo) => {
        const terminar = () => listo();
        mapa.once('moveend', terminar);
        mapa.flyTo({
          center: [destino.lng, destino.lat],
          zoom: zoomParaRadio(radio, destino.lat, el.clientWidth || 900),
          duration: ms,
          essential: true,
        });
        // Si el navegador tiene las animaciones apagadas (`prefers-reduced-
        // motion`), MapLibre salta y `moveend` puede llegar antes de que este
        // `once` quede puesto. El reloj es el seguro para que el recorrido no
        // se quede esperando un evento que ya pasó.
        setTimeout(terminar, ms + 400);
      });
    },
    encuadrar(caja, ms) {
      mapa.fitBounds(
        [
          [caja.oeste, caja.sur],
          [caja.este, caja.norte],
        ],
        { padding: 64, duration: ms },
      );
    },
    pulsar(cuadrante) {
      const id = `celda-${cuadrante.i}-${(contador += 1)}`;
      mapa.addSource(id, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [cuadrante.caja.oeste, cuadrante.caja.sur],
                [cuadrante.caja.este, cuadrante.caja.sur],
                [cuadrante.caja.este, cuadrante.caja.norte],
                [cuadrante.caja.oeste, cuadrante.caja.norte],
                [cuadrante.caja.oeste, cuadrante.caja.sur],
              ],
            ],
          },
        },
      });
      /*
       * El relleno al 18 % y el borde de 3 px no son gusto: sobre las teselas
       * de OSM —que ya traen su propia paleta de verdes, rosas y beiges— un
       * azul al 12 % con línea de 2 px sencillamente no se distinguía en la
       * captura a 1440. Si el cuadrante no se ve, el recorrido no se ve, y el
       * recorrido es lo que se está enseñando.
       */
      mapa.addLayer({
        id: `${id}-relleno`,
        type: 'fill',
        source: id,
        paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.18 },
      });
      mapa.addLayer({
        id: `${id}-borde`,
        type: 'line',
        source: id,
        paint: { 'line-color': '#1d4ed8', 'line-width': 3, 'line-dasharray': [3, 2] },
      });

      const pulso = document.createElement('div');
      pulso.className = 'goossip-pulso';
      pulso.innerHTML = '<span class="goossip-anillo"></span>';
      const marca = new maplibregl.Marker({ element: pulso })
        .setLngLat([cuadrante.centro.lng, cuadrante.centro.lat])
        .addTo(mapa);

      return () => {
        marca.remove();
        for (const capa of [`${id}-relleno`, `${id}-borde`]) {
          if (mapa.getLayer(capa)) mapa.removeLayer(capa);
        }
        if (mapa.getSource(id)) mapa.removeSource(id);
      };
    },
    marcar(m) {
      if (marcadores.has(m.id)) return;
      const marca = new maplibregl.Marker({ element: elementoMarcador(m) })
        .setLngLat([m.punto.lng, m.punto.lat])
        .addTo(mapa);
      marcadores.set(m.id, marca);
    },
    quitarMarcador(id) {
      marcadores.get(id)?.remove();
      marcadores.delete(id);
    },
    destacar(id) {
      for (const [k, marca] of marcadores) {
        (marca.getElement() as HTMLElement).classList.toggle('es-destacado', k === id);
      }
    },
    remedir() {
      mapa.resize();
    },
    destruir() {
      dejarDeVigilar();
      for (const marca of marcadores.values()) marca.remove();
      marcadores.clear();
      mapa.remove();
    },
  };
}

// ---------------------------------------------------------------------------
// Google Maps JS
// ---------------------------------------------------------------------------

let cargandoGoogle: Promise<void> | null = null;

function cargarGoogle(llave: string): Promise<void> {
  if ((window as any).google?.maps) return Promise.resolve();
  // Una sola etiqueta `<script>` por pestaña: dos cargas del SDK de Google en
  // la misma página se pisan y la segunda tira "You have included the Google
  // Maps JavaScript API multiple times".
  if (cargandoGoogle) return cargandoGoogle;
  cargandoGoogle = new Promise<void>((listo, falla) => {
    const s = document.createElement('script');
    const url = new URL('https://maps.googleapis.com/maps/api/js');
    url.searchParams.set('key', llave);
    url.searchParams.set('v', 'weekly');
    url.searchParams.set('language', 'es');
    s.src = url.toString();
    s.async = true;
    s.onload = () => listo();
    s.onerror = () => falla(new Error('No cargó el SDK de Google Maps.'));
    document.head.appendChild(s);
  });
  return cargandoGoogle;
}

async function motorGoogle(
  el: HTMLElement,
  centro: Punto,
  radioM: number,
  llave: string,
): Promise<Motor> {
  await cargarGoogle(llave);
  // Google mide la caja igual de temprano que MapLibre y se queda igual de
  // ciego si mide cero. Misma espera, mismo motivo.
  await esperarCaja(el);
  const g = (window as any).google;
  const mapa = new g.maps.Map(el, {
    center: { lat: centro.lat, lng: centro.lng },
    zoom: Math.round(zoomParaRadio(radioM, centro.lat, el.clientWidth || 900)),
    disableDefaultUI: true,
    zoomControl: true,
    clickableIcons: false,
  });

  const marcadores = new Map<string, any>();
  const capas: any[] = [];
  const dejarDeVigilar = vigilarCaja(el, () => g.maps.event.trigger(mapa, 'resize'));

  return {
    nombre: 'google',
    fuente: 'Google Maps',
    volarA(destino, radio, ms) {
      return new Promise<void>((listo) => {
        mapa.panTo({ lat: destino.lat, lng: destino.lng });
        mapa.setZoom(Math.round(zoomParaRadio(radio, destino.lat, el.clientWidth || 900)));
        // `panTo` de Google no avisa cuándo terminó de moverse; su `idle` llega
        // también por un arrastre del usuario. El reloj es más honesto que
        // colgarse de un evento que significa otra cosa.
        setTimeout(listo, ms);
      });
    },
    encuadrar(caja) {
      mapa.fitBounds(
        new g.maps.LatLngBounds(
          { lat: caja.sur, lng: caja.oeste },
          { lat: caja.norte, lng: caja.este },
        ),
        64,
      );
    },
    pulsar(cuadrante) {
      const celda = new g.maps.Rectangle({
        bounds: new g.maps.LatLngBounds(
          { lat: cuadrante.caja.sur, lng: cuadrante.caja.oeste },
          { lat: cuadrante.caja.norte, lng: cuadrante.caja.este },
        ),
        strokeColor: '#2563eb',
        strokeWeight: 2,
        fillColor: '#2563eb',
        fillOpacity: 0.12,
        clickable: false,
        map: mapa,
      });
      const anillo = new g.maps.Polygon({
        paths: circuloComoPoligono(cuadrante.centro, cuadrante.radioM * 0.45).map((p) => ({
          lat: p.lat,
          lng: p.lng,
        })),
        strokeColor: '#2563eb',
        strokeOpacity: 0.7,
        strokeWeight: 2,
        fillOpacity: 0,
        clickable: false,
        map: mapa,
      });
      capas.push(celda, anillo);
      return () => {
        celda.setMap(null);
        anillo.setMap(null);
      };
    },
    marcar(m) {
      if (marcadores.has(m.id)) return;
      marcadores.set(
        m.id,
        new g.maps.Marker({
          position: { lat: m.punto.lat, lng: m.punto.lng },
          map: mapa,
          title: m.titulo,
          animation: g.maps.Animation.DROP,
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: TONOS[m.tono],
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        }),
      );
    },
    quitarMarcador(id) {
      marcadores.get(id)?.setMap(null);
      marcadores.delete(id);
    },
    destacar(id) {
      for (const [k, marca] of marcadores) {
        marca.setZIndex(k === id ? 999 : 1);
      }
    },
    remedir() {
      g.maps.event.trigger(mapa, 'resize');
    },
    destruir() {
      dejarDeVigilar();
      for (const marca of marcadores.values()) marca.setMap(null);
      for (const capa of capas) capa.setMap(null);
      marcadores.clear();
      el.innerHTML = '';
    },
  };
}

// ---------------------------------------------------------------------------

/**
 * Levanta el mapa que se pueda. Si Google está configurado pero se cae al
 * cargar —llave mal restringida, cuota, la red del hotel donde se da la
 * demo— se cae a MapLibre en vez de dejar un rectángulo gris: el recorrido es
 * lo que se está enseñando, y el recorrido no depende del proveedor de teselas.
 */
export async function crearMotor(
  el: HTMLElement,
  centro: Punto,
  radioM: number,
): Promise<Motor> {
  const llave = llaveDelNavegador();
  if (llave) {
    try {
      return await motorGoogle(el, centro, radioM, llave);
    } catch {
      el.innerHTML = '';
    }
  }
  return motorMapLibre(el, centro, radioM);
}
