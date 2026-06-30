import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacidad — Goossip',
  description: 'Aviso de privacidad de Goossip · All Global Holding LLC.',
};

export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
      <Link href="/" className="text-sm text-[var(--color-primary)] hover:underline">
        ← Volver a Goossip
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">Aviso de privacidad</h1>
      <div className="mt-8 space-y-5 text-sm leading-relaxed text-[var(--color-foreground-muted)]">
        <p>
          En Goossip, operado por All Global Holding LLC, tu información es tuya y la tratamos
          con respeto. Recopilamos únicamente los datos necesarios para conectar tus redes,
          aprender la voz de tu marca y publicar en tu nombre.
        </p>
        <p>
          <strong className="text-[var(--color-foreground)]">No vendemos ni compartimos</strong> tu
          información con terceros con fines publicitarios. Las credenciales de tus redes se
          almacenan de forma cifrada y se usan solo para ejecutar las acciones que tú autorizas.
        </p>
        <p>
          Puedes solicitar la eliminación de tu cuenta y de tus datos en cualquier momento
          escribiéndonos por WhatsApp al{' '}
          <a href="https://wa.me/529984292748" className="text-[var(--color-primary)] hover:underline">
            +52 998 429 2748
          </a>
          .
        </p>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Este documento se actualizará conforme Goossip evolucione. Última revisión: 2026.
        </p>
      </div>
    </main>
  );
}
