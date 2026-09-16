import { cn } from '@/lib/utils';
import { CONNECTION_STATE_LABEL, type ConnectionState } from '@/src/projects/types';

/**
 * UN solo sistema de etiquetas en toda la app.
 *
 * Antes convivían "conectado", "próximo", "en configuración", "soon", un
 * `Badge variant="outline"` y puntitos de colores con `title` escondido. Cinco
 * vocabularios para tres estados. Aquí están los cuatro de hoy y no hay más.
 *
 * `reconectar` se ve distinto de `sin_conectar` a propósito: una cuenta que se
 * cayó pide una acción HOY, y pintarla igual que una que nunca se conectó
 * esconde justo lo que hay que arreglar.
 */
const ESTILOS: Record<ConnectionState, string> = {
  conectado: 'bg-[var(--color-success)]/15 text-[var(--color-success)]',
  sin_conectar: 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
  reconectar: 'bg-[var(--color-warning)]/15 text-[var(--color-warning)]',
  proximamente: 'border border-dashed border-[var(--color-border)] text-[var(--color-muted-foreground)]',
};

export function ConnectionBadge({
  state,
  className,
}: {
  state: ConnectionState;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium',
        ESTILOS[state],
        className,
      )}
    >
      {state === 'conectado' && (
        <span className="dot-pulse block h-1.5 w-1.5 rounded-full bg-current" />
      )}
      {CONNECTION_STATE_LABEL[state]}
    </span>
  );
}
