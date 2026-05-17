'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export function WhatsAppComposer() {
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    if (sending) return;
    const cleanTo = to.replace(/[^\d]/g, '');
    if (cleanTo.length < 8 || !message.trim()) {
      setFeedback({ ok: false, text: 'Pon un número (solo dígitos) y un mensaje.' });
      return;
    }
    setSending(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: cleanTo, message: message.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback({ ok: true, text: `Enviado · id ${data.messageId.slice(0, 8)}` });
        setMessage('');
      } else {
        setFeedback({ ok: false, text: data.error ?? 'error' });
      }
    } catch (e) {
      setFeedback({ ok: false, text: e instanceof Error ? e.message : 'error' });
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="card-glow">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Enviar mensaje</CardTitle>
        <CardDescription>Envío manual desde el dashboard. Goossip lo guarda como outbound · human.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Número en E.164 (ej. 5215512345678)"
        />
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Mensaje…"
          className="min-h-[90px]"
        />
        <Button onClick={send} disabled={sending} className="btn-brand w-full">
          {sending ? 'Enviando…' : 'Enviar'}
        </Button>
        {feedback && (
          <p
            className={`text-xs ${
              feedback.ok ? 'text-emerald-300' : 'text-rose-300'
            }`}
          >
            {feedback.text}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
