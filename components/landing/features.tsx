import { IconBrain, IconCalendar, IconBolt, IconChat, IconSignal, IconShield } from '@/components/icons';

const features = [
  {
    icon: IconBrain,
    title: 'Memoria de marca',
    body: 'Goossip aprende tu voz, tu producto, tus líneas rojas. Cada post se construye sobre lo que ya dijiste sin sonar a robot.',
  },
  {
    icon: IconCalendar,
    title: 'Plan semanal automático',
    body: 'Cada lunes diseña 7 días de contenido por red. Diversifica temas, ángulos y formato sin que tengas que pensar.',
  },
  {
    icon: IconBolt,
    title: 'Publicación 24/7',
    body: 'Cron en Vercel ejecuta tu plan a las horas que tú elijas. Tweetea, postea en LinkedIn, responde WhatsApp — sin pausa.',
  },
  {
    icon: IconChat,
    title: 'WhatsApp con agente',
    body: 'Conecta tu número de WhatsApp Business. Goossip lee mensajes, los recuerda y opcionalmente responde con tu tono.',
  },
  {
    icon: IconSignal,
    title: 'Modelos a la medida',
    body: 'Claude Sonnet donde importa, modelos rápidos para draft y replies. Pagas lo justo, sin caja negra.',
  },
  {
    icon: IconShield,
    title: 'Tu data, tu control',
    body: 'Postgres en Neon bajo tu cuenta. Cada draft pasa por tu aprobación si quieres. Cero dependencia de proveedores opacos.',
  },
];

export function Features() {
  return (
    <section id="features" className="border-b border-[var(--color-border)]">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold sm:text-4xl">
            Un equipo entero de marketing,{' '}
            <span className="brand-gradient">en un agente</span>
          </h2>
          <p className="mt-4 text-base text-[var(--color-muted-foreground)]">
            Goossip no es un programador de posts. Es un agente con memoria, criterio y permisos
            para ejecutar — supervisado por ti.
          </p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="card-glow rounded-xl p-6 transition-colors"
            >
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
