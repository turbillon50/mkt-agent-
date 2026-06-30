'use client';

import * as React from 'react';

// Formulario de captura de la pagina publica /ref/[code]. NO usa useToast
// (la pagina publica no monta el ToastProvider): el feedback es inline.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '13px 15px',
  borderRadius: 12,
  border: '1px solid #f0dce3',
  background: '#fff',
  color: '#221821',
  fontSize: 15,
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#6b5b66',
  margin: '0 0 6px',
};

export function ReferralForm({ code }: { code: string }) {
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [whatsapp, setWhatsapp] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !EMAIL_RE.test(email.trim())) {
      setError('Pon un correo válido.');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/public/ref/${code}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, whatsapp }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? 'No se pudo enviar.');
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '28px 20px',
          borderRadius: 16,
          background: '#fbe8ee',
          border: '1px solid #f0dce3',
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 10 }}>🎉</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#d6336c', marginBottom: 6 }}>
          ¡Listo! Te contactaremos pronto
        </div>
        <p style={{ fontSize: 14, color: '#6b5b66', margin: 0 }}>
          Recibimos tus datos. Muy pronto sabrás de nosotros.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 14, textAlign: 'left' }}>
      <div>
        <label style={labelStyle} htmlFor="rf-name">
          Nombre
        </label>
        <input
          id="rf-name"
          style={inputStyle}
          placeholder="Tu nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
      </div>
      <div>
        <label style={labelStyle} htmlFor="rf-email">
          Correo
        </label>
        <input
          id="rf-email"
          type="email"
          style={inputStyle}
          placeholder="tucorreo@ejemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </div>
      <div>
        <label style={labelStyle} htmlFor="rf-whatsapp">
          WhatsApp
        </label>
        <input
          id="rf-whatsapp"
          style={inputStyle}
          placeholder="+52 ..."
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          autoComplete="tel"
          inputMode="tel"
        />
      </div>

      {error ? (
        <div
          style={{
            fontSize: 13,
            color: '#b42318',
            background: '#fef3f2',
            border: '1px solid #fecdca',
            borderRadius: 10,
            padding: '10px 12px',
          }}
        >
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        style={{
          padding: '15px 24px',
          borderRadius: 14,
          border: 'none',
          background: busy
            ? '#e7b9cb'
            : 'linear-gradient(135deg,#ff5d8f 0%,#d6336c 60%,#6b2545 100%)',
          color: '#fff',
          fontWeight: 800,
          fontSize: 16,
          cursor: busy ? 'default' : 'pointer',
          boxShadow: '0 16px 40px -16px rgba(214,51,108,0.7)',
        }}
      >
        {busy ? 'Enviando…' : 'Quiero saber más'}
      </button>
    </form>
  );
}
