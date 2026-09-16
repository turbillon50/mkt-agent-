'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast-provider';
import { IconSparkles } from '@/components/icons';
import { cn } from '@/lib/utils';

/**
 * Auditoría de marca: cuánto se parece lo que sale a lo que el cliente aprobó.
 *
 * Los colores se MIDEN — se baja cada pieza y se le cuentan los píxeles, y la
 * distancia entre dos colores se calcula en CIELAB, que es como la ve el ojo.
 * Por eso la pantalla puede decir "ΔE 1.1 contra tu negro de fondo" en vez de
 * "parece que sí usa tus colores".
 *
 * Es un botón y no un cálculo automático al abrir: bajar treinta imágenes cada
 * vez que alguien entra a Marca es caro y nadie lo pidió.
 */

interface PiezaAuditada {
  id: string;
  url: string;
  red: string;
  cuando: string;
  deLaMarca: number;
  masCercano: { hex: string; rol: string; deltaE: number } | null;
  dominantes: string[];
  problema: string | null;
}

interface Resultado {
  revisadas: number;
  bajadas: number;
  consistencia: number | null;
  piezas: PiezaAuditada[];
  paleta: Array<{ rol: string; hex: string }>;
  tono: { revisados: number; conProhibidas: Array<{ texto: string; palabras: string[] }> };
  huecos: Array<{ red: string; label: string; dias: number | null; texto: string }>;
  sugerencias: Array<{ texto: string; prompt: string }>;
  motivo: string | null;
}

export function AuditoriaDeMarca({ projectId }: { projectId: string }) {
  const { push } = useToast();
  const [r, setR] = useState<Resultado | null>(null);
  const [midiendo, setMidiendo] = useState(false);

  async function medir() {
    setMidiendo(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/marca/auditoria`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cuantas: 30 }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'No se pudo medir.');
      setR(d);
    } catch (e) {
      push({ title: e instanceof Error ? e.message : 'Error', variant: 'error' });
    } finally {
      setMidiendo(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Auditoría de marca</h2>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Se bajan tus últimas 30 piezas y se les cuentan los píxeles contra tu paleta.
            </p>
          </div>
          <Button size="sm" variant="outline" disabled={midiendo} onClick={() => void medir()}>
            {midiendo ? 'Midiendo…' : 'Medir ahora'}
          </Button>
        </div>

        {!r && !midiendo && (
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Todavía no se ha medido nada. Aprieta &quot;Medir ahora&quot;.
          </p>
        )}

        {r && (
          <div className="space-y-4">
            {/* --------------------------------------------------- el número */}
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <p className="text-3xl font-semibold tabular-nums">
                  {r.consistencia !== null ? `${r.consistencia}%` : '—'}
                </p>
                <p className="text-[11px] text-[var(--color-muted-foreground)]">
                  de lo que sale está pintado con tus colores
                </p>
              </div>
              <p className="text-[11px] text-[var(--color-muted-foreground)]">
                {r.bajadas} de {r.revisadas} piezas se pudieron bajar y medir.
              </p>
              <div className="flex gap-1">
                {r.paleta.map((c) => (
                  <span
                    key={c.hex}
                    title={`${c.rol} ${c.hex}`}
                    style={{ backgroundColor: c.hex }}
                    className="h-6 w-6 rounded border border-[var(--color-border)]"
                  />
                ))}
              </div>
            </div>

            {r.motivo && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                {r.motivo}
              </p>
            )}

            {/* ------------------------------------------------- pieza a pieza */}
            {r.piezas.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {r.piezas.map((p) => (
                  <div
                    key={p.id}
                    className="flex gap-2 rounded-lg border border-[var(--color-border)] p-2"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-[11px]">
                        <Badge variant="outline" className="text-[9px]">
                          {p.red}
                        </Badge>
                        <span
                          className={cn(
                            'font-semibold tabular-nums',
                            p.deLaMarca >= 0.5
                              ? 'text-[var(--color-success)]'
                              : p.deLaMarca >= 0.25
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-[var(--color-destructive)]',
                          )}
                        >
                          {Math.round(p.deLaMarca * 100)}%
                        </span>
                      </p>
                      <div className="mt-1 flex gap-0.5">
                        {p.dominantes.map((h) => (
                          <span
                            key={h}
                            title={h}
                            style={{ backgroundColor: h }}
                            className="h-3 w-3 rounded-sm border border-[var(--color-border)]"
                          />
                        ))}
                      </div>
                      {p.masCercano && (
                        <p className="mt-0.5 text-[10px] text-[var(--color-muted-foreground)]">
                          más cerca de tu {p.masCercano.rol} ({p.masCercano.hex}) · ΔE{' '}
                          {p.masCercano.deltaE}
                        </p>
                      )}
                      {p.problema && (
                        <p className="text-[10px] text-[var(--color-destructive)]">{p.problema}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ------------------------------------------------------- el tono */}
            <div>
              <h3 className="text-xs font-semibold">Tono</h3>
              {r.tono.conProhibidas.length === 0 ? (
                <p className="text-[11px] text-[var(--color-muted-foreground)]">
                  De {r.tono.revisados} publicaciones revisadas, ninguna usa palabras que tu marca
                  tiene prohibidas.
                </p>
              ) : (
                <ul className="space-y-1">
                  {r.tono.conProhibidas.map((t, i) => (
                    <li
                      key={i}
                      className="rounded border-l-2 border-[var(--color-destructive)] bg-[var(--color-destructive)]/5 py-1 pl-2 text-[11px]"
                    >
                      <strong>{t.palabras.join(', ')}</strong> — “{t.texto}”
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* ------------------------------------------------------ los huecos */}
            {r.huecos.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold">Huecos</h3>
                <ul className="space-y-0.5">
                  {r.huecos.map((h) => (
                    <li key={h.red} className="text-[11px] text-[var(--color-muted-foreground)]">
                      · {h.texto}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* --------------------------------------------------- qué hacer ya */}
            {r.sugerencias.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="text-xs font-semibold">Qué haría yo</h3>
                {r.sugerencias.map((s, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border)] px-2.5 py-2"
                  >
                    <p className="min-w-0 flex-1 text-[11px] leading-snug">{s.texto}</p>
                    {/*
                      El botón dicta el prompt al Asistente. La guía activa tiene
                      una regla y aquí se respeta: sin acción no es sugerencia,
                      es reproche.
                    */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 shrink-0 text-[11px]"
                      onClick={() => {
                        window.dispatchEvent(
                          new CustomEvent('goossip:dictar', { detail: { prompt: s.prompt } }),
                        );
                        push({ title: 'Se lo pasé al Asistente', variant: 'success' });
                      }}
                    >
                      <IconSparkles className="h-3.5 w-3.5" /> Generar pieza
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
