'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  IconClose,
  IconFile,
  IconImage,
  IconMic,
  IconPaperclip,
  IconSend,
  IconStop,
  IconVideo,
} from '@/components/icons';
import { comandosQueEmpiezanCon, type Comando } from '@/src/assistant/comandos';
import { pesoLegible } from '@/src/assistant/tipos-archivo';
import { cn } from '@/lib/utils';
import { useDictado } from './dictado';
import { useAdjuntos } from './use-adjuntos';
import type { MencionUI } from './use-asistente';

/**
 * El compose.
 *
 * Todo lo que se puede meter a una conversación entra por aquí: texto,
 * archivos de cualquier tipo, menciones a cosas del proyecto, comandos y la
 * voz. La caja crece sola, Enter manda y Shift+Enter salta de renglón.
 *
 * Tres decisiones que no se ven y que son las que lo hacen usable:
 *
 *  1. **La zona de soltar es TODO el compose, no un recuadro punteado.** El
 *     recuadro obliga a apuntar; soltar un archivo encima de la caja donde ya
 *     estabas escribiendo es lo que la gente intenta primero.
 *
 *  2. **Pegar cuenta como adjuntar.** Una captura de pantalla en el
 *     portapapeles es el archivo que más se manda en esta app y no tiene
 *     nombre ni vive en ninguna carpeta: si solo se aceptara el clip, habría
 *     que guardarla al escritorio primero.
 *
 *  3. **`@` y `/` se detectan por la posición del cursor, no por cómo empieza
 *     el texto.** Escribir "mándale un mensaje a @an" con el cursor después de
 *     "an" tiene que ofrecer leads; el mismo texto con el cursor al principio,
 *     no. Mirar solo el final de la cadena falla en cuanto alguien corrige algo
 *     que escribió tres palabras atrás.
 */

export interface EnvioDelCompose {
  texto: string;
  adjuntos: Array<{ id: string; nombre: string; mime: string; size: number; url: string }>;
  menciones: MencionUI[];
  autonomia: 'propone' | 'publica';
}

interface Props {
  projectId: string | null;
  pensando: boolean;
  puedeOperar: boolean;
  autonomia: 'propone' | 'publica';
  onAutonomia: (a: 'propone' | 'publica') => void;
  onEnviar: (envio: EnvioDelCompose) => void;
  onDetener: () => void;
  /** En el cajón de celular la barra va más apretada. */
  compacto?: boolean;
  placeholder?: string;
}

type Disparador = { tipo: '@' | '/'; inicio: number; consulta: string } | null;

/**
 * Qué menú toca abrir, si toca alguno.
 *
 * `/` solo cuenta al principio del mensaje: un comando es el mensaje entero,
 * no una palabra en medio. `@` cuenta en cualquier lado siempre que venga
 * después de un espacio — si no, cualquier correo escrito en el chat abriría
 * el menú de menciones.
 */
function detectarDisparador(texto: string, caret: number): Disparador {
  const antes = texto.slice(0, caret);

  if (/^\/[\p{L}]*$/u.test(antes)) {
    return { tipo: '/', inicio: 0, consulta: antes.slice(1) };
  }

  const arroba = antes.lastIndexOf('@');
  if (arroba >= 0) {
    const anterior = arroba === 0 ? ' ' : antes[arroba - 1]!;
    const trozo = antes.slice(arroba + 1);
    if (/\s/.test(anterior) && !/\n/.test(trozo) && trozo.length <= 30) {
      return { tipo: '@', inicio: arroba, consulta: trozo };
    }
  }
  return null;
}

export function Compose({
  projectId,
  pensando,
  puedeOperar,
  autonomia,
  onAutonomia,
  onEnviar,
  onDetener,
  compacto = false,
  placeholder = 'Pregúntame lo que sea de este proyecto…',
}: Props) {
  const [texto, setTexto] = useState('');
  const [menciones, setMenciones] = useState<MencionUI[]>([]);
  const [disparador, setDisparador] = useState<Disparador>(null);
  const [sugerencias, setSugerencias] = useState<MencionUI[]>([]);
  const [resaltada, setResaltada] = useState(0);
  const [encima, setEncima] = useState(false);

  const caja = useRef<HTMLTextAreaElement>(null);
  const clip = useRef<HTMLInputElement>(null);
  const imagen = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLInputElement>(null);
  const arrastres = useRef(0);

  const adjuntos = useAdjuntos(projectId);

  const dictado = useDictado(
    useCallback((trozo: string) => {
      setTexto((t) => (t ? `${t.replace(/\s+$/, '')} ${trozo.trim()}` : trozo.trim()));
    }, []),
  );

  /* ---- la caja crece sola ---- */
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    el.style.height = 'auto';
    // El tope es de la CAJA, no del panel: sin él, un mensaje largo empuja la
    // barra de botones fuera de la pantalla y ya no se puede ni mandar.
    el.style.height = `${Math.min(el.scrollHeight, compacto ? 120 : 200)}px`;
  }, [compacto, texto]);

  /* ---- el menú de `@` ---- */
  useEffect(() => {
    if (!disparador || disparador.tipo !== '@' || !projectId) {
      if (disparador?.tipo !== '/') setSugerencias([]);
      return;
    }
    let vivo = true;
    const t = setTimeout(() => {
      fetch(
        `/api/projects/${projectId}/asistente/menciones?q=${encodeURIComponent(disparador.consulta)}`,
        { cache: 'no-store' },
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!vivo) return;
          setSugerencias(Array.isArray(d?.menciones) ? d.menciones : []);
          setResaltada(0);
        })
        .catch(() => undefined);
      // 140 ms: lo suficiente para que escribir "ana" no dispare tres consultas
      // y lo bastante poco para que el menú no se sienta perezoso.
    }, 140);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [disparador, projectId]);

  const comandos: Comando[] = useMemo(
    () =>
      disparador?.tipo === '/' ? comandosQueEmpiezanCon(disparador.consulta, puedeOperar) : [],
    [disparador, puedeOperar],
  );

  const opciones = disparador?.tipo === '/' ? comandos.length : sugerencias.length;
  const menuAbierto = Boolean(disparador) && opciones > 0;

  const alEscribir = useCallback((valor: string, caret: number) => {
    setTexto(valor);
    setDisparador(detectarDisparador(valor, caret));
  }, []);

  const elegir = useCallback(
    (indice: number) => {
      if (!disparador) return;
      const el = caja.current;
      const caret = el?.selectionStart ?? texto.length;

      if (disparador.tipo === '/') {
        const c = comandos[indice];
        if (!c) return;
        // El comando se deja escrito con su barra y un espacio: el usuario ve
        // lo que eligió y sigue escribiendo el argumento. Expandirlo aquí, en
        // la caja, le enseñaría un párrafo que él no escribió.
        const nuevo = `/${c.nombre} `;
        setTexto(nuevo + texto.slice(caret));
        setDisparador(null);
        requestAnimationFrame(() => {
          el?.focus();
          el?.setSelectionRange(nuevo.length, nuevo.length);
        });
        return;
      }

      const m = sugerencias[indice];
      if (!m) return;
      const antes = texto.slice(0, disparador.inicio);
      const despues = texto.slice(caret);
      const insertado = `@${m.etiqueta} `;
      setTexto(antes + insertado + despues);
      setMenciones((lista) =>
        lista.some((x) => x.tipo === m.tipo && x.id === m.id) ? lista : [...lista, m],
      );
      setDisparador(null);
      const pos = antes.length + insertado.length;
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(pos, pos);
      });
    },
    [comandos, disparador, sugerencias, texto],
  );

  const mandar = useCallback(() => {
    const limpio = texto.trim();
    if (!limpio && !adjuntos.listos.length) return;
    if (pensando) return;
    onEnviar({
      texto: limpio,
      adjuntos: adjuntos.listos,
      // Solo se mandan las menciones que SIGUEN escritas. Si alguien borró
      // "@Ana" del texto, mandar su ficha al modelo haría que Goossip conteste
      // sobre alguien que el usuario ya había quitado.
      menciones: menciones.filter((m) => limpio.includes(`@${m.etiqueta}`)),
      autonomia,
    });
    setTexto('');
    setMenciones([]);
    setDisparador(null);
    adjuntos.limpiar();
    dictado.detener();
  }, [adjuntos, autonomia, dictado, menciones, onEnviar, pensando, texto]);

  const alTeclear = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuAbierto) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setResaltada((i) => (i + 1) % opciones);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setResaltada((i) => (i - 1 + opciones) % opciones);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        elegir(resaltada);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        // Escape cierra el MENÚ, no el panel. Se para la propagación porque el
        // panel también escucha Escape: sin esto, quitar el menú de menciones
        // te cerraba Goossip entero.
        e.stopPropagation();
        setDisparador(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      mandar();
    }
  };

  /* ---- soltar y pegar ---- */
  const alSoltar = (e: React.DragEvent) => {
    e.preventDefault();
    arrastres.current = 0;
    setEncima(false);
    if (e.dataTransfer?.files?.length) void adjuntos.agregar(e.dataTransfer.files);
  };

  const alPegar = (e: React.ClipboardEvent) => {
    const archivos = Array.from(e.clipboardData?.files ?? []);
    if (!archivos.length) return;
    e.preventDefault();
    void adjuntos.agregar(archivos);
  };

  const hayQueMandar = Boolean(texto.trim()) || adjuntos.listos.length > 0;

  return (
    <div
      // `dragenter`/`dragleave` se cuentan porque el evento se dispara también
      // al pasar sobre cada hijo: sin el contador, el resaltado parpadea al
      // mover el archivo por encima de la barra de botones.
      onDragEnter={(e) => {
        e.preventDefault();
        arrastres.current += 1;
        setEncima(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        arrastres.current -= 1;
        if (arrastres.current <= 0) setEncima(false);
      }}
      onDrop={alSoltar}
      className={cn(
        'shrink-0 border-t border-[var(--color-border)] bg-[var(--color-background-elevated)] p-2.5 transition-colors',
        encima && 'bg-[var(--color-primary)]/10 ring-1 ring-inset ring-[var(--color-primary)]',
      )}
    >
      {adjuntos.aviso && (
        <div className="mb-2 flex items-start gap-2 rounded-lg bg-amber-500/10 px-2.5 py-2 text-[11px] leading-snug text-amber-700 dark:text-amber-300">
          <span className="flex-1">{adjuntos.aviso}</span>
          <button
            type="button"
            onClick={adjuntos.descartarAviso}
            aria-label="Descartar el aviso"
            className="shrink-0 opacity-70 hover:opacity-100"
          >
            <IconClose className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {adjuntos.lista.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {adjuntos.lista.map((a) => (
            <span
              key={a.id}
              title={a.error ?? `${a.nombre} · ${pesoLegible(a.size)}`}
              className={cn(
                'flex max-w-full items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] py-1 pl-1.5 pr-1 text-[11px]',
                a.error && 'border-[var(--color-destructive)] text-[var(--color-destructive)]',
              )}
            >
              <IconFile className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="max-w-[140px] truncate">{a.nombre}</span>
              <span className="shrink-0 opacity-60">
                {a.subiendo ? 'subiendo…' : a.error ? 'falló' : pesoLegible(a.size)}
              </span>
              <button
                type="button"
                onClick={() => adjuntos.quitar(a.id)}
                aria-label={`Quitar ${a.nombre}`}
                className="grid h-4 w-4 shrink-0 place-items-center rounded hover:bg-[var(--color-accent)]"
              >
                <IconClose className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        {menuAbierto && (
          <div className="absolute bottom-full left-0 z-20 mb-1.5 max-h-60 w-full overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-background-elevated)] py-1 shadow-xl">
            {disparador?.tipo === '/'
              ? comandos.map((c, i) => (
                  <button
                    key={c.nombre}
                    type="button"
                    onMouseEnter={() => setResaltada(i)}
                    onClick={() => elegir(i)}
                    className={cn(
                      'flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left text-xs',
                      i === resaltada && 'bg-[var(--color-accent)]',
                    )}
                  >
                    <span className="font-medium">/{c.nombre}</span>
                    <span className="truncate text-[11px] text-[var(--color-muted-foreground)]">
                      {c.ayuda}
                    </span>
                  </button>
                ))
              : sugerencias.map((m, i) => (
                  <button
                    key={`${m.tipo}-${m.id}`}
                    type="button"
                    onMouseEnter={() => setResaltada(i)}
                    onClick={() => elegir(i)}
                    className={cn(
                      'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs',
                      i === resaltada && 'bg-[var(--color-accent)]',
                    )}
                  >
                    <span className="shrink-0 rounded bg-[var(--color-accent)] px-1 py-0.5 text-[10px] uppercase tracking-wide">
                      {m.tipo}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{m.etiqueta}</span>
                    {m.detalle && (
                      <span className="shrink-0 truncate text-[10px] text-[var(--color-muted-foreground)]">
                        {m.detalle}
                      </span>
                    )}
                  </button>
                ))}
          </div>
        )}

        <textarea
          ref={caja}
          value={texto}
          onChange={(e) => alEscribir(e.target.value, e.target.selectionStart ?? e.target.value.length)}
          onClick={(e) => setDisparador(detectarDisparador(texto, e.currentTarget.selectionStart ?? 0))}
          onKeyUp={(e) => {
            // Moverse con las flechas también cambia lo que toca sugerir. Solo
            // se recalcula al navegar: hacerlo en cada tecla duplicaría el
            // trabajo que ya hace `onChange`.
            if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') {
              setDisparador(detectarDisparador(texto, e.currentTarget.selectionStart ?? 0));
            }
          }}
          onKeyDown={alTeclear}
          onPaste={alPegar}
          rows={compacto ? 2 : 3}
          placeholder={placeholder}
          aria-label="Mensaje para Goossip"
          className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2.5 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-ring)]"
        />

        {dictado.provisional && (
          <p className="px-1 pt-1 text-xs italic text-[var(--color-muted-foreground)]">
            {dictado.provisional}
          </p>
        )}
      </div>

      {/* ---- la barra de abajo ---- */}
      <div className="mt-1.5 flex items-center gap-0.5">
        <input
          ref={clip}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void adjuntos.agregar(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={imagen}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void adjuntos.agregar(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={video}
          type="file"
          multiple
          accept="video/*,audio/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void adjuntos.agregar(e.target.files);
            e.target.value = '';
          }}
        />

        <BotonBarra etiqueta="Adjuntar un archivo" onClick={() => clip.current?.click()}>
          <IconPaperclip className="h-4 w-4" />
        </BotonBarra>
        <BotonBarra etiqueta="Adjuntar una imagen" onClick={() => imagen.current?.click()}>
          <IconImage className="h-4 w-4" />
        </BotonBarra>
        <BotonBarra etiqueta="Adjuntar video o audio" onClick={() => video.current?.click()}>
          <IconVideo className="h-4 w-4" />
        </BotonBarra>
        {dictado.disponible && (
          <BotonBarra
            etiqueta={dictado.escuchando ? 'Dejar de dictar' : 'Dictar'}
            onClick={dictado.alternar}
            activo={dictado.escuchando}
          >
            <IconMic className="h-4 w-4" />
          </BotonBarra>
        )}
        <BotonBarra
          etiqueta="Mencionar algo del proyecto"
          onClick={() => {
            const el = caja.current;
            const caret = el?.selectionStart ?? texto.length;
            const antes = texto.slice(0, caret);
            const necesitaEspacio = antes && !/\s$/.test(antes);
            const nuevo = `${antes}${necesitaEspacio ? ' ' : ''}@${texto.slice(caret)}`;
            const pos = antes.length + (necesitaEspacio ? 2 : 1);
            setTexto(nuevo);
            setDisparador({ tipo: '@', inicio: pos - 1, consulta: '' });
            requestAnimationFrame(() => {
              el?.focus();
              el?.setSelectionRange(pos, pos);
            });
          }}
        >
          <span className="text-sm font-semibold leading-none">@</span>
        </BotonBarra>
        <BotonBarra
          etiqueta="Comandos"
          onClick={() => {
            setTexto((t) => (t.startsWith('/') ? t : `/${t}`));
            setDisparador({ tipo: '/', inicio: 0, consulta: '' });
            requestAnimationFrame(() => {
              caja.current?.focus();
              caja.current?.setSelectionRange(1, 1);
            });
          }}
        >
          <span className="text-sm font-semibold leading-none">/</span>
        </BotonBarra>

        <div className="ml-auto flex items-center gap-1.5">
          {/*
            El selector de autonomía. A un lector no se le enseña: el servidor
            le fuerza "Propone" de todas formas, y un control que no hace nada
            es peor que no tener control.
          */}
          {puedeOperar && (
            <select
              value={autonomia}
              onChange={(e) => onAutonomia(e.target.value as 'propone' | 'publica')}
              aria-label="Qué tanto puede hacer Goossip solo"
              title="Qué tanto puede hacer Goossip solo"
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-1.5 py-1 text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-ring)]"
            >
              <option value="propone">Propone</option>
              <option value="publica">Publica solo</option>
            </select>
          )}

          {pensando ? (
            <button
              type="button"
              onClick={onDetener}
              aria-label="Parar"
              title="Parar"
              className="grid h-8 w-8 place-items-center rounded-md border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
            >
              <IconStop className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={mandar}
              disabled={!hayQueMandar}
              aria-label="Mandar"
              title="Mandar (Enter)"
              className="btn-brand grid h-8 w-8 place-items-center rounded-md disabled:opacity-40"
            >
              <IconSend className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function BotonBarra({
  etiqueta,
  onClick,
  activo,
  children,
}: {
  etiqueta: string;
  onClick: () => void;
  activo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      title={etiqueta}
      className={cn(
        'grid h-8 w-8 place-items-center rounded-md text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]',
        activo && 'bg-[var(--color-destructive)]/15 text-[var(--color-destructive)]',
      )}
    >
      {children}
    </button>
  );
}
