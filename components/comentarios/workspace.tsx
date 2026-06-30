'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  IconChat,
  IconPlus,
  IconClose,
  IconCheckCircle,
  IconSparkles,
  IconTarget,
} from '@/components/icons';
import { useToast } from '@/components/ui/toast-provider';

type Rule = {
  id: string;
  name: string;
  platform: string;
  keywords: string[];
  replyMessage: string;
  paymentLink: string | null;
  active: boolean;
  matchedCount: number;
};

const PLATFORMS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'twitter', label: 'Twitter / X' },
];

function platformLabel(value: string): string {
  return PLATFORMS.find((p) => p.value === value)?.label ?? value;
}

function parseKeywords(raw: string): string[] {
  return raw
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
}

export function ComentariosWorkspace() {
  const { push } = useToast();
  const [rules, setRules] = React.useState<Rule[] | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [name, setName] = React.useState('');
  const [platform, setPlatform] = React.useState('instagram');
  const [keywords, setKeywords] = React.useState('quiero, precio, info, cuánto, cómo compro');
  const [replyMessage, setReplyMessage] = React.useState('');
  const [paymentLink, setPaymentLink] = React.useState('');

  const [testText, setTestText] = React.useState('');
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<
    { matched: boolean; ruleName?: string; reply?: string } | null
  >(null);

  const load = React.useCallback(async () => {
    try {
      const r = await fetch('/api/comment-rules', { cache: 'no-store' });
      const d = await r.json();
      if (r.ok) setRules(d.rules ?? []);
      else throw new Error(d.error ?? 'Error al cargar');
    } catch (e) {
      setRules([]);
      push({
        title: 'No se pudieron cargar las reglas',
        description: String(e instanceof Error ? e.message : e),
        variant: 'error',
      });
    }
  }, [push]);

  React.useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!name.trim()) return push({ title: 'Ponle un nombre a la regla', variant: 'error' });
    const kw = parseKeywords(keywords);
    if (kw.length === 0) return push({ title: 'Agrega al menos una palabra clave', variant: 'error' });
    if (!replyMessage.trim()) return push({ title: 'Falta el mensaje de respuesta', variant: 'error' });
    setBusy(true);
    try {
      const r = await fetch('/api/comment-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, platform, keywords: kw, replyMessage, paymentLink }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Error al crear');
      push({ title: '¡Regla creada!', description: 'Ya responde sola a los comentarios que matcheen.', variant: 'success' });
      setName('');
      setReplyMessage('');
      setPaymentLink('');
      load();
    } catch (e) {
      push({ title: 'No se pudo crear', description: String(e instanceof Error ? e.message : e), variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const runTest = async () => {
    if (!testText.trim()) return push({ title: 'Escribe un comentario de ejemplo', variant: 'error' });
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch('/api/comment-rules/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: testText }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Error al probar');
      setTestResult(d);
      push({
        title: d.matched ? `Matchea: ${d.ruleName}` : 'Ninguna regla matchea',
        variant: d.matched ? 'success' : 'info',
      });
    } catch (e) {
      push({ title: 'No se pudo probar', description: String(e instanceof Error ? e.message : e), variant: 'error' });
    } finally {
      setTesting(false);
    }
  };

  const toggle = async (rule: Rule) => {
    try {
      const r = await fetch(`/api/comment-rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !rule.active }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? 'Error');
      push({ title: rule.active ? 'Regla pausada' : 'Regla activada', variant: 'success' });
      load();
    } catch (e) {
      push({ title: 'No se pudo actualizar', description: String(e instanceof Error ? e.message : e), variant: 'error' });
    }
  };

  const remove = async (rule: Rule) => {
    if (!confirm(`¿Eliminar la regla "${rule.name}"?`)) return;
    try {
      const r = await fetch(`/api/comment-rules/${rule.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Error');
      push({ title: 'Regla eliminada', variant: 'success' });
      load();
    } catch (e) {
      push({ title: 'No se pudo eliminar', description: String(e instanceof Error ? e.message : e), variant: 'error' });
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
      {/* Crear + Probar */}
      <div className="space-y-6">
        <Card className="h-fit">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <IconChat className="h-4 w-4 text-[var(--color-primary)]" /> Nueva regla
            </div>
            <Input placeholder="Nombre (ej. Cierre de venta)" value={name} onChange={(e) => setName(e.target.value)} />
            <div>
              <div className="mb-1.5 text-xs font-medium text-[var(--color-muted-foreground)]">Plataforma</div>
              <div className="flex flex-wrap gap-1.5">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPlatform(p.value)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      platform === p.value
                        ? 'border-transparent bg-[var(--color-primary)] text-white'
                        : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-[var(--color-muted-foreground)]">
                Palabras clave (separadas por comas)
              </div>
              <Input
                placeholder="quiero, precio, info, cuánto"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
              />
            </div>
            <Textarea
              placeholder="Mensaje de respuesta automático (ej. ¡Hola! Aquí tienes toda la info 👇)"
              value={replyMessage}
              onChange={(e) => setReplyMessage(e.target.value)}
              className="min-h-[80px]"
            />
            <Input
              placeholder="Link de pago / landing (opcional)"
              value={paymentLink}
              onChange={(e) => setPaymentLink(e.target.value)}
            />
            <Button onClick={create} disabled={busy} className="w-full">
              <IconPlus className="h-4 w-4" /> {busy ? 'Creando…' : 'Crear regla'}
            </Button>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <IconSparkles className="h-4 w-4 text-[var(--color-primary)]" /> Probar
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Escribe un comentario de ejemplo y mira qué regla respondería. No crea leads.
            </p>
            <Textarea
              placeholder="Ej. Hola, ¿cuánto cuesta? lo quiero"
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              className="min-h-[64px]"
            />
            <Button onClick={runTest} disabled={testing} variant="outline" className="w-full">
              <IconTarget className="h-4 w-4" /> {testing ? 'Probando…' : 'Probar'}
            </Button>
            {testResult ? (
              testResult.matched ? (
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-3 text-sm">
                  <div className="mb-1 flex items-center gap-1.5 font-medium text-[var(--color-primary)]">
                    <IconCheckCircle className="h-4 w-4" /> {testResult.ruleName}
                  </div>
                  <p className="whitespace-pre-wrap text-[var(--color-muted-foreground)]">{testResult.reply}</p>
                </div>
              ) : (
                <div className="rounded-lg border border-[var(--color-border)] p-3 text-sm text-[var(--color-muted-foreground)]">
                  Ninguna regla matchea este comentario.
                </div>
              )
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Lista */}
      <div className="space-y-4">
        {rules === null ? (
          <div className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">Cargando reglas…</div>
        ) : rules.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="mb-2 text-3xl">💬</div>
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Aún no tienes reglas. Crea la primera y deja que tus comentarios se conviertan en leads solos.
              </p>
            </CardContent>
          </Card>
        ) : (
          rules.map((rule) => (
            <Card key={rule.id}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold">{rule.name}</h3>
                      <Badge variant={rule.active ? 'default' : 'outline'}>{rule.active ? 'Activa' : 'Pausada'}</Badge>
                      <Badge variant="outline">{platformLabel(rule.platform)}</Badge>
                    </div>
                  </div>
                  <div className="shrink-0 text-sm text-[var(--color-muted-foreground)]">
                    Matches: <b className="text-[var(--color-foreground)]">{rule.matchedCount}</b>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {rule.keywords.map((k, i) => (
                    <span
                      key={`${k}-${i}`}
                      className="rounded-full bg-[var(--color-muted)]/60 px-2.5 py-0.5 text-xs text-[var(--color-muted-foreground)]"
                    >
                      {k}
                    </span>
                  ))}
                </div>

                <p className="line-clamp-2 text-sm text-[var(--color-muted-foreground)]">{rule.replyMessage}</p>
                {rule.paymentLink ? (
                  <p className="truncate text-xs text-[var(--color-primary)]">{rule.paymentLink}</p>
                ) : null}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button size="sm" variant="ghost" onClick={() => toggle(rule)}>
                    {rule.active ? 'Pausar' : 'Activar'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-[var(--color-destructive)]"
                    onClick={() => remove(rule)}
                  >
                    <IconClose className="h-3.5 w-3.5" /> Eliminar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
