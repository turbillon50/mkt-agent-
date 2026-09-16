'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { IconCheck, IconSparkles, IconTrash } from '@/components/icons';
import { useToast } from '@/components/ui/toast-provider';
import { PreviewRed } from '@/components/contenido/preview-red';
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
  copy?: string | null;
  headline?: string | null;
  cta?: string | null;
  altText?: string | null;
  socialPackId?: string | null;
  source?: string | null;
  loteId: string | null;
  createdAt: string;
  /** Lo que pidieron al apretar "Pedir cambios" (corrida 7). */
  comentario?: string | null;
  programadaPara?: string | null;
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

/**
 * El camino de la pieza (corrida 7). `propuesta` ES el borrador: no se renombró
 * la columna para no romper las piezas que ya existen en producción, pero lo
 * que el usuario lee es "Borrador", que es lo que significa.
 */
const ESTADO_LABEL: Record<string, string> = {
  propuesta: 'Borrador',
  en_revision: 'En revisión',
  cambios: 'Cambios pedidos',
  aprobada: 'Aprobada',
  programada: 'Programada',
  descartada: 'Rechazada',
  publicada: 'Publicada',
};

const ESTADO_ESTILO: Record<string, string> = {
  propuesta: '',
  en_revision: 'border-[var(--color-primary)]/50 text-[var(--color-primary)]',
  cambios: 'border-amber-500/50 text-amber-700 dark:text-amber-400',
  aprobada: 'border-[var(--color-success)]/50 text-[var(--color-success)]',
  programada: 'border-[var(--color-success)]/50 text-[var(--color-success)]',
  descartada: '',
  publicada: 'border-[var(--color-success)]/50 text-[var(--color-success)]',
};

export function GaleriaPiezas({
  projectId,
  puedeEditar,
  kitCompleto,
  nombreProyecto = 'Tu marca',
  logo = null,
}: {
  projectId: string;
  puedeEditar: boolean;
  kitCompleto: boolean;
  /** Para el visor: la pieza se ve firmada como la firma la red. */
  nombreProyecto?: string;
  logo?: string | null;
}) {
  const toast = useToast();
  const [visor, setVisor] = useState<string | null>(null);
  const [piezas, setPiezas] = useState<PiezaUI[]>([]);
  const [porRed, setPorRed] = useState<Array<{ red: string; label: string; n: number }>>([]);
  const [filtro, setFiltro] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<'paquete' | 'una'>('paquete');
  const [redesElegidas, setRedesElegidas] = useState<string[]>([
    'instagram',
    'facebook',
    'twitter',
    'linkedin',
  ]);
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
      if (modo === 'paquete' && redesElegidas.length === 0) {
        toast.push({ title: 'Elige al menos una red', variant: 'error' });
        setHaciendo(false);
        return;
      }
      const res = await fetch(
        modo === 'paquete'
          ? `/api/projects/${projectId}/piezas/paquete`
          : `/api/projects/${projectId}/piezas`,
        {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          modo === 'paquete'
            ? { redes: redesElegidas, brief, cta, opciones: 2 }
            : { red, formato: formato || null, brief, titular, cta },
        ),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? 'No se pudo hacer la pieza.');
      if (modo === 'paquete') {
        const total = (d.networks ?? []).reduce(
          (sum: number, network: { piezas?: unknown[] }) => sum + (network.piezas?.length ?? 0),
          0,
        );
        toast.push({
          title: `${d.networks?.length ?? 0} redes y ${total} artes listos`,
          description: 'Cada red lleva su propio copy, formato y dirección visual.',
          variant: 'success',
        });
      } else {
        toast.push({
          title: `${d.piezas.length} opciones listas`,
          description: `${d.formato.label} · ${d.formato.ancho} × ${d.formato.alto} px. ${d.nota ?? ''}`,
          variant: 'success',
        });
      }
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
  }, [brief, cta, cargar, filtro, formato, modo, projectId, red, redesElegidas, titular, toast]);

  /**
   * Mover una pieza por el camino de aprobación.
   *
   * La transición la valida el SERVIDOR. Aquí solo se pide: si un botón mal
   * pintado intentara mandar una pieza publicada a borrador, la ruta contesta
   * 409 y el mensaje se enseña tal cual.
   */
  const mover = useCallback(
    async (id: string, estado: string, extra: Record<string, unknown> = {}) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/piezas/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado, ...extra }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d?.error ?? 'No se pudo.');
        await cargar(filtro);
      } catch (e) {
        toast.push({
          title: 'No se pudo guardar tu decisión',
          description: e instanceof Error ? e.message : undefined,
          variant: 'error',
        });
      }
    },
    [cargar, filtro, projectId, toast],
  );

  /**
   * "Pedir cambios" OBLIGA a escribir cuáles.
   *
   * Sin el porqué no es una corrección, es un no — y es justo el texto que se
   * guarda como lección del proyecto para que Goossip no repita el error. Un
   * rechazo mudo no le enseña nada a nadie.
   */
  const pedirCambios = useCallback(
    async (id: string) => {
      const comentario = window.prompt('¿Qué quieres distinto? Esto se lo guardo a Goossip como lección.');
      if (comentario === null) return;
      if (comentario.trim().length < 3) {
        toast.push({ title: 'Dime qué cambiar', variant: 'error' });
        return;
      }
      await mover(id, 'cambios', { comentario: comentario.trim() });
    },
    [mover, toast],
  );

  const programar = useCallback(
    async (id: string) => {
      const cuando = window.prompt('¿Qué día y a qué hora sale? (2026-09-20 10:00)');
      if (cuando === null) return;
      const fecha = new Date(cuando.trim().replace(' ', 'T'));
      if (Number.isNaN(fecha.getTime())) {
        toast.push({ title: 'Esa fecha no se entiende', variant: 'error' });
        return;
      }
      await mover(id, 'programada', { programadaPara: fecha.toISOString() });
    },
    [mover, toast],
  );

  const abiertaEnVisor = piezas.find((p) => p.id === visor) ?? null;

  return (
    <div className="piezas-galeria space-y-4">
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
            {abierto ? 'Cerrar' : 'Crear contenido'}
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
            <div className="flex w-fit rounded-lg border border-[var(--color-border)] p-1 text-xs">
              <button
                type="button"
                onClick={() => setModo('paquete')}
                className={cn('rounded-md px-3 py-1.5', modo === 'paquete' && 'bg-[var(--color-primary)] text-white')}
              >
                Paquete por red
              </button>
              <button
                type="button"
                onClick={() => setModo('una')}
                className={cn('rounded-md px-3 py-1.5', modo === 'una' && 'bg-[var(--color-primary)] text-white')}
              >
                Una sola pieza
              </button>
            </div>

            {modo === 'paquete' ? (
              <div className="space-y-2">
                <p className="text-xs font-medium">¿En qué redes sale?</p>
                <div className="flex flex-wrap gap-2">
                  {REDES.slice(0, 6).map((item) => {
                    const checked = redesElegidas.includes(item.slug);
                    return (
                      <label
                        key={item.slug}
                        className={cn(
                          'flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs',
                          checked && 'border-[var(--color-primary)] bg-[var(--color-primary)]/10',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setRedesElegidas((current) =>
                              checked
                                ? current.filter((value) => value !== item.slug)
                                : [...current, item.slug],
                            )
                          }
                        />
                        {item.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : (
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
            )}
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
              {modo === 'una' ? (
                <Input
                  value={titular}
                  onChange={(e) => setTitular(e.target.value)}
                  placeholder="Titular que va encima (opcional)"
                  aria-label="Titular"
                />
              ) : (
                <p className="rounded-md bg-[var(--color-accent)]/60 px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
                  Goossip escribirá un titular y un copy diferentes para cada red.
                </p>
              )}
              <Input
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                placeholder="Botón: Agenda tu visita (opcional)"
                aria-label="Llamada a la acción"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-[var(--color-muted-foreground)]">
                {modo === 'paquete'
                  ? 'Dos artes distintos por red, con copy, CTA y medida nativos. Puede tardar unos minutos.'
                  : 'Tres opciones distintas, en la medida exacta que pide esa red. Tarda cerca de un minuto.'}
              </p>
              <Button onClick={hacer} disabled={haciendo} className="btn-brand shrink-0">
                {haciendo
                  ? 'Creando…'
                  : modo === 'paquete'
                    ? 'Crear paquete'
                    : 'Hacer 3 opciones'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---- el visor, a ancho completo ---- */}
      {abiertaEnVisor && (
        <Card className="border-[var(--color-primary)]/40">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Cómo se va a ver</p>
                <p className="truncate text-xs text-[var(--color-muted-foreground)]">
                  {abiertaEnVisor.brief}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setVisor(null)}>
                Cerrar el visor
              </Button>
            </div>
            <PreviewRed
              pieza={{
                id: abiertaEnVisor.id,
                url: abiertaEnVisor.url,
                red: abiertaEnVisor.red,
                formato: abiertaEnVisor.formato,
                brief: abiertaEnVisor.brief,
              }}
              texto={abiertaEnVisor.copy ?? abiertaEnVisor.brief}
              proyecto={nombreProyecto}
              logo={logo}
            />
          </CardContent>
        </Card>
      )}

      {/* ---- la galería ---- */}
      {cargando ? (
        <div className="piezas-grid grid gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton aspect-[4/5] w-full rounded-xl" />
          ))}
        </div>
      ) : piezas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">
            Todavía no hay piezas. Aprieta <strong>Crear contenido</strong> para empezar.
          </CardContent>
        </Card>
      ) : (
        <div className="piezas-grid grid gap-3">
          {piezas.map((p) => (
            <Card key={p.id} className={cn(p.estado === 'descartada' && 'opacity-50')}>
              <CardContent className="space-y-2.5 p-3">
                {p.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.url}
                    alt={p.angulo ?? p.brief}
                    className="h-40 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-accent)]/30 object-cover sm:h-44"
                  />
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">
                    {REDES.find((r) => r.slug === p.red)?.label ?? p.red}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn('text-[10px]', ESTADO_ESTILO[p.estado] ?? '')}
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
                {p.headline && <p className="line-clamp-1 text-xs font-semibold">{p.headline}</p>}
                <p className="line-clamp-2 text-[11px] text-[var(--color-muted-foreground)]">
                  {p.copy ?? p.brief}
                </p>
                {p.nota && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400">{p.nota}</p>
                )}
                {p.comentario && (
                  <p className="rounded border-l-2 border-amber-500 bg-amber-500/10 py-1 pl-2 text-[10px] leading-snug">
                    Pidieron: {p.comentario}
                  </p>
                )}
                {p.programadaPara && (
                  <p className="text-[10px] text-[var(--color-success)]">
                    Sale el{' '}
                    {new Date(p.programadaPara).toLocaleString('es-MX', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                )}

                {/*
                  El visor NO se abre dentro de la tarjeta.
                  
                  Se intentó y se vio en la captura por qué no: la galería es un
                  grid de tres columnas, así que la tarjeta mide un tercio de la
                  pantalla, y ahí dentro la columna de avisos del visor quedaba
                  de treinta píxeles — el texto salía a UNA LETRA POR RENGLÓN.
                  Las clases `lg:` responden al ancho de la VENTANA, no al del
                  contenedor, así que a 1440 creían tener sitio de sobra.

                  Ahora se abre a ancho completo arriba de la galería, que
                  además es donde se quiere ver: aprobar una pieza mirándola en
                  miniatura es lo mismo que aprobarla sin mirarla.
                */}
                <button
                  type="button"
                  onClick={() => setVisor((v) => (v === p.id ? null : p.id))}
                  className="text-[11px] font-medium text-[var(--color-primary)] hover:underline"
                >
                  {visor === p.id ? 'Cerrar el visor' : 'Ver en cada red'}
                </button>

                {puedeEditar && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {(p.estado === 'propuesta' || p.estado === 'en_revision' || p.estado === 'cambios') && (
                      <>
                        {p.estado !== 'en_revision' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-[11px]"
                            onClick={() => void mover(p.id, 'en_revision')}
                          >
                            A revisión
                          </Button>
                        )}
                        <Button
                          size="sm"
                          className="btn-brand h-8 flex-1 text-[11px]"
                          onClick={() => void mover(p.id, 'aprobada')}
                        >
                          <IconCheck className="h-3.5 w-3.5" /> Aprobar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-[11px]"
                          onClick={() => void pedirCambios(p.id)}
                        >
                          Pedir cambios
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          aria-label="Rechazar"
                          onClick={() => void mover(p.id, 'descartada')}
                        >
                          <IconTrash className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    {p.estado === 'aprobada' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-[11px]"
                        onClick={() => void programar(p.id)}
                      >
                        Programar
                      </Button>
                    )}
                    {p.estado === 'programada' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-[11px]"
                        onClick={() => void mover(p.id, 'aprobada')}
                      >
                        Quitar la fecha
                      </Button>
                    )}
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
