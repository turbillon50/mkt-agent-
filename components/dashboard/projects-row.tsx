import Link from 'next/link';
import { IconPlus, IconFolder } from '@/components/icons';
import { Card, CardContent } from '@/components/ui/card';
import { getOrCreateUser } from '@/lib/users';
import { listCampaigns } from '@/lib/campaigns';

export async function ProjectsRow() {
  let campaigns: Awaited<ReturnType<typeof listCampaigns>> = [];
  try {
    const user = await getOrCreateUser();
    if (user) campaigns = await listCampaigns(user.id);
  } catch {
    campaigns = [];
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tus campañas</h2>
        <Link href="/campaigns" className="text-sm text-[var(--color-muted-foreground)] hover:underline">
          Ver todas
        </Link>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {campaigns.slice(0, 3).map((c) => (
          <Link key={c.id} href={`/campaigns/${c.id}`}>
            <Card className="card-glow h-full transition-colors hover:bg-[var(--color-accent)]/40">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[var(--color-accent)] text-[var(--color-primary)]">
                    <IconFolder className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{c.name}</div>
                    <div className="truncate text-xs text-[var(--color-muted-foreground)]">
                      {c.brandVoice || 'sin voz definida'}
                    </div>
                  </div>
                </div>
                <span className="inline-flex rounded bg-[var(--color-muted)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  {c.status}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
        <Link
          href="/campaigns"
          className="flex min-h-[140px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--color-border)] text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-accent)]"
        >
          <IconPlus className="h-5 w-5" />
          <span className="text-sm">{campaigns.length === 0 ? 'Crear tu primera campaña' : 'Nueva campaña'}</span>
        </Link>
      </div>
    </section>
  );
}
