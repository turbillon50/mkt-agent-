'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast-provider';
import { IconPhone, IconWhatsApp, IconSend } from '@/components/icons';
import { LEAD_STAGES, type LeadGrade, type LeadStage } from '@/src/sales/types';

interface PipelineLead {
  id: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  score: number;
  grade: LeadGrade;
  stage: LeadStage;
  source: string;
  scoreBreakdown: { signals?: string[]; zone?: string } | null;
  phoneValidation: { valid?: boolean | null; detail?: string } | null;
  createdAt: string;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
}

interface TimelineEvent {
  id: string;
  type: string;
  fromStage: string | null;
  toStage: string | null;
  actor: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

interface TimelineMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  channel: string;
  deliveryStatus: string | null;
  createdAt: string;
}

const STAGE_LABEL: Record<LeadStage, string> = {
  nuevo: 'Nuevos',
  contactado: 'Contactados',
  interesado: 'Interesados',
  cita_agendada: 'Cita agendada',
  visita_hecha: 'Visita hecha',
  apartado: 'Apartado',
  cerrado: 'Cerrado',
  perdido: 'Perdido',
};

const GRADE_STYLE: Record<LeadGrade, string> = {
  A: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  B: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  C: 'bg-slate-500/15 text-slate-600 border-slate-500/30',
};

function waLink(phone: string) {
  return `https://wa.me/${phone.replace(/\D/g, '')}`;
}

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

export function SalesPipeline() {
  const { push } = useToast();
  const [leads, setLeads] = useState<PipelineLead[]>([]);
  const [project, setProject] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<{ events: TimelineEvent[]; messages: TimelineMessage[] } | null>(null);
  const [template, setTemplate] = useState('');
  const [segmentGrade, setSegmentGrade] = useState<'' | LeadGrade>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sales/leads');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'error');
      setLeads(data.leads ?? []);
      setProject(data.project);
    } catch (e) {
      push({ title: 'No se pudo cargar el pipeline', description: e instanceof Error ? e.message : '', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openTimeline(id: string) {
    if (openId === id) {
      setOpenId(null);
      setTimeline(null);
      return;
    }
    setOpenId(id);
    setTimeline(null);
    const res = await fetch(`/api/sales/leads/${id}`);
    const data = await res.json();
    if (res.ok) setTimeline({ events: data.events ?? [], messages: data.messages ?? [] });
  }

  async function changeStage(id: string, stage: LeadStage) {
    const res = await fetch(`/api/sales/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }),
    });
    if (!res.ok) {
      push({ title: 'No se movió la etapa', variant: 'error' });
      return;
    }
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, stage } : l)));
  }

  async function logCall(id: string) {
    await fetch(`/api/sales/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logCall: true }),
    });
    push({ title: 'Llamada registrada', variant: 'success' });
  }

  async function sendSegment() {
    if (!template.trim()) {
      push({ title: 'Escribe el nombre de la plantilla aprobada', variant: 'error' });
      return;
    }
    const res = await fetch('/api/sales/segment-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: template.trim(), grades: segmentGrade ? [segmentGrade] : [] }),
    });
    const data = await res.json();
    if (!res.ok) {
      push({ title: 'No se encoló', description: data.error ?? '', variant: 'error' });
      return;
    }
    push({
      title: `${data.encoladas} acciones en cola`,
      description: `Segmento de ${data.segmento}. Apruébalas en Automatizaciones.`,
      variant: 'success',
    });
  }

  if (loading) return <p className="text-sm text-[var(--color-muted-foreground)]">Cargando…</p>;

  if (!project) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">
          Todavía no tienes proyectos. Crea el primero en{' '}
          <a href="/projects" className="text-[var(--color-primary)] hover:underline">
            Proyectos
          </a>
          .
        </CardContent>
      </Card>
    );
  }

  const porEtapa = LEAD_STAGES.map((s) => ({ stage: s, leads: leads.filter((l) => l.stage === s) })).filter(
    (g) => g.leads.length > 0,
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Pipeline · {project.name}</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {leads.length} leads · {leads.filter((l) => l.grade === 'A').length} de grado A.
        </p>
      </header>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-medium">Plantilla de WhatsApp a un segmento</label>
            <Input value={template} onChange={(e) => setTemplate(e.target.value)} placeholder="primer_contacto_es" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Grado</label>
            <select
              value={segmentGrade}
              onChange={(e) => setSegmentGrade(e.target.value as '' | LeadGrade)}
              className="flex h-9 rounded-md border border-[var(--color-border)] bg-transparent px-3 text-sm"
            >
              <option value="">Todos</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </div>
          <Button onClick={() => void sendSegment()} className="btn-brand">
            <IconSend className="h-4 w-4" /> Encolar
          </Button>
          <p className="w-full text-[11px] text-[var(--color-muted-foreground)]">
            No se manda nada aquí: se encola una acción por lead y el runner las ejecuta con rate
            limit, después de que las apruebes.
          </p>
        </CardContent>
      </Card>

      {porEtapa.map(({ stage, leads: grupo }) => (
        <section key={stage} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            {STAGE_LABEL[stage]} ({grupo.length})
          </h2>
          <div className="space-y-2">
            {grupo.map((l) => (
              <Card key={l.id}>
                <CardContent className="space-y-2 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button onClick={() => void openTimeline(l.id)} className="min-w-0 text-left">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <span className={`rounded border px-1.5 text-[11px] ${GRADE_STYLE[l.grade]}`}>
                          {l.grade} · {l.score}
                        </span>
                        {l.fullName ?? 'Sin nombre'}
                      </p>
                      <p className="truncate text-xs text-[var(--color-muted-foreground)]">
                        {l.phone ?? 'sin teléfono'} · {l.scoreBreakdown?.zone ?? '—'} · {l.source} ·{' '}
                        {fechaCorta(l.createdAt)}
                        {l.phoneValidation?.valid === false && ' · teléfono inválido'}
                      </p>
                    </button>

                    <div className="flex flex-wrap items-center gap-2">
                      {l.phone && (
                        <>
                          <a
                            href={waLink(l.phone)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--color-border)] px-2 text-xs hover:bg-[var(--color-accent)]"
                          >
                            <IconWhatsApp className="h-3.5 w-3.5" /> WA
                          </a>
                          <a
                            href={`tel:${l.phone}`}
                            onClick={() => void logCall(l.id)}
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--color-border)] px-2 text-xs hover:bg-[var(--color-accent)]"
                          >
                            <IconPhone className="h-3.5 w-3.5" /> Tel
                          </a>
                        </>
                      )}
                      <select
                        value={l.stage}
                        onChange={(e) => void changeStage(l.id, e.target.value as LeadStage)}
                        className="h-8 rounded-md border border-[var(--color-border)] bg-transparent px-2 text-xs"
                      >
                        {LEAD_STAGES.map((s) => (
                          <option key={s} value={s}>
                            {STAGE_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {(l.scoreBreakdown?.signals?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {l.scoreBreakdown!.signals!.map((s, i) => (
                        <Badge key={i} variant="outline" className="text-[10px]">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {openId === l.id && (
                    <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
                      {!timeline && <p className="text-xs text-[var(--color-muted-foreground)]">Cargando timeline…</p>}
                      {timeline && timeline.messages.length > 0 && (
                        <div className="space-y-1">
                          {timeline.messages.map((m) => (
                            <p key={m.id} className="text-xs">
                              <span className="text-[var(--color-muted-foreground)]">
                                {m.direction === 'inbound' ? '←' : '→'} {m.channel}{' '}
                                {m.deliveryStatus ? `(${m.deliveryStatus})` : ''}{' '}
                              </span>
                              {m.body.slice(0, 200)}
                            </p>
                          ))}
                        </div>
                      )}
                      {timeline && (
                        <ol className="space-y-1">
                          {timeline.events.map((e) => (
                            <li key={e.id} className="text-[11px] text-[var(--color-muted-foreground)]">
                              {new Date(e.createdAt).toLocaleString('es-MX')} · {e.type}
                              {e.toStage ? ` → ${e.toStage}` : ''} · {e.actor}
                              {e.payload?.note ? ` · ${String(e.payload.note).slice(0, 120)}` : ''}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
