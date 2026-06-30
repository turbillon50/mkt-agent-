import { VotacionesWorkspace } from '@/components/votaciones/workspace';

export const dynamic = 'force-dynamic';

export default function VotacionesPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Co-creación</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Deja que tu comunidad elija el siguiente producto. Crea una votación entre 2 y 4 opciones, comparte el link, y
          al cerrar avisamos por correo a todos los que votaron qué producto ganó.
        </p>
      </header>
      <VotacionesWorkspace />
    </div>
  );
}
