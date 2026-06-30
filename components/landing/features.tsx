import {
  IconChat,
  IconBolt,
  IconFunnel,
  IconMail,
  IconMap,
  IconSparkles,
  IconTrophy,
  IconRocket,
} from '@/components/icons';

const features = [
  {
    icon: IconChat,
    title: 'Venta por comentario',
    body: 'Tu audiencia comenta una palabra y Goossip le manda el link de compra al DM. El interés se vuelve venta en segundos.',
  },
  {
    icon: IconBolt,
    title: 'Ofertas Flash',
    body: 'Lanza promociones con cuenta regresiva real. Goossip avisa, recuerda y cierra antes de que se enfríe el momento.',
  },
  {
    icon: IconFunnel,
    title: 'Embudo automático',
    body: 'Cada seguidor entra a un camino que lo lleva de “quién eres” a “ya te compré”, sin que tú muevas un dedo.',
  },
  {
    icon: IconMail,
    title: 'Mailing inteligente',
    body: 'Convierte seguidores en lista de correo y manda campañas que sí abren — escritas con tu voz, no plantillas frías.',
  },
  {
    icon: IconMap,
    title: 'Mapa de prospectos',
    body: 'Ve quién interactúa, dónde está y qué tan caliente está. Tu mejor cliente deja de perderse entre likes.',
  },
  {
    icon: IconSparkles,
    title: 'DM automático con IA',
    body: 'Responde mensajes 24/7 con tu tono, resuelve dudas y agenda — sin sonar a robot y sin que tú estés pegado al teléfono.',
  },
  {
    icon: IconTrophy,
    title: 'Embajadores gamificados',
    body: 'Premia a quienes te recomiendan. Tus seguidores se vuelven tu fuerza de ventas con retos, puntos y recompensas.',
  },
  {
    icon: IconRocket,
    title: 'Landing por campaña',
    body: 'Cada promo o lanzamiento con su propia página lista para vender, generada al instante y con tu marca.',
  },
];

export function Features() {
  return (
    <section id="features" className="border-b border-[var(--color-border)]">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
            Tu arsenal
          </p>
          <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
            Todo lo que un equipo de marketing haría por ti,{' '}
            <span className="brand-gradient">automático</span>
          </h2>
          <p className="mt-4 text-base text-[var(--color-muted-foreground)]">
            No es una herramienta más para programar posts. Es el motor que hace crecer
            tu audiencia y la convierte en clientes que pagan.
          </p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card-glow group rounded-2xl p-6">
              <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[var(--color-primary)]/15 to-[var(--color-secondary)]/15 transition-transform group-hover:scale-105">
                <Icon className="h-5 w-5 text-[var(--color-primary)]" />
              </div>
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-muted-foreground)]">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
