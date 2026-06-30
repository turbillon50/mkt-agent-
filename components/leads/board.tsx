'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconUsers, IconPlus, IconClose } from '@/components/icons';

type Lead = {
  id: string;
  sourceUrl: string;
  platform: string;
  fullName: string | null;
  headline: string | null;
  company: string | null;
  summary: string | null;
  status: string;
  createdAt: string;
};

const STATUS_LABEL: Record<string, string> = {
  new: 'nuevo',
  contacted: 'contactado',
  qualified: 'calificado',
  discarded: 'descartado',
};

const STATUS_ORDER = ['new', 'contacted', 'qualified', 'discarded'];

export function LeadsBoard() {
  const [leads, setLeads] = React.useState<Lead[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [url, setUrl] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/leads', { cache: 'no-store' });
      const data = await res.json();
      setLeads(data.leads ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    refresh();
  }, []);

  async function addLead() {
    if (adding || !url.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceUrl: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al agregar el lead');
      setUrl('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setAdding(false);
    }
  }

  async function setStatus(id: string, status: string) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  }

  async function remove(id: string) {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    await fetch(`/api/leads/${id}`, { method: 'DELETE' });
  }

  return (
    <div className="space-y-4">
      <Card className="card-glow">
        <CardHeader>
          <CardTitle className="text-base">Agregar prospecto</CardTitle>
          <CardDescription>
            Pega el link de un perfil público (LinkedIn, X, sitio web). Goossip saca nombre, cargo
            y resumen automáticamente de la información pública de esa página.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addLead()}
              placeholder="https://www.linkedin.com/in/..."
            />
            <Button onClick={addLead} disabled={adding || !url.trim()} className="btn-brand shrink-0">
              <IconPlus className="h-4 w-4" /> {adding ? 'Agregando…' : 'Agregar'}
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
      ) : leads.length === 0 ? (
        <Card className="card-glow">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <IconUsers className="h-8 w-8 text-[var(--color-muted-foreground)]" />
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Aún no tienes prospectos. Pega un link arriba para agregar el primero.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {leads.map((l) => (
            <Card key={l.id} className="card-glow">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{l.fullName ?? 'Sin nombre detectado'}</span>
                      <Badge variant="outline">{l.platform}</Badge>
                    </div>
                    {l.headline && (
                      <p className="text-xs text-[var(--color-muted-foreground)]">{l.headline}</p>
                    )}
                  </div>
                  <button
                    onClick={() => remove(l.id)}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
                    aria-label="Quitar"
                  >
                    <IconClose className="h-3.5 w-3.5" />
                  </button>
                </div>
                {l.summary && (
                  <p className="line-clamp-2 text-xs text-[var(--color-muted-foreground)]">{l.summary}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {STATUS_ORDER.map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatus(l.id, s)}
                      className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                        l.status === s
                          ? 'btn-brand font-medium'
                          : 'border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]'
                      }`}
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                  <a
                    href={l.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto text-[11px] text-[var(--color-primary)] hover:underline"
                  >
                    Ver perfil →
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
