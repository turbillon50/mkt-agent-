'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Campaign = {
  id: string;
  name: string;
  status: string;
  channelType: string;
  budgetMicros: string | null;
};

function formatMoney(micros: string | null): string {
  if (!micros) return '—';
  const n = Number(micros) / 1_000_000;
  return `$${n.toLocaleString('es-MX', { maximumFractionDigits: 2 })}/día`;
}

export function AdsCampaigns() {
  const [loading, setLoading] = React.useState(true);
  const [connected, setConnected] = React.useState(false);
  const [customerId, setCustomerId] = React.useState('');
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [connectInput, setConnectInput] = React.useState('');
  const [connecting, setConnecting] = React.useState(false);
  const [toggling, setToggling] = React.useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ads/campaigns', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error cargando campañas');
      setConnected(Boolean(data.connected));
      setCustomerId(data.customerId ?? '');
      setCampaigns(data.campaigns ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    refresh();
  }, []);

  async function connect() {
    if (connecting) return;
    setConnecting(true);
    setError(null);
    try {
      const res = await fetch('/api/integrations/composio/connect-googleads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: connectInput }),
      });
      const data = await res.json();
      if (!res.ok || !data.redirectUrl) throw new Error(data.error || 'No se pudo iniciar la conexión');
      window.location.href = data.redirectUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
      setConnecting(false);
    }
  }

  async function toggle(id: string, current: string) {
    setToggling(id);
    try {
      const next = current === 'ENABLED' ? 'PAUSED' : 'ENABLED';
      const res = await fetch(`/api/ads/campaigns/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'No se pudo cambiar el estado');
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setToggling(null);
    }
  }

  if (loading) {
    return (
      <Card className="card-glow">
        <CardContent className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">
          Cargando…
        </CardContent>
      </Card>
    );
  }

  if (!connected) {
    return (
      <Card className="card-glow">
        <CardHeader>
          <CardTitle className="text-base">Conecta tu cuenta de Google Ads</CardTitle>
          <CardDescription>
            Pega tu ID de cliente (Customer ID), formato 123-456-7890. Lo encuentras arriba a la
            derecha en ads.google.com, junto al nombre de tu cuenta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={connectInput}
              onChange={(e) => setConnectInput(e.target.value)}
              placeholder="123-456-7890"
              className="sm:max-w-xs"
            />
            <Button onClick={connect} disabled={connecting || !connectInput} className="btn-brand">
              {connecting ? 'Abriendo…' : 'Conectar Google Ads'}
            </Button>
          </div>
          {error && <p className="text-xs text-[var(--color-destructive)]">{error}</p>}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Cuenta conectada: <code>{customerId}</code>
        </p>
        <Button onClick={refresh} variant="outline" size="sm">
          Refrescar
        </Button>
      </div>

      {error && <p className="text-xs text-[var(--color-destructive)]">{error}</p>}

      {campaigns.length === 0 ? (
        <Card className="card-glow">
          <CardContent className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">
            No hay campañas en esta cuenta todavía.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {campaigns.map((c) => (
            <Card key={c.id} className="card-glow">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    <Badge variant={c.status === 'ENABLED' ? 'default' : 'outline'}>
                      {c.status === 'ENABLED' ? 'activa' : c.status === 'PAUSED' ? 'pausada' : c.status.toLowerCase()}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                    {c.channelType.replaceAll('_', ' ').toLowerCase()} · presupuesto {formatMoney(c.budgetMicros)}
                  </p>
                </div>
                {(c.status === 'ENABLED' || c.status === 'PAUSED') && (
                  <Button
                    onClick={() => toggle(c.id, c.status)}
                    disabled={toggling === c.id}
                    variant="outline"
                    size="sm"
                  >
                    {toggling === c.id ? '…' : c.status === 'ENABLED' ? 'Pausar' : 'Activar'}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
