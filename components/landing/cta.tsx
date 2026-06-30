import Link from 'next/link';
import { IconArrowRight } from '@/components/icons';

export function FinalCTA() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, #ff5d8f 0%, #d6336c 50%, #6b2545 100%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(at 15% 20%, rgba(255,255,255,0.25) 0px, transparent 40%), radial-gradient(at 85% 90%, rgba(0,0,0,0.2) 0px, transparent 45%)',
        }}
      />
      <div className="relative mx-auto max-w-3xl px-4 py-20 text-center text-white sm:px-6 sm:py-28">
        <h2 className="text-balance text-3xl font-semibold leading-tight sm:text-5xl">
          Tu audiencia ya está ahí.
          <br className="hidden sm:block" /> Empieza a venderle hoy.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-balance text-base text-white/85 sm:text-lg">
          Deja que Goossip crezca tu marca mientras tú haces lo que amas.
          Gratis para empezar, sin tarjeta.
        </p>
        <div className="mt-9 flex justify-center">
          <Link
            href="/sign-up"
            prefetch
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-semibold text-[var(--color-primary)] shadow-lg shadow-black/15 transition-transform hover:-translate-y-0.5 active:translate-y-0"
          >
            Empieza gratis hoy <IconArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <p className="mt-6 text-sm text-white/75">
          Early access · sin tarjeta · cancela cuando quieras
        </p>
      </div>
    </section>
  );
}
