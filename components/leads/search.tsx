'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { IconSparkles, IconCheck, IconChevronDown } from '@/components/icons';
import { useToast } from '@/components/ui/toast-provider';

type Candidate = {
  url: string;
  label: string;
  snippet: string | null;
  address?: string | null;
  phone?: string | null;
  rating?: string | null;
  source: 'maps' | 'web' | 'linkedin';
  aiReason?: string | null;
};

export function ProspectSearch({ onAdded }: { onAdded?: () => void }) {
  const { push } = useToast();
  const [query, setQuery] = React.useState('');
  const [searching, setSearching] = React.useState(false);
  const [candidates, setCandidates] = React.useState<Candidate[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [adding, setAdding] = React.useState(false);
  const [searched, setSearched] = React.useState(false);
  const [showFilters, setShowFilters] = React.useState(false);
  const [mapsReady, setMapsReady] = React.useState<boolean | null>(null);

  // filtros
  const [minRating, setMinRating] = React.useState('');
  const [requirePhone, setRequirePhone] = React.useState(false);
  const [requireWebsite, setRequireWebsite] = React.useState(false);
  const [maxResults, setMaxResults] = React.useState('14');
  const [aiPrompt, setAiPrompt] = React.useState('');

  React.useEffect(() => {
    fetch('/api/leads/search', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setMapsReady(Boolean(d.mapsAvailable)))
      .catch(() => setMapsReady(false));
  }, []);

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
        body: JSON.stringify({
          query: query.trim(),
          minRating: minRating ? parseFloat(minRating) : undefined,
          requirePhone,
          requireWebsite,
          maxResults: maxResults ? parseInt(maxResults, 10) : undefined,
          aiPrompt: aiPrompt.trim() || undefined,
        }),
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

  const activeFilterCount = [minRating, requirePhone, requireWebsite, aiPrompt.trim()].filter(Boolean).length;

  return (
    <Card className="card-glow">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <IconSparkles className="h-4 w-4 text-[var(--color-primary)]" />
          Buscador de prospectos
        </CardTitle>
        <CardDescription>
          Describe a quién buscas (ej. "agencias de marketing digital en Cancún").{' '}
          {mapsReady ? 'Usa Google Maps — datos reales' : 'Usa Google Search verificado'} (dirección,
          teléfono, rating). Nunca inventa nombres ni links.
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

        <button
          onClick={() => setShowFilters((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <IconChevronDown className={`h-3.5 w-3.5 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          Filtros{activeFilterCount > 0 ? ` (${activeFilterCount} activos)` : ''}
        </button>

        {showFilters && (
          <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="text-xs">
                <span className="mb-1 block text-[var(--color-muted-foreground)]">Rating mínimo</span>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="5"
                  value={minRating}
                  onChange={(e) => setMinRating(e.target.value)}
                  placeholder="ej. 4"
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-[var(--color-muted-foreground)]">Cuántos resultados</span>
                <Input
                  type="number"
                  min="1"
                  max="20"
                  value={maxResults}
                  onChange={(e) => setMaxResults(e.target.value)}
                />
              </label>
              <div className="flex items-end gap-3 pb-1.5 text-xs">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={requirePhone} onChange={(e) => setRequirePhone(e.target.checked)} />
                  Con teléfono
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={requireWebsite} onChange={(e) => setRequireWebsite(e.target.checked)} />
                  Con sitio web
                </label>
              </div>
            </div>
            <label className="block text-xs">
              <span className="mb-1 flex items-center gap-1.5 text-[var(--color-muted-foreground)]">
                <IconSparkles className="h-3 w-3" /> Filtro por IA (prompt libre, opcional)
              </span>
              <Input
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder='ej. "solo negocios boutique, descarta cadenas grandes"'
              />
            </label>
          </div>
        )}

        {searched && candidates.length === 0 && !searching && (
          <p className="text-xs text-[var(--color-muted-foreground)]">
            No encontré resultados verificables (o los filtros descartaron todo). Intenta ser más
            específico o aflojar los filtros.
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
                    {c.aiReason && (
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--color-primary)]">
                        <IconSparkles className="h-2.5 w-2.5" /> {c.aiReason}
                      </span>
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
