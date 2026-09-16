/**
 * Adaptadores de PAUTA: Meta Ads y Google Ads. Leen campañas, gasto y
 * resultados — lo que el dueño del proyecto pregunta cada mañana.
 *
 * Meta Ads hoy sale "Próximamente" en Conexiones porque NO tiene auth
 * administrada por Composio (medido: `composio_managed_auth_schemes: []`,
 * pide client_id/client_secret de una app propia). El adaptador se queda
 * escrito y probado del lado que se puede: el día que Composio habilite la
 * auth administrada —o que Luis decida meter la app propia— la tarjeta se
 * enciende sola y esto ya funciona. Lo que NO se hace es fingir que conecta.
 */
import type { Project } from '../db/schema';
import { proxy, run, verifyChannel, type ChannelAdapter } from './base';

export const metaads: ChannelAdapter = {
  toolkit: 'metaads',
  verify: (project) => verifyChannel(project, 'metaads'),

  /** Gasto y resultados de una cuenta publicitaria o una campaña. */
  async readCampaigns(project: Project, input: Record<string, unknown> = {}) {
    const objectId = String(input.objectId ?? input.adAccountId ?? '');
    if (!objectId) throw new Error('Falta la cuenta publicitaria de Meta.');
    return run(project, 'metaads', 'METAADS_GET_INSIGHTS', {
      object_id: objectId,
      level: String(input.level ?? 'campaign'),
      date_preset: String(input.datePreset ?? 'last_7d'),
      fields: input.fields ?? [
        'campaign_name',
        'spend',
        'impressions',
        'clicks',
        'actions',
        'cost_per_action_type',
      ],
    });
  },

  /** Los conjuntos de anuncios vivos, para saber qué está prendido. */
  async readRows(project: Project, input: Record<string, unknown>) {
    const adAccountId = String(input.adAccountId ?? '');
    if (!adAccountId) throw new Error('Falta la cuenta publicitaria de Meta.');
    return run(project, 'metaads', 'METAADS_READ_ADSETS', {
      ad_account_id: adAccountId,
      limit: Number(input.limit ?? 25),
      effective_status: input.effectiveStatus ?? ['ACTIVE'],
    });
  },
};

/**
 * Google Ads.
 *
 * Su toolkit en Composio trae CINCO tools (medido) y ninguna lista campañas con
 * su gasto, que es justo lo que hace falta. Para eso se va por la llamada cruda
 * con las credenciales que pone Composio, contra `googleAds:search` de la API
 * v23 — la misma vía que ya usaba la corrida 1, pero ahora con la cuenta del
 * PROYECTO en vez de una sola cuenta compartida.
 *
 * El `developer-token` es de Goossip y no es una app de developer: Google lo
 * exige para CUALQUIER llamada a su API, venga de donde venga. Quien autoriza
 * su cuenta sigue siendo el cliente, en la pantalla de Composio.
 */
const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v23';

function developerToken(): string {
  const v = (process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '').trim();
  if (v && !v.startsWith('[')) return v;
  // El de la corrida 1, que sigue vivo. Vive en el código desde entonces y no
  // es un secreto de cliente: identifica a Goossip ante Google, no a nadie más.
  return 'Lzit41AqBs2luUzU8iFq8g';
}

export interface GoogleAdsCampaign {
  id: string;
  name: string;
  status: string;
  costMicros: string | null;
  impressions: string | null;
  clicks: string | null;
  conversions: number | null;
}

export const googleads: ChannelAdapter = {
  toolkit: 'googleads',
  verify: (project) => verifyChannel(project, 'googleads'),

  /** Campañas con su gasto de los últimos 30 días. */
  async readCampaigns(project: Project, input: Record<string, unknown> = {}) {
    const customerId = String(input.customerId ?? '').replace(/[^0-9]/g, '');
    if (customerId.length !== 10) {
      throw new Error('El ID de cliente de Google Ads debe tener 10 dígitos (123-456-7890).');
    }
    const query = `
      SELECT campaign.id, campaign.name, campaign.status,
             metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
      FROM campaign
      WHERE segments.date DURING LAST_30_DAYS
      ORDER BY metrics.cost_micros DESC
    `;
    const data = await proxy(project, 'googleads', {
      endpoint: `${GOOGLE_ADS_API}/customers/${customerId}/googleAds:search`,
      method: 'POST',
      parameters: [{ name: 'developer-token', value: developerToken(), type: 'header' }],
      body: { query },
    });
    const rows = data?.results ?? [];
    return rows.map(
      (r: any): GoogleAdsCampaign => ({
        id: String(r.campaign?.id ?? ''),
        name: r.campaign?.name ?? '(sin nombre)',
        status: r.campaign?.status ?? 'UNKNOWN',
        costMicros: r.metrics?.costMicros ?? null,
        impressions: r.metrics?.impressions ?? null,
        clicks: r.metrics?.clicks ?? null,
        conversions: r.metrics?.conversions ?? null,
      }),
    );
  },

  /** Las listas de clientes, con la tool nativa del toolkit. */
  async readRows(project: Project) {
    return run(project, 'googleads', 'GOOGLEADS_GET_CUSTOMER_LISTS', {});
  },
};
