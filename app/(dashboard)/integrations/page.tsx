import { auth } from '@clerk/nextjs/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConnectButton } from '@/components/integrations/connect-button';
import { isConnected, isToolkitConfigured, isEmailConnected, isEmailToolkitConfigured } from '@/lib/composio';
import { IconX, IconLinkedIn, IconChat, IconMail } from '@/components/icons';

export const dynamic = 'force-dynamic';

const soonIntegrations = [
  { name: 'Instagram' },
  { name: 'Facebook' },
  { name: 'TikTok' },
];

export default async function IntegrationsPage() {
  const { userId } = await auth();

  let twitterConnected = false;
  let linkedinConnected = false;
  let gmailConnected = false;
  let outlookConnected = false;

  if (userId) {
    [twitterConnected, linkedinConnected, gmailConnected, outlookConnected] = await Promise.all([
      isConnected(userId, 'twitter').catch(() => false),
      isConnected(userId, 'linkedin').catch(() => false),
      isEmailConnected(userId, 'gmail').catch(() => false),
      isEmailConnected(userId, 'outlook').catch(() => false),
    ]);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Integraciones</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Conecta tus propias cuentas. Cada conexión es tuya — Goossip solo publica con tu
          autorización explícita, y la puedes revocar cuando quieras.
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="card-glow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-3">
              <IconX className="h-5 w-5" />
              <div>
                <CardTitle className="text-base">X (Twitter)</CardTitle>
                <CardDescription>Requiere app de developer propia</CardDescription>
              </div>
            </div>
            {isToolkitConfigured('twitter') ? (
              <ConnectButton toolkit="twitter" connected={twitterConnected} label="Conectar" />
            ) : (
              <Badge variant="outline">en configuración</Badge>
            )}
          </CardHeader>
          <CardContent className="text-xs text-[var(--color-muted-foreground)]">
            {isToolkitConfigured('twitter')
              ? 'Conéctate una vez y Goossip queda autorizado a publicar lo que tú apruebes.'
              : 'Necesitamos registrar una app de X Developer antes de habilitar esta conexión. Próximamente.'}
          </CardContent>
        </Card>

        <Card className="card-glow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-3">
              <IconLinkedIn className="h-5 w-5" />
              <div>
                <CardTitle className="text-base">LinkedIn</CardTitle>
                <CardDescription>Perfil personal o página de empresa</CardDescription>
              </div>
            </div>
            <ConnectButton toolkit="linkedin" connected={linkedinConnected} label="Conectar" />
          </CardHeader>
          <CardContent className="text-xs text-[var(--color-muted-foreground)]">
            {linkedinConnected
              ? 'Goossip puede publicar en tu nombre cuando tú lo apruebes.'
              : 'Conéctate una vez y Goossip queda autorizado a publicar lo que tú apruebes.'}
          </CardContent>
        </Card>

        <Card className="card-glow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-3">
              <IconChat className="h-5 w-5" />
              <div>
                <CardTitle className="text-base">WhatsApp</CardTitle>
                <CardDescription>Business API oficial, en construcción</CardDescription>
              </div>
            </div>
            <Badge variant="outline">próximo</Badge>
          </CardHeader>
          <CardContent className="text-xs text-[var(--color-muted-foreground)]">
            Hoy corre sobre un bridge interno solo para pruebas. La versión que vas a poder
            usar tú llega con WhatsApp Business API oficial.
          </CardContent>
        </Card>

        <Card className="card-glow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-3">
              <IconMail className="h-5 w-5" />
              <div>
                <CardTitle className="text-base">Gmail</CardTitle>
                <CardDescription>Lee y envía correo desde tu Gmail</CardDescription>
              </div>
            </div>
            {isEmailToolkitConfigured('gmail') ? (
              <ConnectButton toolkit="gmail" connected={gmailConnected} label="Conectar" />
            ) : (
              <Badge variant="outline">en configuración</Badge>
            )}
          </CardHeader>
          <CardContent className="text-xs text-[var(--color-muted-foreground)]">
            {isEmailToolkitConfigured('gmail')
              ? gmailConnected
                ? 'Goossip puede leer tu bandeja y enviar correos cuando tú lo apruebes.'
                : 'Conéctate una vez y Goossip queda autorizado a leer/enviar correo en tu nombre.'
              : 'Falta registrar la app de Gmail en Composio antes de habilitar esta conexión. Próximamente.'}
          </CardContent>
        </Card>

        <Card className="card-glow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-3">
              <IconMail className="h-5 w-5" />
              <div>
                <CardTitle className="text-base">Outlook</CardTitle>
                <CardDescription>Lee y envía correo desde tu Outlook</CardDescription>
              </div>
            </div>
            {isEmailToolkitConfigured('outlook') ? (
              <ConnectButton toolkit="outlook" connected={outlookConnected} label="Conectar" />
            ) : (
              <Badge variant="outline">en configuración</Badge>
            )}
          </CardHeader>
          <CardContent className="text-xs text-[var(--color-muted-foreground)]">
            {isEmailToolkitConfigured('outlook')
              ? outlookConnected
                ? 'Goossip puede leer tu bandeja y enviar correos cuando tú lo apruebes.'
                : 'Conéctate una vez y Goossip queda autorizado a leer/enviar correo en tu nombre.'
              : 'Falta registrar la app de Outlook en Composio antes de habilitar esta conexión. Próximamente.'}
          </CardContent>
        </Card>

        {soonIntegrations.map((i) => (
          <Card key={i.name} className="card-glow opacity-70">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{i.name}</CardTitle>
              <Badge variant="outline">próximo</Badge>
            </CardHeader>
            <CardContent className="text-xs text-[var(--color-muted-foreground)]">
              Llega en fases posteriores.
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
