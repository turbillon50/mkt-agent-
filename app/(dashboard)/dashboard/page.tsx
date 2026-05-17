import Link from 'next/link';
import { Bell, Edit3 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CommandCenter } from '@/components/dashboard/command-center';
import { ProjectsRow } from '@/components/dashboard/projects-row';
import { getDashboardStats } from '@/lib/data';
import { formatDate } from '@/lib/utils';
import { isClerkConfigured } from '@/lib/clerk-config';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function safeStats() {
  try {
    return await getDashboardStats();
  } catch {
    return null;
  }
}

async function safeUserFirstName(): Promise<string> {
  if (!isClerkConfigured()) return 'humano';
  try {
    const { auth, currentUser } = await import('@clerk/nextjs/server');
    const { userId } = await auth();
    if (!userId) return 'humano';
    const user = await currentUser();
    return user?.firstName ?? user?.username ?? 'humano';
  } catch {
    return 'humano';
  }
}

export default async function DashboardPage() {
  const firstName = await safeUserFirstName();
  const stats = await safeStats();

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
      <main className="flex min-w-0 flex-1 flex-col gap-6 lg:gap-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold lg:text-xl">
              Goossip AI <span className="ml-1 inline-block h-2 w-2 rounded-full bg-fuchsia-400 align-middle" />
            </h1>
            <p className="text-xs text-[var(--color-muted-foreground)]">Online</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]">
              <Edit3 className="h-4 w-4" />
            </button>
            <button className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]">
              <Bell className="h-4 w-4" />
            </button>
          </div>
        </header>

        <section className="mt-2 text-center lg:mt-4">
          <h2 className="text-2xl font-semibold lg:text-3xl">¡Buenas, {firstName}! 👋</h2>
          <p className="mt-1 text-2xl font-semibold brand-gradient lg:text-3xl">¿Qué vamos a crear hoy?</p>
        </section>

        <Card className="card-glow border border-[var(--color-border)]">
          <CardContent className="p-5">
            <Link
              href="/chat"
              className="block rounded-lg bg-[var(--color-muted)]/60 px-4 py-3 text-sm text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)]"
            >
              Cuéntame tu idea, objetivo o lo que necesitas…
            </Link>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Chip label="Investigar" emoji="🔎" />
              <Chip label="Crear" emoji="✨" />
              <Chip label="Analizar" emoji="📊" />
              <div className="ml-auto">
                <Button asChild className="btn-brand">
                  <Link href="/chat">↑</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <ActionChip href="/posts" label="Generar contenido" />
          <ActionChip href="/posts" label="Diseñar arte" />
          <ActionChip href="/knowledge" label="Investigar tendencia" />
          <ActionChip href="/plan" label="Plan de contenidos" />
          <ActionChip href="/audience" label="Analizar competencia" />
        </div>

        <ProjectsRow />

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
                  Aún no hay publicaciones. Cuando el agente publique algo aparecerá aquí.
                </p>
                <Button asChild className="btn-brand">
                  <Link href="/chat">Hablar con Goossip</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="card-glow">
              <CardContent className="p-0">
                <ul className="divide-y divide-[var(--color-border)]">
                  {stats.recent.map((p) => (
                    <li key={p.id} className="flex items-start gap-4 px-5 py-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-fuchsia-500/40 to-pink-500/40 text-xs font-semibold">
                        {p.platform === 'twitter' ? 'X' : p.platform === 'linkedin' ? 'in' : '·'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">
                          Publicaste en <span className="font-medium">{p.platform}</span>
                          {p.topic && <span className="text-[var(--color-muted-foreground)]"> · {p.topic}</span>}
                        </div>
                        <p className="line-clamp-1 text-xs text-[var(--color-muted-foreground)]">{p.text}</p>
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
      </main>

      <CommandCenter stats={stats} />
    </div>
  );
}

function Chip({ label, emoji }: { label: string; emoji: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/60 px-2.5 py-1 text-xs">
      <span>{emoji}</span>
      <span>{label}</span>
    </span>
  );
}

function ActionChip({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-card)]/60 px-3 py-1.5 text-xs text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-muted)]"
    >
      {label}
    </Link>
  );
}
