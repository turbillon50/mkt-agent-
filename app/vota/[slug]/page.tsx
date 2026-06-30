import type { Metadata } from 'next';
import { getPollBySlug, getPollTally } from '@/lib/polls';
import { PollVote } from '@/components/public/poll-vote';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const poll = await getPollBySlug(slug);
  if (!poll) return { title: 'Votación no disponible' };
  return {
    title: `${poll.question} — vota y co-crea`,
    description: poll.description ?? undefined,
  };
}

function wrap(children: React.ReactNode) {
  return (
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
}

export default async function VotaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const poll = await getPollBySlug(slug);

  if (!poll) {
    return wrap(
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🌸</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>Esta votación no existe</h1>
        <p style={{ color: '#6b5b66', margin: 0 }}>El enlace no es válido o la votación fue eliminada.</p>
      </div>,
    );
  }

  const closed = poll.status === 'closed';
  const tally = await getPollTally(poll.id);

  // Para resultados cerrados.
  const total = Object.values(tally).reduce((a, b) => a + b, 0);
  const winnerId = poll.winnerOptionId;

  return wrap(
    <div
      style={{
        maxWidth: 520,
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
        🗳️ {closed ? 'Resultados' : 'Vota y co-crea'}
      </div>

      <h1 style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.2, margin: '0 0 12px' }}>{poll.question}</h1>

      {poll.description ? (
        <p style={{ fontSize: 15, lineHeight: 1.6, color: '#6b5b66', margin: '0 0 24px' }}>{poll.description}</p>
      ) : (
        <div style={{ height: 12 }} />
      )}

      {closed ? (
        <div style={{ textAlign: 'left' }}>
          <div style={{ textAlign: 'center', marginBottom: 18, fontSize: 14, color: '#6b5b66' }}>
            La votación cerró · {total} voto{total === 1 ? '' : 's'}
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {poll.options.map((o) => {
              const count = tally[o.id] ?? 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              const won = o.id === winnerId;
              return (
                <div
                  key={o.id}
                  style={{
                    border: `1px solid ${won ? '#d6336c' : '#f0dce3'}`,
                    borderRadius: 14,
                    padding: '12px 14px',
                    background: won ? '#fff5f8' : '#fff',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, color: '#221821' }}>
                      {won ? '🏆 ' : ''}
                      {o.label}
                    </span>
                    <span style={{ fontWeight: 700, color: '#d6336c', whiteSpace: 'nowrap' }}>
                      {pct}% · {count}
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: '#f3e9ec', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${pct}%`,
                        borderRadius: 999,
                        background: 'linear-gradient(90deg,#ff5d8f,#d6336c)',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <PollVote slug={poll.slug} options={poll.options} initialTally={tally} />
      )}

      <div style={{ marginTop: 24, fontSize: 12, color: '#bcaeb6' }}>Goossip · vliving.life</div>
    </div>,
  );
}
