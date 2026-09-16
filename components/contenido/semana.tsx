'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * La semana: qué sale, qué día y en qué red.
 *
 * La regla que define esta pantalla: **solo entran las piezas con FECHA.** Una
 * pieza aprobada sin programar no está "en el lunes" — está esperando que
 * alguien decida cuándo sale, y ponerla en el calendario de hoy sería
 * inventarle un plan al cliente.
 *
 * Reemplaza al Calendario global, que mezclaba el contenido de tres clientes y
 * por eso no servía para planear el de ninguno.
 */

interface PiezaDia {
  id: string;
  red: string;
  formato: string;
  url: string | null;
  brief: string;
  estado: string;
  etiqueta: string;
  programadaPara: string | null;
}

interface Dia {
  dia: string;
  piezas: PiezaDia[];
}

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function VistaSemana({ projectId }: { projectId: string }) {
  const [dias, setDias] = useState<Dia[]>([]);
  const [desde, setDesde] = useState<Date | null>(null);
  const [offset, setOffset] = useState(0);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(
    async (semanas: number) => {
      setCargando(true);
      const base = new Date();
      base.setDate(base.getDate() + semanas * 7);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/contenido/semana?desde=${base.toISOString()}`,
          { cache: 'no-store' },
        );
        const d = await res.json();
        if (res.ok) {
          setDias(d.dias ?? []);
          setDesde(new Date(d.desde));
        }
      } finally {
        setCargando(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    void cargar(offset);
  }, [cargar, offset]);

  const total = dias.reduce((n, d) => n + d.piezas.length, 0);
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          {desde && (
            <span className="font-medium">
              Semana del{' '}
              {desde.toLocaleDateString('es-MX', { day: '2-digit', month: 'long' })}
            </span>
          )}
          <span className="text-[var(--color-muted-foreground)]">
            {' '}
            · {total} {total === 1 ? 'pieza programada' : 'piezas programadas'}
          </span>
        </p>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setOffset((o) => o - 1)}>
            Anterior
          </Button>
          <Button size="sm" variant="outline" onClick={() => setOffset(0)} disabled={offset === 0}>
            Esta semana
          </Button>
          <Button size="sm" variant="outline" onClick={() => setOffset((o) => o + 1)}>
            Siguiente
          </Button>
        </div>
      </div>

      {cargando ? (
        <div className="skeleton h-48 w-full rounded-xl" />
      ) : (
        <div className="grid gap-2 md:grid-cols-7">
          {dias.map((d, i) => (
            <Card
              key={d.dia}
              className={cn(
                'min-h-[9rem]',
                d.dia === hoy && 'border-[var(--color-primary)]/50',
              )}
            >
              <CardContent className="space-y-2 p-2.5">
                <p className="text-[11px] font-medium">
                  {DIAS[i]}{' '}
                  <span className="text-[var(--color-muted-foreground)]">
                    {d.dia.slice(8, 10)}
                  </span>
                </p>
                {d.piezas.length === 0 ? (
                  <p className="text-[10px] text-[var(--color-muted-foreground)]">—</p>
                ) : (
                  d.piezas.map((p) => (
                    <div
                      key={p.id}
                      className="space-y-1 rounded-md border border-[var(--color-border)] p-1.5"
                      title={p.brief}
                    >
                      {p.url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.url}
                          alt=""
                          className="aspect-square w-full rounded object-cover"
                        />
                      )}
                      <Badge variant="outline" className="text-[9px]">
                        {p.red}
                      </Badge>
                      <p className="text-[10px] text-[var(--color-muted-foreground)]">
                        {p.programadaPara
                          ? new Date(p.programadaPara).toLocaleTimeString('es-MX', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}{' '}
                        · {p.etiqueta}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!cargando && total === 0 && (
        <p className="rounded-lg border border-dashed border-[var(--color-border)] px-3 py-4 text-center text-xs text-[var(--color-muted-foreground)]">
          Aquí solo salen las piezas con fecha. Aprueba una y apriétale
          &quot;Programar&quot; para que aparezca en su día.
        </p>
      )}
    </div>
  );
}
