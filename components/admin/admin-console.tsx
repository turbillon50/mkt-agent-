'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast-provider';
import { IconShield, IconUsers, IconBolt, IconBarChart } from '@/components/icons';
import { cn } from '@/lib/utils';

/**
 * Módulo de administración de la APP. Es la vista del dueño de Goossip, por
 * encima de todas las organizaciones. La puerta real está en el servidor
 * (`apiAppAdmin`); esto solo la dibuja.
 *
 * Cuatro pestañas, que es lo que pidió el issue: Organizaciones · Usuarios ·
 * Cola global · Salud. Navegable en móvil: las pestañas hacen scroll y las
 * tablas se vuelven tarjetas.
 */

type Tab = 'orgs' | 'users' | 'queue' | 'health';

const TABS: Array<{ key: Tab; label: string; Icon: React.ElementType }> = [
  { key: 'orgs', label: 'Organizaciones', Icon: IconShield },
  { key: 'users', label: 'Usuarios', Icon: IconUsers },
  { key: 'queue', label: 'Cola global', Icon: IconBolt },
  { key: 'health', label: 'Salud', Icon: IconBarChart },
];

interface Usage {
  leads: number;
  messages: number;
  actions: number;
}

interface OrgRow {
  id: string;
  name: string;
  slug: string | null;
  plan: string;
  status: string;
  ownerEmail: string | null;
  createdAt: string;
  members: number;
  projects: number;
  usage: Usage;
}

interface OrgDetail {
  org: OrgRow & { settings: Record<string, unknown> };
  usage: Usage;
  members: Array<{ clerkUserId: string; email: string | null; role: string; lastSeenAt: string | null }>;
  projects: Array<{
    id: string;
    name: string;
    slug: string;
    kind: string;
    status: string;
    channels: Record<string, unknown>;
    rules: number;
    leads: number;
  }>;
  pending: number;
}

interface UserRow {
  id: string;
  clerkId: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  orgs: Array<{ id: string; name: string | null; slug: string | null; role: string }>;
}

interface QueueRow {
  id: string;
  kind: string;
  status: string;
  reason: string | null;
  createdBy: string;
  createdAt: string;
  project: string | null;
  org: string | null;
  orgId: string | null;
  lead: string | null;
}

interface Health {
  webhooks: Array<{ source: string; ok: number; error: number; rejected: number; last: string | null }>;
  errors: Array<{ source: string; event: string | null; detail: string | null; createdAt: string }>;
  version: { sha: string | null; ref: string | null; env: string | null; url: string | null };
  totals: { orgs: number; users: number; projects: number; leads: number; conversations: number };
}

const PLANES = ['free', 'pro', 'agency'] as const;

function fecha(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

function rolCorto(role: string): string {
  if (role === 'org:owner') return 'dueño';
  if (role === 'org:admin') return 'admin';
  return 'miembro';
}

export function AdminConsole() {
  const [tab, setTab] = useState<Tab>('orgs');
  const [forbidden, setForbidden] = useState(false);

  if (forbidden) {
    return (
      <Card className="card-glow">
        <CardContent className="space-y-2 py-10 text-center">
          <p className="text-sm font-medium">403 — este módulo es del dueño de Goossip.</p>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Tu cuenta no tiene <code>is_admin</code>.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Administración de Goossip</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Todas las organizaciones, sus usuarios y lo que la app está haciendo ahora mismo.
        </p>
      </header>

      <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors',
              tab === key
                ? 'bg-gradient-to-br from-[var(--color-brand-1)] to-[var(--color-brand-3)] text-white shadow-sm'
                : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]/60',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {tab === 'orgs' && <OrgsTab onForbidden={() => setForbidden(true)} />}
      {tab === 'users' && <UsersTab onForbidden={() => setForbidden(true)} />}
      {tab === 'queue' && <QueueTab onForbidden={() => setForbidden(true)} />}
      {tab === 'health' && <HealthTab onForbidden={() => setForbidden(true)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Organizaciones
// ---------------------------------------------------------------------------

function OrgsTab({ onForbidden }: { onForbidden: () => void }) {
  const { push } = useToast();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (term: string) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/orgs${term ? `?q=${encodeURIComponent(term)}` : ''}`, {
          cache: 'no-store',
        });
        if (res.status === 403) return onForbidden();
        const data = await res.json();
        setOrgs(data.orgs ?? []);
      } finally {
        setLoading(false);
      }
    },
    [onForbidden],
  );

  useEffect(() => {
    void load('');
  }, [load]);

  const openDetail = useCallback(async (id: string) => {
    setOpenId(id);
    setDetail(null);
    setConfirmText('');
    const res = await fetch(`/api/admin/orgs/${id}`, { cache: 'no-store' });
    if (res.ok) setDetail(await res.json());
  }, []);

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/orgs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'error');
      setDetail(data);
      await load(q);
      push({ title: 'Listo', description: 'Organización actualizada.', variant: 'success' });
    } catch (e) {
      push({ title: 'No se pudo', description: e instanceof Error ? e.message : 'error', variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function borrar(id: string, expected: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/orgs/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: confirmText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'error');
      push({ title: 'Borrada', description: `${expected} ya no existe.`, variant: 'success' });
      setOpenId(null);
      setDetail(null);
      await load(q);
    } catch (e) {
      push({ title: 'No se pudo', description: e instanceof Error ? e.message : 'error', variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load(q);
        }}
        className="flex gap-2"
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o slug…"
          className="flex-1"
        />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>

      {loading ? (
        <Vacio texto="Cargando organizaciones…" />
      ) : orgs.length === 0 ? (
        <Vacio texto="No hay organizaciones que coincidan." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {orgs.map((o) => (
            <Card key={o.id} className="card-glow">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{o.name}</div>
                    <div className="truncate text-xs text-[var(--color-muted-foreground)]">
                      {o.slug ? <code>{o.slug}</code> : o.id} · {o.ownerEmail ?? 'sin dueño'}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant="outline">{o.plan}</Badge>
                    {o.status === 'suspended' && (
                      <Badge className="bg-[var(--color-destructive)]/15 text-[var(--color-destructive)]">
                        suspendida
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-1 text-center text-[11px]">
                  <Dato n={o.members} l="miembros" />
                  <Dato n={o.projects} l="proyectos" />
                  <Dato n={o.usage.leads} l="leads" />
                  <Dato n={o.usage.messages} l="msjs" />
                  <Dato n={o.usage.actions} l="acciones" />
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => (openId === o.id ? setOpenId(null) : void openDetail(o.id))}
                >
                  {openId === o.id ? 'Cerrar' : 'Ver detalle'}
                </Button>

                {openId === o.id && (
                  <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-3">
                    {!detail ? (
                      <p className="text-xs text-[var(--color-muted-foreground)]">Cargando…</p>
                    ) : (
                      <>
                        <Seccion titulo={`Miembros (${detail.members.length})`}>
                          {detail.members.length === 0 ? (
                            <p className="text-xs text-[var(--color-muted-foreground)]">Sin miembros espejados.</p>
                          ) : (
                            <ul className="space-y-1">
                              {detail.members.map((m) => (
                                <li key={m.clerkUserId} className="flex items-center justify-between gap-2 text-xs">
                                  <span className="truncate">{m.email ?? m.clerkUserId}</span>
                                  <Badge variant="outline">{rolCorto(m.role)}</Badge>
                                </li>
                              ))}
                            </ul>
                          )}
                        </Seccion>

                        <Seccion titulo={`Proyectos (${detail.projects.length})`}>
                          {detail.projects.length === 0 ? (
                            <p className="text-xs text-[var(--color-muted-foreground)]">Sin proyectos.</p>
                          ) : (
                            <ul className="space-y-1.5">
                              {detail.projects.map((p) => (
                                <li key={p.id} className="text-xs">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="truncate font-medium">{p.name}</span>
                                    <span className="shrink-0 text-[var(--color-muted-foreground)]">
                                      {p.leads} leads · {p.rules} reglas
                                    </span>
                                  </div>
                                  <div className="mt-0.5 flex flex-wrap gap-1">
                                    {canales(p.channels).map((c) => (
                                      <span
                                        key={c.label}
                                        className="inline-flex items-center gap-1 rounded bg-[var(--color-accent)]/60 px-1.5 py-0.5 text-[10px]"
                                      >
                                        <span
                                          className="h-1.5 w-1.5 rounded-full"
                                          style={{
                                            background: c.on ? '#2ba87a' : 'transparent',
                                            border: c.on ? 'none' : '1px solid currentColor',
                                          }}
                                        />
                                        {c.label}
                                      </span>
                                    ))}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </Seccion>

                        <Seccion titulo="Uso del mes">
                          <p className="text-xs text-[var(--color-muted-foreground)]">
                            {detail.usage.leads} leads · {detail.usage.messages} mensajes ·{' '}
                            {detail.usage.actions} acciones · {detail.pending} pendientes en cola
                          </p>
                        </Seccion>

                        <Seccion titulo="Plan">
                          <div className="flex flex-wrap gap-1.5">
                            {PLANES.map((p) => (
                              <Button
                                key={p}
                                size="sm"
                                disabled={busy || detail.org.plan === p}
                                variant={detail.org.plan === p ? 'default' : 'outline'}
                                onClick={() => void patch(o.id, { plan: p })}
                              >
                                {p}
                              </Button>
                            ))}
                          </div>
                        </Seccion>

                        <Seccion titulo="Estado">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void patch(o.id, {
                                status: detail.org.status === 'suspended' ? 'active' : 'suspended',
                              })
                            }
                          >
                            {detail.org.status === 'suspended' ? 'Reactivar' : 'Suspender'}
                          </Button>
                          <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
                            Suspendida = sus miembros no entran al panel. Los datos no se tocan.
                          </p>
                        </Seccion>

                        <Seccion titulo="Borrar">
                          <p className="mb-1.5 text-[11px] text-[var(--color-muted-foreground)]">
                            Se borra en Clerk y aquí. Escribe{' '}
                            <code>{detail.org.slug ?? detail.org.id}</code> para confirmar.
                          </p>
                          <div className="flex gap-2">
                            <Input
                              value={confirmText}
                              onChange={(e) => setConfirmText(e.target.value)}
                              placeholder={detail.org.slug ?? detail.org.id}
                              className="flex-1"
                            />
                            <Button
                              variant="outline"
                              disabled={busy || confirmText !== (detail.org.slug ?? detail.org.id)}
                              onClick={() => void borrar(o.id, detail.org.slug ?? detail.org.id)}
                              className="border-[var(--color-destructive)]/40 text-[var(--color-destructive)]"
                            >
                              Borrar
                            </Button>
                          </div>
                        </Seccion>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function canales(ch: Record<string, unknown>): Array<{ label: string; on: boolean }> {
  return [
    { label: 'Meta', on: Boolean(ch.meta) },
    { label: 'WhatsApp', on: Boolean(ch.waba) },
    { label: 'Twilio', on: Boolean(ch.twilio) },
    { label: `MCP ${Number(ch.mcp ?? 0)}`, on: Number(ch.mcp ?? 0) > 0 },
  ];
}

// ---------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------

function UsersTab({ onForbidden }: { onForbidden: () => void }) {
  const { push } = useToast();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    async (term: string) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/users${term ? `?q=${encodeURIComponent(term)}` : ''}`, {
          cache: 'no-store',
        });
        if (res.status === 403) return onForbidden();
        const data = await res.json();
        setRows(data.users ?? []);
      } finally {
        setLoading(false);
      }
    },
    [onForbidden],
  );

  useEffect(() => {
    void load('');
  }, [load]);

  async function toggleAdmin(u: UserRow) {
    setBusy(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAdmin: !u.isAdmin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'error');
      setRows((prev) => prev.map((r) => (r.id === u.id ? { ...r, isAdmin: data.user.isAdmin } : r)));
    } catch (e) {
      push({ title: 'No se pudo', description: e instanceof Error ? e.message : 'error', variant: 'error' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load(q);
        }}
        className="flex gap-2"
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por correo…" className="flex-1" />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>

      {loading ? (
        <Vacio texto="Cargando usuarios…" />
      ) : rows.length === 0 ? (
        <Vacio texto="No hay usuarios que coincidan." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((u) => (
            <Card key={u.id} className="card-glow">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{u.name ?? u.email}</div>
                    <div className="truncate text-xs text-[var(--color-muted-foreground)]">{u.email}</div>
                  </div>
                  {u.isAdmin && (
                    <Badge className="bg-[var(--color-primary)]/15 text-[var(--color-primary)]">admin app</Badge>
                  )}
                </div>

                <div className="text-xs text-[var(--color-muted-foreground)]">
                  Último acceso: {fecha(u.lastSeenAt)}
                </div>

                <div className="flex flex-wrap gap-1">
                  {u.orgs.length === 0 ? (
                    <span className="text-xs text-[var(--color-muted-foreground)]">Sin organizaciones</span>
                  ) : (
                    u.orgs.map((o) => (
                      <span
                        key={o.id}
                        className="inline-flex items-center gap-1 rounded bg-[var(--color-accent)]/60 px-1.5 py-0.5 text-[10px]"
                      >
                        {o.name ?? o.slug ?? o.id}
                        <span className="text-[var(--color-muted-foreground)]">· {rolCorto(o.role)}</span>
                      </span>
                    ))
                  )}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy === u.id}
                  onClick={() => void toggleAdmin(u)}
                  className="w-full"
                >
                  {u.isAdmin ? 'Quitar admin de la app' : 'Hacer admin de la app'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cola global
// ---------------------------------------------------------------------------

const ESTADOS = ['pending', 'approved', 'auto', 'executed', 'failed', 'rejected'];

function QueueTab({ onForbidden }: { onForbidden: () => void }) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [status, setStatus] = useState('pending');
  const [orgId, setOrgId] = useState('');
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ status });
      if (orgId) qs.set('orgId', orgId);
      const res = await fetch(`/api/admin/queue?${qs}`, { cache: 'no-store' });
      if (res.status === 403) return onForbidden();
      const data = await res.json();
      setRows(data.actions ?? []);
    } finally {
      setLoading(false);
    }
  }, [status, orgId, onForbidden]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void fetch('/api/admin/orgs', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { orgs: [] }))
      .then((d) => setOrgs(d.orgs ?? []))
      .catch(() => undefined);
  }, []);

  const porOrg = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.org ?? '—', (m.get(r.org ?? '—') ?? 0) + 1);
    return [...m.entries()];
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm"
        >
          {ESTADOS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm"
        >
          <option value="">Todas las organizaciones</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>

      {porOrg.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {porOrg.map(([name, n]) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 rounded bg-[var(--color-accent)]/60 px-2 py-0.5 text-[11px]"
            >
              {name} <strong>{n}</strong>
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <Vacio texto="Cargando cola…" />
      ) : rows.length === 0 ? (
        <Vacio texto={`Nada en estado "${status}".`} />
      ) : (
        <Card className="card-glow">
          <CardContent className="p-0">
            <ul className="divide-y divide-[var(--color-border)]">
              {rows.map((r) => (
                <li key={r.id} className="space-y-1 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{r.kind}</Badge>
                    <span className="text-xs font-medium">{r.org ?? '—'}</span>
                    <span className="text-xs text-[var(--color-muted-foreground)]">· {r.project ?? '—'}</span>
                    {r.lead && <span className="text-xs text-[var(--color-muted-foreground)]">· {r.lead}</span>}
                  </div>
                  <p className="text-xs text-[var(--color-muted-foreground)]">{r.reason ?? 'sin motivo'}</p>
                  <p className="text-[11px] text-[var(--color-muted-foreground)]">
                    {r.createdBy} · {fecha(r.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Salud
// ---------------------------------------------------------------------------

function HealthTab({ onForbidden }: { onForbidden: () => void }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/admin/health', { cache: 'no-store' });
        if (res.status === 403) return onForbidden();
        setHealth(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, [onForbidden]);

  if (loading) return <Vacio texto="Midiendo…" />;
  if (!health) return <Vacio texto="No se pudo leer la salud de la app." />;

  return (
    <div className="space-y-4">
      <Card className="card-glow">
        <CardContent className="grid grid-cols-2 gap-3 p-4 text-center md:grid-cols-5">
          <Dato n={health.totals.orgs} l="organizaciones" />
          <Dato n={health.totals.users} l="usuarios" />
          <Dato n={health.totals.projects} l="proyectos" />
          <Dato n={health.totals.leads} l="leads" />
          <Dato n={health.totals.conversations} l="conversaciones" />
        </CardContent>
      </Card>

      <Card className="card-glow">
        <CardContent className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">Webhooks · últimas 24 h</h2>
          <ul className="space-y-2">
            {health.webhooks.map((w) => (
              <li key={w.source} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-medium capitalize">{w.source}</span>
                <span className="flex items-center gap-2">
                  <span className="text-[var(--color-success)]">{w.ok} ok</span>
                  <span className={w.error > 0 ? 'text-[var(--color-destructive)]' : 'text-[var(--color-muted-foreground)]'}>
                    {w.error} err
                  </span>
                  <span className={w.rejected > 0 ? 'text-[var(--color-destructive)]' : 'text-[var(--color-muted-foreground)]'}>
                    {w.rejected} rech
                  </span>
                  <span className="text-[var(--color-muted-foreground)]">{fecha(w.last)}</span>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="card-glow">
        <CardContent className="space-y-2 p-4">
          <h2 className="text-sm font-semibold">Errores recientes</h2>
          {health.errors.length === 0 ? (
            <p className="text-xs text-[var(--color-muted-foreground)]">Ninguno en 24 h.</p>
          ) : (
            <ul className="space-y-1.5">
              {health.errors.map((e, i) => (
                <li key={i} className="text-xs">
                  <span className="font-medium capitalize">{e.source}</span>
                  <span className="text-[var(--color-muted-foreground)]"> · {e.event ?? '—'} · {fecha(e.createdAt)}</span>
                  <p className="text-[var(--color-muted-foreground)]">{e.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="card-glow">
        <CardContent className="space-y-1 p-4 text-xs">
          <h2 className="mb-2 text-sm font-semibold">Versión desplegada</h2>
          <Linea k="commit" v={health.version.sha ? health.version.sha.slice(0, 8) : 'local'} />
          <Linea k="rama" v={health.version.ref ?? '—'} />
          <Linea k="entorno" v={health.version.env ?? '—'} />
          <Linea k="url" v={health.version.url ?? '—'} />
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Dato({ n, l }: { n: number; l: string }) {
  return (
    <div>
      <div className="text-base font-semibold">{n}</div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">{l}</div>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
        {titulo}
      </h3>
      {children}
    </div>
  );
}

function Linea({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[var(--color-muted-foreground)]">{k}</span>
      <code className="truncate">{v}</code>
    </div>
  );
}

function Vacio({ texto }: { texto: string }) {
  return (
    <Card className="card-glow">
      <CardContent className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">{texto}</CardContent>
    </Card>
  );
}
