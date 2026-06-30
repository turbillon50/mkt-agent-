'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { IconUsers, IconCheck, IconCheckCircle } from '@/components/icons';

export type Segment =
  | { type: 'all' }
  | { type: 'status'; value: string }
  | { type: 'tag'; value: string }
  | { type: 'manual'; ids: string[] };

export type LeadLite = {
  id: string;
  fullName: string | null;
  company: string | null;
  email: string | null;
  status: string;
  unsubscribed?: boolean;
  emailStatus?: string;
};

const STATUS_LABEL: Record<string, string> = {
  new: 'nuevos',
  contacted: 'contactados',
  qualified: 'calificados',
  discarded: 'descartados',
};

type CountState = { loading: boolean; total: number; eligible: number; sample: Array<{ name: string; email: string }> };

export function RecipientsPicker({
  segment,
  onChange,
  tags,
  statuses,
}: {
  segment: Segment;
  onChange: (s: Segment) => void;
  tags: Array<{ tag: string; count: number }>;
  statuses: Record<string, number>;
}) {
  const [count, setCount] = React.useState<CountState>({ loading: true, total: 0, eligible: 0, sample: [] });
  const [leads, setLeads] = React.useState<LeadLite[] | null>(null);
  const [q, setQ] = React.useState('');

  // Conteo real en vivo cada vez que cambia el segmento.
  React.useEffect(() => {
    let alive = true;
    setCount((c) => ({ ...c, loading: true }));
    fetch('/api/mailing/recipients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ segment }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setCount({ loading: false, total: d.total ?? 0, eligible: d.eligible ?? 0, sample: d.sample ?? [] });
      })
      .catch(() => alive && setCount((c) => ({ ...c, loading: false })));
    return () => {
      alive = false;
    };
  }, [JSON.stringify(segment)]);

  // Carga de leads para el modo manual.
  React.useEffect(() => {
    if (segment.type !== 'manual' || leads) return;
    fetch('/api/leads', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setLeads(d.leads ?? []))
      .catch(() => setLeads([]));
  }, [segment.type, leads]);

  const tabs: Array<{ key: Segment['type']; label: string }> = [
    { key: 'all', label: 'Todos' },
    { key: 'status', label: 'Por etapa' },
    { key: 'tag', label: 'Por tag' },
    { key: 'manual', label: 'Manual' },
  ];

  function pickTab(key: Segment['type']) {
    if (key === 'all') onChange({ type: 'all' });
    else if (key === 'status') onChange({ type: 'status', value: Object.keys(statuses)[0] ?? 'new' });
    else if (key === 'tag') onChange({ type: 'tag', value: tags[0]?.tag ?? '' });
    else onChange({ type: 'manual', ids: [] });
  }

  const selected = segment.type === 'manual' ? new Set(segment.ids) : new Set<string>();
  const filteredLeads = (leads ?? []).filter((l) => {
    if (!l.email) return false;
    if (!q.trim()) return true;
    const hay = `${l.fullName ?? ''} ${l.company ?? ''} ${l.email}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  function toggleLead(id: string) {
    if (segment.type !== 'manual') return;
    const next = new Set(segment.ids);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange({ type: 'manual', ids: [...next] });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => pickTab(t.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              segment.type === t.key
                ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                : 'border border-[var(--color-border)] hover:bg-[var(--color-accent)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {segment.type === 'status' && (
        <select
          value={segment.value}
          onChange={(e) => onChange({ type: 'status', value: e.target.value })}
          className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
        >
          {Object.entries(statuses).length === 0 && <option value="new">Sin prospectos aún</option>}
          {Object.entries(statuses).map(([s, n]) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s] ?? s} ({n})
            </option>
          ))}
        </select>
      )}

      {segment.type === 'tag' && (
        <>
          {tags.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--color-border)] p-3 text-xs text-[var(--color-muted-foreground)]">
              Aún no hay tags en tus prospectos. Agrégalos desde el tablero de Prospectos para segmentar por tag.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <button
                  key={t.tag}
                  type="button"
                  onClick={() => onChange({ type: 'tag', value: t.tag })}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    segment.value === t.tag
                      ? 'bg-[var(--color-accent)] text-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/40'
                      : 'border border-[var(--color-border)] hover:bg-[var(--color-accent)]'
                  }`}
                >
                  #{t.tag} · {t.count}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {segment.type === 'manual' && (
        <div className="rounded-xl border border-[var(--color-border)]">
          <div className="border-b border-[var(--color-border)] p-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar prospecto…" className="h-8" />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {leads === null ? (
              <p className="p-3 text-xs text-[var(--color-muted-foreground)]">Cargando prospectos…</p>
            ) : filteredLeads.length === 0 ? (
              <p className="p-3 text-xs text-[var(--color-muted-foreground)]">
                No hay prospectos con correo {q ? 'que coincidan' : 'todavía'}.
              </p>
            ) : (
              filteredLeads.map((l) => {
                const on = selected.has(l.id);
                const blocked = l.unsubscribed || ['bounced', 'complained', 'invalid'].includes(l.emailStatus ?? '');
                return (
                  <button
                    key={l.id}
                    type="button"
                    disabled={blocked}
                    onClick={() => toggleLead(l.id)}
                    className={`flex w-full items-center gap-2 border-b border-[var(--color-border)] px-3 py-2 text-left text-xs last:border-0 ${
                      blocked ? 'cursor-not-allowed opacity-50' : 'hover:bg-[var(--color-accent)]'
                    }`}
                  >
                    <span
                      className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
                        on ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white' : 'border-[var(--color-border)]'
                      }`}
                    >
                      {on && <IconCheck className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{l.fullName ?? l.company ?? l.email}</span>{' '}
                      <span className="text-[var(--color-muted-foreground)]">{l.email}</span>
                    </span>
                    {blocked && <span className="shrink-0 text-[10px] text-[var(--color-muted-foreground)]">no contactable</span>}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Conteo real de destinatarios */}
      <div className="flex items-center gap-2 rounded-lg bg-[var(--color-accent)]/50 px-3 py-2 text-xs">
        <IconUsers className="h-4 w-4 text-[var(--color-primary)]" />
        {count.loading ? (
          <span className="text-[var(--color-muted-foreground)]">Calculando destinatarios…</span>
        ) : (
          <span>
            <span className="font-semibold text-[var(--color-foreground)]">{count.eligible}</span> destinatario
            {count.eligible === 1 ? '' : 's'} recibirán este correo
            {count.total > count.eligible && (
              <span className="text-[var(--color-muted-foreground)]">
                {' '}
                · {count.total - count.eligible} sin correo / dados de baja / con rebote (excluidos)
              </span>
            )}
          </span>
        )}
      </div>
      {!count.loading && count.sample.length > 0 && (
        <p className="flex items-start gap-1.5 px-1 text-[11px] text-[var(--color-muted-foreground)]">
          <IconCheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-[var(--color-success)]" />
          <span>Ej: {count.sample.map((s) => s.email).join(', ')}{count.eligible > count.sample.length ? '…' : ''}</span>
        </p>
      )}
    </div>
  );
}

export function segmentLabel(s: Segment, tags?: Array<{ tag: string }>): string {
  if (s.type === 'all') return 'Todos los prospectos';
  if (s.type === 'status') return `Etapa: ${STATUS_LABEL[s.value] ?? s.value}`;
  if (s.type === 'tag') return `Tag: #${s.value}`;
  return `${s.ids.length} seleccionados a mano`;
}
