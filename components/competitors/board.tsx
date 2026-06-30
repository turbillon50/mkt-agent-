'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconBarChart, IconPlus, IconClose } from '@/components/icons';
import { useToast } from '@/components/ui/toast-provider';

type Snapshot = {
  id: string;
  label: string;
  url: string;
  kind: string;
  title: string | null;
  description: string | null;
  error: string | null;
};

export function CompetitorsBoard() {
  const { push } = useToast();
  const [items, setItems] = React.useState<Snapshot[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [label, setLabel] = React.useState('');
  const [url, setUrl] = React.useState('');
  const [kind, setKind] = React.useState<'own' | 'competitor'>('competitor');
  const [adding, setAdding] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/competitors', { cache: 'no-store' });
      const data = await res.json();
      setItems(data.links ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    refresh();
  }, []);

  async function add() {
    if (adding || !label.trim() || !url.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch('/api/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim(), url: url.trim(), kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al agregar');
      setLabel('');
      setUrl('');
      await refresh();
      push({ variant: 'success', title: 'Agregado', description: `${data.link?.label ?? ''} en la comparativa.` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido';
      setError(msg);
      push({ variant: 'error', title: 'No se pudo agregar', description: msg });
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      const res = await fetch(`/api/competitors/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('No se pudo quitar');
      push({ variant: 'info', title: 'Link eliminado' });
    } catch {
      push({ variant: 'error', title: 'No se pudo quitar el link' });
      await refresh();
    }
  }

  const own = items.filter((i) => i.kind === 'own');
  const competitors = items.filter((i) => i.kind === 'competitor');

  return (
    <div className="space-y-4">
      <Card className="card-glow">
        <CardHeader>
          <CardTitle className="text-base">Agregar para comparar</CardTitle>
          <CardDescription>
            Marca tus propias redes o sitio, y las de la competencia. Goossip trae el título y
            descripción pública de cada uno cada vez que entras a esta pantalla.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto_auto]">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Etiqueta (ej. Zuxen MX)" />
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as 'own' | 'competitor')}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm"
            >
              <option value="competitor">Competencia</option>
              <option value="own">Propio</option>
            </select>
            <Button onClick={add} disabled={adding} className="btn-brand shrink-0">
              <IconPlus className="h-4 w-4" /> {adding ? '…' : 'Agregar'}
            </Button>
          </div>
          {error && <p className="mt-2 text-xs text-[var(--color-destructive)]">{error}</p>}
        </CardContent>
      </Card>

      {loading ? (
        <Card className="card-glow">
          <CardContent className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">
            Cargando…
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card className="card-glow">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <IconBarChart className="h-8 w-8 text-[var(--color-muted-foreground)]" />
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Agrega tu primer link arriba — el tuyo y el de un competidor — para empezar a comparar.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <div className="px-1 text-xs font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Tuyo
            </div>
            {own.length === 0 && (
              <p className="px-1 text-xs text-[var(--color-muted-foreground)]">Sin links propios todavía.</p>
            )}
            {own.map((i) => (
              <SnapshotCard key={i.id} item={i} onRemove={remove} />
            ))}
          </div>
          <div className="space-y-2">
            <div className="px-1 text-xs font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Competencia
            </div>
            {competitors.length === 0 && (
              <p className="px-1 text-xs text-[var(--color-muted-foreground)]">Sin competidores agregados todavía.</p>
            )}
            {competitors.map((i) => (
              <SnapshotCard key={i.id} item={i} onRemove={remove} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SnapshotCard({ item, onRemove }: { item: Snapshot; onRemove: (id: string) => void }) {
  return (
    <Card className="card-glow">
      <CardContent className="space-y-1.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-medium">{item.label}</span>
            {item.error ? (
              <Badge variant="outline" className="text-[var(--color-destructive)]">
                {item.error}
              </Badge>
            ) : null}
          </div>
          <button
            onClick={() => onRemove(item.id)}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
            aria-label="Quitar"
          >
            <IconClose className="h-3.5 w-3.5" />
          </button>
        </div>
        {item.title && <p className="text-xs font-medium">{item.title}</p>}
        {item.description && (
          <p className="line-clamp-3 text-xs text-[var(--color-muted-foreground)]">{item.description}</p>
        )}
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-[11px] text-[var(--color-primary)] hover:underline"
        >
          {item.url} →
        </a>
      </CardContent>
    </Card>
  );
}
