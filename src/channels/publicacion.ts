/**
 * Adaptadores de PUBLICACIÓN: Facebook, Instagram, LinkedIn, X, TikTok y
 * YouTube. Uno por toolkit, cada uno con `verify` y sus acciones reales.
 *
 * Todos los slugs de tools están tomados del catálogo REAL de Composio
 * (`GET /api/v3/tools?toolkit_slug=…`, 16-sep-2026), no de memoria. Los
 * argumentos también: `required` e `input_parameters` de cada tool.
 */
import type { Project } from '../db/schema';
import { assertPublicMediaUrl } from './media-url';
import { TWITTER_TOOL_VERSION, twitterPostArguments } from './twitter-contract';
import {
  cuerpo,
  proxy,
  proxyConEncabezados,
  run,
  runWithFiles,
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

  /**
   * Publica en la página del proyecto, CON TOKEN DE PÁGINA.
   *
   * Esto era `FACEBOOK_CREATE_POST` a secas y no funcionaba: Composio firma esa
   * tool con el token de USUARIO y `/{page}/feed` exige el de PÁGINA. Medido el
   * 16-sep con la cuenta real: `403 (#200) OAuthException`, con
   * `pages_manage_posts` concedido. Todo el arreglo vive en `./facebook.ts`.
   */
  async publish(project: Project, input: PublishInput): Promise<PublishResult> {
    const { publicarEnPagina } = await import('./facebook');
    const r = await publicarEnPagina(project, {
      texto: input.texto,
      media: input.media ?? null,
      link: input.link ?? null,
    });
    return { toolkit: 'facebook', id: r.id, url: r.url };
  },

  /** Las páginas que administra la cuenta conectada. */
  async readCampaigns(project: Project) {
    return run(project, 'facebook', 'FACEBOOK_GET_USER_PAGES', {
      fields: 'id,name,category,tasks',
    });
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
   * Publicar en Instagram son TRES tiempos, no dos: contenedor, **esperar a que
   * Meta diga FINISHED** y publicar.
   *
   * La QA se quedó en el primero y por eso el post nunca existió. El paso que
   * faltaba, el carrusel y el reel viven en `./instagram.ts`.
   */
  async publish(project: Project, input: PublishInput): Promise<PublishResult> {
    if (!input.media) {
      throw new Error('Instagram necesita una imagen o un video para publicar.');
    }
    const { publicarEnInstagram } = await import('./instagram');
    const r = await publicarEnInstagram(project, { texto: input.texto, media: input.media });
    return { toolkit: 'instagram', id: r.id, url: r.url };
  },
};

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

    /**
     * La imagen NO viaja. LinkedIn exige subir el binario con `PUT` a una URL
     * temporal firmada con el token del usuario, y Composio (auth administrada)
     * no expone ese token ni deja pasar cuerpos binarios por su proxy. Hasta
     * tener app propia de LinkedIn, aquí sale solo el texto — y se dice, en vez
     * de dar la pieza por publicada.
     */
    const mediaPublicada = !input.media;

    return {
      toolkit: 'linkedin',
      id,
      url: id ? `https://www.linkedin.com/feed/update/${id}/` : null,
      mediaPublicada,
      advertencia: mediaPublicada
        ? null
        : 'LinkedIn recibió solo el texto: la imagen no se puede subir por Composio. La pieza sigue aprobada, no publicada.',
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
    const mediaIds: string[] = [];
    if (input.media) {
      assertPublicMediaUrl(input.media);
      const subida: any = cuerpo(
        await runWithFiles(
          project,
          'twitter',
          'TWITTER_UPLOAD_MEDIA',
          { media: input.media, media_category: 'tweet_image' },
          TWITTER_TOOL_VERSION,
        ),
      );
      const mediaId =
        subida?.media_id_string ??
        subida?.media_id ??
        subida?.data?.media_id_string ??
        subida?.data?.media_id ??
        subida?.id;
      if (!mediaId) throw new Error('X recibió la imagen, pero no devolvió su identificador.');
      mediaIds.push(String(mediaId));
    }

    const data: any = cuerpo(
      await run(
        project,
        'twitter',
        'TWITTER_CREATION_OF_A_POST',
        twitterPostArguments(input.texto, mediaIds),
        TWITTER_TOOL_VERSION,
      ),
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

  /**
   * Los videos del canal, para ver qué se publicó y cómo le fue.
   *
   * `channelId` ya NO es obligatorio: si no viene, se descubre. La QA del
   * 16-sep midió que este adaptador existía y **nadie lo llamaba**, y que
   * además pedía un `channelId` que Goossip no guardaba en ningún lado — hubo
   * que sacarlo a mano con `/youtube/v3/channels?mine=true`. Un adaptador que
   * exige un dato que la app no tiene es un adaptador apagado.
   */
  async readCampaigns(project: Project, input: Record<string, unknown> = {}) {
    const channelId = String(input.channelId ?? '') || (await canalDeYoutube(project))?.id || '';
    if (!channelId) {
      throw new Error('No encontramos tu canal de YouTube. Vuelve a conectarlo en Conexiones.');
    }
    return run(project, 'youtube', 'YOUTUBE_LIST_CHANNEL_VIDEOS', {
      channelId,
      maxResults: Number(input.maxResults ?? 10),
    });
  },
};

/**
 * El canal de YouTube del proyecto, descubierto y guardado.
 *
 * `mine=true` es la única forma de saber cuál es el canal de quien autorizó: el
 * toolkit de Composio no trae tool para esto (medido). Se guarda en la fila de
 * la conexión para no volver a preguntar en cada carga de pantalla.
 */
export async function canalDeYoutube(
  project: Project,
): Promise<{ id: string; nombre: string; suscriptores: number | null; videos: number | null } | null> {
  const { and, eq } = await import('drizzle-orm');
  const { db } = await import('../db/client');
  const { socialAccounts } = await import('../db/schema');

  const filas = await db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.orgId, project.orgId),
        eq(socialAccounts.campaignId, project.id),
        eq(socialAccounts.platform, 'youtube'),
      ),
    )
    .limit(1);
  const fila = filas[0] ?? null;
  const meta = (fila?.metadata ?? {}) as { channel_id?: string; channel_title?: string };

  if (meta.channel_id) {
    return {
      id: String(meta.channel_id),
      nombre: String(meta.channel_title ?? meta.channel_id),
      suscriptores: null,
      videos: null,
    };
  }

  const data = await proxy(project, 'youtube', {
    endpoint: 'https://www.googleapis.com/youtube/v3/channels',
    method: 'GET',
    parameters: [
      { name: 'part', value: 'id,snippet,statistics', type: 'query' },
      { name: 'mine', value: 'true', type: 'query' },
    ],
  }).catch(() => null);

  const canal = (data?.items ?? [])[0];
  if (!canal?.id) return null;

  const out = {
    id: String(canal.id),
    nombre: canal.snippet?.title ?? String(canal.id),
    suscriptores: canal.statistics?.subscriberCount ? Number(canal.statistics.subscriberCount) : null,
    videos: canal.statistics?.videoCount ? Number(canal.statistics.videoCount) : null,
  };

  if (fila) {
    await db
      .update(socialAccounts)
      .set({
        externalId: out.id,
        metadata: { ...(fila.metadata ?? {}), channel_id: out.id, channel_title: out.nombre },
        updatedAt: new Date(),
      })
      .where(eq(socialAccounts.id, fila.id))
      .catch(() => undefined);
  }
  return out;
}

/** Los videos del canal, ya aplanados, con sus números. */
export async function videosDeYoutube(
  project: Project,
  limite = 10,
): Promise<{
  canal: { id: string; nombre: string } | null;
  videos: Array<{
    id: string;
    titulo: string;
    url: string;
    publicado: string | null;
    vistas: number | null;
    likes: number | null;
    comentarios: number | null;
  }>;
}> {
  const canal = await canalDeYoutube(project);
  if (!canal) return { canal: null, videos: [] };

  const data: any = cuerpo(
    await run(project, 'youtube', 'YOUTUBE_LIST_CHANNEL_VIDEOS', {
      channelId: canal.id,
      maxResults: limite,
    }),
  );
  const items = data?.items ?? data?.videos ?? [];
  const ids = items
    .map((v: any) => String(v?.id?.videoId ?? v?.id ?? v?.videoId ?? ''))
    .filter(Boolean);

  // Las estadísticas van en otra llamada: `search.list` no las trae. Sin esto,
  // "métricas en Contenido" serían tres columnas vacías.
  const stats = new Map<string, any>();
  if (ids.length) {
    const s = await proxy(project, 'youtube', {
      endpoint: 'https://www.googleapis.com/youtube/v3/videos',
      method: 'GET',
      parameters: [
        { name: 'part', value: 'statistics,snippet', type: 'query' },
        { name: 'id', value: ids.join(','), type: 'query' },
      ],
    }).catch(() => null);
    for (const v of s?.items ?? []) stats.set(String(v.id), v);
  }

  return {
    canal: { id: canal.id, nombre: canal.nombre },
    videos: items.map((v: any) => {
      const id = String(v?.id?.videoId ?? v?.id ?? v?.videoId ?? '');
      const detalle = stats.get(id);
      const snippet = detalle?.snippet ?? v?.snippet ?? {};
      const st = detalle?.statistics ?? {};
      return {
        id,
        titulo: snippet.title ?? '(sin título)',
        url: `https://youtu.be/${id}`,
        publicado: snippet.publishedAt ?? null,
        vistas: st.viewCount !== undefined ? Number(st.viewCount) : null,
        likes: st.likeCount !== undefined ? Number(st.likeCount) : null,
        comentarios: st.commentCount !== undefined ? Number(st.commentCount) : null,
      };
    }),
  };
}
