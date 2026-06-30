import { MembershipsWorkspace } from '@/components/memberships/workspace';

export const dynamic = 'force-dynamic';

export default function MembresiasPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Membresías VIP</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Crea planes de suscripción VIP para tu comunidad. Por ahora cierras la venta por WhatsApp con un link listo
          para compartir; pronto podrás cobrar automático con tarjeta.
        </p>
      </header>
      <MembershipsWorkspace />
    </div>
  );
}
