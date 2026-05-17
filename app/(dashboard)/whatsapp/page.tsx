import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WhatsAppConnection } from '@/components/whatsapp/connection';
import { WhatsAppComposer } from '@/components/whatsapp/composer';
import { ConversationsList } from '@/components/whatsapp/conversations-list';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function loadConversations() {
  try {
    const { listConversations } = await import('@/src/whatsapp/repo');
    return await listConversations(50);
  } catch {
    return null;
  }
}

export default async function WhatsAppPage() {
  const convos = await loadConversations();

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">WhatsApp</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Bridge Baileys persistente en Hetzner. Goossip recibe, recuerda y opcionalmente responde.
          </p>
        </div>
        <Badge variant="outline">canal 1:1</Badge>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="card-glow">
          <CardHeader>
            <CardTitle className="text-base">Conversaciones recientes</CardTitle>
            <CardDescription>
              Agrupadas por contacto. Click para ver historial (próximo).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!convos ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Sin conexión a la base de datos.
              </p>
            ) : convos.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted-foreground)]">
                Aún no hay mensajes. Conecta WhatsApp escaneando el QR a la derecha y manda algo a
                este número.
              </div>
            ) : (
              <ConversationsList
                items={convos.map((c) => ({
                  fromNumber: c.fromNumber,
                  lastBody: c.lastBody,
                  lastAt: formatDate(c.lastAt),
                  messages: c.messages,
                }))}
              />
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <WhatsAppConnection />
          <WhatsAppComposer />
        </div>
      </div>
    </div>
  );
}
