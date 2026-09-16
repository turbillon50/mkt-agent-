'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { IconSend, IconSparkles } from '@/components/icons';
import { cn } from '@/lib/utils';

/**
 * El Asistente EMBEBIDO en el Inicio del proyecto.
 *
 * Luis: *"el chat y todas las herramientas deben ser visibles y funcionar"*. El
 * cajón con ⌘K de la corrida 6 sigue ahí para las otras nueve pantallas, pero
 * en el Inicio el chat no puede estar escondido detrás de un atajo de teclado
 * que nadie descubre solo. Aquí es la columna ancha.
 *
 * Es el MISMO Asistente: la misma ruta, el mismo hilo, el mismo proyecto. No es
 * un segundo chat — si fuera otro, el usuario tendría dos historiales del mismo
 * cliente y ninguno completo.
 */

interface Pieza {
  id: string;
  url: string;
  angulo: string;
}

interface Mensaje {
  role: 'user' | 'assistant';
  content: string;
  piezas?: Pieza[];
  publicado?: string | null;
}

/**
 * Las tres de arranque, tal como se aprobaron. No son ejemplos: son las tres
 * cosas que un cliente nuevo quiere el primer día, y cada una es un prompt
 * completo para que el Asistente no tenga que preguntar "¿de qué?".
 */
const ARRANQUE = [
  { etiqueta: 'Arma una campaña de lanzamiento', prompt: 'Ármame una campaña de lanzamiento para este proyecto: objetivo, redes, mensajes y qué publicar la primera semana.' },
  { etiqueta: 'Redacta 5 posts para esta semana', prompt: 'Redáctame 5 publicaciones para esta semana, con la voz de la marca de este proyecto, y dime en qué red va cada una.' },
  { etiqueta: '¿Qué hace la competencia?', prompt: '¿Qué hace la competencia de este proyecto? Dime cada cuánto publican y de dónde sacaste cada número.' },
];

export function AsistenteEmbebido({
  projectId,
  nombre,
  puedeOperar,
}: {
  projectId: string;
  nombre: string;
  puedeOperar: boolean;
}) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projectId}/asistente`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivo && Array.isArray(d?.mensajes)) setMensajes(d.mensajes);
      })
      .catch(() => undefined)
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [projectId]);

  useEffect(() => {
    // Solo cuando ya hay hilo: hacer scroll al montar con el panel vacío
    // arrastra la página entera hacia abajo y esconde la cabecera del proyecto.
    if (mensajes.length > 0) finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [mensajes, pensando]);

  const mandar = useCallback(
    async (mensaje: string) => {
      if (!mensaje.trim() || pensando) return;
      setMensajes((m) => [...m, { role: 'user', content: mensaje }]);
      setTexto('');
      setPensando(true);
      try {
        const res = await fetch(`/api/projects/${projectId}/asistente`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mensaje }),
        });
        const d = await res.json();
        setMensajes((m) => [
          ...m,
          {
            role: 'assistant',
            content: d?.respuesta ?? d?.error ?? 'No pude contestar.',
            piezas: d?.piezas ?? [],
            publicado: d?.publicado ?? null,
          },
        ]);
      } catch {
        setMensajes((m) => [
          ...m,
          { role: 'assistant', content: 'Se cayó la conexión. Inténtalo otra vez.' },
        ]);
      } finally {
        setPensando(false);
      }
    },
    [pensando, projectId],
  );

  return (
    /*
     * `h-[28rem]` fijo y no `h-full`.
     *
     * Con `h-full` la caja se estiraba a la altura de la columna de al lado y
     * un proyecto nuevo enseñaba 620 px de blanco. Un panel de chat tiene una
     * altura propia: la suficiente para ver el hilo sin comerse la pantalla.
     */
    <Card className="flex h-[28rem] flex-col">
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <div className="flex shrink-0 items-center gap-2">
          <IconSparkles className="h-4 w-4 text-[var(--color-primary)]" />
          <h2 className="text-sm font-semibold">Asistente de {nombre}</h2>
          <span className="ml-auto text-[10px] text-[var(--color-muted-foreground)]">
            también con Ctrl+K desde cualquier pantalla
          </span>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {cargando && (
            <div className="space-y-2">
              <div className="skeleton h-4 w-2/3" />
              <div className="skeleton h-4 w-1/2" />
            </div>
          )}

          {!cargando && mensajes.length === 0 && (
            <div className="space-y-3 py-2">
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Sé todo de {nombre}: sus conexiones, su marca, su conocimiento, sus leads y sus
                campañas. Dime qué hacemos.
              </p>
              <div className="flex flex-wrap gap-2">
                {ARRANQUE.map((s) => (
                  <Button
                    key={s.etiqueta}
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    disabled={pensando}
                    onClick={() => void mandar(s.prompt)}
                  >
                    {s.etiqueta}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {mensajes.map((m, i) => (
            <div
              key={i}
              className={cn(
                'max-w-[92%] rounded-xl px-3 py-2 text-sm',
                m.role === 'user'
                  ? 'ml-auto bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                  : 'bg-[var(--color-accent)]/60',
              )}
            >
              {m.role === 'assistant' ? (
                <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-ul:my-1">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{m.content}</p>
              )}

              {m.piezas && m.piezas.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {m.piezas.map((p, j) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={j}
                      src={p.url}
                      alt={p.angulo}
                      title={p.angulo}
                      className="aspect-[4/5] w-full rounded-md border border-[var(--color-border)] object-cover"
                    />
                  ))}
                </div>
              )}

              {m.publicado && (
                <a
                  href={m.publicado}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs underline"
                >
                  Ver la publicación
                </a>
              )}
            </div>
          ))}

          {pensando && (
            <p className="text-xs text-[var(--color-muted-foreground)]">Goossip está trabajando…</p>
          )}
          <div ref={finRef} />
        </div>

        <form
          className="flex shrink-0 items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void mandar(texto);
          }}
        >
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void mandar(texto);
              }
            }}
            rows={2}
            placeholder={
              puedeOperar
                ? `Pídele algo para ${nombre}…`
                : 'En este proyecto miras sin cambiar nada, pero puedes preguntar.'
            }
            className="min-h-[44px] flex-1 resize-none rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
          />
          <Button type="submit" size="sm" className="btn-brand h-10" disabled={pensando || !texto.trim()}>
            <IconSend className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
