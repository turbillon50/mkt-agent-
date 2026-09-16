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
 *
 * CORRIDA 7: y ni siquiera eso pasa sin permiso. Publicar solo es el nivel 2 de
 * autonomía, y además la red tiene que estar en `rules.auto_publish`. Un cron
 * que publica en la cuenta de un cliente que nunca dijo que sí es el mismo bug
 * de la corrida 6 con otro disfraz.
 */
import { and, eq, isNull, or } from 'drizzle-orm';
import { db } from './db/client';
import { campaigns, posts, type Project } from './db/schema';
import { generatePost } from './generator';
import { CANALES_DE_PUBLICACION, publishTo } from './channels/index';
import { activeAccountFor } from './projects/composio-connections';
import { autoPublicaEn, puedeSolo } from './autonomia/niveles';
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
      /**
       * La compuerta de autonomía (corrida 7).
       *
       * Hasta aquí, el cron generaba un texto y lo PUBLICABA en cada canal vivo
       * de cada proyecto activo. Eso es comportamiento de nivel 2 pasando en
       * proyectos que están en nivel 1 — es decir, publicar en la cuenta de un
       * cliente sin que nadie haya aprobado ni el texto ni la decisión de
       * publicar solo.
       *
       * Ahora hacen falta las dos cosas: que el proyecto esté en nivel 2 o más
       * Y que esa red esté en `rules.auto_publish`. Sin las dos, se salta y se
       * dice por qué — no se publica "por si acaso".
       */
      if (!autoPublicaEn(project, canal)) {
        saltados.push({
          projectId: project.id,
          projectName: project.name,
          motivo: `${canal}: ${puedeSolo(project, 'publicar_organico').puede ? 'no está en auto_publish' : puedeSolo(project, 'publicar_organico').motivo}`,
        });
        continue;
      }

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
 * Las piezas PROGRAMADAS que ya les tocaba salir.
 *
 * Es otra corrida y no parte de `runOnce` a propósito: esto NO genera nada ni
 * decide nada. Publica lo que una persona ya aprobó y ya le puso fecha, que es
 * el único caso en el que publicar sin preguntar no necesita ningún nivel de
 * autonomía — el permiso ya se dio, con nombre y hora, cuando se programó.
 */
export async function publicarProgramadas(
  opts: { dryRun?: boolean; ahora?: Date } = {},
): Promise<RunReport> {
  const { programadasVencidas } = await import('./creative/repo');
  const publicados: RunResult[] = [];
  const saltados: RunSkip[] = [];

  const piezas = await programadasVencidas(opts.ahora ?? new Date());
  if (piezas.length === 0) return { publicados, saltados };

  const porProyecto = new Map<string, Project>();
  for (const pieza of piezas) {
    let project = porProyecto.get(pieza.projectId) ?? null;
    if (!project) {
      const [fila] = await db.select().from(campaigns).where(eq(campaigns.id, pieza.projectId)).limit(1);
      if (!fila) continue;
      project = fila;
      porProyecto.set(pieza.projectId, fila);
    }

    if (opts.dryRun) {
      publicados.push({
        projectId: project.id,
        projectName: project.name,
        channel: pieza.red,
        text: pieza.brief,
        posted: { dryRun: true },
      });
      continue;
    }

    try {
      const out = await publishTo(project, pieza.red, {
        texto: pieza.brief,
        media: pieza.url ?? null,
      });
      const [fila] = await db
        .insert(posts)
        .values({
          orgId: project.orgId,
          projectId: project.id,
          platform: pieza.red,
          text: pieza.brief,
          externalId: out.id,
          externalUrl: out.url,
          publishedAt: new Date(),
          metadata: { programada: true, piezaId: pieza.id },
        })
        .returning({ id: posts.id });
      await marcarPublicada(pieza.id, fila?.id ?? null);
      publicados.push({
        projectId: project.id,
        projectName: project.name,
        channel: pieza.red,
        text: pieza.brief,
        posted: { id: out.id, url: out.url },
      });
    } catch (e) {
      saltados.push({
        projectId: project.id,
        projectName: project.name,
        motivo: `${pieza.red}: ${e instanceof Error ? e.message : 'no se pudo publicar la pieza programada'}`,
      });
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
