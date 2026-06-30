import { AutomationsBoard } from '@/components/automations/board';

export const dynamic = 'force-dynamic';

export default function AutomationsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Automatizaciones</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Embudos de correo automáticos: cuando un prospecto llega a una etapa, recibe tu secuencia
          de seguimiento vía Resend, sin que muevas un dedo.
        </p>
      </header>
      <AutomationsBoard />
    </div>
  );
}
