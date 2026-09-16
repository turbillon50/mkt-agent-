import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { IconCheck } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { ChannelCard } from '@/src/projects/connections';
import { CONNECTION_STATE_LABEL } from '@/src/projects/types';

/**
 * La franja de conexiones del Inicio: TODOS los conectores del catálogo, con su
 * estado real.
 *
 * La regla que la define, y que es lo que Luis señaló: **nada se esconde por no
 * estar conectado.** El Inicio viejo enseñaba una lista de pendientes; lo que
 * un cliente nuevo veía era "te falta esto, te falta lo otro" y nunca supo que
 * Goossip habla con veinticuatro cosas. Aquí están las veinticuatro: las verdes
 * porque ya están, las de acento porque se pueden conectar HOY con un clic, y
 * las apagadas porque todavía no — y esas también se ven, porque saber que
 * TikTok viene es parte de saber qué compraste.
 *
 * Es un componente de servidor: el estado ya viene resuelto y reconciliado
 * contra Composio desde `projectHome`. La pantalla no decide nada, solo pinta.
 */

const ESTILO: Record<ChannelCard['state'], string> = {
  conectado:
    'border-[var(--color-success)]/40 bg-[var(--color-success)]/10 text-[var(--color-foreground)]',
  sin_conectar:
    'border-[var(--color-primary)]/30 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10',
  reconectar: 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  proximamente:
    'border-dashed border-[var(--color-border)] text-[var(--color-muted-foreground)] opacity-70',
};

export function FranjaConexiones({
  projectId,
  cards,
  conectados,
  total,
  aviso,
}: {
  projectId: string;
  cards: ChannelCard[];
  conectados: number;
  total: number;
  /** Lo que dijo Composio si NO se pudo reconciliar. Se dice, no se esconde. */
  aviso?: string | null;
}) {
  // El orden es el que sirve para decidir: lo conectado primero (para verlo de
  // un golpe), después lo que se puede conectar hoy, y al final lo que no
  // depende del usuario.
  const peso: Record<ChannelCard['state'], number> = {
    conectado: 0,
    reconectar: 1,
    sin_conectar: 2,
    proximamente: 3,
  };
  const orden = [...cards].sort((a, b) => peso[a.state] - peso[b.state]);

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Conexiones</h2>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            <span className="font-medium text-[var(--color-foreground)]">
              {conectados} de {total}
            </span>{' '}
            ·{' '}
            <Link
              href={`/projects/${projectId}/conexiones`}
              className="text-[var(--color-primary)] hover:underline"
            >
              Ver todas
            </Link>
          </p>
        </div>

        {aviso && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
            No se pudo confirmar con el proveedor ahora mismo, así que esto puede estar viejo:{' '}
            {aviso}
          </p>
        )}

        <div className="flex flex-wrap gap-1.5">
          {orden.map((c) => {
            const chip = (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                  ESTILO[c.state],
                )}
                title={
                  c.state === 'conectado'
                    ? `${c.label}${c.detail ? ` · ${c.detail}` : ''}`
                    : `${c.label} — ${CONNECTION_STATE_LABEL[c.state]}. ${c.blurb}`
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.logo} alt="" aria-hidden className="h-3.5 w-3.5 rounded-sm" />
                <span className="max-w-[10rem] truncate">{c.label}</span>
                {c.state === 'conectado' && <IconCheck className="h-3 w-3 shrink-0" />}
                {c.state === 'sin_conectar' && <span className="shrink-0 font-medium">Conectar</span>}
                {c.state === 'reconectar' && <span className="shrink-0 font-medium">Reconectar</span>}
                {c.state === 'proximamente' && (
                  <span className="shrink-0 text-[10px]">Próximamente</span>
                )}
              </span>
            );

            // "Próximamente" no lleva a ningún lado a propósito: un clic que no
            // hace nada enseña a no confiar en los clics.
            return c.state === 'proximamente' ? (
              <span key={c.id}>{chip}</span>
            ) : (
              <Link key={c.id} href={`/projects/${projectId}/conexiones`}>
                {chip}
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
