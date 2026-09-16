'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { IconCheck, IconSparkles, IconTrash } from '@/components/icons';
import { useToast } from '@/components/ui/toast-provider';
import { cn } from '@/lib/utils';

/**
 * La galería de piezas del proyecto, con el botón que hace piezas nuevas.
 *
 * Dos decisiones que se ven poco y pesan:
 *
 * 1. El filtro por red se pinta con los NÚMEROS reales, no con las ocho redes
 *    del catálogo. Un proyecto que solo publica en Instagram no tiene por qué
 *    ver siete pestañas vacías.
 * 2. Hacer una pieza tarda de verdad (tres imágenes más composición). El botón
 *    lo dice y se apaga mientras trabaja. Un botón que parece que no hizo nada
 *    se aprieta tres veces y salen nueve piezas.
 */

export interface PiezaUI {
  id: string;
  red: string;
  formato: string;
  url: string | null;
  ancho: number | null;
  alto: number | null;
  brief: string;
  motor: string;
  estado: string;
  angulo: string | null;
  nota: string | null;
  loteId: string | null;
  createdAt: string;
}

const REDES: Array<{ slug: string; label: string }> = [
  { slug: 'instagram', label: 'Instagram' },
  { slug: 'facebook', label: 'Facebook' },
  { slug: 'linkedin', label: 'LinkedIn' },
  { slug: 'twitter', label: 'X' },
  { slug: 'tiktok', label: 'TikTok' },
  { slug: 'youtube', label: 'YouTube' },
  { slug: 'googleads', label: 'Google Ads' },
  { slug: 'whatsapp', label: 'WhatsApp' },
];

const ESTADO_LABEL: Record<string, string> = {
  propuesta: 'Propuesta',
  aprobada: 'Aprobada',
  descartada: 'Descartada',
  publicada: 'Publicada',
};

export function GaleriaPiezas({
  projectId,
  puedeEditar,
  kitCompleto,
}: {
  projectId: string;
  puedeEditar: boolean;
  kitCompleto: boolean;
}) {
  const toast = useToast();
  const [piezas, setPiezas] = useState<PiezaUI[]>([]);
  const [porRed, setPorRed] = useState<Array<{ red: string; label: string; n: number }>>([]);
  const [filtro, setFiltro] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const [abierto, setAbierto] = useState(false);
  const [red, setRed] = useState('instagram');
  const [formato, setFormato] = useState('');
  const [brief, setBrief] = useState('');
  const [titular, setTitular] = useState('');
  const [cta, setCta] = useState('');
  const [haciendo, setHaciendo] = useState(false);

  const cargar = useCallback(
    async (r: string | null) => {
      setCargando(true);
      try {
        const url = r ? `/api/projects/${projectId}/piezas?red=${r}` : `/api/projects/${projectId}/piezas`;
        const res = await fetch(url, { cache: 'no-store' });
        const d = await res.json();
        setPiezas(d?.piezas ?? []);
        setPorRed(d?.porRed ?? []);
      } catch {
        setPiezas([]);
      } finally {
        setCargando(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    void cargar(filtro);
  }, [cargar, filtro]);

  const hacer = useCallback(async () => {
    if (brief.trim().length < 4) {
      toast.push({ title: 'Dime de qué va la pieza', variant: 'error' });
      return;
    }
    setHaciendo(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/piezas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ red, formato: formato || null, brief, titular, cta }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? 'No se pudo hacer la pieza.');
      toast.push({
        title: `${d.piezas.length} opciones listas`,
        description: `${d.formato.label} · ${d.formato.ancho} × ${d.formato.alto} px. ${d.nota ?? ''}`,
        variant: 'success',
      });
      setAbierto(false);
      setBrief('');
      setTitular('');
      setCta('');
      await cargar(filtro);
    } catch (e) {
      toast.push({
        title: 'No se pudo hacer la pieza',
        description: e instanceof Error ? e.message : undefined,
        variant: 'error',
      });
    } finally {
      setHaciendo(false);
    }
  }, [brief, cta, cargar, filtro, formato, projectId, red, titular, toast]);

  const decidir = useCallback(
    async (id: string, accion: 'aprobar' | 'descartar') => {
      try {
        const res = await fetch(`/api/projects/${projectId}/piezas/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accion }),
        });
        if (!res.ok) throw new Error();
        await cargar(filtro);
      } catch {
        toast.push({ title: 'No se pudo guardar tu decisión', variant: 'error' });
      }
    },
    [cargar, filtro, projectId, toast],
  );

  return (
    <div className="space-y-4">
      {/* ---- barra: filtro por red + botón ---- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pestana activo={filtro === null} onClick={() => setFiltro(null)}>
            Todas
          </Pestana>
          {porRed.map((r) => (
            <Pestana key={r.red} activo={filtro === r.red} onClick={() => setFiltro(r.red)}>
              {r.label} <span className="opacity-60">{r.n}</span>
            </Pestana>
          ))}
        </div>
        {puedeEditar && (
          <Button className="btn-brand" onClick={() => setAbierto((v) => !v)}>
            <IconSparkles className="h-4 w-4" />
            {abierto ? 'Cerrar' : 'Hazme una pieza'}
          </Button>
        )}
      </div>

      {!kitCompleto && (
        <p className="rounded-lg border border-dashed border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
          Este proyecto todavía no tiene kit de marca. Las piezas van a salir, pero sin tu logo ni
          tus colores — carga tu marca en la sección <strong>Marca</strong> y vuelve.
        </p>
      )}

      {/* ---- el encargo ---- */}
      {abierto && puedeEditar && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="red" className="text-xs font-medium">
                  ¿Para qué red?
                </label>
                <select
                  id="red"
                  value={red}
                  onChange={(e) => setRed(e.target.value)}
                  className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2 text-sm"
                >
                  {REDES.map((r) => (
                    <option key={r.slug} value={r.slug}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="formato" className="text-xs font-medium">
                  ¿Qué formato? (opcional)
                </label>
                <Input
                  id="formato"
                  value={formato}
                  onChange={(e) => setFormato(e.target.value)}
                  placeholder="historia, reel, cuadrado, carrusel…"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="brief" className="text-xs font-medium">
                ¿De qué va?
              </label>
              <Input
                id="brief"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Promoción de fin de semana en el departamento modelo de Polanco"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                value={titular}
                onChange={(e) => setTitular(e.target.value)}
                placeholder="Titular que va encima (opcional)"
                aria-label="Titular"
              />
              <Input
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                placeholder="Botón: Agenda tu visita (opcional)"
                aria-label="Llamada a la acción"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-[var(--color-muted-foreground)]">
                Te voy a dar tres opciones distintas, en la medida exacta que pide esa red. Tarda
                cerca de un minuto.
              </p>
              <Button onClick={hacer} disabled={haciendo} className="btn-brand shrink-0">
                {haciendo ? 'Haciéndolas…' : 'Hacer 3 opciones'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---- la galería ---- */}
      {cargando ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton aspect-[4/5] w-full rounded-xl" />
          ))}
        </div>
      ) : piezas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">
            Todavía no hay piezas. Aprieta <strong>Hazme una pieza</strong> y te doy tres opciones.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {piezas.map((p) => (
            <Card key={p.id} className={cn(p.estado === 'descartada' && 'opacity-50')}>
              <CardContent className="space-y-2.5 p-3">
                {p.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.url}
                    alt={p.angulo ?? p.brief}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-accent)]/30 object-cover"
                    style={{ aspectRatio: p.ancho && p.alto ? `${p.ancho}/${p.alto}` : '4/5' }}
                  />
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">
                    {REDES.find((r) => r.slug === p.red)?.label ?? p.red}
                  </Badge>
                  <Badge
                    variant={p.estado === 'aprobada' ? 'default' : 'outline'}
                    className="text-[10px]"
                  >
                    {ESTADO_LABEL[p.estado] ?? p.estado}
                  </Badge>
                  {p.ancho && p.alto && (
                    <span className="text-[10px] text-[var(--color-muted-foreground)]">
                      {p.ancho} × {p.alto}
                    </span>
                  )}
                </div>
                {p.angulo && <p className="text-xs font-medium">{p.angulo}</p>}
                <p className="line-clamp-2 text-[11px] text-[var(--color-muted-foreground)]">
                  {p.brief}
                </p>
                {p.nota && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400">{p.nota}</p>
                )}
                {puedeEditar && p.estado === 'propuesta' && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="btn-brand flex-1" onClick={() => decidir(p.id, 'aprobar')}>
                      <IconCheck className="h-3.5 w-3.5" />
                      Esta
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label="Descartar"
                      onClick={() => decidir(p.id, 'descartar')}
                    >
                      <IconTrash className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Pestana({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={activo ? 'true' : undefined}
      className={cn(
        'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
        activo
          ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
          : 'border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]',
      )}
    >
      {children}
    </button>
  );
}
