import { HotLeadsWorkspace } from '@/components/hot-leads/workspace';

export const dynamic = 'force-dynamic';

export default function HotLeadsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Leads calientes</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Cuando un prospecto acumula señales de compra (abre correos, hace click, entra por un referido, llena una
          landing o vota), te avisamos por WhatsApp al instante. Aquí configuras el umbral y ves quién está caliente.
        </p>
      </header>
      <HotLeadsWorkspace />
    </div>
  );
}
