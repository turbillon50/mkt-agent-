import { CompetitorsBoard } from '@/components/competitors/board';

export const dynamic = 'force-dynamic';

export default function CompetitorsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Competencia</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Pon tus redes y las de tu competencia lado a lado. Datos públicos reales, sin inventar nada.
        </p>
      </header>
      <CompetitorsBoard />
    </div>
  );
}
