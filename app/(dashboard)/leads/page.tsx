import { LeadsBoard } from '@/components/leads/board';

export const dynamic = 'force-dynamic';

export default function LeadsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Prospectos</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Pega links de perfiles públicos y arma tu lista de prospectos. Léelo desde el chat
          cuando quieras redactar el primer mensaje.
        </p>
      </header>
      <LeadsBoard />
    </div>
  );
}
