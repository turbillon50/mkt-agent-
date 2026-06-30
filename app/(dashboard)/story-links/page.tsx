import { StoryLinksWorkspace } from '@/components/story-links/workspace';

export const dynamic = 'force-dynamic';

export default function StoryLinksPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Story Link inteligente</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Un solo link maestro que redirige a destinos distintos según de dónde llega cada visitante (utm_source,
          utm_campaign…). Comparte el mismo link en todos lados y manda a cada audiencia a la página que le toca.
        </p>
      </header>
      <StoryLinksWorkspace />
    </div>
  );
}
