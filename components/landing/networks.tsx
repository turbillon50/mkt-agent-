import { IconBox, IconFacebook, IconGlobe, IconWhatsApp } from '@/components/icons';
import { ConnectionBadge } from '@/components/projects/connection-badge';
import { channelAvailable } from '@/src/projects/connections';
import { activeConnectors, defaultLogo } from '@/src/projects/catalog';

/** Lo que no es de Composio no tiene logo allá: lleva el ícono de la casa. */
const ICONO_PROPIO: Record<string, React.ElementType> = {
  sitio: IconGlobe,
  mcp: IconBox,
  whatsapp: IconWhatsApp,
  meta: IconFacebook,
};

/**
 * Lo que puedes conectar, en la portada.
 *
 * Sale del MISMO catálogo que la pantalla de Conexiones y del mismo
 * `channelAvailable`: antes esta lista era fija en el código y decía "Live" o
 * "Próximo" por su cuenta — prometía WhatsApp y no prometía Facebook, justo al
 * revés de la realidad. Ahora no puede mentir, porque no sabe nada: pregunta.
 *
 * Los logos son los del catálogo de Composio, no PNG nuestros que envejecen
 * solos en `/public`.
 */
export function Networks() {
  const conectores = activeConnectors();
  return (
    <section className="border-b border-[var(--color-border)] bg-[var(--color-card)]/30">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="text-center text-xs uppercase tracking-[0.2em] text-[var(--color-muted-foreground)]">
          Lo que puedes conectar
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {conectores.map((c) => {
            const listo = channelAvailable(c.slug);
            const Propio = ICONO_PROPIO[c.slug] ?? IconGlobe;
            return (
              <div
                key={c.slug}
                className="flex flex-col items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-center"
              >
                <span
                  className={`grid h-8 w-8 place-items-center overflow-hidden rounded-lg ${
                    c.via === 'composio' ? 'bg-white' : 'bg-[var(--color-accent)]'
                  }`}
                >
                  {c.via === 'composio' ? (
                    <img src={defaultLogo(c.slug)} alt="" className="h-5 w-5 object-contain" />
                  ) : (
                    <Propio className="h-4 w-4" />
                  )}
                </span>
                <span className="text-sm font-medium">{c.label}</span>
                <ConnectionBadge state={listo ? 'sin_conectar' : 'proximamente'} />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
