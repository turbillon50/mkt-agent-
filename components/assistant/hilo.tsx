'use client';

import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { IconFile } from '@/components/icons';
import { pesoLegible } from '@/src/assistant/tipos-archivo';
import { cn } from '@/lib/utils';
import type { MensajeUI } from './use-asistente';

/**
 * El hilo: lo dicho y lo hecho.
 *
 * Las respuestas son RICAS y no un bloque de texto, porque lo que Goossip
 * devuelve casi nunca es una frase: son tres piezas para elegir, una tabla de
 * leads o una publicación que ya salió. Una pieza que solo se puede ver
 * abriéndola en otra pestaña es una pieza que nadie aprueba.
 *
 * El auto-scroll solo baja si el usuario YA estaba abajo. Arrastrarlo al final
 * mientras lee un mensaje de hace rato —que es lo que pasa cuando el texto
 * llega transmitido— es pelearse con quien está leyendo.
 */

interface Props {
  mensajes: MensajeUI[];
  pensando: boolean;
  trabajando: string | null;
  vacio?: React.ReactNode;
  /** Para el botón "Ver en <red>" de cada pieza. */
  projectId: string | null;
}

export function Hilo({ mensajes, pensando, trabajando, vacio, projectId }: Props) {
  const caja = useRef<HTMLDivElement>(null);
  const pegadoAbajo = useRef(true);

  useEffect(() => {
    const el = caja.current;
    if (!el || !pegadoAbajo.current) return;
    el.scrollTop = el.scrollHeight;
  }, [mensajes, pensando, trabajando]);

  return (
    <div
      ref={caja}
      onScroll={(e) => {
        const el = e.currentTarget;
        // 40 px de holgura: exigir el píxel exacto hace que un scroll suave
        // que se queda a dos píxeles del fondo cuente como "se subió".
        pegadoAbajo.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
      className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden p-3"
    >
      {mensajes.length === 0 && !pensando && vacio}

      {mensajes.map((m, i) => (
        <div
          key={m.id ?? i}
          className={cn(
            // `min-w-0` + `overflow-hidden`: sin los dos, una tabla de markdown
            // ancha se sale del panel y se va por debajo del borde de la
            // ventana. Se vio en la captura de la respuesta con el brochure.
            'min-w-0 overflow-hidden rounded-xl px-3 py-2 text-sm',
            m.role === 'user'
              ? 'ml-auto max-w-[92%] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
              : 'max-w-full bg-[var(--color-accent)]/60',
          )}
        >
          {m.role === 'assistant' ? (
            <div className="prose prose-sm respuesta-rica max-w-none break-words dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-headings:mt-3 prose-headings:mb-1 prose-table:text-xs prose-blockquote:my-1 prose-blockquote:not-italic">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{limpiarMarkdown(m.content)}</ReactMarkdown>
            </div>
          ) : (
            <p className="whitespace-pre-wrap">{m.content}</p>
          )}

          {/* Lo que el usuario adjuntó, para que el hilo se entienda al releerlo. */}
          {m.adjuntos && m.adjuntos.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {m.adjuntos.map((a) => (
                <a
                  key={a.id}
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  title={`${a.nombre} · ${pesoLegible(a.size)}`}
                  className={cn(
                    'flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]',
                    m.role === 'user'
                      ? 'border-white/30 text-white/90'
                      : 'border-[var(--color-border)]',
                  )}
                >
                  <IconFile className="h-3 w-3" />
                  <span className="max-w-[120px] truncate">{a.nombre}</span>
                </a>
              ))}
            </div>
          )}

          {m.piezas && m.piezas.length > 0 && (
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {m.piezas.map((p, j) => (
                <figure key={p.id || j} className="min-w-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={p.angulo}
                    title={p.angulo}
                    className="aspect-[4/5] w-full rounded-md border border-[var(--color-border)] object-cover"
                  />
                  <figcaption className="mt-0.5 flex items-center gap-1">
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-[10px] underline decoration-dotted"
                    >
                      Ver grande
                    </a>
                    {projectId && p.id && (
                      <a
                        href={`/projects/${projectId}/piezas`}
                        className="shrink-0 text-[10px] underline decoration-dotted"
                      >
                        Decidir
                      </a>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}

          {m.publicado && (
            <a
              href={m.publicado}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block rounded-md border border-[var(--color-border)] px-2 py-1 text-xs"
            >
              Ver la publicación ↗
            </a>
          )}
        </div>
      ))}

      {/*
        El "está trabajando" dice QUÉ está haciendo cuando se sabe. "Goossip
        está leyendo brochure.pdf…" es información; "Cargando…" es un reloj de
        arena con otra tipografía.
      */}
      {trabajando && (
        <div className="max-w-[92%] rounded-xl bg-[var(--color-accent)]/60 px-3 py-2">
          <span className="text-xs text-[var(--color-muted-foreground)]">{trabajando}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Los `<br>` que sueltan los modelos dentro de las celdas de una tabla.
 *
 * `react-markdown` no interpreta HTML —y está bien que no lo haga: activarlo
 * sería dejar que el texto de un modelo meta etiquetas en la página— así que
 * esos `<br>` se pintaban LITERALES, como "&lt;br&gt;" en medio de la frase. Se
 * vio en la respuesta del brochure. Se cambian por el salto que el modelo
 * quería, y nada más: no se interpreta ninguna otra etiqueta.
 */
function limpiarMarkdown(texto: string): string {
  return texto.replace(/<br\s*\/?>/gi, '\n');
}
