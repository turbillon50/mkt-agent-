'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Ancho y plegado del panel de Goossip.
 *
 * Es el mismo patrón del menú lateral de la corrida 4 y por las mismas dos
 * razones, que aquí pesan más porque el panel es lo primero que se ve:
 *
 *  1. El ancho vive en una variable CSS del `<html>`, no en el estado de React.
 *     Arrastrar el borde mueve la variable directo; React solo se entera al
 *     soltar, para guardar. Sesenta renders por segundo de un panel con un
 *     hilo de conversación dentro se sienten.
 *  2. El plegado lo pinta CSS mirando `html[data-asistente]`. Con un efecto de
 *     React, cada navegación pintaría el panel de 360 px abierto y luego lo
 *     cerraría de un salto.
 *
 * Y una tercera que el menú no tenía: el valor de arranque puede venir del
 * SERVIDOR. `localStorage` no existe en la primera visita desde otra máquina, y
 * ahí es donde entra lo que quedó guardado en `users.settings`. El script de
 * arranque prefiere `localStorage` —es lo más nuevo, lo escribió este
 * navegador hace un momento— y cae al valor del servidor si no hay nada.
 */

export const PANEL_MIN = 250;
export const PANEL_MAX = 480;
export const PANEL_DEFAULT = 360;
export const PANEL_PLEGADO = 48;
/**
 * Abajo de esto no hay tres columnas: manda el cajón de celular.
 *
 * Tiene que ser EL MISMO número que `--breakpoint-panel` en `globals.css`, y
 * es 1250 y no 1280 por lo que está explicado allá: una media query mide el
 * viewport sin la barra de desplazamiento, así que una ventana de 1280 px con
 * scroll reporta 1263 y se quedaba sin tercera columna justo en el ancho que
 * el spec promete.
 */
export const ESCRITORIO = 1250;

const KEY_ANCHO = 'goossip.asistente.ancho';
const KEY_PLEGADO = 'goossip.asistente.plegado';

/**
 * Lo que el CONTENIDO necesita para no verse apretado.
 *
 * No es un número inventado: es el ancho que tiene `<main>` en una ventana de
 * 1024 px con el menú abierto (1024 − 264), que es la medida para la que están
 * hechas todas las pantallas de la app desde la corrida 3. Por debajo de eso
 * las rejillas de dos columnas empiezan a partir los títulos.
 *
 * Se vio en la captura de 1280 de la primera vuelta: con el panel en 400 px,
 * Conexiones quedaba con "Meta A…", "Facebo…" y las descripciones bajando de
 * una palabra por renglón. El spec dice que el contenido se REACOMODA, no que
 * se aplaste: reacomodarse hasta volverse ilegible es lo mismo que taparlo.
 */
export const CONTENIDO_MINIMO = 760;

/** El menú lateral también cambia de ancho: su variable es la que manda. */
function anchoDelMenu(): number {
  const v = parseInt(
    getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w'),
    10,
  );
  return Number.isFinite(v) && v > 0 ? v : 264;
}

/**
 * El panel más ancho que cabe HOY, en esta ventana y con este menú.
 *
 * `PANEL_MIN` gana siempre: si la ventana es tan angosta que ni 250 px dejan
 * sitio, el panel se queda en 250 y es el contenido el que aprieta. Un panel de
 * 80 px no es un panel, es una franja rota.
 */
export function topeDelPanel(): number {
  if (typeof window === 'undefined') return PANEL_MAX;
  const libre = window.innerWidth - anchoDelMenu() - CONTENIDO_MINIMO;
  return Math.max(PANEL_MIN, Math.min(PANEL_MAX, Math.floor(libre)));
}

export function acotarAncho(v: number, tope = PANEL_MAX): number {
  if (!Number.isFinite(v)) return Math.min(PANEL_DEFAULT, tope);
  return Math.min(tope, Math.max(PANEL_MIN, Math.round(v)));
}

/**
 * Se inyecta como `<script>` que BLOQUEA. Es feo y es a propósito: es la única
 * forma de que el panel nazca con su ancho en el primer frame.
 */
export function panelBoot(inicial: { ancho: number; plegado: boolean }): string {
  return `(function(){try{
var d=document.documentElement;
var w=parseInt(localStorage.getItem('${KEY_ANCHO}')||'',10);
if(!w||w<${PANEL_MIN}||w>${PANEL_MAX})w=${acotarAncho(inicial.ancho)};
var m=parseInt(getComputedStyle(d).getPropertyValue('--sidebar-w'),10)||264;
var tope=Math.max(${PANEL_MIN},Math.min(${PANEL_MAX},Math.floor(window.innerWidth-m-${CONTENIDO_MINIMO})));
if(w>tope)w=tope;
var g=localStorage.getItem('${KEY_PLEGADO}');
var c=g===null?${inicial.plegado ? 'true' : 'false'}:g==='1';
d.style.setProperty('--asistente-w-abierto',w+'px');
d.style.setProperty('--asistente-w',(c?${PANEL_PLEGADO}:w)+'px');
d.dataset.asistente=c?'plegado':'abierto';
}catch(e){}})();`;
}

function aplicar(ancho: number, plegado: boolean): void {
  const d = document.documentElement;
  // `--asistente-w-abierto` guarda LO QUE EL USUARIO QUIERE; `--asistente-w` es
  // lo que cabe hoy. Separarlas es lo que permite que el panel se encoja en una
  // ventana chica sin perder la preferencia.
  d.style.setProperty('--asistente-w-abierto', `${ancho}px`);
  const efectivo = Math.min(ancho, topeDelPanel());
  d.style.setProperty('--asistente-w', `${plegado ? PANEL_PLEGADO : efectivo}px`);
  d.dataset.asistente = plegado ? 'plegado' : 'abierto';
}

/** Se guarda en el servidor con retraso: arrastrar dispara cien cambios. */
function guardarEnElServidor(parche: { ancho?: number; plegado?: boolean }): void {
  void fetch('/api/me/panel', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parche),
  }).catch(() => undefined);
}

export interface PanelPrefs {
  ancho: number;
  plegado: boolean;
  plegar: () => void;
  desplegar: () => void;
  alternar: () => void;
  /** Se le cuelga al tirador del borde IZQUIERDO del panel. */
  empezarArrastre: (event: React.PointerEvent<HTMLElement>) => void;
  arrastrando: boolean;
}

export function usePanelPrefs(): PanelPrefs {
  // Arranca con el valor por omisión para que el HTML del servidor y el primer
  // render del cliente sean idénticos; el efecto de abajo lee lo que el script
  // de arranque ya dejó puesto en el DOM.
  const [ancho, setAncho] = useState(PANEL_DEFAULT);
  const [plegado, setPlegado] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const anchoAlArrastrar = useRef(PANEL_DEFAULT);

  useEffect(() => {
    const d = document.documentElement;
    const abierto = parseInt(d.style.getPropertyValue('--asistente-w-abierto'), 10);
    if (Number.isFinite(abierto)) {
      setAncho(acotarAncho(abierto));
      anchoAlArrastrar.current = acotarAncho(abierto);
    }
    setPlegado(d.dataset.asistente === 'plegado');
  }, []);

  /*
   * Al achicar la ventana, el que cede es el PANEL, no el contenido. Y lo que
   * cede NO se guarda: si alguien trabaja un rato en una ventana chica y luego
   * la maximiza, su panel vuelve a los 400 px que él eligió. Guardar el ancho
   * apretado le borraría su preferencia sin que él tocara nada.
   */
  useEffect(() => {
    const alCambiar = () => {
      const tope = topeDelPanel();
      const d = document.documentElement;
      const guardado = parseInt(d.style.getPropertyValue('--asistente-w-abierto'), 10);
      const deseado = Number.isFinite(guardado) ? guardado : ancho;
      const efectivo = Math.min(deseado, tope);
      if (d.dataset.asistente !== 'plegado') {
        d.style.setProperty('--asistente-w', `${efectivo}px`);
      }
    };
    window.addEventListener('resize', alCambiar);
    alCambiar();
    return () => window.removeEventListener('resize', alCambiar);
  }, [ancho]);

  const ponerPlegado = useCallback(
    (siguiente: boolean) => {
      setPlegado(siguiente);
      aplicar(ancho, siguiente);
      try {
        localStorage.setItem(KEY_PLEGADO, siguiente ? '1' : '0');
      } catch {
        // Incógnito con almacenamiento bloqueado: el panel se sigue plegando,
        // nada más no se acuerda. No es motivo para reventar.
      }
      guardarEnElServidor({ plegado: siguiente });
    },
    [ancho],
  );

  const plegar = useCallback(() => ponerPlegado(true), [ponerPlegado]);
  const desplegar = useCallback(() => ponerPlegado(false), [ponerPlegado]);
  const alternar = useCallback(() => ponerPlegado(!plegado), [plegado, ponerPlegado]);

  const empezarArrastre = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      // Plegado no se arrastra: son 48 px de ícono, no hay nada que ajustar.
      if (plegado) return;
      event.preventDefault();
      const tirador = event.currentTarget;
      tirador.setPointerCapture(event.pointerId);
      setArrastrando(true);
      document.documentElement.dataset.asistenteDrag = 'si';
      anchoAlArrastrar.current = ancho;

      const mover = (e: PointerEvent) => {
        // El panel termina en el borde DERECHO de la ventana, así que su ancho
        // es lo que hay del puntero al borde. Es la resta que el menú lateral
        // no necesita porque él empieza en el borde izquierdo.
        const nuevo = acotarAncho(window.innerWidth - e.clientX, topeDelPanel());
        anchoAlArrastrar.current = nuevo;
        aplicar(nuevo, false);
      };
      const soltar = () => {
        tirador.releasePointerCapture?.(event.pointerId);
        tirador.removeEventListener('pointermove', mover);
        tirador.removeEventListener('pointerup', soltar);
        tirador.removeEventListener('pointercancel', soltar);
        delete document.documentElement.dataset.asistenteDrag;
        setArrastrando(false);
        setAncho(anchoAlArrastrar.current);
        try {
          localStorage.setItem(KEY_ANCHO, String(anchoAlArrastrar.current));
        } catch {
          // Ver arriba.
        }
        guardarEnElServidor({ ancho: anchoAlArrastrar.current });
      };

      tirador.addEventListener('pointermove', mover);
      tirador.addEventListener('pointerup', soltar);
      tirador.addEventListener('pointercancel', soltar);
    },
    [ancho, plegado],
  );

  return { ancho, plegado, plegar, desplegar, alternar, empezarArrastre, arrastrando };
}

/** ¿Estamos en la vista de tres columnas? Se pregunta al DOM, no a React. */
export function enEscritorio(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(`(min-width: ${ESCRITORIO}px)`).matches;
}
