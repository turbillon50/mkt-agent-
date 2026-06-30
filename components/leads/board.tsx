'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconUsers, IconPlus, IconClose, IconCheck, IconSparkles } from '@/components/icons';
import { useToast } from '@/components/ui/toast-provider';

type Lead = {
  id: string;
  sourceUrl: string;
  platform: string;
  source: string;
  fullName: string | null;
  headline: string | null;
  company: string | null;
  address: string | null;
  phone: string | null;
  rating: string | null;
  summary: string | null;
  status: string;
  draftMessage: string | null;
  createdAt: string;
};

const STATUS_LABEL: Record<string, string> = {
  new: 'nuevo',
  contacted: 'contactado',
  qualified: 'calificado',
  discarded: 'descartado',
};

const STATUS_ORDER = ['new', 'contacted', 'qualified', 'discarded'];

// Normaliza para búsqueda: minúsculas + sin acentos, para que "cancun"
// encuentre "Cancún" y "jose" encuentre "José".
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function LeadsBoard() {
  const { push } = useToast();
  const [leads, setLeads] = React.useState<Lead[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [url, setUrl] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [messagePrompt, setMessagePrompt] = React.useState('');
  const [generating, setGenerating] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');

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
      push({
        variant: 'success',
        title: 'Prospecto agregado',
        description: data.lead?.fullName ? `Se detectó: ${data.lead.fullName}` : 'Guardado correctamente.',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido';
      setError(msg);
      push({ variant: 'error', title: 'No se pudo agregar', description: msg });
    } finally {
      setAdding(false);
    }
  }

  async function setStatus(id: string, status: string) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('No se pudo actualizar');
    } catch {
      push({ variant: 'error', title: 'No se pudo actualizar el status' });
      await refresh();
    }
  }

  async function remove(id: string) {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    try {
      const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('No se pudo quitar');
      push({ variant: 'info', title: 'Prospecto eliminado' });
    } catch {
      push({ variant: 'error', title: 'No se pudo quitar el prospecto' });
      await refresh();
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function generateMessages() {
    const leadIds = Array.from(selected);
    if (leadIds.length === 0 || generating) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/leads/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds, prompt: messagePrompt.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo generar');
      const byId = new Map((data.leads as Lead[]).map((l) => [l.id, l]));
      setLeads((prev) => prev.map((l) => byId.get(l.id) ?? l));
      push({
        variant: 'success',
        title: `${leadIds.length} mensaje${leadIds.length === 1 ? '' : 's'} listo${leadIds.length === 1 ? '' : 's'}`,
        description: 'Cada uno es distinto a propósito — no copies el mismo texto a todos.',
      });
    } catch (e) {
      push({ variant: 'error', title: 'No se pudo generar', description: e instanceof Error ? e.message : 'error' });
    } finally {
      setGenerating(false);
    }
  }

  function copyMessage(text: string) {
    navigator.clipboard?.writeText(text).then(() => {
      push({ variant: 'success', title: 'Copiado' });
    });
  }

  // Conteos por status (pipeline) sobre TODOS los leads, sin importar el texto buscado.
  const counts = React.useMemo(() => {
    const c: Record<string, number> = { all: leads.length, new: 0, contacted: 0, qualified: 0, discarded: 0 };
    for (const l of leads) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [leads]);

  // Búsqueda full-text (nombre, empresa, cargo, teléfono, dirección, resumen, link) + filtro de status.
  const filtered = React.useMemo(() => {
    const q = norm(search.trim());
    return leads.filter((l) => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = norm(
        [l.fullName, l.company, l.headline, l.phone, l.address, l.summary, l.sourceUrl, l.platform]
          .filter(Boolean)
          .join(' '),
      );
      return q.split(/\s+/).every((term) => haystack.includes(term));
    });
  }, [leads, search, statusFilter]);

  return (
    <div className="space-y-4">
      <Card className="card-glow">
        <CardHeader>
          <CardTitle className="text-base">Agregar prospecto manual</CardTitle>
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

      {selected.size > 0 && (
        <Card className="card-glow border-[var(--color-primary)]/30">
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <IconSparkles className="h-4 w-4 text-[var(--color-primary)]" />
              {selected.size} seleccionado{selected.size === 1 ? '' : 's'} — generar mensajes personalizados
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={messagePrompt}
                onChange={(e) => setMessagePrompt(e.target.value)}
                placeholder="Instrucción opcional (ej. invítalos a una demo gratis de 15 min)"
              />
              <Button onClick={generateMessages} disabled={generating} className="btn-brand shrink-0">
                {generating ? 'Redactando…' : 'Generar mensajes'}
              </Button>
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Cada mensaje se redacta por separado y distinto a propósito — mandar el mismo texto a
              todos es justo lo que hace que las redes detecten spam.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && leads.length > 0 && (
        <Card className="card-glow">
          <CardContent className="space-y-3 p-4">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar en tus contactos (nombre, empresa, teléfono, ciudad…)"
            />
            <div className="flex flex-wrap items-center gap-2">
              {(['all', ...STATUS_ORDER] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                    statusFilter === s
                      ? 'btn-brand font-medium'
                      : 'border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]'
                  }`}
                >
                  {s === 'all' ? 'todos' : STATUS_LABEL[s]} ({counts[s] ?? 0})
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
              Aún no tienes prospectos. Búscalos arriba o pega un link.
            </p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="card-glow">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <IconUsers className="h-8 w-8 text-[var(--color-muted-foreground)]" />
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Ningún contacto coincide con tu búsqueda o filtro.
            </p>
            <button
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
              }}
              className="text-xs font-medium text-[var(--color-primary)] hover:underline"
            >
              Limpiar filtros
            </button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((l) => (
            <Card key={l.id} className={`card-glow ${selected.has(l.id) ? 'border-[var(--color-primary)]/40' : ''}`}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => toggleSelect(l.id)}
                    className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border ${
                      selected.has(l.id)
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                        : 'border-[var(--color-border)]'
                    }`}
                  >
                    {selected.has(l.id) && <IconCheck className="h-3 w-3" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{l.fullName ?? 'Sin nombre detectado'}</span>
                      <Badge variant="outline">{l.platform}</Badge>
                      {l.source === 'maps' && (
                        <Badge variant="outline" className="text-[10px]">
                          Maps
                        </Badge>
                      )}
                    </div>
                    {l.headline && (
                      <p className="text-xs text-[var(--color-muted-foreground)]">{l.headline}</p>
                    )}
                    {(l.phone || l.rating) && (
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        {[l.phone, l.rating ? `${l.rating}★` : null].filter(Boolean).join(' · ')}
                      </p>
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
                  <p className="line-clamp-2 pl-7 text-xs text-[var(--color-muted-foreground)]">{l.summary}</p>
                )}
                {l.draftMessage && (
                  <div className="ml-7 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-2.5">
                    <p className="whitespace-pre-wrap text-xs">{l.draftMessage}</p>
                    <button
                      onClick={() => copyMessage(l.draftMessage!)}
                      className="mt-1.5 text-[11px] font-medium text-[var(--color-primary)] hover:underline"
                    >
                      Copiar mensaje
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 pl-7 pt-1">
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
                    Ver →
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
