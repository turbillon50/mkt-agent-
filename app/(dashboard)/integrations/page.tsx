import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const integrations = [
  { name: 'X (Twitter)', envFlag: 'TWITTER_ENABLED', status: 'configurable' },
  { name: 'LinkedIn', envFlag: 'LINKEDIN_ENABLED', status: 'configurable' },
  { name: 'Instagram', envFlag: 'INSTAGRAM_ENABLED', status: 'soon' },
  { name: 'Facebook', envFlag: 'FACEBOOK_ENABLED', status: 'soon' },
  { name: 'TikTok', envFlag: 'TIKTOK_ENABLED', status: 'soon' },
];

export default function IntegrationsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Integraciones</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Plataformas que Goossip puede manejar. Activa cada una en las variables de entorno en Vercel.
        </p>
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        {integrations.map((i) => (
          <Card key={i.name} className="card-glow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{i.name}</CardTitle>
                <CardDescription>flag: <code>{i.envFlag}</code></CardDescription>
              </div>
              <Badge variant={i.status === 'configurable' ? 'default' : 'outline'}>{i.status}</Badge>
            </CardHeader>
            <CardContent className="text-xs text-[var(--color-muted-foreground)]">
              {i.status === 'configurable'
                ? 'Define las credenciales en Vercel → Settings → Environment Variables.'
                : 'Esta integración llegará en fases posteriores.'}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
