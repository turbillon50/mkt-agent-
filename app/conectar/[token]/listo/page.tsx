import Link from 'next/link';
import { IconCheck, IconLogoMark } from '@/components/icons';

export const dynamic = 'force-dynamic';

/**
 * Donde cae el invitado al terminar.
 *
 * A propósito no enseña ni el nombre del proyecto ni un botón para entrar a
 * Goossip: esta persona vino a hacer una cosa, ya la hizo, y no tiene por qué
 * quedarse dentro de la cuenta de alguien más.
 */
export default async function ListoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-background)] px-6 py-12">
      <div className="w-full max-w-md space-y-5 text-center">
        <Link
          href="/"
          className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[var(--color-brand-1)] to-[var(--color-brand-3)] text-white"
        >
          <IconLogoMark className="h-6 w-6" />
        </Link>

        {error ? (
          <>
            <h1 className="text-xl font-semibold">No se pudo conectar</h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">{error}</p>
          </>
        ) : (
          <>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--color-success)]/15 text-[var(--color-success)]">
              <IconCheck className="h-6 w-6" />
            </span>
            <h1 className="text-xl font-semibold">Listo, ya quedó conectado</h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Gracias. Ya puedes cerrar esta ventana — quien te mandó el enlace se encarga del
              resto.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
