import { FlashOffersWorkspace } from '@/components/flash-offers/workspace';

export const dynamic = 'force-dynamic';

export default function OfertasPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Ofertas Flash</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Crea una oferta con countdown en vivo y comparte un link público en tus lives y stories. Cada oferta mide
          clicks y conversiones reales.
        </p>
      </header>
      <FlashOffersWorkspace />
    </div>
  );
}
