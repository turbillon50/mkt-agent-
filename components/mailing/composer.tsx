'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { IconSparkles, IconSend, IconCalendar, IconClose, IconCheck, IconEdit } from '@/components/icons';
import { useToast } from '@/components/ui/toast-provider';
import { RecipientsPicker, type Segment } from './recipients-picker';

export type CampaignDraft = {
  id?: string;
  name: string;
  subject: string;
  body: string;
  segment: Segment;
  status?: string;
};

const VARS = ['nombre', 'empresa', 'remitente'];

function preview(text: string): string {
  return text
    .replace(/\{\{\s*nombre\s*\}\}/gi, 'Ana López')
    .replace(/\{\{\s*empresa\s*\}\}/gi, 'Acme Studio')
    .replace(/\{\{\s*remitente\s*\}\}/gi, 'tu marca');
}

export function Composer({
  initial,
  tags,
  statuses,
  mailerConfigured,
  brandName,
  onClose,
  onSaved,
}: {
  initial: CampaignDraft | null;
  tags: Array<{ tag: string; count: number }>;
  statuses: Record<string, number>;
  mailerConfigured: boolean;
  brandName: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { push } = useToast();
  const [id, setId] = React.useState<string | undefined>(initial?.id);
  const [name, setName] = React.useState(initial?.name ?? '');
  const [subject, setSubject] = React.useState(initial?.subject ?? '');
  const [body, setBody] = React.useState(initial?.body ?? '');
  const [segment, setSegment] = React.useState<Segment>(initial?.segment ?? { type: 'all' });
  const [showPreview, setShowPreview] = React.useState(false);
  const [aiPrompt, setAiPrompt] = React.useState('');
  const [busy, setBusy] = React.useState<string | null>(null);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);

  const locked = initial?.status === 'sent' || initial?.status === 'sending';

  function insertVar(v: string) {
    const token = `{{${v}}}`;
    const el = bodyRef.current;
    if (!el) {
      setBody((b) => b + token);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + token + body.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + token.length;
    });
  }

  async function ai(action: 'subject' | 'body' | 'generate') {
    setBusy(`ai-${action}`);
    try {
      const res = await fetch('/api/mailing/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, subject, body, prompt: aiPrompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'la IA falló');
      if (action === 'subject') {
        setSubject(data.subject);
        push({ variant: 'success', title: 'Asunto mejorado por IA' });
      } else if (action === 'body') {
        setBody(data.body);
        push({ variant: 'success', title: 'Cuerpo mejorado por IA' });
      } else {
        if (data.subject) setSubject(data.subject);
        if (data.body) setBody(data.body);
        setAiPrompt('');
        push({ variant: 'success', title: 'Borrador generado por IA' });
      }
    } catch (e) {
      push({ variant: 'error', title: 'La IA no respondió', description: e instanceof Error ? e.message : '' });
    } finally {
      setBusy(null);
    }
  }

  // Guarda como borrador (crea o actualiza) y regresa el id.
  async function persist(): Promise<string | null> {
    if (!name.trim()) {
      push({ variant: 'error', title: 'Ponle nombre a la campaña' });
      return null;
    }
    const payload = { name: name.trim(), subject, body, segment };
    if (id) {
      const res = await fetch(`/api/mailing/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar');
      return id;
    }
    const res = await fetch('/api/mailing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo guardar');
    setId(data.campaign.id);
    return data.campaign.id as string;
  }

  async function saveDraft() {
    setBusy('save');
    try {
      await persist();
      push({ variant: 'success', title: 'Borrador guardado' });
      onSaved();
    } catch (e) {
      push({ variant: 'error', title: 'No se pudo guardar', description: e instanceof Error ? e.message : '' });
    } finally {
      setBusy(null);
    }
  }

  async function saveTemplate() {
    if (!subject.trim() && !body.trim()) return push({ variant: 'error', title: 'Nada que guardar como plantilla' });
    setBusy('tpl');
    try {
      const res = await fetch('/api/mailing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'template', name: name.trim() || subject.trim() || 'Plantilla', subject, body }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'error');
      push({ variant: 'success', title: 'Guardada como plantilla', description: 'La reusas cuando quieras.' });
      onSaved();
    } catch (e) {
      push({ variant: 'error', title: 'No se pudo guardar la plantilla', description: e instanceof Error ? e.message : '' });
    } finally {
      setBusy(null);
    }
  }

  async function sendNow() {
    if (!subject.trim() || !body.trim()) return push({ variant: 'error', title: 'Falta asunto o cuerpo' });
    if (!mailerConfigured) return push({ variant: 'error', title: 'Resend no está configurado', description: 'Pídele a Luis la RESEND_API_KEY.' });
    setBusy('send');
    try {
      const cid = await persist();
      if (!cid) return;
      const res = await fetch('/api/mailing/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: cid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar');
      const r = data.report;
      push({
        variant: 'success',
        title: `Campaña enviada · ${r.sent} correo${r.sent === 1 ? '' : 's'}`,
        description:
          (r.failed ? `${r.failed} fallaron. ` : '') +
          (r.cappedAt ? `Se envió el tope de ${r.cappedAt}; el resto queda para la próxima corrida.` : 'Revisa las tasas reales en la analítica.'),
      });
      onSaved();
      onClose();
    } catch (e) {
      push({ variant: 'error', title: 'No se pudo enviar', description: e instanceof Error ? e.message : '' });
    } finally {
      setBusy(null);
    }
  }

  async function schedule(whenLocal: string) {
    if (!whenLocal) return;
    if (!subject.trim() || !body.trim()) return push({ variant: 'error', title: 'Falta asunto o cuerpo' });
    setBusy('schedule');
    try {
      const cid = await persist();
      if (!cid) return;
      const iso = new Date(whenLocal).toISOString();
      const res = await fetch('/api/mailing/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: cid, scheduleAt: iso }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo programar');
      push({ variant: 'success', title: 'Campaña programada', description: new Date(whenLocal).toLocaleString('es-MX') });
      onSaved();
      onClose();
    } catch (e) {
      push({ variant: 'error', title: 'No se pudo programar', description: e instanceof Error ? e.message : '' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="card-glow border-[var(--color-primary)]/30">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">{id ? 'Editar campaña' : 'Nueva campaña de correo'}</CardTitle>
          <CardDescription>
            Personaliza con {VARS.map((v) => `{{${v}}}`).join(', ')}. Mira la vista previa antes de enviar.
          </CardDescription>
        </div>
        <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md hover:bg-[var(--color-accent)]" aria-label="Cerrar">
          <IconClose className="h-4 w-4" />
        </button>
      </CardHeader>
      <CardContent className="space-y-4">
        {locked && (
          <p className="rounded-lg bg-[var(--color-accent)] px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
            Esta campaña ya fue enviada — se muestra en solo lectura.
          </p>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-muted-foreground)]">Nombre de la campaña</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Invitación al webinar de mayo" disabled={locked} />
        </div>

        {/* Destinatarios */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--color-muted-foreground)]">¿A quién?</label>
          <RecipientsPicker segment={segment} onChange={setSegment} tags={tags} statuses={statuses} />
        </div>

        {/* Generar con IA desde prompt */}
        {!locked && (
          <div className="rounded-xl border border-dashed border-[var(--color-primary)]/30 bg-[var(--color-accent)]/30 p-3">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--color-primary)]">
              <IconSparkles className="h-3.5 w-3.5" /> Generar con IA
            </label>
            <div className="flex gap-2">
              <Input
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Ej: invitación a webinar gratis de marketing el jueves"
                onKeyDown={(e) => e.key === 'Enter' && aiPrompt.trim() && ai('generate')}
              />
              <Button type="button" variant="outline" disabled={busy !== null || !aiPrompt.trim()} onClick={() => ai('generate')}>
                {busy === 'ai-generate' ? 'Generando…' : 'Generar'}
              </Button>
            </div>
          </div>
        )}

        {/* Asunto */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-xs font-medium text-[var(--color-muted-foreground)]">Asunto</label>
            {!locked && (
              <button
                onClick={() => ai('subject')}
                disabled={busy !== null}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-primary)] hover:underline disabled:opacity-50"
              >
                <IconSparkles className="h-3 w-3" /> {busy === 'ai-subject' ? 'Pensando…' : 'Mejorar con IA'}
              </button>
            )}
          </div>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Asunto del correo" disabled={locked} />
        </div>

        {/* Cuerpo */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-xs font-medium text-[var(--color-muted-foreground)]">Cuerpo</label>
            <div className="flex items-center gap-3">
              <button onClick={() => setShowPreview((p) => !p)} className="inline-flex items-center gap-1 text-[11px] font-medium hover:underline">
                <IconEdit className="h-3 w-3" /> {showPreview ? 'Editar' : 'Vista previa'}
              </button>
              {!locked && (
                <button
                  onClick={() => ai('body')}
                  disabled={busy !== null || !body.trim()}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-primary)] hover:underline disabled:opacity-50"
                >
                  <IconSparkles className="h-3 w-3" /> {busy === 'ai-body' ? 'Mejorando…' : 'Mejorar con IA'}
                </button>
              )}
            </div>
          </div>

          {!locked && !showPreview && (
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {VARS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertVar(v)}
                  className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[11px] hover:bg-[var(--color-accent)]"
                >
                  + {`{{${v}}}`}
                </button>
              ))}
            </div>
          )}

          {showPreview ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
              <p className="mb-2 border-b border-[var(--color-border)] pb-2 text-sm font-semibold">{preview(subject) || '(sin asunto)'}</p>
              <div className="space-y-2 text-sm text-[#2a2530]">
                {preview(body)
                  .split(/\n{2,}/)
                  .map((p, i) => (
                    <p key={i} className="leading-relaxed" style={{ whiteSpace: 'pre-wrap' }}>
                      {p}
                    </p>
                  ))}
              </div>
              <p className="mt-4 border-t border-[var(--color-border)] pt-2 text-[11px] text-[var(--color-muted-foreground)]">
                Enviado por {brandName || 'Goossip'} · incluye link de baja real al pie.
              </p>
            </div>
          ) : (
            <Textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hola {{nombre}}, …"
              rows={9}
              disabled={locked}
            />
          )}
        </div>

        {/* Acciones */}
        {!locked && (
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-3">
            <Button onClick={sendNow} disabled={busy !== null} className="btn-brand">
              <IconSend className="h-4 w-4" /> {busy === 'send' ? 'Enviando…' : 'Enviar ahora'}
            </Button>
            <ScheduleButton disabled={busy !== null} onSchedule={schedule} busy={busy === 'schedule'} />
            <Button onClick={saveDraft} variant="outline" disabled={busy !== null}>
              {busy === 'save' ? 'Guardando…' : 'Guardar borrador'}
            </Button>
            <Button onClick={saveTemplate} variant="ghost" disabled={busy !== null} className="text-xs">
              {busy === 'tpl' ? 'Guardando…' : 'Guardar como plantilla'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScheduleButton({ onSchedule, disabled, busy }: { onSchedule: (v: string) => void; disabled: boolean; busy: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [when, setWhen] = React.useState('');
  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant="outline" disabled={disabled}>
        <IconCalendar className="h-4 w-4" /> Programar
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="datetime-local"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
        className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs"
      />
      <Button onClick={() => onSchedule(when)} disabled={disabled || !when} size="sm" className="btn-brand">
        {busy ? '…' : <IconCheck className="h-4 w-4" />}
      </Button>
      <button onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-md hover:bg-[var(--color-accent)]">
        <IconClose className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
