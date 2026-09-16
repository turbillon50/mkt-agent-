import { cn } from '@/lib/utils';
import { CONNECTION_STATE_LABEL, type ConnectionState } from '@/src/projects/types';

/**
 * UN solo sistema de etiquetas en toda la app.
 *
 * Antes convivían "conectado", "próximo", "en configuración", "soon", un
 * `Badge variant="outline"` y puntitos de colores con `title` escondido. Cinco
 * vocabularios para tres estados. Aquí están los tres y no hay más.
 */
const ESTILOS: Record<ConnectionState, string> = {
  conectado: 'bg-[var(--color-success)]/15 text-[var(--color-success)]',
  sin_conectar: 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
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
