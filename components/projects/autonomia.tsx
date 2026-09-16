'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast-provider';
import { IconShield } from '@/components/icons';
import { cn } from '@/lib/utils';

/**
 * Cuánta libertad tiene Goossip en este proyecto, y qué se ha ganado.
 *
 * Dos cosas que esta pantalla deja claras porque son las que hacen que alguien
 * firme esto:
 *
 *   1. **Subir de nivel lo hace el dueño, no Goossip.** El contador SUGIERE
 *      cuando lleva N acciones seguidas sin corrección; el botón lo aprieta una
 *      persona. Un sistema que se da permisos a sí mismo por buen
 *      comportamiento es exactamente lo que nadie quiere firmar.
 *   2. **Las compuertas duras no suben con el nivel.** Dinero, promesas
 *      legales, precios fuera del catálogo y WhatsApp se quedan del lado
 *      humano en los cuatro niveles. Si el nivel 4 las abriera, no serían
 *      compuertas.
 */

interface Nivel {
  n: 1 | 2 | 3 | 4;
  nombre: string;
  hace: string;
  pide: string;
}

interface Datos {
  metricas: {
    dias: number;
    piezasPublicadas: number;
    piezasHechas: number;
    leadsContactados: number;
    primeraRespuestaMin: number | null;
    aprobacionSinCambios: { aprobadas: number; conCambios: number; rechazadas: number; tasa: number | null };
    correcciones: number;
    ahorro: { horas: number; cuenta: string };
  };
  autonomia: {
    nivel: 1 | 2 | 3 | 4;
    siguiente: 1 | 2 | 3 | 4 | null;
    sinCorreccion: number;
    faltan: number;
    sugerirSubir: boolean;
    ultimaCorreccion: string | null;
    descripcion: Nivel;
    niveles: Nivel[];
    topeDiario: number | null;
  };
  aprendi: {
    total: number;
    resumen: string;
    lecciones: Array<{ leccion: string; cuando: string; quien: string | null }>;
  };
  puedeAdministrar: boolean;
}

export function PanelAutonomia({
  projectId,
  rules,
}: {
  projectId: string;
  /** Las reglas actuales del proyecto: se mandan completas al guardar. */
  rules: Record<string, unknown>;
}) {
  const { push } = useToast();
  const [d, setD] = useState<Datos | null>(null);
  const [tope, setTope] = useState<string>(String(rules.maps_search_cap ?? 50));
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/metricas`, { cache: 'no-store' });
    if (res.ok) setD(await res.json());
  }, [projectId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardar(cambios: Record<string, unknown>) {
    setGuardando(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: { ...rules, ...cambios } }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'No se pudo guardar.');
      push({ title: 'Guardado', variant: 'success' });
      void cargar();
    } catch (e) {
      push({ title: e instanceof Error ? e.message : 'Error', variant: 'error' });
    } finally {
      setGuardando(false);
    }
  }

  if (!d) return <div className="skeleton h-40 w-full rounded-xl" />;

  const a = d.autonomia;
  const m = d.metricas;

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------------ niveles */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <IconShield className="h-4 w-4 text-[var(--color-primary)]" />
              Cuánto hace Goossip solo
            </h2>
            <Badge variant="outline" className="text-[10px]">
              {a.sinCorreccion} acciones sin que nadie corrija
              {a.faltan > 0 ? ` · faltan ${a.faltan} para sugerir subir` : ''}
            </Badge>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {a.niveles.map((n) => (
              <button
                key={n.n}
                type="button"
                disabled={!d.puedeAdministrar || guardando}
                onClick={() => void guardar({ autonomy_level: n.n })}
                className={cn(
                  'rounded-lg border p-3 text-left transition-colors',
                  n.n === a.nivel
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                    : 'border-[var(--color-border)] hover:bg-[var(--color-accent)]/50',
                  !d.puedeAdministrar && 'cursor-default opacity-80',
                )}
              >
                <p className="text-xs font-semibold">
                  {n.n}. {n.nombre}
                  {n.n === a.nivel && (
                    <span className="ml-1 text-[10px] font-normal text-[var(--color-primary)]">
                      · ahora
                    </span>
                  )}
                </p>
                <p className="mt-1 text-[11px] leading-snug">{n.hace}</p>
                <p className="mt-1 text-[10px] leading-snug text-[var(--color-muted-foreground)]">
                  Pide permiso: {n.pide}
                </p>
              </button>
            ))}
          </div>

          {a.sugerirSubir && a.siguiente && d.puedeAdministrar && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 px-3 py-2">
              <p className="min-w-0 flex-1 text-[11px] leading-snug">
                Lleva {a.sinCorreccion} acciones seguidas sin que nadie le corrija nada. Se puede
                subir al nivel {a.siguiente}.
              </p>
              <Button
                size="sm"
                className="btn-brand h-7 text-[11px]"
                disabled={guardando}
                onClick={() => void guardar({ autonomy_level: a.siguiente })}
              >
                Subir a {a.siguiente}
              </Button>
            </div>
          )}

          <p className="rounded-lg border border-dashed border-[var(--color-border)] px-3 py-2 text-[11px] leading-snug text-[var(--color-muted-foreground)]">
            <strong className="text-[var(--color-foreground)]">Nunca, en ningún nivel:</strong>{' '}
            mover dinero, hacer promesas legales, dar un precio que no esté en tu base de
            conocimiento, ni mandar WhatsApp. Eso siempre lo aprueba una persona.
          </p>

          {a.nivel === 4 && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-40">
                <label className="mb-1 block text-xs font-medium">Tope de gasto diario</label>
                <Input
                  type="number"
                  defaultValue={a.topeDiario ?? ''}
                  disabled={!d.puedeAdministrar}
                  onBlur={(e) =>
                    void guardar({ autonomy_daily_budget: Number(e.target.value) || 0 })
                  }
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <div className="w-40">
              <label className="mb-1 block text-xs font-medium">
                Búsquedas de mapa al mes
              </label>
              <Input
                type="number"
                value={tope}
                disabled={!d.puedeAdministrar}
                onChange={(e) => setTope(e.target.value)}
                onBlur={() => void guardar({ maps_search_cap: Number(tope) || 0 })}
              />
            </div>
            <p className="flex-1 text-[11px] text-[var(--color-muted-foreground)]">
              Google cobra por búsqueda en Prospección. Cuando se llega al tope, la herramienta lo
              dice y no busca.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------- Goossip como empleado */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <h2 className="text-sm font-semibold">Goossip en los últimos {m.dias} días</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Dato valor={m.piezasPublicadas} label="publicaciones" />
            <Dato valor={m.leadsContactados} label="leads contactados" />
            <Dato
              valor={m.primeraRespuestaMin !== null ? `${m.primeraRespuestaMin} min` : '—'}
              label="1ª respuesta (mediana)"
            />
            <Dato
              valor={m.aprobacionSinCambios.tasa !== null ? `${m.aprobacionSinCambios.tasa}%` : '—'}
              label="aprobadas sin cambios"
            />
            <Dato valor={`${m.ahorro.horas} h`} label="ahorro estimado" />
          </div>
          <p className="text-[10px] text-[var(--color-muted-foreground)]">
            El ahorro se calcula así: {m.ahorro.cuenta}. No es una estimación de marketing — es esa
            cuenta y nada más.
          </p>
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------- qué aprendí */}
      <Card>
        <CardContent className="space-y-2 py-4">
          <h2 className="text-sm font-semibold">Qué aprendí esta semana</h2>
          <p className="text-xs text-[var(--color-muted-foreground)]">{d.aprendi.resumen}</p>
          {d.aprendi.lecciones.length > 0 && (
            <ul className="space-y-1">
              {d.aprendi.lecciones.map((l, i) => (
                <li
                  key={i}
                  className="rounded border-l-2 border-[var(--color-primary)] bg-[var(--color-accent)]/30 py-1 pl-2 text-[11px] leading-snug"
                >
                  {l.leccion}
                  <span className="block text-[10px] text-[var(--color-muted-foreground)]">
                    {new Date(l.cuando).toLocaleDateString('es-MX')} · {l.quien ?? 'alguien'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Dato({ valor, label }: { valor: number | string; label: string }) {
  return (
    <div>
      <p className="text-xl font-semibold tabular-nums">{valor}</p>
      <p className="text-[10px] leading-tight text-[var(--color-muted-foreground)]">{label}</p>
    </div>
  );
}
