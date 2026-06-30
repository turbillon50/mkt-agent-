import { LandingsWorkspace } from '@/components/landings/workspace';

export const dynamic = 'force-dynamic';

export default function LandingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Páginas de venta</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Crea una página de ventas por campaña con un link público y un formulario de captura. Cada visita y cada
          registro se mide en tiempo real, y cada contacto entra como lead.
        </p>
      </header>
      <LandingsWorkspace />
    </div>
  );
}
