/**
 * Adaptadores de PUBLICACIÓN: Facebook, Instagram, LinkedIn, X, TikTok y
 * YouTube. Uno por toolkit, cada uno con `verify` y sus acciones reales.
 *
 * Todos los slugs de tools están tomados del catálogo REAL de Composio
 * (`GET /api/v3/tools?toolkit_slug=…`, 16-sep-2026), no de memoria. Los
 * argumentos también: `required` e `input_parameters` de cada tool.
 */
import type { Project } from '../db/schema';
import {
  cuerpo,
  proxy,
  proxyConEncabezados,
  run,
  verifyChannel,
  type ChannelAdapter,
  type PublishInput,
  type PublishResult,
  type RawLead,
} from './base';

export const GRAPH_VERSION = 'v21.0';

// ---------------------------------------------------------------------------
// Facebook
// ---------------------------------------------------------------------------

export const facebook: ChannelAdapter = {
  toolkit: 'facebook',
  verify: (project) => verifyChannel(project, 'facebook'),

  /** Publica en la página del proyecto. `target` es el id de la página. */
  async publish(project: Project, input: PublishInput): Promise<PublishResult> {
    const pageId = input.target ?? (await paginaPrincipal(project))?.id ?? null;
    if (!pageId) throw new Error('Este proyecto todavía no tiene una página de Facebook elegida.');
    const data = cuerpo<any>(await run<any>(project, 'facebook', 'FACEBOOK_CREATE_POST', {
      page_id: pageId,
      message: input.texto,
      ...(input.link ? { link: input.link } : {}),
    }));
    const id = data?.id ?? data?.post_id ?? null;
    return { toolkit: 'facebook', id, url: id ? `https://facebook.com/${id}` : null };
  },

  /** Las páginas que administra la cuenta conectada. */
  async readCampaigns(project: Project) {
    return run(project, 'facebook', 'FACEBOOK_GET_USER_PAGES', {});
  },

  /**
   * Los leads de los formularios de anuncios.
   *
   * Facebook tiene 41 tools en Composio y NINGUNA lee lead ads (medido), así
   * que se va por la llamada cruda con las credenciales que pone Composio. Es
   * la misma conexión del proyecto: el token nunca toca a Goossip.
   */
  async fetchLeads(project: Project, input: { formIds: string[]; desde?: Date }): Promise<RawLead[]> {
    const out: RawLead[] = [];
    for (const formId of input.formIds) {
      const params: Array<{ name: string; value: string; type: 'query' }> = [
        { name: 'fields', value: 'id,created_time,field_data,form_id', type: 'query' },
        { name: 'limit', value: '50', type: 'query' },
      ];
      if (input.desde) {
        params.push({
          name: 'filtering',
          value: JSON.stringify([
            {
              field: 'time_created',
              operator: 'GREATER_THAN',
              value: Math.floor(input.desde.getTime() / 1000),
            },
          ]),
          type: 'query',
        });
      }
      const data = await proxy(project, 'facebook', {
        endpoint: `https://graph.facebook.com/${GRAPH_VERSION}/${formId}/leads`,
        method: 'GET',
        parameters: params,
      }).catch(() => null);

      for (const row of data?.data ?? []) {
        out.push(normalizaLead(row, formId));
      }
    }
    return out;
  },
};

/** Los formularios de lead ads de una página, por la misma vía cruda. */
export async function listLeadForms(
  project: Project,
  pageId: string,
): Promise<Array<{ id: string; name: string; status: string; leadsCount: number }>> {
  const data = await proxy(project, 'facebook', {
    endpoint: `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/leadgen_forms`,
    method: 'GET',
    parameters: [{ name: 'fields', value: 'id,name,status,leads_count', type: 'query' }],
  });
  return (data?.data ?? []).map((f: any) => ({
    id: String(f.id),
    name: f.name ?? f.id,
    status: f.status ?? 'UNKNOWN',
    leadsCount: Number(f.leads_count ?? 0),
  }));
}

async function paginaPrincipal(project: Project): Promise<{ id: string; name: string } | null> {
  const data: any = cuerpo(
    await run(project, 'facebook', 'FACEBOOK_GET_USER_PAGES', {}).catch(() => null),
  );
  const lista = data?.data ?? data?.pages ?? [];
  const p = lista[0];
  return p ? { id: String(p.id), name: p.name ?? String(p.id) } : null;
}

/**
 * Un lead de Meta, aplanado. Los nombres de los campos los pone quien armó el
 * formulario, así que se reconocen por varios alias y nunca se asume uno.
 */
export function normalizaLead(row: any, formId: string): RawLead {
  const campos: Record<string, string> = {};
  for (const f of row?.field_data ?? []) {
    const key = String(f?.name ?? '').toLowerCase();
    const value = Array.isArray(f?.values) ? String(f.values[0] ?? '') : String(f?.values ?? '');
    if (key) campos[key] = value;
  }
  const pick = (...claves: string[]) => {
    for (const c of claves) {
      const hit = Object.keys(campos).find((k) => k.includes(c));
      if (hit && campos[hit]) return campos[hit];
    }
    return null;
  };
  return {
    leadgenId: String(row?.id ?? ''),
    formId: String(row?.form_id ?? formId),
    createdAt: row?.created_time ? new Date(row.created_time) : new Date(),
    fullName: pick('full_name', 'nombre', 'name'),
    phone: pick('phone', 'telefono', 'teléfono', 'celular', 'whatsapp'),
    email: pick('email', 'correo'),
    raw: { ...campos, form_id: formId },
  };
}

// ---------------------------------------------------------------------------
// Instagram
// ---------------------------------------------------------------------------

export const instagram: ChannelAdapter = {
  toolkit: 'instagram',
  verify: (project) => verifyChannel(project, 'instagram'),

  /**
   * Publicar en Instagram son DOS pasos en su API: primero se sube el
   * contenedor con la imagen, después se publica. No hay atajo, y saltarse el
   * primero deja un post vacío.
   */
  async publish(project: Project, input: PublishInput): Promise<PublishResult> {
    if (!input.media) {
      throw new Error('Instagram necesita una imagen o un video para publicar.');
    }
    const igUserId = input.target ?? (await cuentaInstagram(project));
    if (!igUserId) {
      throw new Error(
        'No encontramos tu cuenta de Instagram. Necesita ser Business o Creator y estar ligada a una página de Facebook.',
      );
    }
    const contenedor: any = cuerpo(
      await run(project, 'instagram', 'INSTAGRAM_CREATE_MEDIA_CONTAINER', {
        ig_user_id: igUserId,
        image_url: input.media,
        caption: input.texto,
      }),
    );
    const creationId = contenedor?.id ?? contenedor?.creation_id;
    if (!creationId) throw new Error('Instagram no aceptó la imagen.');
    const data: any = cuerpo(
      await run(project, 'instagram', 'INSTAGRAM_CREATE_POST', {
        ig_user_id: igUserId,
        creation_id: String(creationId),
      }),
    );
    const id = data?.id ?? null;
    return { toolkit: 'instagram', id, url: id ? `https://www.instagram.com/p/${id}` : null };
  },
};

async function cuentaInstagram(project: Project): Promise<string | null> {
  const data: any = cuerpo(
    await run(project, 'instagram', 'INSTAGRAM_GET_USER_INFO', {}).catch(() => null),
  );
  const id = data?.id ?? data?.ig_user_id ?? data?.user?.id ?? null;
  return id ? String(id) : null;
}

// ---------------------------------------------------------------------------
// LinkedIn
// ---------------------------------------------------------------------------

export const linkedin: ChannelAdapter = {
  toolkit: 'linkedin',
  verify: (project) => verifyChannel(project, 'linkedin'),

  /**
   * Publicar en LinkedIn va por la llamada CRUDA, no por la tool de Composio.
   *
   * No es capricho. `LINKEDIN_CREATE_LINKED_IN_POST` manda un encabezado
   * `LinkedIn-Version` de 2024 y LinkedIn contesta **426 NONEXISTENT_VERSION**
   * (medido el 16-sep-2026 con la cuenta real de MOMENTUM). LinkedIn caduca sus
   * versiones de API cada pocos meses y esa tool se quedó atrás; esperar a que
   * Composio la actualice deja a los clientes sin publicar mientras tanto.
   *
   * Por el proxy sale la MISMA conexión del proyecto —el token nunca toca a
   * Goossip— y el encabezado de versión lo ponemos nosotros. Es exactamente lo
   * que ya se hacía con los formularios de lead ads de Facebook.
   *
   * `author` es obligatorio: LinkedIn no asume "publica como quien está
   * conectado". Se saca el URN en el momento y no se cachea — publicar en la
   * cuenta equivocada es el peor error posible aquí.
   */
  async publish(project: Project, input: PublishInput): Promise<PublishResult> {
    const urn = input.target ?? (await urnDeLinkedIn(project));
    const { data, headers } = await proxyConEncabezados(project, 'linkedin', {
      endpoint: 'https://api.linkedin.com/rest/posts',
      method: 'POST',
      parameters: [
        { name: 'LinkedIn-Version', value: LINKEDIN_VERSION, type: 'header' },
        { name: 'X-Restli-Protocol-Version', value: '2.0.0', type: 'header' },
      ],
      body: {
        author: urn,
        commentary: input.texto,
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      },
    });

    /**
     * LinkedIn devuelve el id en el encabezado `x-restli-id` y el cuerpo VACÍO.
     * Sin leer el encabezado, la publicación sale bien y Goossip contesta que
     * no sabe dónde quedó — que para el usuario es igual que un fallo.
     */
    const id: string | null = headers['x-restli-id'] ?? (data as any)?.id ?? null;

    return {
      toolkit: 'linkedin',
      id,
      url: id ? `https://www.linkedin.com/feed/update/${id}/` : null,
    };
  },
};

/**
 * La versión de la API de LinkedIn que se declara en cada llamada.
 *
 * LinkedIn obliga a mandarla y caduca las viejas: sin esto contesta 426. Se
 * sube aquí —o por entorno— cuando toque, sin esperar a nadie.
 */
export const LINKEDIN_VERSION = process.env.LINKEDIN_API_VERSION || '202609';

/**
 * El URN de la persona con la que publica ESTE proyecto.
 *
 * `author_id` va primero porque es lo que LinkedIn devuelve de verdad, y ya
 * viene con el prefijo puesto (`urn:li:person:AaAf8dE53o`, medido 16-sep-2026).
 * Los otros nombres se quedan como red: el día que Composio cambie el campo, la
 * publicación no se cae — y si ninguno está, se dice en español.
 */
export async function urnDeLinkedIn(project: Project): Promise<string> {
  const data: any = cuerpo(await run(project, 'linkedin', 'LINKEDIN_GET_MY_INFO', {}));
  const raw: string | undefined =
    data?.author_id ?? data?.id ?? data?.sub ?? data?.author ?? data?.personUrn;
  if (!raw) throw new Error('No se pudo leer tu identidad de LinkedIn. Vuelve a conectarlo.');
  return raw.startsWith('urn:li:person:') ? raw : `urn:li:person:${raw}`;
}

// ---------------------------------------------------------------------------
// X (Twitter)
// ---------------------------------------------------------------------------

export const twitter: ChannelAdapter = {
  toolkit: 'twitter',
  verify: (project) => verifyChannel(project, 'twitter'),

  async publish(project: Project, input: PublishInput): Promise<PublishResult> {
    const data: any = cuerpo(
      await run(project, 'twitter', 'TWITTER_CREATION_OF_A_POST', { text: input.texto }),
    );
    const id = data?.id ?? data?.data?.id ?? null;
    return { toolkit: 'twitter', id, url: id ? `https://x.com/i/status/${id}` : null };
  },
};

// ---------------------------------------------------------------------------
// TikTok
// ---------------------------------------------------------------------------

export const tiktok: ChannelAdapter = {
  toolkit: 'tiktok',
  verify: (project) => verifyChannel(project, 'tiktok'),

  /**
   * TikTok publica en dos tiempos: se sube el video (que devuelve un
   * `publish_id`) y después se publica ese id. `target` es el `publish_id` de
   * una subida previa.
   */
  async publish(project: Project, input: PublishInput): Promise<PublishResult> {
    const publishId =
      input.target ??
      cuerpo<any>(await run<any>(project, 'tiktok', 'TIKTOK_UPLOAD_VIDEO', { video_url: input.media }))
        ?.publish_id;
    if (!publishId) throw new Error('TikTok no aceptó el video.');
    const data: any = cuerpo(await run(project, 'tiktok', 'TIKTOK_PUBLISH_VIDEO', {
      publish_id: String(publishId),
      caption: input.texto,
    }));
    const id = data?.publish_id ?? String(publishId);
    return { toolkit: 'tiktok', id, url: null };
  },
};

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

export const youtube: ChannelAdapter = {
  toolkit: 'youtube',
  verify: (project) => verifyChannel(project, 'youtube'),

  async publish(project: Project, input: PublishInput): Promise<PublishResult> {
    if (!input.media) throw new Error('YouTube necesita el archivo del video.');
    const data: any = cuerpo(await run(project, 'youtube', 'YOUTUBE_UPLOAD_VIDEO', {
      title: input.texto.slice(0, 95),
      description: input.texto,
      tags: [],
      categoryId: '22',
      privacyStatus: 'public',
      videoFilePath: input.media,
    }));
    const id = data?.id ?? data?.videoId ?? null;
    return { toolkit: 'youtube', id, url: id ? `https://youtu.be/${id}` : null };
  },

  /** Los videos del canal, para ver qué se publicó y cómo le fue. */
  async readCampaigns(project: Project, input: Record<string, unknown> = {}) {
    const channelId = String(input.channelId ?? '');
    if (!channelId) throw new Error('Falta el canal de YouTube.');
    return run(project, 'youtube', 'YOUTUBE_LIST_CHANNEL_VIDEOS', {
      channelId,
      maxResults: Number(input.maxResults ?? 10),
    });
  },
};
