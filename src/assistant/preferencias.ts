/**
 * El ancho y el plegado del panel de Goossip, guardados en el USUARIO.
 *
 * `localStorage` ya lo guarda y es lo que evita el parpadeo al cargar. Esto es
 * lo otro: que quien entra desde otra máquina —o desde el mismo navegador
 * después de limpiar— se encuentre su panel como lo dejó. Uno resuelve el
 * primer frame; el otro resuelve el segundo dispositivo. Hacen falta los dos.
 *
 * Vive dentro de `users.settings`, que ya existía como jsonb. Una columna
 * nueva por cada preferencia de interfaz sería una migración cada vez que
 * alguien agregue un interruptor.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';

export const PANEL_MIN = 250;
export const PANEL_MAX = 480;
export const PANEL_DEFAULT = 360;
/** Plegado: la tira con el ícono y el badge. */
export const PANEL_PLEGADO = 48;

export interface PreferenciasDelPanel {
  ancho: number;
  plegado: boolean;
  /** 'propone' | 'publica' — el selector del compose. */
  autonomia: 'propone' | 'publica';
}

export const PANEL_POR_OMISION: PreferenciasDelPanel = {
  ancho: PANEL_DEFAULT,
  plegado: false,
  autonomia: 'propone',
};

export function acotarAncho(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return PANEL_DEFAULT;
  return Math.min(PANEL_MAX, Math.max(PANEL_MIN, Math.round(n)));
}

export function leerPreferencias(settings: Record<string, unknown> | null | undefined): PreferenciasDelPanel {
  const crudo = (settings?.assistantPanel ?? null) as Record<string, unknown> | null;
  if (!crudo || typeof crudo !== 'object') return PANEL_POR_OMISION;
  return {
    ancho: acotarAncho(crudo.ancho),
    plegado: crudo.plegado === true,
    autonomia: crudo.autonomia === 'publica' ? 'publica' : 'propone',
  };
}

export async function guardarPreferencias(
  userId: string,
  parche: Partial<PreferenciasDelPanel>,
): Promise<PreferenciasDelPanel> {
  const [fila] = await db.select({ settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1);
  const actuales = leerPreferencias(fila?.settings);
  const nuevas: PreferenciasDelPanel = {
    ancho: parche.ancho === undefined ? actuales.ancho : acotarAncho(parche.ancho),
    plegado: parche.plegado === undefined ? actuales.plegado : parche.plegado === true,
    autonomia:
      parche.autonomia === undefined
        ? actuales.autonomia
        : parche.autonomia === 'publica'
          ? 'publica'
          : 'propone',
  };

  // Se mezcla con lo que ya había en `settings`. Escribir el objeto entero
  // borraría cualquier otra preferencia que viva ahí, que es exactamente el
  // bug del guardado parcial del kit de marca de la corrida 6.
  await db
    .update(users)
    .set({ settings: { ...(fila?.settings ?? {}), assistantPanel: nuevas } })
    .where(eq(users.id, userId));

  return nuevas;
}
