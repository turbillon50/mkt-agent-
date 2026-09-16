'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Campaign = {
  id: string;
  name: string;
  status: string;
  channelType: string;
  budgetMicros: string | null;
  costMicros: string | null;
  impressions: string | null;
  clicks: string | null;
};

function formatMoney(micros: string | null): string {
  if (!micros) return '—';
  const n = Number(micros) / 1_000_000;
  return `$${n.toLocaleString('es-MX', { maximumFractionDigits: 2 })}/día`;
}

/** Lo GASTADO, que no lleva "/día". Confundirlos hace creer que se gastó 30 veces más. */
function gastado(micros: string | null): string {
  if (!micros) return '$0';
  const n = Number(micros) / 1_000_000;
  return `$${n.toLocaleString('es-MX', { maximumFractionDigits: 2 })}`;
}

/**
 * Lo que sale de Google Ads cuando algo falla es un JSON con códigos, slugs y
 * un `request_id`. Eso es para nosotros, no para quien vende departamentos.
 *
 * Si el mensaje trae jerga o llaves, se cambia por una frase que la persona
 * pueda leer y actuar; si es un mensaje limpio y corto, se deja pasar tal cual.
 */
function enCristiano(crudo: string): string {
  const s = crudo.trim();
  const esJerga =
    /[{}[\]"]|api[_ ]?key|status["' ]*:|request_id|slug|unauthorized|forbidden|\b40[0-9]\b|\b50[0-9]\b/i.test(
      s,
    );
  if (esJerga || s.length > 140) {
    return 'No pudimos hablar con Google Ads ahora mismo. Inténtalo otra vez en un minuto.';
  }
  return s;
}

/**
 * Las campañas de Google Ads DEL PROYECTO.
 *
 * Dos cosas cambian en la corrida 13 y las dos salen de la QA:
 *
 *   · **Lleva `projectId`.** La ruta llaveaba por el usuario de Clerk y por eso
 *     contestaba "no conectado" con Google Ads conectado (hallazgo G).
 *   · **Ya no se teclea el ID de cliente.** Se descubre con
 *     `customers:listAccessibleCustomers` y, si hay más de uno, se elige de una
 *     lista. Pedirle a alguien un dato de 10 dígitos con guiones que la API ya
 *     sabe es una forma barata de perderlo en el primer minuto.
 */
export function AdsCampaigns({ projectId }: { projectId: string }) {
  const [loading, setLoading] = React.useState(true);
  const [connected, setConnected] = React.useState(false);
  const [customerId, setCustomerId] = React.useState('');
  const [disponibles, setDisponibles] = React.useState<string[]>([]);
  const [motivo, setMotivo] = React.useState<string | null>(null);
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [toggling, setToggling] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ads/campaigns?project=${projectId}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error cargando campañas');
      setConnected(Boolean(data.connected));
      setCustomerId(data.customerId ?? '');
      setDisponibles(data.disponibles ?? []);
      setMotivo(data.motivo ?? data.error ?? null);
      setCampaigns(data.campaigns ?? []);
    } catch (e) {
      setError(enCristiano(e instanceof Error ? e.message : ''));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Elegir con cuál de las cuentas accesibles trabaja este proyecto. */
  async function elegir(cuenta: string) {
    setLoading(true);
    try {
      await fetch('/api/ads/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, customerId: cuenta }),
      });
      await refresh();
    } catch (e) {
      setError(enCristiano(e instanceof Error ? e.message : ''));
      setLoading(false);
    }
  }

  async function toggle(id: string, current: string) {
    setToggling(id);
    try {
      const next = current === 'ENABLED' ? 'PAUSED' : 'ENABLED';
      const res = await fetch(`/api/ads/campaigns/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, status: next }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'No se pudo cambiar el estado');
      }
      await refresh();
    } catch (e) {
      setError(enCristiano(e instanceof Error ? e.message : ''));
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
          <CardTitle className="text-base">
            {disponibles.length > 0 ? 'Elige tu cuenta de Google Ads' : 'Conecta tu cuenta de Google Ads'}
          </CardTitle>
          <CardDescription>
            {disponibles.length > 0
              ? 'Tu permiso llega a estas cuentas. Elige con cuál trabaja este proyecto.'
              : (motivo ??
                'Conecta Google en Conexiones del proyecto y aquí aparecen tus cuentas solas. No hace falta que teclees ningún ID.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {disponibles.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {disponibles.map((cuenta) => (
                <Button key={cuenta} variant="outline" size="sm" onClick={() => void elegir(cuenta)}>
                  {cuenta}
                </Button>
              ))}
            </div>
          ) : (
            <Button asChild variant="outline" size="sm">
              <a href={`/projects/${projectId}/conexiones`}>Ir a Conexiones</a>
            </Button>
          )}
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
          {disponibles.length > 1 && ` · ${disponibles.length} cuentas a tu alcance`}
        </p>
        <Button onClick={() => void refresh()} variant="outline" size="sm">
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
                    {c.channelType.replaceAll('_', ' ').toLowerCase()} · presupuesto{' '}
                    {formatMoney(c.budgetMicros)} · gastado 30 d {gastado(c.costMicros)} ·{' '}
                    {c.impressions ?? 0} impresiones
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
