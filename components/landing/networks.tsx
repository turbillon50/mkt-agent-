import {
  IconBox,
  IconFacebook,
  IconGlobe,
  IconGoogle,
  IconInstagram,
  IconLinkedIn,
  IconTikTok,
  IconWhatsApp,
  IconX,
} from '@/components/icons';
import { ConnectionBadge } from '@/components/projects/connection-badge';
import { channelAvailable } from '@/src/projects/connections';
import { CHANNEL_SPECS } from '@/src/projects/types';

/**
 * Los canales, en la portada.
 *
 * Sale del MISMO catálogo que la pantalla de Conexiones y del mismo
 * `channelAvailable`: antes esta lista era fija en el código y decía "Live" o
 * "Próximo" por su cuenta — prometía WhatsApp y no prometía Facebook, justo al
 * revés de la realidad. Ahora no puede mentir, porque no sabe nada: pregunta.
 */
const ICONO: Record<string, React.ElementType> = {
  meta: IconFacebook,
  whatsapp: IconWhatsApp,
  google: IconGoogle,
  linkedin: IconLinkedIn,
  x: IconX,
  tiktok: IconTikTok,
  sitio: IconGlobe,
  mcp: IconBox,
};

export function Networks() {
  return (
    <section className="border-b border-[var(--color-border)] bg-[var(--color-card)]/30">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="text-center text-xs uppercase tracking-[0.2em] text-[var(--color-muted-foreground)]">
          Lo que puedes conectar
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CHANNEL_SPECS.map((spec) => {
            const Icon = ICONO[spec.id];
            const listo = channelAvailable(spec.id);
            return (
              <div
                key={spec.id}
                className="flex flex-col items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-center"
              >
                <span className="flex items-center gap-1 text-[var(--color-foreground)]">
                  <Icon className="h-5 w-5" />
                  {spec.id === 'meta' && <IconInstagram className="h-5 w-5" />}
                </span>
                <span className="text-sm font-medium">{spec.label}</span>
                <ConnectionBadge state={listo ? 'sin_conectar' : 'proximamente'} />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
