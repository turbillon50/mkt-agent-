'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast-provider';
import { IconBarChart, IconPlus, IconTrash } from '@/components/icons';
import { cn } from '@/lib/utils';

/**
 * Competencia del proyecto: qué publican tus rivales contra lo que publicas tú.
 *
 * La columna que NO es decorativa es **Fuente**. Cada número dice de dónde
 * salió y, cuando no salió de ningún lado, dice por qué — con el mensaje del
 * proveedor. Un "publican 5 por semana" sin fuente no aguanta la primera
 * pregunta del cliente, que siempre es "¿de dónde sacaste eso?".
 */

interface Rival {
  id: string;
  name: string;
  website: string | null;
  handles: Record<string, string>;
  notes: string | null;
}

interface Fila {
  quien: string;
  esTuyo: boolean;
  red: string;
  fuente: 'composio' | 'web' | 'ninguna';
  motivo: string | null;
  posts: number;
  porSemana: number | null;
  ultimo: string | null;
  formatos: Record<string, number>;
  seguidores: number | null;
  leidoEn: string;
}

const FUENTE_LABEL: Record<Fila['fuente'], string> = {
  composio: 'su API, por tu conexión',
  web: 'su web pública',
  ninguna: 'no se pudo leer',
};

const FUENTE_ESTILO: Record<Fila['fuente'], string> = {
  composio: 'border-[var(--color-success)]/40 text-[var(--color-success)]',
  web: 'border-[var(--color-primary)]/40 text-[var(--color-primary)]',
  ninguna: 'border-[var(--color-border)] text-[var(--color-muted-foreground)]',
};

const REDES = ['facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'twitter'] as const;

export function TableroCompetencia({ projectId }: { projectId: string }) {
  const { push } = useToast();
  const [rivales, setRivales] = useState<Rival[]>([]);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [veredicto, setVeredicto] = useState<string[]>([]);
  const [puedeOperar, setPuedeOperar] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [leyendo, setLeyendo] = useState(false);
  const [alta, setAlta] = useState(false);
  const [form, setForm] = useState<{ name: string; website: string; handles: Record<string, string> }>({
    name: '',
    website: '',
    handles: {},
  });

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/competencia`, { cache: 'no-store' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'No se pudo cargar.');
      setRivales(d.rivales ?? []);
      setFilas(d.filas ?? []);
      setVeredicto(d.veredicto ?? []);
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

  async function leer() {
    setLeyendo(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/competencia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'leer' }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'No se pudo leer.');
      setFilas(d.filas ?? []);
      setVeredicto(d.veredicto ?? []);
      push({ title: `${d.lecturas} lecturas`, variant: 'success' });
    } catch (e) {
      push({ title: e instanceof Error ? e.message : 'Error', variant: 'error' });
    } finally {
      setLeyendo(false);
    }
  }

  async function agregar() {
    if (form.name.trim().length < 2) {
      push({ title: 'Dime cómo se llama el rival', variant: 'error' });
      return;
    }
    const res = await fetch(`/api/projects/${projectId}/competencia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const d = await res.json();
    if (!res.ok) {
      push({ title: d.error ?? 'No se pudo', variant: 'error' });
      return;
    }
    if (d.descartados > 0) {
      push({
        title: `${d.descartados} descartados`,
        description: 'Eran perfiles personales. Aquí solo entran páginas de negocio.',
        variant: 'error',
      });
    }
    setForm({ name: '', website: '', handles: {} });
    setAlta(false);
    void cargar();
  }

  async function borrar(id: string) {
    await fetch(`/api/projects/${projectId}/competencia?rival=${id}`, { method: 'DELETE' });
    void cargar();
  }

  if (cargando) return <p className="text-sm text-[var(--color-muted-foreground)]">Cargando…</p>;

  const mios = filas.filter((f) => f.esTuyo);
  const deRivales = filas.filter((f) => !f.esTuyo);

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------- el veredicto */}
      <Card>
        <CardContent className="space-y-2 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <IconBarChart className="h-4 w-4 text-[var(--color-primary)]" />
              Tú contra ellos
            </h2>
            {puedeOperar && (
              <Button size="sm" variant="outline" disabled={leyendo} onClick={() => void leer()}>
                {leyendo ? 'Leyendo…' : 'Volver a leer'}
              </Button>
            )}
          </div>
          {veredicto.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Todavía no hay lecturas. Da de alta a tus rivales y aprieta &quot;Volver a leer&quot;.
            </p>
          ) : (
            <ul className="space-y-1">
              {veredicto.map((v, i) => (
                <li key={i} className="text-sm leading-snug">
                  · {v}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------- tu lado */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Lo que publicas tú</h2>
        {mios.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-[var(--color-muted-foreground)]">
              No se ha leído tu propio ritmo todavía.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {mios.map((f, i) => (
              <FilaLectura key={i} f={f} />
            ))}
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------- los rivales */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Tus rivales ({rivales.length})</h2>
          {puedeOperar && (
            <Button size="sm" variant="outline" onClick={() => setAlta((v) => !v)}>
              <IconPlus className="h-3.5 w-3.5" /> Agregar rival
            </Button>
          )}
        </div>

        {alta && (
          <Card>
            <CardContent className="space-y-3 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium">Nombre</label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Lamudi México"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Su sitio</label>
                  <Input
                    value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                    placeholder="https://www.lamudi.com.mx/"
                  />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {REDES.map((r) => (
                  <div key={r}>
                    <label className="mb-1 block text-[11px] font-medium capitalize">{r}</label>
                    <Input
                      value={form.handles[r] ?? ''}
                      onChange={(e) =>
                        setForm({ ...form, handles: { ...form.handles, [r]: e.target.value } })
                      }
                      placeholder="su página de negocio"
                    />
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-[var(--color-muted-foreground)]">
                Solo páginas de negocio y cuentas de marca. Un perfil personal se descarta al
                guardar: es la regla que evita bans y demandas.
              </p>
              <Button size="sm" className="btn-brand" onClick={() => void agregar()}>
                Guardar rival
              </Button>
            </CardContent>
          </Card>
        )}

        {rivales.length === 0 && !alta && (
          <Card>
            <CardContent className="py-6 text-center text-sm text-[var(--color-muted-foreground)]">
              Todavía no hay rivales. Agrega dos o tres y Goossip los lee cada vez que se lo pidas.
            </CardContent>
          </Card>
        )}

        {rivales.map((r) => {
          const suyas = deRivales.filter((f) => f.quien === r.name);
          return (
            <Card key={r.id}>
              <CardContent className="space-y-2 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{r.name}</p>
                    {r.website && (
                      <a
                        href={r.website}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-xs text-[var(--color-primary)] hover:underline"
                      >
                        {r.website}
                      </a>
                    )}
                  </div>
                  {puedeOperar && (
                    <button
                      type="button"
                      onClick={() => void borrar(r.id)}
                      aria-label={`Quitar ${r.name}`}
                      className="grid h-8 w-8 place-items-center rounded-md text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
                    >
                      <IconTrash className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {suyas.length === 0 ? (
                  <p className="text-xs text-[var(--color-muted-foreground)]">Sin lecturas todavía.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {suyas.map((f, i) => (
                      <FilaLectura key={i} f={f} compacta />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
}

function FilaLectura({ f, compacta = false }: { f: Fila; compacta?: boolean }) {
  const formatos = Object.entries(f.formatos).sort((a, b) => b[1] - a[1]);
  return (
    <div
      className={cn(
        'rounded-lg border border-[var(--color-border)] p-3',
        compacta && 'bg-[var(--color-accent)]/25',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium capitalize">{f.red}</span>
        <Badge variant="outline" className={cn('text-[10px]', FUENTE_ESTILO[f.fuente])}>
          {FUENTE_LABEL[f.fuente]}
        </Badge>
      </div>

      <p className="mt-1 text-sm">
        {f.porSemana !== null ? (
          <>
            <span className="text-lg font-semibold tabular-nums">{f.porSemana}</span>
            <span className="text-xs text-[var(--color-muted-foreground)]"> por semana</span>
          </>
        ) : (
          <span className="text-xs text-[var(--color-muted-foreground)]">sin ritmo medible</span>
        )}
        {f.posts > 0 && (
          <span className="text-xs text-[var(--color-muted-foreground)]">
            {' '}
            · {f.posts} publicaciones leídas
          </span>
        )}
        {f.seguidores !== null && (
          <span className="text-xs text-[var(--color-muted-foreground)]">
            {' '}
            · {f.seguidores} seguidores
          </span>
        )}
      </p>

      {formatos.length > 0 && (
        <p className="mt-0.5 text-[11px] text-[var(--color-muted-foreground)]">
          {formatos.map(([k, n]) => `${k} ${n}`).join(' · ')}
        </p>
      )}

      {f.motivo && (
        <p className="mt-1 text-[11px] leading-snug text-[var(--color-muted-foreground)]">
          {f.motivo}
        </p>
      )}

      <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">
        leído el {new Date(f.leidoEn).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
      </p>
    </div>
  );
}
