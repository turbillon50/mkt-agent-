'use client';

import { useState, useRef, useEffect } from 'react';
import { Paperclip, Send, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type Msg = { role: 'user' | 'agent'; text: string; image?: string };

const MAX_IMAGE_MB = 5;

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function handleFile(file: File) {
    setImageError(null);
    if (!file.type.startsWith('image/')) {
      setImageError('Solo imágenes (jpg, png, webp).');
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setImageError(`Máximo ${MAX_IMAGE_MB} MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function send() {
    const prompt = input.trim();
    if ((!prompt && !image) || loading) return;
    setInput('');
    const sentImage = image;
    setImage(null);
    setMessages((m) => [...m, { role: 'user', text: prompt || '(imagen)', image: sentImage ?? undefined }]);
    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt || 'Mira esta imagen y dime qué ves.', image: sentImage }),
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
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-4 lg:h-[calc(100vh-4rem)]">
      <header>
        <h1 className="text-2xl font-semibold">Chat con Goossip</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Tu agente de marketing 24/7. Memoria persistente. Puedes mandarle fotos.
        </p>
      </header>

      <Card className="flex-1 overflow-y-auto">
        <CardContent className="space-y-3 py-4">
          {hydrating && messages.length === 0 && (
            <p className="text-sm text-[var(--color-muted-foreground)]">cargando conversación…</p>
          )}
          {!hydrating && messages.length === 0 && (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Tira algo. <em>"qué onda Goossip"</em>, <em>"cuéntame de la familia"</em>,{' '}
              <em>"vamos a mover apicomerce"</em>.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                m.role === 'user'
                  ? 'ml-auto bg-gradient-to-br from-fuchsia-500 to-pink-500 text-white'
                  : 'bg-[var(--color-card)] border border-[var(--color-border)]'
              }`}
            >
              {m.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.image} alt="imagen" className="mb-2 max-h-64 rounded-lg" />
              )}
              {m.role === 'agent' ? (
                <div className="prose prose-invert prose-sm max-w-none prose-p:my-1.5 prose-li:my-0.5 prose-strong:text-fuchsia-300 prose-headings:text-[var(--color-foreground)] prose-headings:mt-3 prose-headings:mb-1 prose-code:rounded prose-code:bg-[var(--color-muted)] prose-code:px-1 prose-code:py-0.5 prose-code:text-fuchsia-200 prose-code:before:content-none prose-code:after:content-none prose-a:text-fuchsia-300">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{m.text}</p>
              )}
            </div>
          ))}
          {loading && (
            <div className="max-w-[80%] rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2.5 text-sm text-[var(--color-muted-foreground)]">
              <span className="inline-block animate-pulse">Goossip está pensando…</span>
            </div>
          )}
          <div ref={endRef} />
        </CardContent>
      </Card>

      {image && (
        <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="preview" className="h-14 w-14 rounded object-cover" />
          <span className="flex-1 text-xs text-[var(--color-muted-foreground)]">
            Imagen lista. Goossip la verá cuando envíes.
          </span>
          <button
            onClick={() => setImage(null)}
            className="grid h-7 w-7 place-items-center rounded-md hover:bg-[var(--color-accent)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {imageError && (
        <p className="text-xs text-rose-300">{imageError}</p>
      )}

      <div className="flex items-end gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          aria-label="Adjuntar imagen"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={image ? 'Pregúntale algo sobre la imagen…' : 'Escribe a Goossip… (⌘+Enter)'}
          className="min-h-[60px] flex-1"
        />
        <Button
          onClick={send}
          disabled={loading || (input.trim().length === 0 && !image)}
          className="btn-brand h-10 px-4"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
