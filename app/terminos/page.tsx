import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Términos — Goossip',
  description: 'Términos y condiciones de uso de Goossip · All Global Holding LLC.',
};

export default function TerminosPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
      <Link href="/" className="text-sm text-[var(--color-primary)] hover:underline">
        ← Volver a Goossip
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">Términos y condiciones</h1>
      <div className="mt-8 space-y-5 text-sm leading-relaxed text-[var(--color-foreground-muted)]">
        <p>
          Al usar Goossip aceptas estos términos. Goossip es una herramienta que automatiza la
          creación y publicación de contenido en tus redes sociales. Tú eres responsable del
          contenido que se publica desde tu cuenta y de cumplir las políticas de cada plataforma.
        </p>
        <p>
          Goossip se encuentra en <strong className="text-[var(--color-foreground)]">early access</strong>.
          Las funciones y los precios pueden cambiar mientras seguimos mejorando el producto.
          Si entras durante el lanzamiento, conservas tu tarifa.
        </p>
        <p>
          Puedes cancelar tu suscripción cuando quieras, sin contratos ni penalizaciones. El
          servicio continúa hasta el final del periodo ya pagado.
        </p>
        <p>
          Para dudas o soporte, escríbenos por WhatsApp al{' '}
          <a href="https://wa.me/529984292748" className="text-[var(--color-primary)] hover:underline">
            +52 998 429 2748
          </a>
          .
        </p>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          All Global Holding LLC · Última revisión: 2026.
        </p>
      </div>
    </main>
  );
}
