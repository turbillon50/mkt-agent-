'use client';

import * as React from 'react';

// Countdown en vivo para las ofertas flash. Cuenta hacia endsAt (ISO string).
// Cuando llega a cero, muestra "Oferta terminada" y dispara onExpire una vez.
export function Countdown({
  endsAt,
  onExpire,
  accent = '#d6336c',
}: {
  endsAt: string;
  onExpire?: () => void;
  accent?: string;
}) {
  const target = React.useMemo(() => new Date(endsAt).getTime(), [endsAt]);
  const [now, setNow] = React.useState<number>(() => target); // SSR-safe: arranca igual
  const firedRef = React.useRef(false);

  React.useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = Math.max(0, target - now);
  React.useEffect(() => {
    if (remaining === 0 && !firedRef.current && now !== target) {
      firedRef.current = true;
      onExpire?.();
    }
  }, [remaining, onExpire, now, target]);

  if (remaining === 0) {
    return (
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 18, color: accent }}>
        Esta oferta ya terminó
      </div>
    );
  }

  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const cells: Array<{ v: number; l: string }> = [];
  if (days > 0) cells.push({ v: days, l: 'días' });
  cells.push({ v: hours, l: 'hrs' }, { v: minutes, l: 'min' }, { v: seconds, l: 'seg' });

  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
      {cells.map((c, i) => (
        <div
          key={i}
          style={{
            minWidth: 64,
            padding: '12px 10px',
            borderRadius: 14,
            background: '#fff',
            border: '1px solid #f0dce3',
            boxShadow: '0 10px 30px -18px rgba(214,51,108,0.5)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1, color: '#221821', fontVariantNumeric: 'tabular-nums' }}>
            {String(c.v).padStart(2, '0')}
          </div>
          <div style={{ fontSize: 11, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1, color: '#9b8d96' }}>
            {c.l}
          </div>
        </div>
      ))}
    </div>
  );
}
