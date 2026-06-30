import { unsubscribeByToken } from '@/lib/mailing';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  let state: 'ok' | 'invalid' | 'missing' = 'missing';
  let email: string | null = null;

  if (token) {
    try {
      const res = await unsubscribeByToken(token);
      state = res.ok ? 'ok' : 'invalid';
      email = res.email;
    } catch {
      state = 'invalid';
    }
  }

  const title =
    state === 'ok' ? 'Listo, te diste de baja' : state === 'invalid' ? 'Enlace no válido' : 'Falta el enlace';
  const message =
    state === 'ok'
      ? `${email ? `${email} ` : ''}ya no recibirá más correos de esta lista. Si fue un error, contáctanos y con gusto te volvemos a sumar.`
      : state === 'invalid'
        ? 'Este enlace de baja no es válido o ya expiró. Si sigues recibiendo correos, responde a uno de ellos y lo resolvemos.'
        : 'No encontramos el enlace de baja. Usa el botón "darte de baja" del correo que recibiste.';

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#fbf7f8',
        color: '#221821',
        fontFamily: '-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        padding: '24px',
      }}
    >
      <div
        style={{
          maxWidth: 460,
          width: '100%',
          background: '#fff',
          border: '1px solid #ecdde2',
          borderRadius: 18,
          padding: '36px 32px',
          textAlign: 'center',
          boxShadow: '0 12px 40px -16px rgba(214,51,108,0.18)',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            margin: '0 auto 20px',
            display: 'grid',
            placeItems: 'center',
            borderRadius: 16,
            background: state === 'ok' ? '#fbe8ee' : '#f3e9ec',
            color: '#d6336c',
            fontSize: 26,
          }}
        >
          {state === 'ok' ? '✓' : '✉'}
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 10px' }}>{title}</h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: '#6b5b66', margin: 0 }}>{message}</p>
      </div>
    </main>
  );
}
