'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { IconCheck } from '@/components/icons';
import { cn } from '@/lib/utils';

/**
 * El semáforo anti-baneo.
 *
 * Verde, ámbar, rojo. Y tres reglas de pantalla que hacen que signifique algo:
 *
 *   1. **La regla se CITA, con su enlace.** "No se puede publicar" no le enseña
 *      nada a nadie; "Meta prohíbe las promesas de ganancia irreal — y aquí está
 *      su política" sí, y la segunda vez el cliente ya no la escribe.
 *   2. **En rojo, el botón de aprobar no está.** No deshabilitado con un
 *      candadito: no está. Un botón gris se aprieta igual y enseña a pelearse
 *      con la pantalla.
 *   3. **Un semáforo viejo se marca viejo.** Si el texto cambió después de la
 *      última revisión, el color se apaga y lo dice. Aprobar mirando un verde
 *      de hace dos párrafos es exactamente cómo se publica lo que no debía.
 */

export interface HallazgoUI {
  texto: string;
  nivel: 'ambar' | 'rojo';
  regla: { id: string; titulo: string; fuente: string; leidoEl: string } | null;
  origen: 'duro' | 'modelo';
  corregible: boolean;
}

export interface VeredictoUI {
  semaforo: 'verde' | 'ambar' | 'rojo';
  resumen: string;
  reglasEvaluadas: number;
  avisoDeRevision: string | null;
  hallazgos: HallazgoUI[];
  cuota: { hoy: number; tope: number | null; quedan: number | null } | null;
}

const ESTILO = {
  verde: {
    caja: 'border-[var(--color-success)]/40 bg-[var(--color-success)]/5',
    punto: 'bg-[var(--color-success)]',
    texto: 'text-[var(--color-success)]',
    titulo: 'Se puede publicar',
  },
  ambar: {
    caja: 'border-amber-500/50 bg-amber-500/5',
    punto: 'bg-amber-500',
    texto: 'text-amber-700 dark:text-amber-400',
    titulo: 'Sale, pero léelo antes',
  },
  rojo: {
    caja: 'border-[var(--color-destructive)]/50 bg-[var(--color-destructive)]/5',
    punto: 'bg-[var(--color-destructive)]',
    texto: 'text-[var(--color-destructive)]',
    titulo: 'No se publica',
  },
} as const;

export function Compuerta({
  veredicto,
  revisando,
  fresco,
  adaptando,
  corrigiendo,
  puedeEditar,
  onRevisar,
  onAdaptar,
  onCorregir,
  onAprobar,
  estadoDeLaPieza,
}: {
  veredicto: VeredictoUI | null;
  revisando: boolean;
  /** ¿El semáforo corresponde al texto de ahora? */
  fresco: boolean;
  adaptando: boolean;
  corrigiendo: boolean;
  puedeEditar: boolean;
  onRevisar: () => void;
  onAdaptar: () => void;
  onCorregir: () => void;
  onAprobar: () => void;
  estadoDeLaPieza: string | null;
}) {
  if (revisando && !veredicto) {
    return (
      <Card>
        <CardContent className="space-y-2 py-5">
          <div className="skeleton h-4 w-32 rounded" />
          <div className="skeleton h-3 w-full rounded" />
          <div className="skeleton h-3 w-2/3 rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!veredicto) {
    return (
      <Card>
        <CardContent className="py-5 text-center text-xs text-[var(--color-muted-foreground)]">
          Elige una pieza y la reviso contra las reglas de la red antes de que salga.
        </CardContent>
      </Card>
    );
  }

  const e = ESTILO[veredicto.semaforo];
  const hayAdaptable = veredicto.hallazgos.some((h) => h.corregible && h.nivel === 'rojo');
  const yaAprobada = estadoDeLaPieza === 'aprobada' || estadoDeLaPieza === 'publicada';

  return (
    <Card className={cn('border', fresco ? e.caja : 'border-dashed border-[var(--color-border)]')}>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-start gap-2">
          <span
            className={cn(
              'mt-1 h-2.5 w-2.5 shrink-0 rounded-full',
              fresco ? e.punto : 'bg-[var(--color-muted-foreground)]',
            )}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className={cn('text-sm font-semibold', fresco ? e.texto : '')}>
              {fresco ? e.titulo : 'El texto cambió'}
            </p>
            <p className="pt-0.5 text-[11px] leading-snug text-[var(--color-muted-foreground)]">
              {fresco
                ? veredicto.resumen
                : 'Cambiaste el texto después de la última revisión, así que este resultado ya no vale. Vuelve a revisar antes de aprobar.'}
            </p>
          </div>
        </div>

        {!fresco && (
          <Button size="sm" className="btn-brand h-8 w-full text-[11px]" onClick={onRevisar} disabled={revisando}>
            {revisando ? 'Revisando…' : 'Revisar con el texto de ahora'}
          </Button>
        )}

        {fresco && veredicto.hallazgos.length > 0 && (
          <ul className="space-y-2">
            {veredicto.hallazgos.map((h, i) => (
              <li
                key={i}
                className={cn(
                  'rounded-md border-l-2 bg-[var(--color-accent)]/30 py-1.5 pl-2.5 pr-2 text-[11px] leading-snug',
                  h.nivel === 'rojo' ? 'border-l-[var(--color-destructive)]' : 'border-l-amber-500',
                )}
              >
                <p>{h.texto}</p>
                {h.regla && (
                  <p className="pt-1 text-[10px] text-[var(--color-muted-foreground)]">
                    {h.regla.titulo} —{' '}
                    <a
                      href={h.regla.fuente}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2"
                    >
                      ver la política
                    </a>{' '}
                    (leída el {h.regla.leidoEl})
                  </p>
                )}
                {!h.regla && (
                  <p className="pt-1 text-[10px] italic text-[var(--color-muted-foreground)]">
                    Criterio de la casa: esto no lo publica la red, lo decidimos nosotros.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        {fresco && veredicto.avisoDeRevision && (
          <p className="rounded-md border border-dashed border-[var(--color-border)] px-2 py-1.5 text-[10px] leading-snug text-[var(--color-muted-foreground)]">
            {veredicto.avisoDeRevision}
          </p>
        )}

        {/* --------------------------------------------------- los botones */}
        {puedeEditar && fresco && !yaAprobada && (
          <div className="space-y-1.5">
            {hayAdaptable && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-full text-[11px]"
                onClick={onAdaptar}
                disabled={adaptando}
              >
                {adaptando ? 'Adaptando…' : 'Adaptar a la medida de la red'}
              </Button>
            )}

            {veredicto.semaforo === 'ambar' && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-full text-[11px]"
                onClick={onCorregir}
                disabled={corrigiendo || revisando}
              >
                {corrigiendo ? 'Corrigiendo…' : 'Corregir con Goossip'}
              </Button>
            )}

            {/*
              En ROJO no hay botón de aprobar. No deshabilitado: ausente.
              Esa es la diferencia entre una compuerta y un permiso.
            */}
            {veredicto.semaforo !== 'rojo' && (
              <Button size="sm" className="btn-brand h-8 w-full text-[11px]" onClick={onAprobar}>
                <IconCheck className="h-3.5 w-3.5" />
                {veredicto.semaforo === 'ambar' ? 'Aprobar de todas formas' : 'Aprobar'}
              </Button>
            )}
          </div>
        )}

        {yaAprobada && (
          <Badge variant="outline" className="w-full justify-center text-[10px]">
            Esta pieza ya está {estadoDeLaPieza === 'publicada' ? 'publicada' : 'aprobada'}
          </Badge>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-2">
          <span className="text-[10px] text-[var(--color-muted-foreground)]">
            {veredicto.reglasEvaluadas} reglas oficiales revisadas
          </span>
          {veredicto.cuota && veredicto.cuota.quedan !== null && (
            <Badge variant="outline" className="text-[10px]">
              te quedan {veredicto.cuota.quedan} hoy
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
