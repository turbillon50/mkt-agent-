import type { Metadata } from 'next';
import { getLandingBySlug, registerView } from '@/lib/campaign-landings';
import { LandingForm } from '@/components/public/landing-form';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const landing = await getLandingBySlug(slug);
  if (!landing || !landing.published) return { title: 'Página no disponible' };
  return {
    title: landing.title,
    description: landing.subtitle ?? landing.description ?? undefined,
  };
}

export default async function LandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const landing = await getLandingBySlug(slug);

  const wrap = (children: React.ReactNode) => (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(160deg,#fff5f8 0%,#fbf7f8 45%,#f7eef2 100%)',
        color: '#221821',
        fontFamily: '-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        padding: '24px',
      }}
    >
      {children}
    </main>
  );

  if (!landing || !landing.published) {
    return wrap(
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🌸</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>Esta página no está disponible</h1>
        <p style={{ color: '#6b5b66', margin: 0 }}>El enlace no es válido o la página aún no está publicada.</p>
      </div>,
    );
  }

  // Cuenta la vista sin romper el render si falla.
  try {
    await registerView(slug);
  } catch {
    /* las metricas no deben tumbar la pagina */
  }

  return wrap(
    <div
      style={{
        maxWidth: 540,
        width: '100%',
        background: '#fff',
        border: '1px solid #f0dce3',
        borderRadius: 24,
        padding: '44px 36px',
        textAlign: 'center',
        boxShadow: '0 30px 80px -40px rgba(214,51,108,0.45)',
      }}
    >
      <div
        style={{
          display: 'inline-block',
          padding: '6px 14px',
          borderRadius: 999,
          background: '#fbe8ee',
          color: '#d6336c',
          fontSize: 12,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 1.5,
          marginBottom: 22,
        }}
      >
        🌸 Edición especial
      </div>

      <h1 style={{ fontSize: 34, fontWeight: 900, lineHeight: 1.12, margin: '0 0 14px' }}>{landing.title}</h1>

      {landing.subtitle ? (
        <p style={{ fontSize: 18, lineHeight: 1.5, color: '#6b2545', fontWeight: 600, margin: '0 0 18px' }}>
          {landing.subtitle}
        </p>
      ) : null}

      {landing.description ? (
        <p style={{ fontSize: 16, lineHeight: 1.7, color: '#6b5b66', margin: '0 0 28px', whiteSpace: 'pre-line' }}>
          {landing.description}
        </p>
      ) : null}

      <div style={{ marginTop: 8 }}>
        <LandingForm slug={landing.slug} ctaLabel={landing.ctaLabel} />
      </div>

      <div style={{ marginTop: 24, fontSize: 12, color: '#bcaeb6' }}>Goossip · vliving.life</div>
    </div>,
  );
}
