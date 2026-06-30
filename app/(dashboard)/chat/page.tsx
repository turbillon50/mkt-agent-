'use client';

import { useState, useRef, useEffect } from 'react';
import { IconPaperclip, IconSend, IconClose } from '@/components/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const MAX_IMAGE_MB = 10;
const MAX_LONGEST_SIDE = 1920;

/**
 * Normaliza CUALQUIER imagen (HEIC del iPhone, PNG, JPEG, WebP, GIF) a JPEG.
 * Usa decodificación nativa del browser (Safari moderno soporta HEIC) y
 * canvas para re-encode. Reduce a 1920px de lado mayor, strip EXIF (privacidad),
 * salida garantizada image/jpeg que TODOS los modelos de visión aceptan.
 */
async function fileToJpegDataUrl(file: File): Promise<string> {
  const objUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No pude leer la imagen — formato no soportado en este navegador'));
      el.src = objUrl;
    });
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error('Imagen sin dimensiones legibles');
    if (Math.max(w, h) > MAX_LONGEST_SIDE) {
      const s = MAX_LONGEST_SIDE / Math.max(w, h);
      w = Math.round(w * s);
      h = Math.round(h * s);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas no disponible');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.88);
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

type Msg = { role: 'user' | 'agent'; text: string; image?: string };

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

  async function handleFile(file: File) {
    setImageError(null);
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setImageError(`Máximo ${MAX_IMAGE_MB} MB.`);
      return;
    }
    try {
      const jpeg = await fileToJpegDataUrl(file);
      setImage(jpeg);
    } catch (e) {
      setImageError(e instanceof Error ? e.message : 'No se pudo procesar la imagen.');
    }
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
                  ? 'ml-auto btn-brand'
                  : 'bg-[var(--color-card)] border border-[var(--color-border)]'
              }`}
            >
              {m.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.image} alt="imagen" className="mb-2 max-h-64 rounded-lg" />
              )}
              {m.role === 'agent' ? (
                <div className="prose prose-sm max-w-none prose-p:my-1.5 prose-li:my-0.5 prose-strong:text-[var(--color-primary)] prose-headings:text-[var(--color-foreground)] prose-headings:mt-3 prose-headings:mb-1 prose-code:rounded prose-code:bg-[var(--color-muted)] prose-code:px-1 prose-code:py-0.5 prose-code:text-[var(--color-secondary)] prose-code:before:content-none prose-code:after:content-none prose-a:text-[var(--color-primary)]">
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
            <IconClose className="h-4 w-4" />
          </button>
        </div>
      )}
      {imageError && (
        <p className="text-xs text-[var(--color-destructive)]">{imageError}</p>
      )}

      <div className="flex items-end gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          aria-label="Adjuntar imagen"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]"
        >
          <IconPaperclip className="h-4 w-4" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,image/heic,image/heif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
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
          <IconSend className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
