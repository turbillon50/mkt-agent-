import { MailingWorkspace } from '@/components/mailing/workspace';

export const dynamic = 'force-dynamic';

export default function MailingPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Correos</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Crea campañas de correo reales: redacta con IA, segmenta a tus prospectos, envía o programa, y mide aperturas,
          clicks y rebotes de verdad — todo vía Resend.
        </p>
      </header>
      <MailingWorkspace />
    </div>
  );
}
