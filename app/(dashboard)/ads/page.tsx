import { AdsCampaigns } from '@/components/ads/campaigns';

export const dynamic = 'force-dynamic';

export default function AdsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Google Ads</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Conecta tu cuenta y administra tus campañas de búsqueda directo desde Goossip.
        </p>
      </header>
      <AdsCampaigns />
    </div>
  );
}
