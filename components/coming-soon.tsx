import { Card, CardContent } from '@/components/ui/card';
import { IconSparkles } from '@/components/icons';

export function ComingSoon({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && (
          <p className="text-sm text-[var(--color-muted-foreground)]">{description}</p>
        )}
      </header>
      <Card className="card-glow">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <IconSparkles className="h-8 w-8 text-fuchsia-400" />
          <p className="text-sm">En desarrollo.</p>
          <p className="max-w-md text-xs text-[var(--color-muted-foreground)]">
            Este módulo llegará en próximas fases. Mientras tanto puedes usar Chats, Memoria,
            Contenido y Calendario.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
