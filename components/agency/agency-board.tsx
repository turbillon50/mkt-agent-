'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast-provider';
import { IconPlus } from '@/components/icons';
import { ProjectForm } from '@/components/projects/project-form';
import type { ChannelStatus } from '@/src/sales/projects';

interface AgencyProject {
  id: string;
  name: string;
  slug: string;
  kind: string;
  status: string;
  channels: ChannelStatus;
  rules: number;
  usage: { leads: number; messages: number; actions: number };
}

interface Tenant {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  createdAt: string;
  projects: AgencyProject[];
}

interface PendingAction {
  id: string;
  kind: string;
  reason: string | null;
  createdBy: string;
  createdAt: string;
  project: string;
  tenant: string;
  lead: string | null;
}

function Chip({ on, label }: { on: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)]/60 px-2 py-0.5 text-[11px]">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: on ? '#2ba87a' : 'transparent', border: on ? 'none' : '1px solid currentColor' }}
      />
      {label}
    </span>
  );
}

export function AgencyBoard() {
  const { push } = useToast();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [pendientes, setPendientes] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newProjectFor, setNewProjectFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agency');
      const data = await res.json();
      if (res.status === 403) throw new Error('Este panel es solo para administradores de la agencia.');
      if (!res.ok) throw new Error(data.error ?? 'error');
      setTenants(data.tenants ?? []);
      setPendientes(data.pendientes ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, decision: 'approve' | 'reject') {
    const res = await fetch(`/api/queue/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    const data = await res.json();
    if (!res.ok) {
      push({ title: 'No se pudo', description: data.error ?? '', variant: 'error' });
      return;
    }
    setPendientes((p) => p.filter((a) => a.id !== id));
    push({ title: decision === 'approve' ? 'Aprobada' : 'Rechazada', variant: 'success' });
  }

  const totales = tenants.reduce(
    (acc, t) => {
      for (const p of t.projects) {
        acc.proyectos++;
        acc.leads += p.usage.leads;
        acc.mensajes += p.usage.messages;
        acc.acciones += p.usage.actions;
      }
      return acc;
    },
    { proyectos: 0, leads: 0, mensajes: 0, acciones: 0 },
  );

  if (loading) return <p className="text-sm text-[var(--color-muted-foreground)]">Cargando…</p>;
  if (error) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">{error}</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Agencia</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {tenants.length} tenants · {totales.proyectos} proyectos · este mes: {totales.leads} leads,{' '}
          {totales.mensajes} mensajes, {totales.acciones} acciones.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Cola global pendiente de aprobación ({pendientes.length})
        </h2>
        {pendientes.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-[var(--color-muted-foreground)]">
              Nada esperando aprobación.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {pendientes.map((a) => (
              <Card key={a.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {a.kind} · {a.project}
                      {a.lead ? ` · ${a.lead}` : ''}
                    </p>
                    <p className="truncate text-xs text-[var(--color-muted-foreground)]">
                      {a.reason} — {a.tenant} · {a.createdBy}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="btn-brand" onClick={() => void decide(a.id, 'approve')}>
                      Aprobar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void decide(a.id, 'reject')}>
                      Rechazar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Tenants
        </h2>
        {tenants.map((t) => (
          <Card key={t.id}>
            <CardContent className="space-y-3 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {t.name ?? t.email}{' '}
                    {t.isAdmin && <Badge variant="secondary">admin</Badge>}
                  </p>
                  <p className="text-xs text-[var(--color-muted-foreground)]">{t.email}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setNewProjectFor(newProjectFor === t.id ? null : t.id)}
                >
                  <IconPlus className="h-3.5 w-3.5" /> Proyecto
                </Button>
              </div>

              {newProjectFor === t.id && (
                <div className="rounded-xl border border-[var(--color-border)] p-4">
                  {t.isAdmin ? (
                    <ProjectForm
                      onSaved={() => {
                        setNewProjectFor(null);
                        void load();
                      }}
                    />
                  ) : (
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      El alta de proyectos se hace desde la cuenta del tenant: el formulario crea el
                      proyecto para quien tiene la sesión abierta, no para un tercero. Entra como{' '}
                      {t.email} o pídele que lo cree en /projects.
                    </p>
                  )}
                </div>
              )}

              {t.projects.length === 0 ? (
                <p className="text-xs text-[var(--color-muted-foreground)]">Sin proyectos.</p>
              ) : (
                <div className="space-y-2">
                  {t.projects.map((p) => (
                    <div key={p.id} className="rounded-lg border border-[var(--color-border)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {p.name} <span className="text-xs text-[var(--color-muted-foreground)]">· {p.kind}</span>
                        </p>
                        <p className="text-xs text-[var(--color-muted-foreground)]">
                          mes: {p.usage.leads} leads · {p.usage.messages} msjs · {p.usage.actions} acciones ·{' '}
                          {p.rules} reglas
                        </p>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Chip on={p.channels.meta && p.channels.metaToken} label="Meta" />
                        <Chip on={p.channels.waba && p.channels.wabaToken} label="WABA" />
                        <Chip on={p.channels.twilio && p.channels.twilioToken} label={`Twilio ${p.channels.twilioMode}`} />
                        <Chip on={p.channels.mcp > 0} label={`MCP ${p.channels.mcp}`} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
