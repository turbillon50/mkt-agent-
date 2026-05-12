import Link from 'next/link';
import { auth, currentUser } from '@clerk/nextjs/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getDashboardStats } from '@/lib/data';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function safeStats() {
  try {
    return await getDashboardStats();
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const { userId } = await auth();
  const user = userId ? await currentUser() : null;
  const firstName = user?.firstName ?? user?.username ?? 'humano';
  const stats = await safeStats();

  const twitter = stats?.byPlatform.find((p) => p.platform === 'twitter')?.c ?? 0;
  const linkedin = stats?.byPlatform.find((p) => p.platform === 'linkedin')?.c ?? 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10">
      <header className="text-center">
        <h1 className="text-3xl font-semibold">¡Buenas, {firstName}! 👋</h1>
        <p className="mt-2 text-3xl font-semibold brand-gradient">¿Qué vamos a crear hoy?</p>
      </header>

      <Card className="card-glow border border-[var(--color-border)]">
        <CardContent className="p-5">
          <Link
            href="/chat"
            className="block rounded-lg bg-[var(--color-muted)]/60 px-4 py-3 text-sm text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)]"
          >
            Cuéntame tu idea, objetivo o lo que necesitas…
          </Link>
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionChip href="/posts" label="Generar contenido" emoji="✍️" />
            <ActionChip href="/knowledge" label="Investigar tendencia" emoji="🔎" />
            <ActionChip href="/plan" label="Plan de contenidos" emoji="📅" />
            <ActionChip href="/chat?topic=competencia" label="Analizar competencia" emoji="🧠" />
          </div>
        </CardContent>
      </Card>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Rendimiento general</h2>
          <Badge variant="outline">Phase 1 · datos reales</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Posts totales" value={stats?.totalPosts ?? 0} hint="histórico" />
          <Kpi label="Twitter" value={twitter} hint="publicaciones" />
          <Kpi label="LinkedIn" value={linkedin} hint="publicaciones" />
          <Kpi label="Memoria" value={stats?.knowledgeCount ?? 0} hint="entradas knowledge" />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Actividad reciente</h2>
          <Link href="/posts" className="text-sm text-[var(--color-muted-foreground)] hover:underline">
            Ver todo
          </Link>
        </div>
        {!stats || stats.recent.length === 0 ? (
          <Card className="card-glow">
            <CardContent className="space-y-3 py-10 text-center">
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Aún no hay publicaciones. Lanza el agente desde el chat o desde el CLI:
              </p>
              <code className="inline-block rounded bg-[var(--color-muted)] px-2 py-1 text-xs">
                npm run cli run
              </code>
              <div>
                <Button asChild>
                  <Link href="/chat">Hablar con Goossip</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="card-glow">
            <CardContent className="p-0">
              <ul className="divide-y divide-[var(--color-border)]">
                {stats.recent.map((p) => (
                  <li key={p.id} className="flex items-start gap-4 px-5 py-3">
                    <Badge variant="secondary">{p.platform}</Badge>
                    <div className="flex-1">
                      <p className="line-clamp-2 text-sm">{p.text}</p>
                      {p.topic && (
                        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                          tema: {p.topic}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-[var(--color-muted-foreground)]">
                      {formatDate(p.publishedAt ?? p.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <Card className="card-glow">
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold">{value}</div>
        <div className="text-xs text-[var(--color-muted-foreground)]">{hint}</div>
      </CardContent>
    </Card>
  );
}

function ActionChip({ href, label, emoji }: { href: string; label: string; emoji: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-1.5 text-xs text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-muted)]"
    >
      <span>{emoji}</span>
      <span>{label}</span>
    </Link>
  );
}
