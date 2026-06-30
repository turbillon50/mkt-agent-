'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { IconBarChart, IconPlus, IconClose, IconShare, IconCheckCircle } from '@/components/icons';
import { useToast } from '@/components/ui/toast-provider';

type PollOption = { id: string; label: string; description?: string };

type Poll = {
  id: string;
  slug: string;
  question: string;
  description: string | null;
  options: PollOption[];
  status: 'open' | 'closed';
  winnerOptionId: string | null;
  totalVotes: number;
  tally: Record<string, number>;
};

type OptionDraft = { label: string; description: string };

export function VotacionesWorkspace() {
  const { push } = useToast();
  const [polls, setPolls] = React.useState<Poll[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [origin, setOrigin] = React.useState('');

  const [question, setQuestion] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [options, setOptions] = React.useState<OptionDraft[]>([
    { label: '', description: '' },
    { label: '', description: '' },
  ]);

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const load = React.useCallback(async () => {
    try {
      const r = await fetch('/api/polls', { cache: 'no-store' });
      const d = await r.json();
      if (r.ok) setPolls(d.polls ?? []);
      else throw new Error(d.error ?? 'Error al cargar');
    } catch (e) {
      setPolls([]);
      push({ title: 'No se pudieron cargar las votaciones', description: String(e instanceof Error ? e.message : e), variant: 'error' });
    }
  }, [push]);

  React.useEffect(() => {
    load();
  }, [load]);

  const setOption = (i: number, patch: Partial<OptionDraft>) => {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  };
  const addOption = () => {
    setOptions((prev) => (prev.length >= 4 ? prev : [...prev, { label: '', description: '' }]));
  };
  const removeOption = (i: number) => {
    setOptions((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)));
  };

  const create = async () => {
    if (!question.trim()) return push({ title: 'Escribe la pregunta de la votación', variant: 'error' });
    const filled = options.filter((o) => o.label.trim());
    if (filled.length < 2) return push({ title: 'Pon al menos 2 opciones', variant: 'error' });
    setBusy(true);
    try {
      const r = await fetch('/api/polls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          description,
          options: filled.map((o) => ({ label: o.label, description: o.description })),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Error al crear');
      push({ title: '¡Votación creada!', description: 'Copia el link y compártelo con tu comunidad.', variant: 'success' });
      setQuestion('');
      setDescription('');
      setOptions([
        { label: '', description: '' },
        { label: '', description: '' },
      ]);
      load();
    } catch (e) {
      push({ title: 'No se pudo crear', description: String(e instanceof Error ? e.message : e), variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const closePoll = async (p: Poll) => {
    if (!confirm(`¿Cerrar la votación "${p.question}"? Se avisará por correo a quienes votaron.`)) return;
    try {
      const r = await fetch(`/api/polls/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Error');
      const winner = d.winner?.label ? `Ganó "${d.winner.label}". ` : '';
      push({
        title: 'Votación cerrada',
        description: `${winner}Se notificó a ${d.notified ?? 0} votante${d.notified === 1 ? '' : 's'}.`,
        variant: 'success',
      });
      load();
    } catch (e) {
      push({ title: 'No se pudo cerrar', description: String(e instanceof Error ? e.message : e), variant: 'error' });
    }
  };

  const remove = async (p: Poll) => {
    if (!confirm(`¿Eliminar la votación "${p.question}"?`)) return;
    try {
      const r = await fetch(`/api/polls/${p.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Error');
      push({ title: 'Votación eliminada', variant: 'success' });
      load();
    } catch (e) {
      push({ title: 'No se pudo eliminar', description: String(e instanceof Error ? e.message : e), variant: 'error' });
    }
  };

  const copyLink = async (p: Poll) => {
    const url = `${origin}/vota/${p.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      push({ title: 'Link copiado', description: url, variant: 'success' });
    } catch {
      push({ title: 'Copia el link manualmente', description: url, variant: 'info' });
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      {/* Crear */}
      <Card className="h-fit">
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <IconBarChart className="h-4 w-4 text-[var(--color-primary)]" /> Nueva votación
          </div>
          <Input
            placeholder="Pregunta (ej. ¿Qué sabor lanzamos?)"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <Textarea
            placeholder="Descripción corta (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-[60px]"
          />

          <div className="space-y-2">
            <div className="text-xs font-medium text-[var(--color-muted-foreground)]">Opciones (2 a 4)</div>
            {options.map((o, i) => (
              <div key={i} className="space-y-1.5 rounded-lg border border-[var(--color-border)] p-2.5">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder={`Opción ${i + 1}`}
                    value={o.label}
                    onChange={(e) => setOption(i, { label: e.target.value })}
                  />
                  {options.length > 2 ? (
                    <button
                      type="button"
                      onClick={() => removeOption(i)}
                      className="shrink-0 rounded-md p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
                      aria-label="Quitar opción"
                    >
                      <IconClose className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
                <Input
                  placeholder="Detalle (opcional)"
                  value={o.description}
                  onChange={(e) => setOption(i, { description: e.target.value })}
                />
              </div>
            ))}
            {options.length < 4 ? (
              <Button size="sm" variant="outline" onClick={addOption} className="w-full">
                <IconPlus className="h-3.5 w-3.5" /> Agregar opción
              </Button>
            ) : null}
          </div>

          <Button onClick={create} disabled={busy} className="w-full">
            <IconPlus className="h-4 w-4" /> {busy ? 'Creando…' : 'Crear votación'}
          </Button>
        </CardContent>
      </Card>

      {/* Lista */}
      <div className="space-y-4">
        {polls === null ? (
          <div className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">Cargando votaciones…</div>
        ) : polls.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="mb-2 text-3xl">🗳️</div>
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Aún no tienes votaciones. Crea la primera y deja que tu comunidad elija el próximo producto.
              </p>
            </CardContent>
          </Card>
        ) : (
          polls.map((p) => {
            const total = Object.values(p.tally).reduce((a, b) => a + b, 0);
            const closed = p.status === 'closed';
            return (
              <Card key={p.id}>
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-semibold">{p.question}</h3>
                        <Badge variant={closed ? 'outline' : 'default'}>{closed ? 'Cerrada' : 'Abierta'}</Badge>
                      </div>
                      {p.description ? (
                        <p className="mt-0.5 line-clamp-2 text-sm text-[var(--color-muted-foreground)]">{p.description}</p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right text-sm text-[var(--color-muted-foreground)]">
                      <b className="text-[var(--color-foreground)]">{total}</b> voto{total === 1 ? '' : 's'}
                    </div>
                  </div>

                  {/* Resultados */}
                  <div className="space-y-2">
                    {p.options.map((o) => {
                      const count = p.tally[o.id] ?? 0;
                      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                      const won = closed && p.winnerOptionId === o.id;
                      return (
                        <div key={o.id}>
                          <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                            <span className={`truncate ${won ? 'font-semibold text-[var(--color-primary)]' : ''}`}>
                              {won ? <IconCheckCircle className="mr-1 inline h-3.5 w-3.5" /> : null}
                              {o.label}
                            </span>
                            <span className="shrink-0 text-[var(--color-muted-foreground)]">
                              {pct}% · {count}
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-[var(--color-muted)]">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${pct}%`,
                                background: won
                                  ? 'linear-gradient(90deg,#ff5d8f,#d6336c)'
                                  : 'var(--color-primary)',
                                opacity: won ? 1 : 0.55,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => copyLink(p)}>
                      <IconShare className="h-3.5 w-3.5" /> Copiar link
                    </Button>
                    <a href={`/vota/${p.slug}`} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="ghost">Ver página</Button>
                    </a>
                    {!closed ? (
                      <Button size="sm" variant="ghost" onClick={() => closePoll(p)}>
                        Cerrar votación
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" className="text-[var(--color-destructive)]" onClick={() => remove(p)}>
                      <IconClose className="h-3.5 w-3.5" /> Eliminar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
