import { NextResponse, type NextRequest } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { isClerkConfigured } from '@/lib/clerk-config';

/**
 * Puerta de entrada (en Next 16 el middleware se llama `proxy.ts`).
 *
 * Dos candados, en este orden:
 *   1. ¿Hay sesión? Si no, a firmar.
 *   2. ¿Hay ORGANIZACIÓN ACTIVA? Sin `orgId` en el token no se entra al
 *      dashboard ni a sus APIs. Las páginas se mandan a /onboarding; las APIs
 *      contestan 403 — un fetch no se redirige, se le dice que no.
 *
 * El filtrado por `org_id` NO vive aquí: vive en cada consulta (`lib/org.ts` +
 * los `where` de la capa de datos). Esto es la primera puerta, no la única.
 */

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  // Legales. Van abiertas a proposito: TikTok, X y Meta abren estas URLs con
  // un robot sin sesion durante la revision de la app. Un redirect a /sign-in
  // ahi significa revision rechazada.
  '/terminos',
  '/privacidad',
  // Archivo de firma con el que TikTok comprueba que el dominio es nuestro.
  // Lo pide sin sesion; si contesta redirect, la app no se puede verificar.
  '/tiktok(.*)',
  '/api/cron/(.*)',
  // Mantenimiento con CRON_SECRET, no sesión. Se listan uno por uno: el
  // comodín dejaba abierto todo lo nuevo bajo /api/admin, que ahora es el
  // módulo de administración de la app.
  '/api/admin/migrate',
  '/api/admin/seed-soul',
  '/api/admin/append-soul',
  '/api/admin/backfill-embeddings',
  '/api/webhooks/(.*)',
  '/api/whatsapp/inbound',
]);

/**
 * Rutas con sesión pero SIN org: donde se elige o se crea la organización, y
 * — desde la corrida 3 — donde alguien de fuera quema un enlace de conexión.
 *
 * El community manager del cliente NO pertenece a la organización y no tiene
 * por qué: su permiso es el enlace de un solo uso, y cada ruta de aquí lo
 * verifica por su cuenta. Exigirle `orgId` sería mandarlo a crear una
 * organización que no quiere para conectar una página que no es suya.
 */
const isOrglessRoute = createRouteMatcher([
  '/onboarding(.*)',
  '/conectar(.*)',
  '/api/connections/(.*)',
  '/api/orgs(.*)',
  '/api/me(.*)',
]);

/** El módulo de administración de la app es del dueño de Goossip, no de una org. */
const isAppAdminRoute = createRouteMatcher(['/admin(.*)', '/api/admin/(.*)']);

function orgsEnabled(): boolean {
  const v = (process.env.CLERK_ORGS_ENABLED ?? '').trim().toLowerCase();
  return !(v === 'false' || v === '0' || v === 'off' || v === 'no');
}

const clerkHandler = clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  const { userId, orgId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();

  if (isOrglessRoute(req) || isAppAdminRoute(req)) return;
  if (!orgsEnabled()) return;
  if (orgId) return;

  // Sesión sin organización activa.
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'sin organización activa', problem: 'no_org' },
      { status: 403 },
    );
  }
  const url = req.nextUrl.clone();
  url.pathname = '/onboarding';
  url.search = '';
  return NextResponse.redirect(url);
});

export default function middleware(req: NextRequest) {
  if (!isClerkConfigured()) {
    return NextResponse.next();
  }
  return clerkHandler(req, {} as never);
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|txt|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
