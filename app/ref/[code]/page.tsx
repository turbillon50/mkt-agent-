import type { Metadata } from 'next';
import { getReferralByCode, registerVisit } from '@/lib/referrals';
import { ReferralForm } from '@/components/public/referral-form';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const referral = await getReferralByCode(code);
  if (!referral) return { title: 'Invitación no disponible' };
  const who = referral.name?.trim() || 'Alguien';
  return {
    title: `${who} te invitó`,
    description: `${who} quiere compartirte algo. Déjanos tus datos y te contamos.`,
  };
}

export default async function RefPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const referral = await getReferralByCode(code);

  if (referral) {
    try {
      await registerVisit(code);
    } catch {
      /* nunca tronar la pagina publica por contar una visita */
    }
  }

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

  if (!referral) {
    return wrap(
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🌸</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>Esta invitación no existe</h1>
        <p style={{ color: '#6b5b66', margin: 0 }}>El enlace no es válido o fue eliminado.</p>
      </div>,
    );
  }

  const who = referral.name?.trim() || 'Un embajador';

  return wrap(
    <div
      style={{
        maxWidth: 480,
        width: '100%',
        background: '#fff',
        border: '1px solid #f0dce3',
        borderRadius: 24,
        padding: '40px 32px',
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
        🌸 Invitación
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.2, margin: '0 0 12px' }}>
        {who} te invitó
      </h1>
      <p style={{ fontSize: 16, lineHeight: 1.6, color: '#6b5b66', margin: '0 0 28px' }}>
        Te queremos dar la bienvenida. Déjanos tus datos y muy pronto sabrás de nosotros.
      </p>

      <ReferralForm code={code} />

      <div style={{ marginTop: 24, fontSize: 12, color: '#bcaeb6', textAlign: 'center' }}>
        Goossip · vliving.life
      </div>
    </div>,
  );
}
