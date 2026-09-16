import { IconBolt, IconBrain, IconChat, IconPlug, IconTarget, IconUsers } from '@/components/icons';

/**
 * Lo que Goossip hace, dicho como lo diría quien vende.
 *
 * La versión anterior enseñaba la maquinaria: "Cron en Vercel", "Postgres en
 * Neon bajo tu cuenta", "Claude Sonnet donde importa, modelos rápidos para
 * draft y replies". A Luis eso le dice algo; a un desarrollador inmobiliario de
 * Tulum le dice que le están vendiendo algo que no entiende. Con qué está hecho
 * por dentro es cosa nuestra.
 *
 * Y el eje cambió: desde la corrida 3 el centro es el PROYECTO, no el post.
 */
const features = [
  {
    icon: IconPlug,
    title: 'Tus canales, en un lugar',
    body: 'Facebook, Instagram, WhatsApp y los formularios de tu sitio entran al mismo pipeline. Cada proyecto con los suyos.',
  },
  {
    icon: IconTarget,
    title: 'Ningún lead se enfría',
    body: 'Cada persona que levanta la mano queda calificada y ordenada por qué tan cerca está de comprar.',
  },
  {
    icon: IconChat,
    title: 'Un vendedor que contesta',
    body: 'Responde en minutos con tu tono, agenda citas y te pasa la conversación cuando hace falta que entres tú.',
  },
  {
    icon: IconBrain,
    title: 'Sabe de tu negocio',
    body: 'Le enseñas tus precios, tus unidades y tus formas de pago una vez. No inventa nada que no le hayas dicho.',
  },
  {
    icon: IconBolt,
    title: 'Tú decides qué sale',
    body: 'Puede contestar solo o proponerte cada mensaje para que lo apruebes. Lo cambias cuando quieras.',
  },
  {
    icon: IconUsers,
    title: 'Tu equipo, con su lugar',
    body: 'Invita a quien atiende, a quien conecta y a quien solo mira. Cada quien ve el proyecto que le toca.',
  },
];

export function Features() {
  return (
    <section id="features" className="border-b border-[var(--color-border)]">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold sm:text-4xl">
            Un equipo de ventas entero, <span className="brand-gradient">en un agente</span>
          </h2>
          <p className="mt-4 text-base text-[var(--color-muted-foreground)]">
            Goossip no es un programador de publicaciones. Atiende a tu gente, la califica y te
            avisa cuando alguien está listo para comprar.
          </p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card-glow rounded-xl p-6 transition-colors">
              <div className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-[var(--color-primary)]/20 to-[var(--color-secondary)]/20">
                <Icon className="h-5 w-5 text-[var(--color-primary)]" />
              </div>
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
