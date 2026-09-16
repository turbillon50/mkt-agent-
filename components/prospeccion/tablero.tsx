'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast-provider';
import { IconDownload, IconGlobe, IconMail, IconPhone, IconTarget } from '@/components/icons';
import { cn } from '@/lib/utils';

/**
 * Prospección por Google Maps.
 *
 * Tres cosas que esta pantalla NO esconde:
 *
 *   · **cuánto va costando** — Places cobra por búsqueda, así que el contador
 *     del mes y el tope están arriba, no en Ajustes;
 *   · **por dónde salió** — con la cuenta de Google del cliente o con la de la
 *     casa, porque el costo cae en bolsillos distintos;
 *   · **qué se leyó de cada negocio** — su sitio contestó o no contestó, y con
 *     qué código.
 *
 * Y lo que no hace, que es el diseño entero: no busca personas. Los datos de
 * contacto salen del sitio que el negocio publicó, no de un perfil de nadie.
 */

interface Prospecto {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  ratingsCount: number | null;
  category: string | null;
  lat: number | null;
  lng: number | null;
  mapsUrl: string | null;
  status: 'nuevo' | 'contactado' | 'descartado' | 'convertido';
  enrichment: {
    email?: string | null;
    whatsapp?: string | null;
    redes?: Record<string, string>;
    leido?: Array<{ url: string; status: number }>;
  };
  leadId: string | null;
}

const ESTADO_ESTILO: Record<Prospecto['status'], string> = {
  nuevo: 'border-[var(--color-border)]',
  contactado: 'border-amber-500/50 text-amber-700 dark:text-amber-400',
  convertido: 'border-[var(--color-success)]/50 text-[var(--color-success)]',
  descartado: 'border-[var(--color-border)] text-[var(--color-muted-foreground)] line-through',
};

export function TableroProspeccion({ projectId }: { projectId: string }) {
  const { push } = useToast();
  const [prospectos, setProspectos] = useState<Prospecto[]>([]);
  const [conteo, setConteo] = useState<Record<string, number>>({});
  const [costo, setCosto] = useState<{ mes: number; tope: number }>({ mes: 0, tope: 0 });
  const [via, setVia] = useState<'composio' | 'places' | null>(null);
  const [puedeOperar, setPuedeOperar] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<{ conSitio: boolean; conTelefono: boolean; ratingMin: number }>({
    conSitio: false,
    conTelefono: false,
    ratingMin: 0,
  });
  const [trabajando, setTrabajando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/prospeccion`, { cache: 'no-store' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'No se pudo cargar.');
      setProspectos(d.prospectos ?? []);
      setConteo(d.conteo ?? {});
      setCosto(d.costo ?? { mes: 0, tope: 0 });
      setVia(d.via ?? null);
      setPuedeOperar(Boolean(d.puedeOperar));
    } catch (e) {
      push({ title: e instanceof Error ? e.message : 'Error', variant: 'error' });
    } finally {
      setCargando(false);
    }
  }, [projectId, push]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function buscar() {
    if (consulta.trim().length < 4) {
      push({ title: 'Dime qué buscar y dónde: "restaurantes en Tulum"', variant: 'error' });
      return;
    }
    setBuscando(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/prospeccion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consulta: consulta.trim(), cuantos: 20 }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'No se pudo buscar.');
      push({
        title: `${d.encontrados} negocios · ${d.nuevos} nuevos`,
        description: `Búsqueda ${d.costo.mes} de ${d.costo.tope} este mes.`,
        variant: 'success',
      });
      void cargar();
    } catch (e) {
      push({ title: e instanceof Error ? e.message : 'Error', variant: 'error' });
    } finally {
      setBuscando(false);
    }
  }

  async function accion(id: string, body: Record<string, unknown>, exito: string) {
    setTrabajando(id);
    try {
      const res = await fetch(`/api/projects/${projectId}/prospeccion/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'No se pudo.');
      push({ title: exito, variant: 'success' });
      void cargar();
    } catch (e) {
      push({ title: e instanceof Error ? e.message : 'Error', variant: 'error' });
    } finally {
      setTrabajando(null);
    }
  }

  async function enriquecer(id: string) {
    setTrabajando(id);
    try {
      const res = await fetch(`/api/projects/${projectId}/prospeccion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'enriquecer', prospectId: id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'No se pudo.');
      setProspectos((ps) => ps.map((p) => (p.id === id ? d.prospecto : p)));
    } catch (e) {
      push({ title: e instanceof Error ? e.message : 'Error', variant: 'error' });
    } finally {
      setTrabajando(null);
    }
  }

  const visibles = useMemo(
    () =>
      prospectos.filter(
        (p) =>
          (!filtro.conSitio || p.website) &&
          (!filtro.conTelefono || p.phone) &&
          (filtro.ratingMin === 0 || (p.rating ?? 0) >= filtro.ratingMin),
      ),
    [prospectos, filtro],
  );

  if (cargando) return <p className="text-sm text-[var(--color-muted-foreground)]">Cargando…</p>;

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------------- buscar */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[240px] flex-1">
              <label className="mb-1 block text-xs font-medium">Giro y zona</label>
              <Input
                value={consulta}
                onChange={(e) => setConsulta(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void buscar()}
                placeholder="restaurantes en Tulum"
                disabled={!puedeOperar}
              />
            </div>
            <Button
              className="btn-brand"
              disabled={!puedeOperar || buscando || via === null}
              onClick={() => void buscar()}
            >
              {buscando ? 'Buscando…' : 'Buscar en el mapa'}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-muted-foreground)]">
            <Badge variant="outline" className="text-[10px]">
              {costo.mes} de {costo.tope} búsquedas este mes
            </Badge>
            {via === 'composio' && (
              <Badge variant="outline" className="text-[10px]">
                sale por la cuenta de Google del proyecto
              </Badge>
            )}
            {via === 'places' && (
              <Badge variant="outline" className="text-[10px]">
                sale por la cuenta de Goossip · conecta Google Maps para usar la tuya
              </Badge>
            )}
            {via === null && (
              <span className="text-[var(--color-destructive)]">
                No hay por dónde buscar: conecta Google Maps en Conexiones del proyecto.
              </span>
            )}
            <span>El tope se cambia en Ajustes. Google cobra por búsqueda.</span>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------ la lista */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-[var(--color-muted-foreground)]">
          {visibles.length} de {conteo.total ?? 0} · {conteo.nuevo ?? 0} sin tocar ·{' '}
          {conteo.contactado ?? 0} contactados · {conteo.convertido ?? 0} convertidos
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          <Chip activo={filtro.conSitio} onClick={() => setFiltro({ ...filtro, conSitio: !filtro.conSitio })}>
            con sitio
          </Chip>
          <Chip
            activo={filtro.conTelefono}
            onClick={() => setFiltro({ ...filtro, conTelefono: !filtro.conTelefono })}
          >
            con teléfono
          </Chip>
          <Chip
            activo={filtro.ratingMin > 0}
            onClick={() => setFiltro({ ...filtro, ratingMin: filtro.ratingMin > 0 ? 0 : 4.5 })}
          >
            4.5+
          </Chip>
          <a
            href={`/api/projects/${projectId}/prospeccion?csv=1`}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--color-border)] px-2 hover:bg-[var(--color-accent)]"
          >
            <IconDownload className="h-3.5 w-3.5" /> CSV
          </a>
        </div>
      </div>

      {visibles.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-[var(--color-muted-foreground)]">
            Todavía no hay negocios. Busca un giro y una zona arriba.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visibles.map((p) => (
            <Card key={p.id}>
              <CardContent className="space-y-2 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {p.mapsUrl ? (
                        <a href={p.mapsUrl} target="_blank" rel="noreferrer" className="hover:underline">
                          {p.name}
                        </a>
                      ) : (
                        p.name
                      )}
                      <Badge variant="outline" className={cn('text-[10px]', ESTADO_ESTILO[p.status])}>
                        {p.status}
                      </Badge>
                      {p.rating !== null && (
                        <span className="text-[11px] text-[var(--color-muted-foreground)]">
                          ★ {p.rating}
                          {p.ratingsCount ? ` (${p.ratingsCount})` : ''}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-[var(--color-muted-foreground)]">
                      {[p.category, p.address].filter(Boolean).join(' · ')}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                      {p.phone && (
                        <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1 hover:underline">
                          <IconPhone className="h-3 w-3" /> {p.phone}
                        </a>
                      )}
                      {p.website && (
                        <a
                          href={p.website}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 truncate hover:underline"
                        >
                          <IconGlobe className="h-3 w-3" /> sitio
                        </a>
                      )}
                      {p.enrichment?.email && (
                        <a
                          href={`mailto:${p.enrichment.email}`}
                          className="inline-flex items-center gap-1 hover:underline"
                        >
                          <IconMail className="h-3 w-3" /> {p.enrichment.email}
                        </a>
                      )}
                      {p.enrichment?.redes &&
                        Object.entries(p.enrichment.redes).map(([red, url]) => (
                          <a
                            key={red}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[var(--color-primary)] hover:underline"
                          >
                            {red}
                          </a>
                        ))}
                      {p.website && !p.enrichment?.leido && puedeOperar && (
                        <button
                          type="button"
                          disabled={trabajando === p.id}
                          onClick={() => void enriquecer(p.id)}
                          className="text-[var(--color-primary)] hover:underline"
                        >
                          {trabajando === p.id ? 'leyendo su sitio…' : 'leer su sitio'}
                        </button>
                      )}
                      {p.enrichment?.leido && !p.enrichment.email && !p.enrichment.whatsapp && (
                        <span className="text-[var(--color-muted-foreground)]">
                          su sitio no publica correo ni WhatsApp
                        </span>
                      )}
                    </div>
                  </div>

                  {puedeOperar && p.status !== 'convertido' && (
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        disabled={trabajando === p.id}
                        onClick={() => void accion(p.id, { accion: 'convertir' }, 'Convertido a lead')}
                      >
                        <IconTarget className="h-3.5 w-3.5" /> A lead
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        disabled={trabajando === p.id}
                        onClick={() =>
                          void accion(
                            p.id,
                            {
                              accion: 'proponer',
                              canal: p.enrichment?.email ? 'correo' : 'llamada',
                              mensaje: `Hola, los vi en Google Maps (${p.name}) y quería contarles cómo trabajamos.`,
                            },
                            'Primer contacto en la cola, esperando tu visto bueno',
                          )
                        }
                      >
                        A la cola
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs"
                        disabled={trabajando === p.id}
                        onClick={() => void accion(p.id, { estado: 'descartado' }, 'Descartado')}
                      >
                        Descartar
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------- el mapa */}
      <Mapa prospectos={visibles} />
    </div>
  );
}

function Chip({
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
      className={cn(
        'h-8 rounded-md border px-2.5 transition-colors',
        activo
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
          : 'border-[var(--color-border)] hover:bg-[var(--color-accent)]',
      )}
    >
      {children}
    </button>
  );
}

/**
 * El mapa, sin librería de mapas.
 *
 * Es un plano de coordenadas normalizadas sobre el recuadro de los resultados.
 * No es un mapa de calles y no pretende serlo: lo que contesta —"¿están todos
 * pegados o desperdigados?, ¿cuál está fuera de la zona?"— se contesta con la
 * posición relativa. Meter Leaflet o el SDK de Google aquí serían 200 KB de
 * JavaScript y una segunda llave de API para dibujar veinte puntitos.
 */
function Mapa({ prospectos }: { prospectos: Prospecto[] }) {
  const conCoords = prospectos.filter((p) => p.lat !== null && p.lng !== null);
  if (conCoords.length < 2) return null;

  const lats = conCoords.map((p) => p.lat!);
  const lngs = conCoords.map((p) => p.lng!);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  // Un solo punto en un eje daría división entre cero.
  const altoLat = maxLat - minLat || 1e-6;
  const anchoLng = maxLng - minLng || 1e-6;

  return (
    <Card>
      <CardContent className="space-y-2 py-4">
        <h3 className="text-sm font-semibold">Dónde están</h3>
        <div className="relative h-56 w-full overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-accent)]/30">
          {conCoords.map((p) => {
            // 6 % de margen para que un punto del borde no quede cortado.
            const x = 6 + ((p.lng! - minLng) / anchoLng) * 88;
            const y = 6 + ((maxLat - p.lat!) / altoLat) * 88;
            return (
              <span
                key={p.id}
                title={`${p.name}${p.rating ? ` · ★ ${p.rating}` : ''}`}
                style={{ left: `${x}%`, top: `${y}%` }}
                className={cn(
                  'absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--color-background)]',
                  p.status === 'convertido'
                    ? 'bg-[var(--color-success)]'
                    : p.status === 'contactado'
                      ? 'bg-amber-500'
                      : 'bg-[var(--color-primary)]',
                )}
              />
            );
          })}
        </div>
        <p className="text-[11px] text-[var(--color-muted-foreground)]">
          {conCoords.length} negocios ubicados. Posición relativa entre ellos, no un mapa de calles
          — para eso está el enlace a Google Maps de cada uno.
        </p>
      </CardContent>
    </Card>
  );
}
