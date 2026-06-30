'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { IconBolt, IconPlus, IconClose, IconMail, IconCheckCircle, IconSparkles } from '@/components/icons';
import { useToast } from '@/components/ui/toast-provider';

type Step = { delayHours: number; subject: string; body: string };
type Funnel = {
  id: string;
  name: string;
  triggerStatus: string;
  enabled: boolean;
  steps: Step[];
  activeCount: number;
  completedCount: number;
  sentCount: number;
};
type LogRow = {
  id: string;
  toEmail: string;
  subject: string;
  step: number | null;
  status: string;
  error: string | null;
  sentAt: string;
};

const TRIGGERS: { value: string; label: string }[] = [
  { value: 'new', label: 'Prospecto nuevo' },
  { value: 'contacted', label: 'Contactado' },
  { value: 'qualified', label: 'Calificado' },
];
const triggerLabel = (v: string) => TRIGGERS.find((t) => t.value === v)?.label ?? v;

const WELCOME_TEMPLATE: Step[] = [
  {
    delayHours: 0,
    subject: 'Hola {{nombre}}, gracias por tu interés',
    body: 'Hola {{nombre}},\n\nGracias por acercarte. Soy {{remitente}} y me da mucho gusto saludarte.\n\nMe encantaría conocer un poco más de {{empresa}} y mostrarte cómo podemos ayudarte. ¿Te late si agendamos una llamada corta esta semana?\n\nQuedo al pendiente.',
  },
  {
    delayHours: 48,
    subject: '¿Seguimos, {{nombre}}?',
    body: 'Hola {{nombre}},\n\nTe escribo de nuevo por si el correo anterior se te traspapeló. Sigo con muchas ganas de platicar sobre {{empresa}}.\n\nSi te queda más fácil, mándame un horario y yo me ajusto.\n\nUn saludo.',
  },
  {
    delayHours: 120,
    subject: 'Última nota por ahora',
    body: 'Hola {{nombre}},\n\nNo quiero ser insistente, así que este es mi último correo por el momento. La puerta queda abierta: cuando quieras retomar, aquí estoy.\n\nTe deseo mucho éxito con {{empresa}}.',
  },
];

function emptyStep(): Step {
  return { delayHours: 24, subject: '', body: '' };
}

export function AutomationsBoard() {
  const { push } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [funnels, setFunnels] = React.useState<Funnel[]>([]);
  const [log, setLog] = React.useState<LogRow[]>([]);
  const [summary, setSummary] = React.useState({ active: 0, completed: 0, stopped: 0 });
  const [mailer, setMailer] = React.useState<{ configured: boolean; from: string | null }>({
    configured: false,
    from: null,
  });

  // Form
  const [showForm, setShowForm] = React.useState(false);
  const [name, setName] = React.useState('');
  const [trigger, setTrigger] = React.useState('new');
  const [steps, setSteps] = React.useState<Step[]>([WELCOME_TEMPLATE[0]]);
  const [saving, setSaving] = React.useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/automations', { cache: 'no-store' });
      const data = await res.json();
      setFunnels(data.funnels ?? []);
      setLog(data.log ?? []);
      setSummary(data.summary ?? { active: 0, completed: 0, stopped: 0 });
      setMailer(data.mailer ?? { configured: false, from: null });
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    refresh();
  }, []);

  function resetForm() {
    setName('');
    setTrigger('new');
    setSteps([WELCOME_TEMPLATE[0]]);
    setShowForm(false);
  }

  async function createFunnel() {
    if (saving) return;
    const clean = steps.filter((s) => s.subject.trim() && s.body.trim());
    if (!name.trim()) return push({ variant: 'error', title: 'Ponle nombre al embudo' });
    if (clean.length === 0) return push({ variant: 'error', title: 'Agrega al menos un correo con asunto y cuerpo' });
    setSaving(true);
    try {
      const res = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), triggerStatus: trigger, steps: clean }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo crear');
      push({ variant: 'success', title: 'Embudo creado', description: `Se disparará cuando un lead llegue a "${triggerLabel(trigger)}".` });
      resetForm();
      await refresh();
    } catch (e) {
      push({ variant: 'error', title: 'No se pudo crear', description: e instanceof Error ? e.message : 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function toggle(f: Funnel) {
    setFunnels((prev) => prev.map((x) => (x.id === f.id ? { ...x, enabled: !x.enabled } : x)));
    try {
      const res = await fetch(`/api/automations/${f.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !f.enabled }),
      });
      if (!res.ok) throw new Error();
      push({ variant: 'info', title: !f.enabled ? 'Embudo activado' : 'Embudo pausado' });
    } catch {
      push({ variant: 'error', title: 'No se pudo actualizar' });
      await refresh();
    }
  }

  async function remove(f: Funnel) {
    setFunnels((prev) => prev.filter((x) => x.id !== f.id));
    try {
      const res = await fetch(`/api/automations/${f.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      push({ variant: 'info', title: 'Embudo eliminado' });
    } catch {
      push({ variant: 'error', title: 'No se pudo eliminar' });
      await refresh();
    }
  }

  return (
    <div className="space-y-4">
      {/* Estado del motor de correo */}
      <Card className="card-glow">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`grid h-9 w-9 place-items-center rounded-xl ${
                mailer.configured ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]' : 'bg-[var(--color-muted)]'
              }`}
            >
              <IconMail className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-medium">Motor de correo (Resend)</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {mailer.configured
                  ? `Listo. Envía desde ${mailer.from}`
                  : 'Apagado: falta RESEND_API_KEY. Los embudos quedan guardados y enviarán en cuanto se conecte.'}
              </p>
            </div>
          </div>
          <Badge variant={mailer.configured ? 'default' : 'outline'}>
            {mailer.configured ? 'Conectado' : 'Pendiente'}
          </Badge>
        </CardContent>
      </Card>

      {/* Resumen de inscripciones */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'En secuencia', value: summary.active },
          { label: 'Completados', value: summary.completed },
          { label: 'Correos enviados', value: log.filter((l) => l.status === 'sent').length },
        ].map((s) => (
          <Card key={s.label} className="card-glow">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-semibold">{s.value}</div>
              <div className="text-xs text-[var(--color-muted-foreground)]">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Crear embudo */}
      {!showForm ? (
        <Button onClick={() => setShowForm(true)} className="btn-brand">
          <IconPlus className="h-4 w-4" /> Nuevo embudo
        </Button>
      ) : (
        <Card className="card-glow border-[var(--color-primary)]/30">
          <CardHeader>
            <CardTitle className="text-base">Nuevo embudo de correos</CardTitle>
            <CardDescription>
              Cuando un prospecto llega a la etapa elegida (y tiene correo), entra a esta secuencia
              automática. Usa {'{{nombre}}'}, {'{{empresa}}'} y {'{{remitente}}'} para personalizar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-muted-foreground)]">Nombre</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bienvenida a nuevos leads" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-muted-foreground)]">
                  Se dispara cuando el lead esté
                </label>
                <select
                  value={trigger}
                  onChange={(e) => setTrigger(e.target.value)}
                  className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
                >
                  {TRIGGERS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setSteps(WELCOME_TEMPLATE.map((s) => ({ ...s })))}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-1 text-xs hover:bg-[var(--color-accent)]"
              >
                <IconSparkles className="h-3.5 w-3.5 text-[var(--color-primary)]" /> Cargar secuencia de bienvenida
              </button>
              <span className="text-xs text-[var(--color-muted-foreground)]">
                {steps.length} correo{steps.length === 1 ? '' : 's'} en la secuencia
              </span>
            </div>

            <div className="space-y-3">
              {steps.map((step, i) => (
                <div key={i} className="rounded-xl border border-[var(--color-border)] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold">Correo {i + 1}</span>
                    {steps.length > 1 && (
                      <button
                        onClick={() => setSteps((prev) => prev.filter((_, idx) => idx !== i))}
                        className="text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]"
                        aria-label="Quitar correo"
                      >
                        <IconClose className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="mb-2 flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
                    <span>Enviar</span>
                    <Input
                      type="number"
                      min={0}
                      value={step.delayHours}
                      onChange={(e) =>
                        setSteps((prev) =>
                          prev.map((s, idx) => (idx === i ? { ...s, delayHours: Math.max(0, Number(e.target.value) || 0) } : s)),
                        )
                      }
                      className="h-8 w-20"
                    />
                    <span>horas después {i === 0 ? 'de entrar (0 = inmediato)' : 'del correo anterior'}</span>
                  </div>
                  <Input
                    value={step.subject}
                    onChange={(e) => setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, subject: e.target.value } : s)))}
                    placeholder="Asunto"
                    className="mb-2"
                  />
                  <Textarea
                    value={step.body}
                    onChange={(e) => setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, body: e.target.value } : s)))}
                    placeholder="Cuerpo del correo…"
                    rows={4}
                  />
                </div>
              ))}
              <button
                onClick={() => setSteps((prev) => [...prev, emptyStep()])}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-primary)] hover:underline"
              >
                <IconPlus className="h-3.5 w-3.5" /> Agregar otro correo
              </button>
            </div>

            <div className="flex gap-2">
              <Button onClick={createFunnel} disabled={saving} className="btn-brand">
                {saving ? 'Guardando…' : 'Crear embudo'}
              </Button>
              <Button onClick={resetForm} variant="outline">
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de embudos */}
      {loading ? (
        <Card className="card-glow">
          <CardContent className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">Cargando…</CardContent>
        </Card>
      ) : funnels.length === 0 ? (
        <Card className="card-glow">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <IconBolt className="h-8 w-8 text-[var(--color-muted-foreground)]" />
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Aún no tienes embudos. Crea uno y los prospectos nuevos con correo recibirán tu
              secuencia automáticamente.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {funnels.map((f) => (
            <Card key={f.id} className="card-glow">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{f.name}</span>
                      <Badge variant="outline">{triggerLabel(f.triggerStatus)}</Badge>
                      <Badge variant={f.enabled ? 'default' : 'outline'}>{f.enabled ? 'activo' : 'pausado'}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                      {f.steps.length} correo{f.steps.length === 1 ? '' : 's'} · {f.activeCount} en curso ·{' '}
                      {f.completedCount} completados · {f.sentCount} enviados
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => toggle(f)}
                      className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-[11px] hover:bg-[var(--color-accent)]"
                    >
                      {f.enabled ? 'Pausar' : 'Activar'}
                    </button>
                    <button
                      onClick={() => remove(f)}
                      className="grid h-7 w-7 place-items-center rounded-md text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
                      aria-label="Eliminar"
                    >
                      <IconClose className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <ol className="space-y-1.5 border-l border-[var(--color-border)] pl-3">
                  {f.steps.map((s, i) => (
                    <li key={i} className="text-xs">
                      <span className="text-[var(--color-muted-foreground)]">
                        {s.delayHours === 0 ? 'inmediato' : `+${s.delayHours}h`} ·{' '}
                      </span>
                      <span className="font-medium">{s.subject}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Bitácora de correos */}
      {log.length > 0 && (
        <Card className="card-glow">
          <CardHeader>
            <CardTitle className="text-base">Correos enviados</CardTitle>
            <CardDescription>Evidencia real de cada envío del embudo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {log.map((l) => (
              <div key={l.id} className="flex items-start gap-2 border-b border-[var(--color-border)] pb-2 text-xs last:border-0 last:pb-0">
                {l.status === 'sent' ? (
                  <IconCheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />
                ) : (
                  <IconClose className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-destructive)]" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    <span className="font-medium">{l.subject}</span> → {l.toEmail}
                  </p>
                  {l.error && <p className="text-[var(--color-destructive)]">{l.error}</p>}
                </div>
                <span className="shrink-0 text-[var(--color-muted-foreground)]">
                  {new Date(l.sentAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
