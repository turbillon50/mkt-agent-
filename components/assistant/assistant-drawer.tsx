'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  IconClose,
  IconPlug,
  IconSend,
  IconSparkles,
  IconTarget,
} from '@/components/icons';
import { useProjects } from '@/components/projects-provider';
import { cn } from '@/lib/utils';

/**
 * El Asistente, en TODA la app.
 *
 * Es un cajón a la derecha con ⌘K / Ctrl+K, no una pantalla. La diferencia
 * importa: preguntarle algo a Goossip mientras miras tus leads no debería
 * costarte perder de vista tus leads. Hasta la corrida 5 el chat era una
 * sección: entrar a preguntar era salirte de donde estabas.
 *
 * El cajón SIEMPRE es de un proyecto — el activo. Sin proyecto no hay
 * Asistente, y eso no es una limitación: es la corrección. El Goossip que no
 * sabía de qué cliente le hablaban acababa publicando con la cuenta de la casa.
 *
 * Arriba del hilo va la GUÍA ACTIVA: lo que el proyecto necesita hoy, con su
 * botón. No espera a que le pregunten.
 */

interface Sugerencia {
  id: string;
  texto: string;
  urgencia: 'alta' | 'media' | 'baja';
  accion: { etiqueta: string; href?: string; prompt?: string };
}

interface Guia {
  proyecto: { id: string; nombre: string };
  puedeOperar: boolean;
  conectados: string[];
  porReconectar: string[];
  kitCompleto: boolean;
  leadsSinContactar: number;
  piezasSinDecidir: number;
  sugerencias: Sugerencia[];
}

interface Mensaje {
  role: 'user' | 'assistant';
  content: string;
  piezas?: Array<{ id: string; url: string; angulo: string }>;
  publicado?: string | null;
}

const URGENCIA_COLOR: Record<Sugerencia['urgencia'], string> = {
  alta: 'border-l-[var(--color-destructive)]',
  media: 'border-l-amber-500',
  baja: 'border-l-[var(--color-primary)]',
};

export function AssistantDrawer() {
  const { active } = useProjects();
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [guia, setGuia] = useState<Guia | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const projectId = active?.id ?? null;

  // ⌘K / Ctrl+K abre y cierra. Escape cierra.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAbierto((v) => !v);
      }
      if (e.key === 'Escape') setAbierto(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (abierto) setTimeout(() => inputRef.current?.focus(), 60);
  }, [abierto]);

  /**
   * Cualquier pantalla le puede DICTAR algo al Asistente.
   *
   * Es un evento del navegador y no un estado global a propósito: el botón
   * "Generar pieza" de la auditoría de marca vive tres componentes más abajo y
   * en otro árbol, y pasarle una función por props significaría enhebrarla por
   * toda la app. El cajón escucha, se abre y manda.
   */
  useEffect(() => {
    const onDictar = (e: Event) => {
      const prompt = (e as CustomEvent<{ prompt?: string }>).detail?.prompt;
      if (!prompt) return;
      setAbierto(true);
      void mandarRef.current?.(prompt);
    };
    window.addEventListener('goossip:dictar', onDictar);
    return () => window.removeEventListener('goossip:dictar', onDictar);
  }, []);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, pensando]);

  // La guía se refresca al cambiar de proyecto Y al cambiar de pantalla: mover
  // un lead a "contactado" tiene que apagar el aviso sin que nadie recargue.
  useEffect(() => {
    if (!projectId) {
      setGuia(null);
      return;
    }
    let vivo = true;
    fetch(`/api/projects/${projectId}/guia`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivo && d?.proyecto) setGuia(d);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [projectId, pathname]);

  // El hilo se carga al abrir, no al montar: nadie paga una consulta por una
  // pantalla que no va a abrir el panel.
  useEffect(() => {
    if (!abierto || !projectId) return;
    let vivo = true;
    fetch(`/api/projects/${projectId}/asistente`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivo && Array.isArray(d?.mensajes)) setMensajes(d.mensajes);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [abierto, projectId]);

  const mandar = useCallback(
    async (mensaje: string) => {
      if (!projectId || !mensaje.trim() || pensando) return;
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
        // Algo pasó: la guía puede haber cambiado.
        fetch(`/api/projects/${projectId}/guia`, { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((g) => g?.proyecto && setGuia(g))
          .catch(() => undefined);
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

  // El listener de `goossip:dictar` se monta UNA vez y `mandar` cambia en cada
  // render (depende de `pensando`). Sin la referencia, el listener se quedaría
  // con la primera versión y mandaría con el proyecto de hace tres pantallas.
  const mandarRef = useRef(mandar);
  useEffect(() => {
    mandarRef.current = mandar;
  }, [mandar]);

  const pendientes = guia?.sugerencias.length ?? 0;

  /**
   * En el Inicio del proyecto, el botón flotante NO se pinta.
   *
   * Ahí el Asistente está EMBEBIDO en la columna ancha (corrida 7), así que el
   * botón sería un segundo acceso a lo mismo — y, peor, un botón fijo abajo a
   * la derecha que tapa una esquina del grid de Herramientas. Se vio en la
   * captura de 1440: caía justo encima de la tarjeta de Competencia.
   *
   * El atajo Ctrl+K sigue funcionando en todas partes, también aquí.
   */
  const enElInicio = Boolean(projectId) && pathname === `/projects/${projectId}`;

  return (
    <>
      {/* El botón flotante. Lleva el número de pendientes: el aviso se ve sin
          abrir nada, que es la mitad de "guía activa". */}
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Abrir el Asistente (Ctrl+K)"
        title="Asistente · Ctrl+K"
        className={cn(
          'fixed bottom-24 right-4 z-40 flex h-12 items-center gap-2 rounded-full bg-gradient-to-br from-[var(--color-brand-1)] to-[var(--color-brand-3)] px-4 text-white shadow-lg transition-transform hover:scale-105 lg:bottom-6',
          (abierto || enElInicio) && 'hidden',
        )}
      >
        <IconSparkles className="h-5 w-5" />
        <span className="hidden text-sm font-medium sm:inline">Asistente</span>
        {pendientes > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-[10px] font-bold text-[var(--color-primary)]">
            {pendientes}
          </span>
        )}
      </button>

      {abierto && (
        <button
          type="button"
          aria-label="Cerrar el Asistente"
          onClick={() => setAbierto(false)}
          className="fixed inset-0 z-40 bg-[var(--color-foreground)]/20 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        aria-hidden={!abierto}
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col border-l border-[var(--color-border)] bg-[var(--color-background-elevated)] shadow-2xl transition-transform duration-200 ease-out',
          abierto ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-2 border-b border-[var(--color-border)] p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <IconSparkles className="h-4 w-4 text-[var(--color-primary)]" />
              <h2 className="text-sm font-semibold">Asistente</h2>
            </div>
            <p className="mt-0.5 truncate text-xs text-[var(--color-muted-foreground)]">
              {guia ? guia.proyecto.nombre : active?.name ?? 'Elige un proyecto'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAbierto(false)}
            aria-label="Cerrar"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </header>

        {!projectId ? (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-[var(--color-muted-foreground)]">
            <p>
              El Asistente siempre trabaja dentro de un proyecto. Elige uno en el menú y vuelve a
              abrirlo.
            </p>
          </div>
        ) : (
          <>
            {/* ---- la guía activa ---- */}
            {guia && (
              <div className="shrink-0 space-y-2 border-b border-[var(--color-border)] p-3">
                <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                  <Badge variant="outline" className="gap-1">
                    <IconPlug className="h-3 w-3" />
                    {guia.conectados.length} conectados
                  </Badge>
                  {guia.leadsSinContactar > 0 && (
                    <Badge variant="outline" className="gap-1">
                      <IconTarget className="h-3 w-3" />
                      {guia.leadsSinContactar} sin contactar
                    </Badge>
                  )}
                  <Badge variant="outline">{guia.kitCompleto ? 'Marca cargada' : 'Sin marca'}</Badge>
                </div>

                {guia.sugerencias.slice(0, 3).map((s) => (
                  <div
                    key={s.id}
                    className={cn(
                      'rounded-r-lg border-l-2 bg-[var(--color-accent)]/40 py-2 pl-2.5 pr-2',
                      URGENCIA_COLOR[s.urgencia],
                    )}
                  >
                    <p className="text-xs leading-snug">{s.texto}</p>
                    <div className="mt-1.5">
                      {s.accion.href ? (
                        <Button asChild size="sm" variant="outline" className="h-7 text-[11px]">
                          <Link href={s.accion.href} onClick={() => setAbierto(false)}>
                            {s.accion.etiqueta}
                          </Link>
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          disabled={pensando}
                          onClick={() => void mandar(s.accion.prompt ?? s.accion.etiqueta)}
                        >
                          {s.accion.etiqueta}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ---- el hilo ---- */}
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              {mensajes.length === 0 && (
                <p className="px-1 py-6 text-center text-xs text-[var(--color-muted-foreground)]">
                  Pregúntame lo que quieras de {guia?.proyecto.nombre ?? 'este proyecto'}: qué
                  publicar, qué medidas lleva un reel, o pídeme que te haga la pieza.
                </p>
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
                <div className="max-w-[92%] rounded-xl bg-[var(--color-accent)]/60 px-3 py-2">
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    Trabajando… si te pedí una pieza, esto tarda cerca de un minuto.
                  </span>
                </div>
              )}
              <div ref={finRef} />
            </div>

            {/* ---- escribir ---- */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void mandar(texto);
              }}
              className="flex shrink-0 items-end gap-2 border-t border-[var(--color-border)] p-3"
            >
              <textarea
                ref={inputRef}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void mandar(texto);
                  }
                }}
                rows={2}
                placeholder="Publica en LinkedIn: …"
                aria-label="Mensaje para el Asistente"
                className="min-h-[44px] max-h-32 flex-1 resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-ring)]"
              />
              <Button
                type="submit"
                size="icon"
                disabled={pensando || !texto.trim()}
                className="btn-brand shrink-0"
                aria-label="Mandar"
              >
                <IconSend className="h-4 w-4" />
              </Button>
            </form>
          </>
        )}
      </aside>
    </>
  );
}
