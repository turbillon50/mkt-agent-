'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconMail, IconPlus, IconClose, IconBarChart, IconSend, IconCalendar, IconSparkles, IconFile } from '@/components/icons';
import { useToast } from '@/components/ui/toast-provider';
import { Composer, type CampaignDraft } from './composer';
import { segmentLabel, type Segment } from './recipients-picker';

type Campaign = {
  id: string;
  name: string;
  subject: string;
  body: string;
  segment: Segment;
  status: string;
  scheduledAt: string | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  sentAt: string | null;
  createdAt: string;
};
type Template = { id: string; name: string; subject: string; body: string };
type Analytics = {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  failed: number;
  rates: { delivered: number; opened: number; clicked: number; bounced: number };
};

const STATUS_META: Record<string, { label: string; variant: 'default' | 'outline' | 'secondary' }> = {
  draft: { label: 'borrador', variant: 'outline' },
  scheduled: { label: 'programada', variant: 'secondary' },
  sending: { label: 'enviando…', variant: 'secondary' },
  sent: { label: 'enviada', variant: 'default' },
  failed: { label: 'falló', variant: 'outline' },
};

export function MailingWorkspace() {
  const { push } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [templates, setTemplates] = React.useState<Template[]>([]);
  const [tags, setTags] = React.useState<Array<{ tag: string; count: number }>>([]);
  const [statuses, setStatuses] = React.useState<Record<string, number>>({});
  const [overview, setOverview] = React.useState({ sent: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0 });
  const [mailer, setMailer] = React.useState<{ configured: boolean; from: string | null }>({ configured: false, from: null });
  const [brandName, setBrandName] = React.useState<string | null>(null);

  const [tab, setTab] = React.useState<'campaigns' | 'templates'>('campaigns');
  const [composing, setComposing] = React.useState<CampaignDraft | null>(null);
  const [open, setOpen] = React.useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/mailing', { cache: 'no-store' });
      const data = await res.json();
      setCampaigns(data.campaigns ?? []);
      setTemplates(data.templates ?? []);
      setTags(data.tags ?? []);
      setStatuses(data.statuses ?? {});
      setOverview(data.overview ?? { sent: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0 });
      setMailer(data.mailer ?? { configured: false, from: null });
      setBrandName(data.brandName ?? null);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    refresh();
  }, []);

  function newCampaign() {
    setComposing({ name: '', subject: '', body: '', segment: { type: 'all' } });
    setOpen(true);
  }
  function editCampaign(c: Campaign) {
    setComposing({ id: c.id, name: c.name, subject: c.subject, body: c.body, segment: c.segment, status: c.status });
    setOpen(true);
  }
  function fromTemplate(t: Template) {
    setComposing({ name: t.name, subject: t.subject, body: t.body, segment: { type: 'all' } });
    setTab('campaigns');
    setOpen(true);
  }

  async function removeCampaign(c: Campaign) {
    if (!confirm(`¿Eliminar la campaña "${c.name}"?`)) return;
    setCampaigns((p) => p.filter((x) => x.id !== c.id));
    try {
      const res = await fetch(`/api/mailing/${c.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      push({ variant: 'info', title: 'Campaña eliminada' });
    } catch {
      push({ variant: 'error', title: 'No se pudo eliminar' });
      refresh();
    }
  }

  async function removeTemplate(t: Template) {
    setTemplates((p) => p.filter((x) => x.id !== t.id));
    try {
      const res = await fetch(`/api/mailing/templates/${t.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      push({ variant: 'info', title: 'Plantilla eliminada' });
    } catch {
      push({ variant: 'error', title: 'No se pudo eliminar' });
      refresh();
    }
  }

  return (
    <div className="space-y-4">
      {/* Estado del motor */}
      <Card className="card-glow">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className={`grid h-9 w-9 place-items-center rounded-xl ${mailer.configured ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]' : 'bg-[var(--color-muted)]'}`}>
              <IconMail className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-medium">Motor de correo (Resend)</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {mailer.configured ? `Listo. Envía desde ${mailer.from}` : 'Apagado: falta RESEND_API_KEY. Pídele a Luis que la inyecte.'}
              </p>
            </div>
          </div>
          <Badge variant={mailer.configured ? 'default' : 'outline'}>{mailer.configured ? 'Conectado' : 'Pendiente'}</Badge>
        </CardContent>
      </Card>

      {/* Stats globales reales */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: 'Enviados', value: overview.sent },
          { label: 'Abiertos', value: overview.opened },
          { label: 'Clicks', value: overview.clicked },
          { label: 'Rebotes', value: overview.bounced },
          { label: 'Bajas', value: overview.unsubscribed },
        ].map((s) => (
          <Card key={s.label} className="card-glow">
            <CardContent className="p-3 text-center">
              <div className="text-xl font-semibold">{s.value}</div>
              <div className="text-[11px] text-[var(--color-muted-foreground)]">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs + nueva */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {(['campaigns', 'templates'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                tab === t ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]' : 'border border-[var(--color-border)] hover:bg-[var(--color-accent)]'
              }`}
            >
              {t === 'campaigns' ? 'Campañas' : 'Plantillas'}
            </button>
          ))}
        </div>
        {!open && (
          <Button onClick={newCampaign} className="btn-brand">
            <IconPlus className="h-4 w-4" /> Nueva campaña
          </Button>
        )}
      </div>

      {/* Composer */}
      {open && composing && (
        <Composer
          initial={composing}
          tags={tags}
          statuses={statuses}
          mailerConfigured={mailer.configured}
          brandName={brandName}
          onClose={() => setOpen(false)}
          onSaved={refresh}
        />
      )}

      {/* Listas */}
      {loading ? (
        <Card className="card-glow">
          <CardContent className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">Cargando…</CardContent>
        </Card>
      ) : tab === 'campaigns' ? (
        campaigns.length === 0 ? (
          <EmptyState icon={<IconSend className="h-8 w-8" />} text="Aún no tienes campañas. Crea una, elige a quién y mándala (o prográmala)." />
        ) : (
          <div className="grid gap-3">
            {campaigns.map((c) => (
              <CampaignCard key={c.id} c={c} tags={tags} onEdit={() => editCampaign(c)} onRemove={() => removeCampaign(c)} />
            ))}
          </div>
        )
      ) : templates.length === 0 ? (
        <EmptyState icon={<IconFile className="h-8 w-8" />} text="Sin plantillas todavía. Guarda un correo como plantilla desde el editor para reusarlo." />
      ) : (
        <div className="grid gap-3">
          {templates.map((t) => (
            <Card key={t.id} className="card-glow">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.name}</p>
                  <p className="truncate text-xs text-[var(--color-muted-foreground)]">{t.subject || '(sin asunto)'}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => fromTemplate(t)}>
                    Usar
                  </Button>
                  <button onClick={() => removeTemplate(t)} className="grid h-7 w-7 place-items-center rounded-md text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]" aria-label="Eliminar">
                    <IconClose className="h-3.5 w-3.5" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <Card className="card-glow">
      <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-[var(--color-muted-foreground)]">
        {icon}
        <p className="max-w-sm text-sm">{text}</p>
      </CardContent>
    </Card>
  );
}

function CampaignCard({
  c,
  tags,
  onEdit,
  onRemove,
}: {
  c: Campaign;
  tags: Array<{ tag: string }>;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const meta = STATUS_META[c.status] ?? { label: c.status, variant: 'outline' as const };
  const [analytics, setAnalytics] = React.useState<Analytics | null>(null);
  const [expanded, setExpanded] = React.useState(false);

  async function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && !analytics && (c.status === 'sent' || c.sentCount > 0)) {
      try {
        const res = await fetch(`/api/mailing/${c.id}`, { cache: 'no-store' });
        const data = await res.json();
        setAnalytics(data.analytics ?? null);
      } catch {
        /* ignore */
      }
    }
  }

  const isSent = c.status === 'sent' || c.sentCount > 0;

  return (
    <Card className="card-glow">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{c.name}</span>
              <Badge variant={meta.variant}>{meta.label}</Badge>
            </div>
            <p className="mt-1 truncate text-xs text-[var(--color-muted-foreground)]">
              {c.subject || '(sin asunto)'} · {segmentLabel(c.segment, tags)}
            </p>
            {c.status === 'scheduled' && c.scheduledAt && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-[var(--color-primary)]">
                <IconCalendar className="h-3 w-3" /> Programada: {new Date(c.scheduledAt).toLocaleString('es-MX')}
              </p>
            )}
            {isSent && (
              <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
                {c.sentCount} enviados{c.failedCount ? ` · ${c.failedCount} fallaron` : ''}
                {c.sentAt ? ` · ${new Date(c.sentAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}` : ''}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {isSent ? (
              <button onClick={toggle} className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2.5 py-1 text-[11px] hover:bg-[var(--color-accent)]">
                <IconBarChart className="h-3.5 w-3.5" /> {expanded ? 'Ocultar' : 'Analítica'}
              </button>
            ) : (
              <Button size="sm" variant="outline" onClick={onEdit}>
                {c.status === 'scheduled' ? 'Ver' : 'Editar'}
              </Button>
            )}
            <button onClick={onRemove} className="grid h-7 w-7 place-items-center rounded-md text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]" aria-label="Eliminar">
              <IconClose className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {expanded && isSent && (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-accent)]/30 p-3">
            {analytics ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label="Entregados" value={analytics.delivered} rate={analytics.rates.delivered} />
                <Metric label="Abiertos" value={analytics.opened} rate={analytics.rates.opened} />
                <Metric label="Clicks" value={analytics.clicked} rate={analytics.rates.clicked} />
                <Metric label="Rebotes" value={analytics.bounced} rate={analytics.rates.bounced} danger />
              </div>
            ) : (
              <p className="text-center text-xs text-[var(--color-muted-foreground)]">Cargando analítica…</p>
            )}
            <p className="mt-2 flex items-center gap-1 text-[10px] text-[var(--color-muted-foreground)]">
              <IconSparkles className="h-3 w-3" /> Tasas reales vía webhooks de Resend. Si ves 0, aún no llegan eventos (o falta configurar el webhook).
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, rate, danger }: { label: string; value: number; rate: number; danger?: boolean }) {
  return (
    <div className="text-center">
      <div className={`text-lg font-semibold ${danger && value > 0 ? 'text-[var(--color-destructive)]' : ''}`}>{value}</div>
      <div className="text-[11px] text-[var(--color-muted-foreground)]">
        {label} · {rate}%
      </div>
    </div>
  );
}
