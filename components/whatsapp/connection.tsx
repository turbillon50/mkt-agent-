'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Status = {
  connected: boolean;
  jid: string | null;
  hasQR: boolean;
  uptimeSec: number;
  error?: string;
};

export function WhatsAppConnection() {
  const [status, setStatus] = useState<Status | null>(null);
  const [qr, setQR] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const [s, q] = await Promise.all([
        fetch('/api/whatsapp/status', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/whatsapp/qr', { cache: 'no-store' }).then((r) => r.json()),
      ]);
      setStatus(s);
      setQR(q.qr ?? null);
    } catch (e) {
      setStatus({ connected: false, jid: null, hasQR: false, uptimeSec: 0, error: 'bridge unreachable' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, []);

  const indicator = status?.connected
    ? { label: 'Conectado', color: 'bg-emerald-500' }
    : status?.error
      ? { label: 'Bridge offline', color: 'bg-rose-500' }
      : { label: 'Esperando QR', color: 'bg-amber-500' };

  return (
    <Card className="card-glow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Estado del bridge</CardTitle>
          <Badge variant="outline">
            <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${indicator.color}`} />
            {indicator.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {status?.jid && (
          <div className="text-xs text-[var(--color-muted-foreground)]">
            Sesión: <code className="text-[var(--color-foreground)]">{status.jid}</code>
          </div>
        )}
        {status?.uptimeSec ? (
          <div className="text-xs text-[var(--color-muted-foreground)]">
            Uptime: {formatUptime(status.uptimeSec)}
          </div>
        ) : null}

        {status?.error && (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
            {status.error}. Verifica <code>WHATSAPP_BRIDGE_URL</code> y{' '}
            <code>WHATSAPP_BRIDGE_SECRET</code> en Vercel.
          </div>
        )}

        {!status?.connected && qr && (
          <div className="space-y-2">
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Escanea con WhatsApp → Dispositivos vinculados → Vincular dispositivo:
            </p>
            <div className="rounded-lg bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR de WhatsApp" className="h-auto w-full" />
            </div>
          </div>
        )}

        {!status?.connected && !qr && !loading && !status?.error && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
            Bridge alcanzado pero no hay QR ni sesión. Probablemente está reconectando — reintenta en
            unos segundos.
          </div>
        )}

        <Button onClick={refresh} variant="outline" size="sm" className="w-full">
          Refrescar
        </Button>
      </CardContent>
    </Card>
  );
}

function formatUptime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
}
