import Link from 'next/link';
import { IconBrain, IconUsers, IconFile, IconCalendar, IconSparkles, IconArrowUpRight } from '@/components/icons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkline } from './sparkline';
import type { getDashboardStats } from '@/lib/data';

type Stats = Awaited<ReturnType<typeof getDashboardStats>>;

const tiles = [
  { href: '/knowledge', label: 'Memoria', Icon: IconBrain },
  { href: '/audience', label: 'Audiencias', Icon: IconUsers },
  { href: '/posts', label: 'Contenido', Icon: IconFile },
  { href: '/plan', label: 'Calendario', Icon: IconCalendar },
];

export function CommandCenter({ stats }: { stats: Stats | null }) {
  const totalLast7 = (stats?.dailySeries ?? []).reduce((s, d) => s + d.c, 0);
  const series = stats?.dailySeries.map((d) => d.c) ?? [0, 0, 0, 0, 0, 0, 0];
  const prev = series.slice(0, 3).reduce((a, b) => a + b, 0);
  const next = series.slice(-3).reduce((a, b) => a + b, 0);
  const delta = prev === 0 ? (next > 0 ? 100 : 0) : Math.round(((next - prev) / Math.max(1, prev)) * 100);

  return (
    <aside className="hidden w-[360px] shrink-0 flex-col gap-4 lg:flex">
      <h2 className="text-lg font-semibold">Centro de comando</h2>

      <div className="grid grid-cols-4 gap-2">
        {tiles.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-3 text-center text-[11px] text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-accent)]"
          >
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--color-accent)] text-[var(--color-primary)]">
              <Icon className="h-4 w-4" />
            </span>
            {label}
          </Link>
        ))}
      </div>

      <Card className="card-glow">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm">Rendimiento general</CardTitle>
          <span className="text-xs text-[var(--color-muted-foreground)]">7 días</span>
        </CardHeader>
        <CardContent>
          <Sparkline data={series.length ? series : [0, 0, 0, 0, 0, 0, 0]} />
          <div className="mt-2 flex items-center justify-between text-xs text-[var(--color-muted-foreground)]">
            <span>Lun Mar Mié Jue Vie Sáb Dom</span>
            <span className={delta >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-destructive)]'}>
              {delta >= 0 ? '+' : ''}
              {delta}%
            </span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Metric label="Alcance" value={totalLast7 * 32} hint={`+${Math.max(0, delta)}%`} positive={delta >= 0} />
            <Metric label="Interacciones" value={totalLast7 * 4} hint="—" />
            <Metric label="Seguidores" value={Math.round(totalLast7 * 1.2)} hint="—" />
          </div>
        </CardContent>
      </Card>

      <ContenidoReciente recent={stats?.recent ?? []} />

      <Card className="card-glow">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm">Integraciones</CardTitle>
          <Link href="/integrations" className="text-xs text-[var(--color-muted-foreground)] hover:underline">
            Gestionar
          </Link>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-2 text-center text-[10px] text-[var(--color-muted-foreground)]">
            {[
              { n: 'Instagram', c: 'from-[var(--color-brand-1)] to-orange-300' },
              { n: 'X', c: 'from-zinc-700 to-zinc-400' },
              { n: 'LinkedIn', c: 'from-blue-600 to-blue-400' },
              { n: 'Facebook', c: 'from-blue-700 to-indigo-500' },
              { n: 'TikTok', c: 'from-[var(--color-primary)] to-cyan-400' },
            ].map((it) => (
              <div key={it.n} className="flex flex-col items-center gap-1">
                <div
                  className={`h-8 w-8 rounded-lg bg-gradient-to-br ${it.c} opacity-90`}
                />
                <span>{it.n}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-[var(--color-primary)]/25 bg-gradient-to-br from-[var(--color-primary)]/8 to-[var(--color-secondary)]/8">
        <CardContent className="space-y-2 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IconSparkles className="h-4 w-4 text-[var(--color-primary)]" />
              <span className="font-semibold">Goossip Pro</span>
            </div>
          </div>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Desbloquea todo el poder de Goossip: imágenes, mentions, métricas y más automatizaciones.
          </p>
          <Link
            href="/integrations"
            className="btn-brand inline-flex w-full items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium"
          >
            Actualizar ahora <IconArrowUpRight className="h-3 w-3" />
          </Link>
        </CardContent>
      </Card>
    </aside>
  );
}

function Metric({
  label,
  value,
  hint,
  positive = true,
}: {
  label: string;
  value: number;
  hint: string;
  positive?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {label}
      </span>
      <span className="text-base font-semibold">{formatNumber(value)}</span>
      <span className={positive ? 'text-[10px] text-[var(--color-success)]' : 'text-[10px] text-[var(--color-destructive)]'}>
        {hint}
      </span>
    </div>
  );
}

function ContenidoReciente({ recent }: { recent: Stats['recent'] }) {
  return (
    <Card className="card-glow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm">Contenido reciente</CardTitle>
        <Link href="/posts" className="text-xs text-[var(--color-muted-foreground)] hover:underline">
          Ver todos
        </Link>
      </CardHeader>
      <CardContent>
        {recent.length === 0 ? (
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Aparecerá aquí en cuanto publiques.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {recent.slice(0, 3).map((p) => (
              <Link
                key={p.id}
                href="/posts"
                className="flex flex-col gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/50 p-2 transition-colors hover:bg-[var(--color-muted)]"
              >
                <div className="aspect-square rounded-md bg-gradient-to-br from-[var(--color-brand-1)]/40 via-[var(--color-primary)]/30 to-[var(--color-brand-3)]/30" />
                <div className="line-clamp-1 text-[11px]">{p.topic ?? p.text.slice(0, 28)}</div>
                <div className="text-[10px] text-[var(--color-muted-foreground)]">
                  Post · {p.platform}
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
