import Link from 'next/link';

/**
 * Marco de las páginas legales.
 *
 * Viven FUERA del candado de sesión a propósito: TikTok, X y Meta abren estas
 * URLs con un robot sin cookies durante la revisión de la app. Si contestan
 * con un redirect a /sign-in, la revisión se rechaza.
 */
export function LegalShell({
  titulo,
  actualizado,
  children,
}: {
  titulo: string;
  actualizado: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <span className="grid h-5 w-5 place-items-center rounded bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-secondary)] text-[10px] font-bold text-[#04130d]">
          G
        </span>
        Goossip
      </Link>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">{titulo}</h1>
      <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
        Última actualización: {actualizado}
      </p>

      <div className="legal-cuerpo mt-10 space-y-8 text-sm leading-relaxed text-[var(--color-foreground-muted)]">
        {children}
      </div>

      <div className="mt-14 border-t border-[var(--color-border)] pt-6 text-xs text-[var(--color-muted-foreground)]">
        <p>
          All Global Holding LLC · Goossip ·{' '}
          <a href="mailto:luisdelator@vmomentums.info" className="hover:text-[var(--color-foreground)]">
            luisdelator@vmomentums.info
          </a>
        </p>
        <p className="mt-2 flex flex-wrap gap-4">
          <Link href="/terminos" className="hover:text-[var(--color-foreground)]">Términos del Servicio</Link>
          <Link href="/privacidad" className="hover:text-[var(--color-foreground)]">Aviso de Privacidad</Link>
          <Link href="/" className="hover:text-[var(--color-foreground)]">Inicio</Link>
        </p>
      </div>
    </main>
  );
}

export function Seccion({ n, titulo, children }: { n: string; titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-[var(--color-foreground)]">
        {n}. {titulo}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
