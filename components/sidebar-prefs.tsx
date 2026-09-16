'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Ancho y plegado del menú lateral, guardados por usuario.
 *
 * Dos decisiones que importan y no se ven:
 *
 * 1. El ancho NO vive en el estado de React: vive en una variable CSS del
 *    `<html>`. Arrastrar el borde mueve la variable directo, sin volver a
 *    renderizar el árbol sesenta veces por segundo. React solo se entera al
 *    soltar, para guardar.
 *
 * 2. El plegado tampoco lo pinta React: lo pinta CSS mirando
 *    `html[data-sidebar]`. Así el menú nace plegado en el primer frame —
 *    `SIDEBAR_BOOT` corre antes de que pinte el navegador — y no hay ese
 *    parpadeo de "se abre y se cierra" al cargar cada página. De paso evita el
 *    error de hidratación clásico: leer localStorage durante el render haría
 *    que el HTML del servidor y el del cliente no coincidan.
 */

export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 320;
export const SIDEBAR_DEFAULT = 264;
/** Plegado: solo íconos. */
export const SIDEBAR_COLLAPSED = 64;

const KEY_WIDTH = 'goossip.sidebar.width';
const KEY_COLLAPSED = 'goossip.sidebar.collapsed';

export function clampWidth(value: number): number {
  if (!Number.isFinite(value)) return SIDEBAR_DEFAULT;
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(value)));
}

/**
 * Se inyecta como `<script>` que BLOQUEA en el layout del panel. Es feo y es a
 * propósito: cualquier otra forma (efecto, provider, cookie leída en el
 * servidor) pinta primero el menú de 264 px y luego lo corrige, y ese salto se
 * ve en cada navegación.
 *
 * Abajo de 1024 px no hace nada: el menú de celular es el cajón de siempre y
 * esta corrida no lo toca.
 */
export const SIDEBAR_BOOT = `(function(){try{
var d=document.documentElement;
var w=parseInt(localStorage.getItem('${KEY_WIDTH}')||'',10);
if(!w||w<${SIDEBAR_MIN}||w>${SIDEBAR_MAX})w=${SIDEBAR_DEFAULT};
var c=localStorage.getItem('${KEY_COLLAPSED}')==='1';
d.style.setProperty('--sidebar-w-open',w+'px');
d.style.setProperty('--sidebar-w',(c?${SIDEBAR_COLLAPSED}:w)+'px');
d.dataset.sidebar=c?'plegado':'abierto';
}catch(e){}})();`;

function applyWidth(width: number, collapsed: boolean): void {
  const d = document.documentElement;
  d.style.setProperty('--sidebar-w-open', `${width}px`);
  d.style.setProperty('--sidebar-w', `${collapsed ? SIDEBAR_COLLAPSED : width}px`);
  d.dataset.sidebar = collapsed ? 'plegado' : 'abierto';
}

export interface SidebarPrefs {
  width: number;
  collapsed: boolean;
  toggle: () => void;
  /** Se le cuelga al tirador del borde derecho. */
  startDrag: (event: React.PointerEvent<HTMLElement>) => void;
  dragging: boolean;
}

export function useSidebarPrefs(): SidebarPrefs {
  // Arranca con el valor por omisión para que el HTML del servidor y el del
  // primer render del cliente sean idénticos; el `useEffect` de abajo lee lo
  // que SIDEBAR_BOOT ya dejó puesto en el DOM y pone a React al día.
  const [width, setWidth] = useState(SIDEBAR_DEFAULT);
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const anchoAlArrastrar = useRef(SIDEBAR_DEFAULT);

  useEffect(() => {
    const d = document.documentElement;
    const abierto = parseInt(d.style.getPropertyValue('--sidebar-w-open'), 10);
    if (Number.isFinite(abierto)) setWidth(clampWidth(abierto));
    setCollapsed(d.dataset.sidebar === 'plegado');
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((previo) => {
      const siguiente = !previo;
      applyWidth(width, siguiente);
      try {
        localStorage.setItem(KEY_COLLAPSED, siguiente ? '1' : '0');
      } catch {
        // Modo incógnito con almacenamiento bloqueado: el menú sigue plegándose,
        // nada más no se acuerda la próxima vez. No es motivo para reventar.
      }
      return siguiente;
    });
  }, [width]);

  const startDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      // Plegado no se arrastra: son 64 px de íconos, no hay nada que ajustar.
      if (collapsed) return;
      event.preventDefault();
      const tirador = event.currentTarget;
      tirador.setPointerCapture(event.pointerId);
      setDragging(true);
      // Mientras dure el arrastre manda el cursor de redimensionar en toda la
      // ventana y nada se puede seleccionar. Sin esto, a la segunda pasada el
      // puntero agarra el texto del menú y lo arrastra como si fuera un enlace.
      document.documentElement.dataset.sidebarDrag = 'si';
      anchoAlArrastrar.current = width;

      const mover = (e: PointerEvent) => {
        // El menú empieza en el borde izquierdo de la ventana, así que el ancho
        // ES la x del puntero. Sin `clientX - left` que se desfasa si la página
        // tiene scroll horizontal.
        const nuevo = clampWidth(e.clientX);
        anchoAlArrastrar.current = nuevo;
        applyWidth(nuevo, false);
      };
      const soltar = () => {
        tirador.releasePointerCapture?.(event.pointerId);
        tirador.removeEventListener('pointermove', mover);
        tirador.removeEventListener('pointerup', soltar);
        tirador.removeEventListener('pointercancel', soltar);
        delete document.documentElement.dataset.sidebarDrag;
        setDragging(false);
        setWidth(anchoAlArrastrar.current);
        try {
          localStorage.setItem(KEY_WIDTH, String(anchoAlArrastrar.current));
        } catch {
          // Ver arriba.
        }
      };

      tirador.addEventListener('pointermove', mover);
      tirador.addEventListener('pointerup', soltar);
      tirador.addEventListener('pointercancel', soltar);
    },
    [collapsed, width],
  );

  return { width, collapsed, toggle, startDrag, dragging };
}
