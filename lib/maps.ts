import 'server-only';

export type MapsPlace = {
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: string | null;
  mapsUrl: string | null;
};

export function isMapsConfigured(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY);
}

/**
 * Google Places API (New) — Text Search. Datos reales y estructurados
 * (direccion, telefono, sitio, rating) en vez de adivinar via grounding de
 * un LLM. Requiere GOOGLE_MAPS_API_KEY con "Places API (New)" habilitada en
 * Google Cloud Console.
 */
export async function searchPlaces(query: string, maxResults = 10): Promise<MapsPlace[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY no está configurada.');

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.googleMapsUri',
    },
    body: JSON.stringify({ textQuery: query, languageCode: 'es', maxResultCount: Math.min(maxResults, 20) }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Google Maps error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const places = data?.places ?? [];
  return places.map((p: any) => ({
    name: p.displayName?.text ?? 'Sin nombre',
    address: p.formattedAddress ?? null,
    phone: p.nationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    rating: p.rating != null ? String(p.rating) : null,
    mapsUrl: p.googleMapsUri ?? null,
  }));
}
