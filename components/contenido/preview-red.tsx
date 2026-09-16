'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatosDelVisor, vistaPrevia, type AutorLinkedin } from '@/src/creative/visor';
import { RED_LABEL, type RedSlug } from '@/src/creative/specs';

/**
 * El visor por red: cómo se va a ver la pieza EN CADA RED, antes de publicarla.
 *
 * Tres decisiones que hacen que esto sirva para aprobar y no solo para adornar:
 *
 *   1. **El recorte es real.** Cada marco tiene la proporción exacta de la spec
 *      oficial y la imagen entra con `object-cover`, que es lo que hace la red:
 *      si la pieza es 4:5 y el marco es 9:16, aquí se ve lo que se va a perder.
 *      Un visor que estira la imagen para que quepa enseña una mentira bonita.
 *   2. **El texto se corta donde lo corta la red.** Lo que queda detrás del
 *      "ver más" se pinta apagado, no se esconde: el cliente tiene que ver
 *      exactamente qué mitad de su mensaje nadie va a leer.
 *   3. **La zona segura se DIBUJA.** En historias y reels, las bandas donde la
 *      red encima sus botones van rayadas sobre la imagen. Decir "269 px
 *      arriba" no le dice nada a nadie; ver el titular debajo de la raya, sí.
 *
 * Ni un número de píxeles está escrito aquí: todos vienen de `specs.ts`, que
 * los trae con su fuente oficial y su fecha de lectura.
 */

export interface PiezaParaVisor {
  id: string;
  url: string | null;
  red: string;
  formato: string;
  brief: string;
}

const CHROME: Record<string, { fondo: string; texto: string }> = {
  facebook: { fondo: 'bg-[#f0f2f5] dark:bg-[#242526]', texto: 'text-[#050505] dark:text-[#e4e6eb]' },
  instagram: { fondo: 'bg-white dark:bg-black', texto: 'text-black dark:text-white' },
  linkedin: { fondo: 'bg-white dark:bg-[#1b1f23]', texto: 'text-[#000000e6] dark:text-white' },
  twitter: { fondo: 'bg-white dark:bg-black', texto: 'text-black dark:text-white' },
  tiktok: { fondo: 'bg-black', texto: 'text-white' },
  youtube: { fondo: 'bg-white dark:bg-[#0f0f0f]', texto: 'text-black dark:text-white' },
};

export function PreviewRed({
  pieza,
  texto,
  proyecto,
  logo,
}: {
  pieza: PiezaParaVisor;
  texto: string;
  proyecto: string;
  logo?: string | null;
}) {
  const formatos = useMemo(() => formatosDelVisor(), []);
  const [activo, setActivo] = useState<string>(
    // Arranca en el formato de la propia pieza si está en la lista; si no, en el
    // primero. Abrir el visor en la red equivocada obliga a un clic que nadie
    // debería tener que dar.
    formatos.find((f) => f.id === pieza.formato)?.id ?? formatos[0].id,
  );
  const [autorLinkedin, setAutorLinkedin] = useState<AutorLinkedin>('pagina');

  const formato = formatos.find((f) => f.id === activo) ?? formatos[0];
  const previa = vistaPrevia({ red: formato.red, formatoId: formato.id, texto });
  const chrome = CHROME[formato.red] ?? CHROME.facebook;

  return (
    <div className="space-y-3">
      {/* -------------------------------------------------------- las pestañas */}
      <div className="flex flex-wrap gap-1.5">
        {formatos.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setActivo(f.id)}
            title={`${f.label} · ${f.ancho} × ${f.alto} px`}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
              f.id === activo
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 font-medium text-[var(--color-primary)]'
                : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]',
            )}
          >
            {f.label.replace(/^[^—]+— /, `${f.redLabel} · `)}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        {/* ------------------------------------------------------- el simulacro */}
        <div className={cn('overflow-hidden rounded-xl border border-[var(--color-border)]', chrome.fondo)}>
          {/* la cabecera de la publicación, con la firma del proyecto */}
          {formato.red !== 'youtube' && (
            <div className="flex items-center gap-2 px-3 py-2">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" className="h-7 w-7 rounded-full object-cover" />
              ) : (
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--color-primary)] text-[11px] font-bold text-[var(--color-primary-foreground)]">
                  {proyecto.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className={cn('truncate text-xs font-semibold', chrome.texto)}>{proyecto}</p>
                <p className="text-[10px] text-[var(--color-muted-foreground)]">
                  {formato.red === 'linkedin'
                    ? autorLinkedin === 'pagina'
                      ? 'Página · Promocionado'
                      : 'Persona · 1.º'
                    : 'Hace un momento'}
                </p>
              </div>
            </div>
          )}

          {/* el texto ANTES de la imagen, que es donde lo pone cada una de estas redes */}
          {formato.red !== 'tiktok' && formato.red !== 'youtube' && (
            <p className={cn('px-3 pb-2 text-xs leading-snug', chrome.texto)}>
              {previa.visible}
              {previa.cortado && (
                <>
                  <span className="text-[var(--color-muted-foreground)]">… ver más</span>
                  <span className="block pt-1 text-[var(--color-muted-foreground)] line-through opacity-60">
                    {previa.oculto.slice(0, 180)}
                    {previa.oculto.length > 180 ? '…' : ''}
                  </span>
                </>
              )}
            </p>
          )}

          {/* EL MARCO: la proporción exacta de la spec. Aquí se ve el recorte. */}
          <div
            className="relative w-full bg-[var(--color-accent)]"
            style={{ aspectRatio: `${formato.ancho} / ${formato.alto}` }}
          >
            {pieza.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={pieza.url}
                alt={pieza.brief}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-[11px] text-[var(--color-muted-foreground)]">
                sin imagen
              </div>
            )}

            {/* la zona segura, dibujada */}
            {(previa.zonaSegura.arriba > 0 || previa.zonaSegura.abajo > 0) && (
              <>
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 bg-[repeating-linear-gradient(45deg,rgba(0,0,0,0.45)_0_6px,transparent_6px_12px)]"
                  style={{ height: `${(previa.zonaSegura.arriba / formato.alto) * 100}%` }}
                  title={`${previa.zonaSegura.arriba} px que la red tapa con su interfaz`}
                />
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 bg-[repeating-linear-gradient(45deg,rgba(0,0,0,0.45)_0_6px,transparent_6px_12px)]"
                  style={{ height: `${(previa.zonaSegura.abajo / formato.alto) * 100}%` }}
                  title={`${previa.zonaSegura.abajo} px que la red tapa con sus botones`}
                />
              </>
            )}

            {/* TikTok pone el texto ENCIMA del video, no arriba */}
            {formato.red === 'tiktok' && (
              <p className="absolute inset-x-3 bottom-[24%] text-[11px] leading-snug text-white drop-shadow">
                {previa.visible}
              </p>
            )}
          </div>

          {/* YouTube: la miniatura lleva TÍTULO debajo, y es la mitad del clic */}
          {formato.red === 'youtube' && (
            <div className="px-3 py-2">
              <p className={cn('line-clamp-2 text-xs font-medium', chrome.texto)}>
                {texto.split('\n')[0] || 'Sin título'}
              </p>
              <p className="text-[10px] text-[var(--color-muted-foreground)]">
                {proyecto} · hace un momento
              </p>
            </div>
          )}

          {formato.red === 'linkedin' && (
            <div className="flex gap-1 px-3 pb-2 pt-1">
              {(['pagina', 'persona'] as AutorLinkedin[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAutorLinkedin(a)}
                  className={cn(
                    'rounded border px-1.5 py-0.5 text-[10px]',
                    autorLinkedin === a
                      ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                      : 'border-[var(--color-border)] text-[var(--color-muted-foreground)]',
                  )}
                >
                  como {a}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* --------------------------------------------------------- los avisos */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {formato.ancho} × {formato.alto} px ({formato.ratio})
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                'text-[10px]',
                previa.limite !== null && previa.caracteres > previa.limite
                  ? 'border-amber-500/50 text-amber-700 dark:text-amber-400'
                  : '',
              )}
            >
              {previa.caracteres}
              {previa.limite !== null ? ` / ${previa.limite}` : ''} caracteres
            </Badge>
            {previa.hashtags.length > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {previa.hashtags.length} hashtags
              </Badge>
            )}
          </div>

          <ul className="space-y-1.5">
            {previa.avisos.map((a, i) => (
              <li
                key={i}
                className={cn(
                  'rounded-md border-l-2 bg-[var(--color-accent)]/30 py-1.5 pl-2.5 pr-2 text-[11px] leading-snug',
                  a.severidad === 'error'
                    ? 'border-l-[var(--color-destructive)]'
                    : a.severidad === 'aviso'
                      ? 'border-l-amber-500'
                      : 'border-l-[var(--color-border)]',
                )}
              >
                {a.texto}
              </li>
            ))}
          </ul>

          <p className="text-[10px] text-[var(--color-muted-foreground)]">
            Medidas de {RED_LABEL[formato.red as RedSlug]} tomadas de{' '}
            <a href={formato.fuente} target="_blank" rel="noreferrer" className="underline">
              su documentación oficial
            </a>{' '}
            el {formato.leidoEl}.
          </p>
        </div>
      </div>
    </div>
  );
}
