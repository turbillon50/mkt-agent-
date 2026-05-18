import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CampaignEditForm } from '@/components/campaigns/edit-form';
import { CampaignActions } from '@/components/campaigns/actions';
import { getOrCreateUser } from '@/lib/users';
import { getCampaign } from '@/lib/campaigns';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getOrCreateUser();
  if (!user) notFound();
  const campaign = await getCampaign(user.id, id);
  if (!campaign) notFound();

  const isActive = user.activeCampaignId === campaign.id;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <Link href="/campaigns" className="mb-2 inline-flex items-center gap-1 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            <ArrowLeft className="h-3 w-3" /> Volver
          </Link>
          <h1 className="text-2xl font-semibold">{campaign.name}</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Creada {formatDate(campaign.createdAt)} · slug <code>{campaign.slug}</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isActive ? (
            <Badge className="bg-emerald-500/20 text-emerald-300">campaña activa</Badge>
          ) : (
            <Badge variant="outline">{campaign.status}</Badge>
          )}
        </div>
      </header>

      <CampaignActions
        campaignId={campaign.id}
        isActive={isActive}
        status={campaign.status}
      />

      <Card className="card-glow">
        <CardHeader>
          <CardTitle className="text-base">Identidad</CardTitle>
          <CardDescription>
            Nombre, voz, audiencia, idioma. Esto se inyecta al agente cuando esta campaña está activa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CampaignEditForm campaign={campaign} />
        </CardContent>
      </Card>
    </div>
  );
}
