'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { IconSparkles, IconCheck } from '@/components/icons';
import { useToast } from '@/components/ui/toast-provider';

type Candidate = {
  url: string;
  label: string;
  snippet: string | null;
  address?: string | null;
  phone?: string | null;
  rating?: string | null;
  source: 'maps' | 'web';
};

export function ProspectSearch({ onAdded }: { onAdded?: () => void }) {
  const { push } = useToast();
  const [query, setQuery] = React.useState('');
  const [searching, setSearching] = React.useState(false);
  const [candidates, setCandidates] = React.useState<Candidate[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [adding, setAdding] = React.useState(false);
  const [searched, setSearched] = React.useState(false);

  async function search() {
    if (searching || !query.trim()) return;
    setSearching(true);
    setSearched(false);
    setCandidates([]);
    setSelected(new Set());
    try {
      const res = await fetch('/api/leads/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo buscar');
      const list: Candidate[] = data.candidates ?? [];
      setCandidates(list);
      setSelected(new Set(list.map((c) => c.url)));
    } catch (e) {
      push({ variant: 'error', title: 'No se pudo buscar', description: e instanceof Error ? e.message : 'error' });
    } finally {
      setSearching(false);
      setSearched(true);
    }
  }

  function toggle(url: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  async function addSelected() {
    const picked = candidates.filter((c) => selected.has(c.url));
    if (picked.length === 0 || adding) return;
    setAdding(true);
    try {
      const res = await fetch('/api/leads/search', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidates: picked }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo agregar');
      push({
        variant: 'success',
        title: `${data.created} prospecto${data.created === 1 ? '' : 's'} agregado${data.created === 1 ? '' : 's'}`,
        description: data.failed ? `${data.failed} no se pudieron leer.` : undefined,
      });
      setCandidates([]);
      setQuery('');
      onAdded?.();
    } catch (e) {
      push({ variant: 'error', title: 'No se pudo agregar', description: e instanceof Error ? e.message : 'error' });
    } finally {
      setAdding(false);
    }
  }

  return (
    <Card className="card-glow">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <IconSparkles className="h-4 w-4 text-[var(--color-primary)]" />
          Buscador de prospectos
        </CardTitle>
        <CardDescription>
          Describe a quién buscas (ej. "agencias de marketing digital en Cancún") y Goossip busca
          negocios reales — usa Google Maps si está conectado (dirección, teléfono, rating reales),
          y si no, Google Search con verificación de fuente. Nunca inventa nombres ni links.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="ej. clínicas dentales en Cancún"
          />
          <Button onClick={search} disabled={searching || !query.trim()} className="btn-brand shrink-0">
            {searching ? 'Buscando…' : 'Buscar'}
          </Button>
        </div>

        {searched && candidates.length === 0 && !searching && (
          <p className="text-xs text-[var(--color-muted-foreground)]">
            No encontré resultados verificables para esa búsqueda. Intenta ser más específico (ciudad,
            giro del negocio).
          </p>
        )}

        {candidates.length > 0 && (
          <div className="space-y-2">
            <div className="grid gap-1.5">
              {candidates.map((c) => (
                <button
                  key={c.url}
                  onClick={() => toggle(c.url)}
                  className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    selected.has(c.url)
                      ? 'border-[var(--color-primary)]/40 bg-[var(--color-accent)]'
                      : 'border-[var(--color-border)] hover:bg-[var(--color-accent)]/50'
                  }`}
                >
                  <span
                    className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border ${
                      selected.has(c.url)
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                        : 'border-[var(--color-border)]'
                    }`}
                  >
                    {selected.has(c.url) && <IconCheck className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-medium">{c.label}</span>
                      {c.source === 'maps' && (
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          Maps
                        </Badge>
                      )}
                    </span>
                    {c.snippet && (
                      <span className="block truncate text-xs text-[var(--color-muted-foreground)]">{c.snippet}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
            <Button onClick={addSelected} disabled={adding || selected.size === 0} className="btn-brand">
              {adding ? 'Agregando…' : `Agregar ${selected.size} seleccionado${selected.size === 1 ? '' : 's'}`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
