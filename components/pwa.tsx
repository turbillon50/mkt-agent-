'use client';

import { useEffect } from 'react';

/**
 * Registra el service worker para que la app funcione offline / cacheada,
 * pero SIN ningún CTA de instalar/descargar. Goossip se usa como web normal.
 * (Se quitaron el botón "Instalar" y el banner de iOS por decisión de producto.)
 */
export function PWABoot() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);

  return null;
}
