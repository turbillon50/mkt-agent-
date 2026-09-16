/**
 * La corrida automática: publicar sin que nadie esté mirando.
 *
 * CAMBIO DE FONDO DE LA CORRIDA 6. Hasta la 5 esto recorría
 * `enabledPosters()` —las cuentas de la casa, con tokens del entorno— y
 * publicaba con ellas. Con un solo cliente daba igual; con tres, el cron de las
 * 9 de la mañana publicaba el contenido de todos en la página de Goossip.
 *
 * Ahora recorre PROYECTOS. Para cada proyecto, para cada canal de publicación
 * que ESE proyecto tiene conectado de verdad, escribe con su voz de marca y
 * publica con SU cuenta. Un proyecto sin canales conectados no publica nada y
 * se dice por qué, en vez de caerse en la cuenta de la casa.
 *
 * Y una regla que no estaba: si el canal es Instagram y no hay pieza aprobada,
 * NO se publica. Instagram no admite publicaciones sin imagen, así que
 * intentarlo es garantizar un error en el log a las 9 de la mañana.
 */
import { and, eq, isNull, or } from 'drizzle-orm';
import { db } from './db/client';
import { campaigns, posts, type Project } from './db/schema';
import { generatePost } from './generator';
import { CANALES_DE_PUBLICACION, publishTo } from './channels/index';
import { activeAccountFor } from './projects/composio-connections';
import { getBrandKit } from './creative/brand-kit';
import { marcarPublicada, piezaAprobadaDe } from './creative/repo';
import { buildPlan, nextUnusedItem, markUsed } from './planner';
import { remember } from './memory/index';
import { config, type Platform } from './config';
import { esRed, type RedSlug } from './creative/specs';

function temaDeRespaldo(): string {
  const t = config.brand.topics;
  return t[Math.floor(Math.random() * t.length)] ?? 'marketing';
}

export interface RunResult {
  projectId: string;
  projectName: string;
  /** El canal, con el slug del catálogo: facebook, instagram, linkedin… */
  channel: string;
  text: string;
  posted: { id?: string | null; url?: string | null; dryRun?: boolean };
}

export interface RunSkip {
  projectId: string;
  projectName: string;
  motivo: string;
}

export interface RunReport {
  publicados: RunResult[];
  saltados: RunSkip[];
}

/** La red del catálogo → la plataforma que entiende el generador de texto. */
function plataformaDeTexto(canal: string): Platform {
  switch (canal) {
    case 'linkedin':
      return 'linkedin';
    case 'instagram':
      return 'instagram';
    case 'twitter':
      return 'twitter';
    default:
      return 'meta';
  }
}

/** Todos los proyectos activos, de todas las organizaciones. */
async function proyectosActivos(): Promise<Project[]> {
  return db
    .select()
    .from(campaigns)
    .where(or(eq(campaigns.status, 'active'), isNull(campaigns.status)));
}

/** Los canales de publicación que ESTE proyecto tiene vivos ahora mismo. */
async function canalesVivos(project: Project): Promise<string[]> {
  const vivos: string[] = [];
  for (const canal of CANALES_DE_PUBLICACION) {
    const cuenta = await activeAccountFor(project, canal).catch(() => null);
    if (cuenta) vivos.push(canal);
  }
  return vivos;
}

export async function runOnce(
  opts: { dryRun?: boolean; projectId?: string } = {},
): Promise<RunReport> {
  const todos = await proyectosActivos();
  const proyectos = opts.projectId ? todos.filter((p) => p.id === opts.projectId) : todos;

  const publicados: RunResult[] = [];
  const saltados: RunSkip[] = [];

  for (const project of proyectos) {
    const canales = await canalesVivos(project);
    if (canales.length === 0) {
      saltados.push({
        projectId: project.id,
        projectName: project.name,
        motivo: 'no tiene ningún canal conectado',
      });
      continue;
    }

    const kit = await getBrandKit(project.orgId, project.id).catch(() => null);

    for (const canal of canales) {
      const plataforma = plataformaDeTexto(canal);
      const planeado = await nextUnusedItem(plataforma).catch(() => null);
      const tema = planeado?.topic ?? temaDeRespaldo();
      const angulo = planeado?.angle ?? null;

      const texto = await generatePost({
        platform: plataforma,
        topic: tema,
        angle: angulo ?? undefined,
      });

      // La pieza aprobada para esa red, si la hay.
      const red: RedSlug | null = esRed(canal) ? canal : null;
      const pieza = red ? await piezaAprobadaDe(project.orgId, project.id, red).catch(() => null) : null;

      if (canal === 'instagram' && !pieza?.url) {
        saltados.push({
          projectId: project.id,
          projectName: project.name,
          motivo: 'Instagram necesita imagen y no hay ninguna pieza aprobada',
        });
        continue;
      }

      if (opts.dryRun) {
        publicados.push({
          projectId: project.id,
          projectName: project.name,
          channel: canal,
          text: texto,
          posted: { dryRun: true },
        });
        continue;
      }

      try {
        const out = await publishTo(project, canal, { texto, media: pieza?.url ?? null });

        const [fila] = await db
          .insert(posts)
          .values({
            orgId: project.orgId,
            projectId: project.id,
            platform: canal,
            text: texto,
            topic: tema,
            angle: angulo,
            externalId: out.id,
            externalUrl: out.url,
            publishedAt: new Date(),
            metadata: { automatico: true, piezaId: pieza?.id ?? null, kit: Boolean(kit) },
          })
          .returning({ id: posts.id });

        if (fila && pieza) await marcarPublicada(pieza.id, fila.id);

        if (fila) {
          await remember({
            refType: 'post',
            refId: fila.id,
            content: `${tema} | ${texto}`,
            metadata: { canal, projectId: project.id, tema },
          }).catch(() => undefined);
        }

        if (planeado?.id) await markUsed(planeado.id);

        publicados.push({
          projectId: project.id,
          projectName: project.name,
          channel: canal,
          text: texto,
          posted: { id: out.id, url: out.url },
        });
      } catch (e) {
        // Que un canal falle no puede tumbar la corrida de los demás
        // proyectos. Se anota el motivo y se sigue.
        saltados.push({
          projectId: project.id,
          projectName: project.name,
          motivo: `${canal}: ${e instanceof Error ? e.message : 'no se pudo publicar'}`,
        });
      }
    }
  }

  return { publicados, saltados };
}

/**
 * Que haya plan para la semana. El plan sigue siendo por plataforma de texto y
 * no por proyecto: es el temario, no la cuenta con la que se publica.
 */
export async function ensurePlan(): Promise<void> {
  const plataformas: Platform[] = ['linkedin', 'twitter', 'meta', 'instagram'];
  for (const p of plataformas) {
    if (await nextUnusedItem(p)) return;
  }
  await buildPlan();
}
