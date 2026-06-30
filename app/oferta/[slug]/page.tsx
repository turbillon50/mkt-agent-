import type { Metadata } from 'next';
import { getOfferBySlug, isLive } from '@/lib/flash-offers';
import { Countdown } from '@/components/public/countdown';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const offer = await getOfferBySlug(slug);
  if (!offer) return { title: 'Oferta no disponible' };
  return {
    title: `${offer.name} — oferta por tiempo limitado`,
    description: offer.description ?? undefined,
  };
}

export default async function OfertaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const offer = await getOfferBySlug(slug);

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

  if (!offer) {
    return wrap(
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🌸</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>Esta oferta no existe</h1>
        <p style={{ color: '#6b5b66', margin: 0 }}>El enlace no es válido o la oferta fue eliminada.</p>
      </div>,
    );
  }

  const live = isLive(offer);
  const ended = !live;

  return wrap(
    <div
      style={{
        maxWidth: 480,
        width: '100%',
        background: '#fff',
        border: '1px solid #f0dce3',
        borderRadius: 24,
        padding: '40px 32px',
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
          marginBottom: 20,
        }}
      >
        ⚡ Oferta Flash
      </div>

      <h1 style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.15, margin: '0 0 12px' }}>{offer.name}</h1>

      {offer.description ? (
        <p style={{ fontSize: 16, lineHeight: 1.6, color: '#6b5b66', margin: '0 0 24px' }}>{offer.description}</p>
      ) : null}

      {offer.price ? (
        <div style={{ fontSize: 40, fontWeight: 900, color: '#d6336c', margin: '0 0 24px' }}>
          {offer.price}
          <span style={{ fontSize: 16, fontWeight: 600, color: '#9b8d96', marginLeft: 6 }}>{offer.currency}</span>
        </div>
      ) : null}

      <div style={{ margin: '0 0 28px' }}>
        {ended ? (
          <div style={{ fontWeight: 700, fontSize: 18, color: '#9b8d96' }}>Esta oferta ya terminó ⏳</div>
        ) : (
          <>
            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5, color: '#9b8d96', marginBottom: 12 }}>
              Termina en
            </div>
            <Countdown endsAt={new Date(offer.endsAt).toISOString()} />
          </>
        )}
      </div>

      {ended ? (
        <div
          style={{
            display: 'block',
            padding: '16px 24px',
            borderRadius: 14,
            background: '#f3e9ec',
            color: '#9b8d96',
            fontWeight: 700,
            fontSize: 16,
          }}
        >
          Oferta no disponible
        </div>
      ) : (
        <a
          href={`/api/public/oferta/${offer.slug}/go`}
          style={{
            display: 'block',
            padding: '16px 24px',
            borderRadius: 14,
            background: 'linear-gradient(135deg,#ff5d8f 0%,#d6336c 60%,#6b2545 100%)',
            color: '#fff',
            fontWeight: 800,
            fontSize: 17,
            textDecoration: 'none',
            boxShadow: '0 16px 40px -16px rgba(214,51,108,0.7)',
          }}
        >
          Aprovechar ahora →
        </a>
      )}

      <div style={{ marginTop: 24, fontSize: 12, color: '#bcaeb6' }}>Goossip · vliving.life</div>
    </div>,
  );
}
