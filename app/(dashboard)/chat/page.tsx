'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type Msg = { role: 'user' | 'agent'; text: string };

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/chat', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const msgs: Msg[] = (data?.messages ?? []).map((m: { role: string; content: string }) => ({
          role: m.role === 'assistant' ? 'agent' : 'user',
          text: m.content,
        }));
        setMessages(msgs);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function send() {
    const prompt = input.trim();
    if (!prompt || loading) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: prompt }]);
    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      const text = data.reply ?? data.error ?? 'sin respuesta';
      setMessages((m) => [...m, { role: 'agent', text }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: 'agent', text: e instanceof Error ? e.message : 'error' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Chat</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Habla con el agente. Puede redactar, publicar, recordar y planificar usando sus tools.
        </p>
      </header>

      <Card className="flex-1 overflow-y-auto">
        <CardContent className="space-y-3 py-4">
          {hydrating && messages.length === 0 && (
            <p className="text-sm text-[var(--color-muted-foreground)]">cargando conversación…</p>
          )}
          {!hydrating && messages.length === 0 && (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Tira algo. <em>"qué onda, qué traes hoy"</em>, <em>"redáctame un tweet sobre X"</em>,{' '}
              <em>"recuerda esto: …"</em>.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                m.role === 'user'
                  ? 'ml-auto bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                  : 'bg-[var(--color-accent)]'
              }`}
            >
              <p className="whitespace-pre-wrap">{m.text}</p>
            </div>
          ))}
          {loading && (
            <div className="max-w-[80%] rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm text-[var(--color-muted-foreground)]">
              pensando…
            </div>
          )}
          <div ref={endRef} />
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Escribe una instrucción para el agente… (⌘+Enter para enviar)"
          className="min-h-[60px]"
        />
        <Button onClick={send} disabled={loading || input.trim().length === 0}>
          Enviar
        </Button>
      </div>
    </div>
  );
}
