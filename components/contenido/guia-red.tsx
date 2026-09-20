'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * "Cómo se postea aquí": el panel lateral de la Sala.
 *
 * Lo que tiene que quedar clarísimo en esta pantalla, y por eso está escrito en
 * el propio panel: **qué sale de la documentación de la red y qué es criterio
 * nuestro.** Cada consejo con fuente trae su enlace; cada consejo sin fuente
 * dice "criterio nuestro" con esas palabras.
 *
 * Suena a detalle y no lo es. Un cliente que sigue un consejo creyendo que es
 * regla de Instagram y le sale mal, deja de creerle a todo lo demás — incluido
 * lo que sí era regla de Instagram.
 */

export interface ConsejoUI {
  titulo: string;
  texto: string;
  fuente: string | null;
}

export interface GuiaUI {
  red: string;
  redLabel: string;
  escribir: ConsejoUI[];
  banean: Array<{ titulo: string; texto: string; fuente: string; leidoEl: string }>;
  hashtags: ConsejoUI;
  horarios: ConsejoUI;
  lienzos: string;
}

export interface UsoUI {
  hoy: number;
  semana: number;
  tope: number | null;
  quedan: number | null;
  agotado: boolean;
  muySeguido: boolean;
  minutosDesdeLaUltima: number | null;
  espaciadoSugeridoMin: number;
  aviso: string;
  nota: string;
}

export function GuiaDeLaRed({ guia, uso }: { guia: GuiaUI | null; uso: UsoUI | null }) {
  const [abierto, setAbierto] = useState<'escribir' | 'banean' | 'limites'>('escribir');

  if (!guia) {
    return (
      <Card>
        <CardContent className="space-y-2 py-5">
          <div className="skeleton h-4 w-40 rounded" />
          <div className="skeleton h-3 w-full rounded" />
          <div className="skeleton h-3 w-5/6 rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div>
          <p className="text-sm font-semibold">Cómo se postea en {guia.redLabel}</p>
          <p className="text-[10px] text-[var(--color-muted-foreground)]">
            Lo que dice {guia.redLabel} y lo que decimos nosotros, separado.
          </p>
        </div>

        <div className="flex gap-1">
          {(
            [
              ['escribir', 'Cómo escribir'],
              ['banean', 'Qué te banea'],
              ['limites', 'Tus límites hoy'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setAbierto(k)}
              className={cn(
                'rounded-full px-2 py-1 text-[10px] font-medium transition-colors',
                abierto === k
                  ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                  : 'border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ------------------------------------------------- cómo escribir */}
        {abierto === 'escribir' && (
          <div className="space-y-2.5">
            {[...guia.escribir, guia.hashtags, guia.horarios].map((c, i) => (
              <Consejo key={i} c={c} />
            ))}
            <p className="border-t border-[var(--color-border)] pt-2 text-[10px] text-[var(--color-muted-foreground)]">
              <span className="font-medium">Lienzos:</span> {guia.lienzos}
            </p>
          </div>
        )}

        {/* --------------------------------------------------- qué banea */}
        {abierto === 'banean' && (
          <ul className="space-y-2">
            {guia.banean.map((b, i) => (
              <li
                key={i}
                className="rounded-md border-l-2 border-l-[var(--color-destructive)]/60 bg-[var(--color-accent)]/30 py-1.5 pl-2.5 pr-2 text-[11px] leading-snug"
              >
                <p className="font-medium">{b.titulo}</p>
                <p className="pt-0.5 text-[var(--color-muted-foreground)]">{b.texto}</p>
                <a
                  href={b.fuente}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-[var(--color-primary)] underline underline-offset-2"
                >
                  la política, tal cual
                </a>{' '}
                <span className="text-[10px] text-[var(--color-muted-foreground)]">
                  (leída el {b.leidoEl})
                </span>
              </li>
            ))}
            {guia.banean.length === 0 && (
              <li className="text-[11px] text-[var(--color-muted-foreground)]">
                No hay reglas de bloqueo cargadas para esta red.
              </li>
            )}
          </ul>
        )}

        {/* ------------------------------------------------ tus límites hoy */}
        {abierto === 'limites' && (
          <div className="space-y-2.5">
            {uso ? (
              <>
                <div
                  className={cn(
                    'rounded-md border px-2.5 py-2 text-[11px] leading-snug',
                    uso.agotado
                      ? 'border-[var(--color-destructive)]/50 bg-[var(--color-destructive)]/5'
                      : uso.muySeguido
                        ? 'border-amber-500/50 bg-amber-500/5'
                        : 'border-[var(--color-border)]',
                  )}
                >
                  {uso.aviso}
                </div>

                <dl className="grid grid-cols-2 gap-2 text-[11px]">
                  <Dato k="Hoy" v={String(uso.hoy)} />
                  <Dato k="Esta semana" v={String(uso.semana)} />
                  <Dato k="Tope de la red" v={uso.tope === null ? 'no publicado' : String(uso.tope)} />
                  <Dato
                    k="Última publicación"
                    v={
                      uso.minutosDesdeLaUltima === null
                        ? 'ninguna'
                        : uso.minutosDesdeLaUltima < 60
                          ? `hace ${uso.minutosDesdeLaUltima} min`
                          : `hace ${Math.round(uso.minutosDesdeLaUltima / 60)} h`
                    }
                  />
                </dl>

                <p className="text-[10px] leading-snug text-[var(--color-muted-foreground)]">
                  {uso.nota}
                </p>
                <p className="text-[10px] italic leading-snug text-[var(--color-muted-foreground)]">
                  El espaciado sugerido de {uso.espaciadoSugeridoMin} minutos es criterio nuestro:
                  ninguna red publica un mínimo entre publicaciones.
                </p>
              </>
            ) : (
              <p className="text-[11px] text-[var(--color-muted-foreground)]">
                No se pudo leer cuánto llevas publicado hoy.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Consejo({ c }: { c: ConsejoUI }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-medium">{c.titulo}</p>
      <p className="text-[11px] leading-snug text-[var(--color-muted-foreground)]">{c.texto}</p>
      {c.fuente ? (
        <a
          href={c.fuente}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] text-[var(--color-primary)] underline underline-offset-2"
        >
          de la documentación oficial
        </a>
      ) : (
        <p className="text-[10px] italic text-[var(--color-muted-foreground)]">
          Criterio nuestro, no regla de la red.
        </p>
      )}
    </div>
  );
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md bg-[var(--color-accent)]/40 px-2 py-1.5">
      <dt className="text-[9px] uppercase tracking-wide text-[var(--color-muted-foreground)]">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
