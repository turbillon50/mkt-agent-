'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconUsers, IconPlus, IconShare, IconClose, IconArrowUpRight } from '@/components/icons';
import { useToast } from '@/components/ui/toast-provider';

type Referral = {
  id: string;
  code: string;
  name: string | null;
  visits: number;
  leadsGenerated: number;
  salesGenerated: number;
  level: string;
};

type LeadOption = { id: string; fullName: string | null; email: string | null };

const LEVEL_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  bronce: { bg: '#f3e3d3', fg: '#8a5a2b', label: 'Bronce' },
  plata: { bg: '#e6e8ec', fg: '#5b6573', label: 'Plata' },
  oro: { bg: '#fbeec2', fg: '#946c0e', label: 'Oro' },
};

function LevelBadge({ level }: { level: string }) {
  const s = LEVEL_STYLE[level] ?? LEVEL_STYLE.bronce;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 999,
        background: s.bg,
        color: s.fg,
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      {s.label}
    </span>
  );
}

export function EmbajadoresWorkspace() {
  const { push } = useToast();
  const [referrals, setReferrals] = React.useState<Referral[] | null>(null);
  const [leads, setLeads] = React.useState<LeadOption[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [origin, setOrigin] = React.useState('');

  const [name, setName] = React.useState('');
  const [leadId, setLeadId] = React.useState('');

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const load = React.useCallback(async () => {
    try {
      const r = await fetch('/api/referrals', { cache: 'no-store' });
      const d = await r.json();
      if (r.ok) setReferrals(d.referrals ?? []);
      else throw new Error(d.error ?? 'Error al cargar');
    } catch (e) {
      setReferrals([]);
      push({
        title: 'No se pudieron cargar los embajadores',
        description: String(e instanceof Error ? e.message : e),
        variant: 'error',
      });
    }
  }, [push]);

  const loadLeads = React.useCallback(async () => {
    try {
      const r = await fetch('/api/leads', { cache: 'no-store' });
      if (!r.ok) return; // si falla, simplemente omitimos el selector
      const d = await r.json();
      setLeads(Array.isArray(d.leads) ? d.leads : []);
    } catch {
      /* selector opcional: si falla, no pasa nada */
    }
  }, []);

  React.useEffect(() => {
    load();
    loadLeads();
  }, [load, loadLeads]);

  const create = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name || null, leadId: leadId || null }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Error al crear');
      push({ title: '¡Embajador creado!', description: 'Ya puedes copiar su link y compartirlo.', variant: 'success' });
      setName('');
      setLeadId('');
      load();
    } catch (e) {
      push({ title: 'No se pudo crear', description: String(e instanceof Error ? e.message : e), variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const addSale = async (ref: Referral) => {
    try {
      const r = await fetch(`/api/referrals/${ref.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addSale' }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? 'Error');
      push({ title: '+1 venta registrada', description: ref.name ?? ref.code, variant: 'success' });
      load();
    } catch (e) {
      push({ title: 'No se pudo registrar', description: String(e instanceof Error ? e.message : e), variant: 'error' });
    }
  };

  const remove = async (ref: Referral) => {
    if (!confirm(`¿Eliminar al embajador "${ref.name ?? ref.code}"?`)) return;
    try {
      const r = await fetch(`/api/referrals/${ref.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Error');
      push({ title: 'Embajador eliminado', variant: 'success' });
      load();
    } catch (e) {
      push({ title: 'No se pudo eliminar', description: String(e instanceof Error ? e.message : e), variant: 'error' });
    }
  };

  const copyLink = async (ref: Referral) => {
    const url = `${origin}/ref/${ref.code}`;
    try {
      await navigator.clipboard.writeText(url);
      push({ title: 'Link copiado', description: url, variant: 'success' });
    } catch {
      push({ title: 'Copia el link manualmente', description: url, variant: 'info' });
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      {/* Crear */}
      <Card className="h-fit">
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <IconUsers className="h-4 w-4 text-[var(--color-primary)]" /> Nuevo embajador
          </div>
          <Input placeholder="Nombre del embajador (ej. Ana López)" value={name} onChange={(e) => setName(e.target.value)} />
          {leads.length > 0 ? (
            <div>
              <div className="mb-1.5 text-xs font-medium text-[var(--color-muted-foreground)]">
                Vincular a un lead existente (opcional)
              </div>
              <select
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-foreground)]"
              >
                <option value="">Sin vincular</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.fullName || l.email || l.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <Button onClick={create} disabled={busy} className="w-full">
            <IconPlus className="h-4 w-4" /> {busy ? 'Creando…' : 'Crear embajador'}
          </Button>
        </CardContent>
      </Card>

      {/* Ranking */}
      <div className="space-y-4">
        {referrals === null ? (
          <div className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">Cargando embajadores…</div>
        ) : referrals.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="mb-2 text-3xl">🤝</div>
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Aún no tienes embajadores. Crea el primero y comparte su link para empezar a medir referidos.
              </p>
            </CardContent>
          </Card>
        ) : (
          referrals.map((ref, i) => (
            <Card key={ref.id}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[var(--color-muted-foreground)]">#{i + 1}</span>
                      <h3 className="truncate font-semibold">{ref.name || 'Embajador'}</h3>
                      <LevelBadge level={ref.level} />
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-[var(--color-muted-foreground)]">{ref.code}</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="text-[var(--color-muted-foreground)]">
                    Visitas: <b className="text-[var(--color-foreground)]">{ref.visits}</b>
                  </span>
                  <span className="text-[var(--color-muted-foreground)]">
                    Leads: <b className="text-[var(--color-foreground)]">{ref.leadsGenerated}</b>
                  </span>
                  <span className="text-[var(--color-muted-foreground)]">
                    Ventas: <b className="text-[var(--color-foreground)]">{ref.salesGenerated}</b>
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => copyLink(ref)}>
                    <IconShare className="h-3.5 w-3.5" /> Copiar link
                  </Button>
                  <a href={`/ref/${ref.code}`} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="ghost">
                      Ver página
                    </Button>
                  </a>
                  <Button size="sm" variant="ghost" onClick={() => addSale(ref)}>
                    <IconArrowUpRight className="h-3.5 w-3.5" /> +1 venta
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-[var(--color-destructive)]"
                    onClick={() => remove(ref)}
                  >
                    <IconClose className="h-3.5 w-3.5" /> Eliminar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
