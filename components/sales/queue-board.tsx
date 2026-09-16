'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast-provider';

interface QueuedRow {
  id: string;
  kind: string;
  status: string;
  priority: number;
  reason: string | null;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  createdBy: string;
  createdAt: string;
  scheduledFor: string;
  projectName: string;
  leadName: string | null;
  leadPhone: string | null;
  leadGrade: string | null;
}

const KIND_LABEL: Record<string, string> = {
  send_template: 'Plantilla de WhatsApp',
  send_sms: 'SMS',
  notify_owner: 'Avisar al dueño',
  propose_reply: 'Respuesta propuesta',
  propose_campaign: 'Campaña propuesta',
  retarget: 'Retargeting',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'esperando aprobación',
  approved: 'aprobada',
  auto: 'automática',
  executed: 'ejecutada',
  rejected: 'rechazada',
  failed: 'falló',
};

const TABS: Array<{ key: string; label: string; statuses: string }> = [
  { key: 'abiertas', label: 'Por hacer', statuses: 'pending,approved,auto' },
  { key: 'hechas', label: 'Hechas', statuses: 'executed' },
  { key: 'paradas', label: 'Falladas y rechazadas', statuses: 'failed,rejected' },
];

export function QueueBoard() {
  const { push } = useToast();
  const [tab, setTab] = useState(TABS[0]!);
  const [rows, setRows] = useState<QueuedRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (statuses: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/queue?status=${encodeURIComponent(statuses)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'error');
      setRows(data.actions ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(tab.statuses);
  }, [load, tab]);

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
    push({
      title: decision === 'approve' ? 'Aprobada — sale en el próximo minuto' : 'Rechazada',
      variant: 'success',
    });
    void load(tab.statuses);
  }

  const esperando = rows.filter((r) => r.status === 'pending');

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Automatizaciones</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Todo lo que Goossip quiere hacer pasa por aquí antes de salir. El runner corre cada
          minuto y solo ejecuta lo aprobado o lo automático.
        </p>
      </header>

      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              t.key === tab.key
                ? 'bg-[var(--color-accent)] text-[var(--color-foreground)]'
                : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]/60'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab.key === 'abiertas' && esperando.length > 0 && (
        <p className="text-xs text-[var(--color-muted-foreground)]">
          {esperando.length} esperando tu tap.
          {esperando.some((r) => (r.reason ?? '').includes('twilio_trial')) &&
            ' Algunas esperan a que Twilio salga de Trial.'}
        </p>
      )}

      {loading && <p className="text-sm text-[var(--color-muted-foreground)]">Cargando…</p>}

      {!loading && rows.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">
            Nada por aquí.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {rows.map((a) => (
          <Card key={a.id}>
            <CardContent className="space-y-2 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {KIND_LABEL[a.kind] ?? a.kind}
                    <Badge variant="outline" className="text-[10px]">
                      {STATUS_LABEL[a.status] ?? a.status}
                    </Badge>
                    <span className="text-xs font-normal text-[var(--color-muted-foreground)]">
                      {a.projectName}
                      {a.leadName ? ` · ${a.leadName}` : ''}
                      {a.leadGrade ? ` (${a.leadGrade})` : ''}
                    </span>
                  </p>
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    {a.reason} — {a.createdBy} · {new Date(a.createdAt).toLocaleString('es-MX')}
                  </p>
                  {typeof a.payload?.reply === 'string' && (
                    <p className="mt-1 rounded-md bg-[var(--color-accent)]/50 p-2 text-xs">
                      “{String(a.payload.reply)}”
                    </p>
                  )}
                  {typeof a.payload?.text === 'string' && (
                    <p className="mt-1 rounded-md bg-[var(--color-accent)]/50 p-2 text-xs">
                      “{String(a.payload.text)}”
                    </p>
                  )}
                  {typeof a.result?.esperando === 'string' && (
                    <p className="mt-1 text-xs text-amber-600">Esperando: {String(a.result.esperando)}</p>
                  )}
                  {typeof a.result?.error === 'string' && (
                    <p className="mt-1 text-xs text-[var(--color-destructive)]">Error: {String(a.result.error)}</p>
                  )}
                </div>

                {['pending', 'approved', 'auto'].includes(a.status) && (
                  <div className="flex gap-2">
                    {a.status === 'pending' && (
                      <Button size="sm" className="btn-brand" onClick={() => void decide(a.id, 'approve')}>
                        Aprobar
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => void decide(a.id, 'reject')}>
                      Rechazar
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
