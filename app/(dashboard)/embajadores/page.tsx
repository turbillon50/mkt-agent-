import { EmbajadoresWorkspace } from '@/components/embajadores/workspace';

export const dynamic = 'force-dynamic';

export default function EmbajadoresPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Embajadores</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Convierte a tus mejores clientes en embajadores. Cada uno tiene un código y un link público para invitar.
          Mide visitas, leads generados y ventas, y gana niveles bronce, plata y oro.
        </p>
      </header>
      <EmbajadoresWorkspace />
    </div>
  );
}
