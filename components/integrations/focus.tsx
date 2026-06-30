'use client';

import * as React from 'react';

// Lee el hash (#int-twitter) cuando se llega desde el sidebar y resalta +
// hace scroll a la card correspondiente. Sin librerías: solo DOM nativo.
export function IntegrationFocus() {
  React.useEffect(() => {
    const id = window.location.hash.replace('#', '');
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-[var(--color-primary)]', 'ring-offset-2', 'ring-offset-[var(--color-background)]');
    const t = window.setTimeout(() => {
      el.classList.remove('ring-2', 'ring-[var(--color-primary)]', 'ring-offset-2', 'ring-offset-[var(--color-background)]');
    }, 2600);
    return () => window.clearTimeout(t);
  }, []);

  return null;
}
