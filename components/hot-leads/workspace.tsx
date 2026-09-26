'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { IconBolt, IconWhatsApp, IconCheck } from '@/components/icons';
import { useToast } from '@/components/ui/toast-provider';

type HotLead = {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  score: number;
  lastSignalAt: string | null;
};
type Settings = {
  threshold: number;
  alertsEnabled: boolean;
  alertWhatsappNumber: string;
  dmAiEnabled: boolean;
};
type Summary = { totalSignals: number; hotCount: number };

export function HotLeadsWorkspace() {
  const { push } = useToast();
  const [hot, setHot] = React.useState<HotLead[] | null>(null);
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [saving, setSaving] = React.useState(false);

  // edición local
  const [threshold, setThreshold] = React.useState(3);
  const [number, setNumber] = React.useState('');
  const [alertsEnabled, setAlertsEnabled] = React.useState(true);
  const [dmAiEnabled, setDmAiEnabled] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      const r = await fetch('/api/hot-leads', { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Error');
      setHot(d.hot ?? []);
      setSettings(d.settings);
      setSummary(d.summary);
      setThreshold(d.settings.threshold);
      setNumber(d.settings.alertWhatsappNumber ?? '');
      setAlertsEnabled(d.settings.alertsEnabled);
      setDmAiEnabled(d.settings.dmAiEnabled);
    } catch (e) {
      setHot([]);
      push({ title: 'No se pudieron cargar los leads calientes', description: String(e instanceof Error ? e.message : e), variant: 'error' });
    }
  }, [push]);

  React.useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/hot-leads/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold, alertWhatsappNumber: number, alertsEnabled, dmAiEnabled }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Error');
      setSettings(d.settings);
      push({ title: 'Configuración guardada', description: `Umbral: ${d.settings.threshold} señales`, variant: 'success' });
    } catch (e) {
      push({ title: 'No se pudo guardar', description: String(e instanceof Error ? e.message : e), variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      {/* Configuración */}
      <Card className="h-fit">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <IconBolt className="h-4 w-4 text-[var(--color-primary)]" /> Configuración de alertas
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[var(--color-muted-foreground)]">
              Umbral de señales para marcar caliente
            </span>
            <Input type="number" min={1} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[var(--color-muted-foreground)]">
              WhatsApp para recibir la alerta (con código país)
            </span>
            <Input placeholder="5219984292748" value={number} onChange={(e) => setNumber(e.target.value)} />
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2.5">
            <span className="text-sm">Alertas activas</span>
            <input type="checkbox" checked={alertsEnabled} onChange={(e) => setAlertsEnabled(e.target.checked)} className="h-4 w-4 accent-[var(--color-primary)]" />
          </label>

          <Button onClick={save} disabled={saving} className="w-full">
            <IconCheck className="h-4 w-4" /> {saving ? 'Guardando…' : 'Guardar configuración'}
          </Button>

          <div className="rounded-lg bg-[var(--color-muted)]/50 p-3 text-xs text-[var(--color-muted-foreground)]">
            <IconWhatsApp className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
            Te llega un WhatsApp cuando un lead cruza el umbral. Una sola alerta por lead.
          </div>
        </CardContent>
      </Card>

      {/* Lista de calientes */}
      <div className="space-y-4">
        {summary ? (
          <div className="flex gap-3">
            <Card className="flex-1">
              <CardContent className="p-4">
                <div className="text-2xl font-bold">{summary.hotCount}</div>
                <div className="text-xs text-[var(--color-muted-foreground)]">leads calientes</div>
              </CardContent>
            </Card>
            <Card className="flex-1">
              <CardContent className="p-4">
                <div className="text-2xl font-bold">{summary.totalSignals}</div>
                <div className="text-xs text-[var(--color-muted-foreground)]">señales registradas</div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {hot === null ? (
          <div className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">Cargando…</div>
        ) : hot.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="mb-2 text-3xl">🔥</div>
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Aún no hay leads calientes. En cuanto tus prospectos empiecen a interactuar, aparecerán aquí.
              </p>
            </CardContent>
          </Card>
        ) : (
          hot.map((l) => (
            <Card key={l.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{l.fullName || l.email || l.phone || 'Lead'}</span>
                    <Badge variant="default">🔥 {l.score}</Badge>
                  </div>
                  <div className="mt-0.5 truncate text-sm text-[var(--color-muted-foreground)]">
                    {[l.email, l.phone].filter(Boolean).join(' · ') || `fuente: ${l.source}`}
                  </div>
                </div>
                {l.phone ? (
                  <a href={`https://wa.me/${l.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline">
                      <IconWhatsApp className="h-3.5 w-3.5" /> Escribir
                    </Button>
                  </a>
                ) : null}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
