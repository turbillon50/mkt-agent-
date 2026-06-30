'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { IconSparkles, IconCheck, IconLinkedIn } from '@/components/icons';
import { useToast } from '@/components/ui/toast-provider';

type Candidate = {
  url: string;
  label: string;
  snippet: string | null;
  address?: string | null;
  phone?: string | null;
  rating?: string | null;
  source: 'maps' | 'web' | 'linkedin';
};

type Mode = 'business' | 'linkedin';

export function ProspectSearch({ onAdded }: { onAdded?: () => void }) {
  const { push } = useToast();
  const [mode, setMode] = React.useState<Mode>('business');
  const [linkedinReady, setLinkedinReady] = React.useState<boolean | null>(null);
  const [query, setQuery] = React.useState('');
  const [searching, setSearching] = React.useState(false);
  const [candidates, setCandidates] = React.useState<Candidate[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [adding, setAdding] = React.useState(false);
  const [searched, setSearched] = React.useState(false);

  React.useEffect(() => {
    fetch('/api/leads/search', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setLinkedinReady(Boolean(d.linkedinAvailable)))
      .catch(() => setLinkedinReady(false));
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
        body: JSON.stringify({ query: query.trim(), mode }),
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
          {mode === 'business'
            ? 'Describe a quién buscas (ej. "agencias de marketing digital en Cancún"). Usa Google Maps si está conectado (datos reales), o Google Search verificado. Nunca inventa nombres ni links.'
            : 'Busca personas reales en LinkedIn usando tu propia sesión logueada. Riesgo real: úsalo con moderación para no levantar banderas de spam en tu cuenta.'}
        </CardDescription>
        <div className="mt-2 flex gap-1.5">
          <button
            onClick={() => {
              setMode('business');
              setCandidates([]);
              setSearched(false);
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              mode === 'business' ? 'btn-brand' : 'border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]'
            }`}
          >
            Negocios
          </button>
          <button
            onClick={() => {
              setMode('linkedin');
              setCandidates([]);
              setSearched(false);
            }}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              mode === 'linkedin' ? 'btn-brand' : 'border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]'
            }`}
          >
            <IconLinkedIn className="h-3 w-3" /> Personas en LinkedIn
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {mode === 'linkedin' && linkedinReady === false && (
          <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/50 p-2.5 text-xs text-[var(--color-muted-foreground)]">
            Falta loguearse en el Navegador Vulcano una vez para activar esto. Avísale al admin.
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder={mode === 'business' ? 'ej. clínicas dentales en Cancún' : 'ej. directores de marketing en Cancún'}
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
                      {c.source === 'linkedin' && (
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          LinkedIn
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
