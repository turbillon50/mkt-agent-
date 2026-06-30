import 'server-only';

export type LinkedInPerson = {
  url: string;
  name: string | null;
  headline: string | null;
  location: string | null;
};

export function isLinkedInSearchConfigured(): boolean {
  return Boolean(process.env.LINKEDIN_SEARCH_API_URL && process.env.LINKEDIN_SEARCH_SECRET);
}

/**
 * Busca personas reales en LinkedIn usando la sesion logueada de Luis
 * (Navegador Vulcano -> storageState -> Playwright en Hetzner). NUNCA se
 * maneja usuario/password aqui — el login lo hace el humano dueño de la
 * cuenta, esto solo reutiliza esa sesion ya autenticada para LEER la
 * pagina de resultados de busqueda. Riesgo real de baneo de cuenta si se
 * abusa (muchas busquedas seguidas) — usar con moderacion.
 */
export async function searchLinkedInPeople(query: string, limit = 10): Promise<LinkedInPerson[]> {
  const base = process.env.LINKEDIN_SEARCH_API_URL;
  const secret = process.env.LINKEDIN_SEARCH_SECRET;
  if (!base || !secret) {
    throw new Error('Búsqueda de LinkedIn no configurada.');
  }

  const res = await fetch(`${base}/search`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (data?.error === 'no_session' || data?.error === 'session_expired') {
      throw new Error(
        'No hay sesión activa de LinkedIn. Luis necesita loguearse una vez en el Navegador Vulcano (vulcano.vmomentum.site).',
      );
    }
    throw new Error(data?.message || data?.error || `Error de búsqueda (${res.status})`);
  }

  return (data?.results ?? []) as LinkedInPerson[];
}
