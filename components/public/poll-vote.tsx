'use client';

import * as React from 'react';

type Option = { id: string; label: string; description?: string };

const PINK = '#d6336c';
const BRAND1 = '#ff5d8f';
const PLUM = '#6b2545';
const TEXT = '#221821';
const MUTED = '#6b5b66';

function ResultBars({ options, tally }: { options: Option[]; tally: Record<string, number> }) {
  const total = Object.values(tally).reduce((a, b) => a + b, 0);
  let topId: string | null = null;
  let best = -1;
  for (const o of options) {
    const c = tally[o.id] ?? 0;
    if (c > best) {
      best = c;
      topId = o.id;
    }
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {options.map((o) => {
        const count = tally[o.id] ?? 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const winning = o.id === topId && total > 0;
        return (
          <div
            key={o.id}
            style={{
              border: `1px solid ${winning ? PINK : '#f0dce3'}`,
              borderRadius: 14,
              padding: '12px 14px',
              background: winning ? '#fff5f8' : '#fff',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
              <span style={{ fontWeight: 700, color: TEXT }}>
                {winning ? '🏆 ' : ''}
                {o.label}
              </span>
              <span style={{ fontWeight: 700, color: PINK, whiteSpace: 'nowrap' }}>
                {pct}% · {count}
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: '#f3e9ec', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${pct}%`,
                  borderRadius: 999,
                  background: `linear-gradient(90deg,${BRAND1},${PINK})`,
                  transition: 'width .4s ease',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PollVote({
  slug,
  options,
  initialTally,
}: {
  slug: string;
  options: Option[];
  initialTally: Record<string, number>;
}) {
  const [optionId, setOptionId] = React.useState<string>('');
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<null | { already: boolean; tally: Record<string, number> }>(null);

  const submit = async () => {
    setError(null);
    if (!optionId) return setError('Elige una opción para votar.');
    if (!email.trim()) return setError('Pon tu correo para registrar tu voto.');
    setBusy(true);
    try {
      const r = await fetch(`/api/public/vota/${slug}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionId, name, email }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'No se pudo registrar tu voto.');
      setDone({ already: Boolean(d.already), tally: d.tally ?? {} });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo salió mal.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div style={{ textAlign: 'left' }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 34, marginBottom: 6 }}>{done.already ? '👍' : '🎉'}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: TEXT }}>
            {done.already ? 'Ya habías votado' : '¡Gracias por votar!'}
          </div>
          <div style={{ fontSize: 14, color: MUTED, marginTop: 4 }}>Así van los resultados:</div>
        </div>
        <ResultBars options={options} tally={done.tally} />
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
        {options.map((o) => {
          const selected = optionId === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setOptionId(o.id)}
              style={{
                textAlign: 'left',
                cursor: 'pointer',
                border: `2px solid ${selected ? PINK : '#f0dce3'}`,
                borderRadius: 14,
                padding: '14px 16px',
                background: selected ? '#fff5f8' : '#fff',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <span
                style={{
                  marginTop: 2,
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  border: `2px solid ${selected ? PINK : '#cbb9c2'}`,
                  background: selected ? PINK : 'transparent',
                  flexShrink: 0,
                  boxShadow: selected ? `inset 0 0 0 3px #fff` : 'none',
                }}
              />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 700, color: TEXT }}>{o.label}</span>
                {o.description ? (
                  <span style={{ display: 'block', fontSize: 13, color: MUTED, marginTop: 2 }}>{o.description}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tu nombre (opcional)"
          style={inputStyle}
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="Tu correo"
          style={inputStyle}
        />
      </div>

      {error ? (
        <div style={{ color: PINK, fontSize: 13, marginBottom: 12, fontWeight: 600 }}>{error}</div>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        style={{
          width: '100%',
          padding: '15px 24px',
          borderRadius: 14,
          border: 'none',
          cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.7 : 1,
          background: `linear-gradient(135deg,${BRAND1} 0%,${PINK} 60%,${PLUM} 100%)`,
          color: '#fff',
          fontWeight: 800,
          fontSize: 16,
          boxShadow: '0 16px 40px -16px rgba(214,51,108,0.7)',
        }}
      >
        {busy ? 'Registrando…' : 'Votar'}
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '13px 14px',
  borderRadius: 12,
  border: '1px solid #f0dce3',
  fontSize: 15,
  color: TEXT,
  outline: 'none',
  background: '#fff',
  boxSizing: 'border-box',
};
