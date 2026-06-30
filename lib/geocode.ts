import 'server-only';

// ── Geocodificación real y gratis (addendum 681 punto 9) ─────────────────
// Convierte una dirección en lat/lng usando Nominatim (OpenStreetMap). No
// requiere API key ni tarjeta — los prospectos con dirección quedan ubicados
// en el mapa interactivo (Leaflet + OSM) de la sección Prospectos.
// Nominatim pide un User-Agent identificable y bajo volumen; lo respetamos.

export type GeoPoint = { lat: string; lng: string };

export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const q = address?.trim();
  if (!q || q.length < 4) return null;
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('accept-language', 'es');

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'GoossipCRM/1.0 (prospect mapping; contact firstcontact@allglobalholding.com)',
      },
      // cache largo: las direcciones no se mueven
      next: { revalidate: 60 * 60 * 24 * 30 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const hit = data?.[0];
    if (!hit?.lat || !hit?.lon) return null;
    return { lat: hit.lat, lng: hit.lon };
  } catch {
    return null;
  }
}
