import Link from 'next/link';
import { IconCheckCircle, IconArrowRight } from '@/components/icons';
import { Card, CardContent } from '@/components/ui/card';

type Step = {
  label: string;
  description: string;
  href: string;
  cta: string;
  done: boolean;
};

export function GettingStarted({
  hasManifesto,
  hasConnectedNetwork,
  hasChatted,
}: {
  hasManifesto: boolean;
  hasConnectedNetwork: boolean;
  hasChatted: boolean;
}) {
  const steps: Step[] = [
    {
      label: 'Cuéntale a Goossip quién eres',
      description: 'Completa el manifiesto de tu marca: voz, tema, audiencia. Mientras más sepa, mejor redacta.',
      href: '/campaigns',
      cta: 'Completar manifiesto',
      done: hasManifesto,
    },
    {
      label: 'Conecta una red social',
      description: 'X o LinkedIn. Tú apruebas cada publicación, la conexión es solo tuya y la revocas cuando quieras.',
      href: '/integrations',
      cta: 'Conectar red',
      done: hasConnectedNetwork,
    },
    {
      label: 'Habla con Goossip',
      description: 'Pídele un post, una idea, o que te genere una imagen con /imagen.',
      href: '/chat',
      cta: 'Abrir chat',
      done: hasChatted,
    },
  ];

  const pending = steps.filter((s) => !s.done);
  if (pending.length === 0) return null;

  return (
    <Card className="card-glow border-[var(--color-primary)]/25">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Primeros pasos</h2>
          <span className="text-xs text-[var(--color-muted-foreground)]">
            {steps.length - pending.length}/{steps.length} listos
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {steps.map((s) => (
            <Link
              key={s.label}
              href={s.href}
              className={`group flex flex-col gap-1.5 rounded-xl border p-3.5 text-left transition-colors ${
                s.done
                  ? 'border-[var(--color-border)] bg-[var(--color-muted)]/40'
                  : 'border-[var(--color-border)] bg-[var(--color-card)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-accent)]/40'
              }`}
            >
              <div className="flex items-center gap-2">
                {s.done ? (
                  <IconCheckCircle className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
                ) : (
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-[var(--color-border)]" />
                )}
                <span className={`text-sm font-medium ${s.done ? 'text-[var(--color-muted-foreground)] line-through' : ''}`}>
                  {s.label}
                </span>
              </div>
              <p className="text-xs text-[var(--color-muted-foreground)]">{s.description}</p>
              {!s.done && (
                <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--color-primary)] opacity-0 transition-opacity group-hover:opacity-100">
                  {s.cta} <IconArrowRight className="h-3 w-3" />
                </span>
              )}
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
