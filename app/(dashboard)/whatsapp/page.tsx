import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { IconWhatsApp, IconCheck } from '@/components/icons';

export const dynamic = 'force-dynamic';

export default function WhatsAppPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">WhatsApp</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Desconectamos el bridge no oficial (Baileys) — nunca fue estable para producción.
          Estamos preparando la integración correcta con WhatsApp Business Platform, la API
          oficial de Meta.
        </p>
      </header>

      <Card className="card-glow">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--color-accent)] text-[var(--color-success)]">
              <IconWhatsApp className="h-5 w-5" />
            </span>
            <CardTitle className="text-base">WhatsApp Business Platform (oficial)</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[var(--color-muted-foreground)]">
            A diferencia del bridge anterior, esta es la API oficial de Meta: sesión estable,
            sin desconexiones aleatorias, y soporta múltiples números — uno por cliente de Goossip,
            igual que ya hicimos con X, LinkedIn y Google Ads.
          </p>
          <ul className="space-y-2 text-sm">
            {[
              'Sin riesgo de baneo — es el canal sancionado por Meta',
              'Cada cliente conecta su propio número de WhatsApp Business',
              'Soporta plantillas, botones, catálogos y respuestas automáticas',
              'Requiere una cuenta de Meta Business verificada',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            En construcción. Mientras tanto puedes seguir operando X, LinkedIn y Google Ads desde
            Goossip.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
