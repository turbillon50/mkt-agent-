import Link from 'next/link';
import { SignInButton } from '@clerk/nextjs';
import { IconFacebook, IconLogoMark } from '@/components/icons';
import { isClerkConfigured } from '@/lib/clerk-config';
import { currentUserOrNull } from '@/lib/users';
import { resolveConnectionLink, type LinkProblem } from '@/src/projects/links';
import { channelSpec } from '@/src/projects/types';

export const dynamic = 'force-dynamic';

/**
 * La pantalla del enlace de conexión.
 *
 * Es para alguien de FUERA — el community manager o el dueño de la página del
 * cliente. No ve el menú, ni los leads, ni ninguna otra cosa de Goossip: una
 * sola frase, un solo botón, y se acabó.
 *
 * El enlace NO se quema aquí. Abrirlo no es usarlo: un prefetch del navegador o
 * el antivirus del correo lo dejarían inservible antes de que la persona
 * llegue. Se quema en el callback, cuando el permiso ya está dado.
 */

const MOTIVO: Record<LinkProblem, { titulo: string; texto: string }> = {
  no_existe: {
    titulo: 'Este enlace no sirve',
    texto: 'Revisa que lo hayas copiado completo, o pídele uno nuevo a quien te lo mandó.',
  },
  usado: {
    titulo: 'Este enlace ya se usó',
    texto: 'Cada enlace sirve una sola vez. Si hace falta otra conexión, pide uno nuevo.',
  },
  expirado: {
    titulo: 'Este enlace ya caducó',
    texto: 'Los enlaces duran 72 horas. Pídele uno nuevo a quien te lo mandó.',
  },
  cancelado: {
    titulo: 'Este enlace fue cancelado',
    texto: 'Quien te lo mandó lo canceló. Pídele uno nuevo si todavía hace falta.',
  },
};

export default async function ConectarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolution = await resolveConnectionLink(token);

  if (!resolution.ok) {
    const motivo = MOTIVO[resolution.problem];
    return (
      <Marco>
        <h1 className="text-xl font-semibold">{motivo.titulo}</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">{motivo.texto}</p>
      </Marco>
    );
  }

  const { link, project } = resolution;
  const spec = channelSpec(link.channel);
  const user = isClerkConfigured() ? await currentUserOrNull() : null;

  return (
    <Marco>
      <h1 className="text-xl font-semibold">
        Conecta {spec.label} a {project.name}
      </h1>
      <p className="text-sm text-[var(--color-muted-foreground)]">
        Das permiso a tu página y listo. No vas a ver ni administrar nada más de {project.name}, y
        puedes quitar el permiso cuando quieras desde tu cuenta de Facebook.
      </p>

      {user ? (
        <a
          href={`/api/connections/meta/start?link=${encodeURIComponent(token)}`}
          className="btn-brand inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold"
        >
          <IconFacebook className="h-4 w-4" />
          Continuar con Facebook
        </a>
      ) : isClerkConfigured() ? (
        <div className="space-y-2">
          <SignInButton mode="modal" forceRedirectUrl={`/conectar/${token}`}>
            <button className="btn-brand w-full rounded-xl px-5 py-3 text-sm font-semibold">
              Entrar para continuar
            </button>
          </SignInButton>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Necesitamos saber quién hizo la conexión. Si no tienes cuenta, la creas en el mismo
            paso.
          </p>
        </div>
      ) : (
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Vuelve a intentarlo en un momento.
        </p>
      )}
    </Marco>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-background)] px-6 py-12">
      <div className="w-full max-w-md space-y-5 text-center">
        <Link href="/" className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[var(--color-brand-1)] to-[var(--color-brand-3)] text-white">
          <IconLogoMark className="h-6 w-6" />
        </Link>
        {children}
      </div>
    </div>
  );
}
