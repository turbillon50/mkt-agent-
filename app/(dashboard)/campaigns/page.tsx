import Link from 'next/link';
import { Plus, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CreateCampaignForm } from '@/components/campaigns/create-form';
import { getOrCreateUser } from '@/lib/users';
import { listCampaigns } from '@/lib/campaigns';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CampaignsPage() {
  const user = await getOrCreateUser();
  const items = user ? await listCampaigns(user.id) : [];
  const activeId = user?.activeCampaignId ?? null;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Campañas</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Cada campaña es una marca/proyecto distinto con su propia voz, manifiesto, plan y memoria.
          </p>
        </div>
      </header>

      <Card className="card-glow">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4" /> Nueva campaña
          </CardTitle>
          <CardDescription>
            Nombre, voz, audiencia y manifiesto. Puedes refinar todo después.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateCampaignForm />
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">
            Aún no tienes campañas. Crea la primera arriba para activar la operación.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((c) => (
            <Link key={c.id} href={`/campaigns/${c.id}`}>
              <Card className="card-glow transition-colors hover:bg-[var(--color-accent)]/40">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">
                        {c.name}
                        {c.id === activeId && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" /> activa
                          </span>
                        )}
                      </CardTitle>
                      {c.description && (
                        <CardDescription className="mt-1">{c.description}</CardDescription>
                      )}
                    </div>
                    <Badge variant="outline">{c.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
                  {c.brandVoice && <span>voz: {c.brandVoice}</span>}
                  {c.brandLanguage && <span>idioma: {c.brandLanguage}</span>}
                  {c.audience && <span>audiencia: {c.audience}</span>}
                  <span className="ml-auto">creada {formatDate(c.createdAt)}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
