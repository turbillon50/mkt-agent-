import { Brain, Calendar, MessageSquare, Shield, Zap, Sparkles } from 'lucide-react';

const features = [
  {
    icon: Brain,
    title: 'Memoria de marca',
    body: 'Goossip aprende tu voz, tu producto, tus líneas rojas. Cada post se construye sobre lo que ya dijiste sin sonar a robot.',
  },
  {
    icon: Calendar,
    title: 'Plan semanal automático',
    body: 'Cada lunes diseña 7 días de contenido por red. Diversifica temas, ángulos y formato sin que tengas que pensar.',
  },
  {
    icon: Zap,
    title: 'Publicación 24/7',
    body: 'Cron en Vercel ejecuta tu plan a las horas que tú elijas. Tweetea, postea en LinkedIn, responde WhatsApp — sin pausa.',
  },
  {
    icon: MessageSquare,
    title: 'WhatsApp con agente',
    body: 'Conecta tu número vía Baileys. Goossip lee mensajes, los recuerda y opcionalmente responde con tu tono.',
  },
  {
    icon: Sparkles,
    title: 'Modelos a la medida',
    body: 'Claude Sonnet 4.5 donde importa, Gemini Flash para draft rápido, modelos free para replies. Pagas lo justo.',
  },
  {
    icon: Shield,
    title: 'Tu data, tu control',
    body: 'Postgres en Neon bajo tu cuenta. Cada draft pasa por tu approval si quieres. Cero dependencia de proveedores opacos.',
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
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]/60 p-6 transition-colors hover:bg-[var(--color-card)]"
            >
              <div className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-fuchsia-500/30 to-violet-500/30">
                <Icon className="h-5 w-5 text-fuchsia-300" />
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
