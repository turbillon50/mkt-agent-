import { cn } from '@/lib/utils';
import { CAMPAIGN_STATUS_LABEL, type CampaignStatus } from '@/src/marketing/types';

/**
 * Las piecitas que comparten la lista de campañas y el detalle.
 *
 * Están juntas para que no haya dos formas de pintar el mismo estado ni dos
 * formas de escribir la misma cantidad de dinero: eso es exactamente como una
 * pantalla empieza a decir 15,000 y la de al lado $15,000.00 MXN.
 */

const ESTILO: Record<CampaignStatus, string> = {
  borrador: 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
  activa: 'bg-[var(--color-success)]/15 text-[var(--color-success)]',
  pausada: 'bg-[var(--color-accent)] text-[var(--color-primary)]',
  terminada: 'border border-dashed border-[var(--color-border)] text-[var(--color-muted-foreground)]',
};

export function CampaignStatusPill({
  status,
  className,
}: {
  status: CampaignStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium',
        ESTILO[status],
        className,
      )}
    >
      {status === 'activa' && <span className="dot-pulse block h-1.5 w-1.5 rounded-full bg-current" />}
      {CAMPAIGN_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * El presupuesto en pesos mexicanos. Es el único lugar de la app donde se
 * escribe dinero, así que la moneda se dice aquí y se dice una vez: la app es
 * de un negocio mexicano y el campo no guarda moneda. El día que haya clientes
 * facturando en dólares, la columna `currency` entra en esta misma función.
 */
export function formatBudget(budget: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: budget % 1 === 0 ? 0 : 2,
  }).format(budget);
}

const DIA = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });

/** "12 sep — 30 sep", "desde el 12 sep", "hasta el 30 sep" o nada. */
export function formatWindow(startsAt: string | null, endsAt: string | null): string | null {
  if (startsAt && endsAt) return `${DIA.format(new Date(startsAt))} — ${DIA.format(new Date(endsAt))}`;
  if (startsAt) return `desde el ${DIA.format(new Date(startsAt))}`;
  if (endsAt) return `hasta el ${DIA.format(new Date(endsAt))}`;
  return null;
}
