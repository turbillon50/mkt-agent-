/**
 * La verdad del negocio que entra a cada pieza.
 *
 * Antes el motor conocía el nombre, la paleta y el brief. Eso permitió que un
 * brief de prueba ("departamento modelo en Polanco") dominara por completo a
 * un proyecto cuyo sitio dice que es un market de proyectos, talento y
 * capital. Aquí juntamos, una sola vez por lote, las fuentes DEL PROYECTO:
 * ficha, sitio oficial, documentos importados y correcciones humanas.
 */
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { knowledge, type Project, type ProjectBrandKit } from '../db/schema';
import { leccionesComoTexto, leccionesParecidas } from '../autonomia/lecciones';
import { leerWebPublica } from '../competencia/lectura';
import { assertPublicMediaUrl } from '../channels/media-url';

export interface ContextoCreativo {
  texto: string;
  fuentes: string[];
}

function limpio(valor: string | null | undefined, max = 900): string | null {
  const texto = valor?.replace(/\s+/g, ' ').trim();
  return texto ? texto.slice(0, max) : null;
}

/** Parte determinista, exportada para probar que el giro nunca se pierda. */
export function fichaCreativa(project: Project, kit: ProjectBrandKit | null): string {
  const lineas = [
    `Nombre: ${project.name}.`,
    project.kind ? `Tipo de negocio: ${project.kind}.` : null,
    limpio(project.description) ? `Qué hace: ${limpio(project.description)}.` : null,
    limpio(project.audience) ? `Audiencia: ${limpio(project.audience)}.` : null,
    limpio(project.brandTopics) ? `Temas propios: ${limpio(project.brandTopics)}.` : null,
    limpio(project.brandVoice) ? `Voz: ${limpio(project.brandVoice)}.` : null,
    limpio(project.manifesto) ? `Principio de marca: ${limpio(project.manifesto)}.` : null,
    project.city || project.country
      ? `Mercado: ${[project.city, project.country].filter(Boolean).join(', ')}.`
      : null,
    project.website ? `Sitio oficial: ${project.website}.` : null,
    limpio(kit?.tono) ? `Dirección verbal y visual aprobada: ${limpio(kit?.tono)}.` : null,
  ].filter(Boolean);
  return lineas.join('\n');
}

function tokens(texto: string): string[] {
  return [...new Set(
    texto
      .toLocaleLowerCase('es-MX')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 4),
  )].slice(0, 18);
}

function relevancia(contenido: string, consulta: string): number {
  const base = contenido.toLocaleLowerCase('es-MX').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return tokens(consulta).reduce((total, token) => total + (base.includes(token) ? 1 : 0), 0);
}

async function documentosDelProyecto(project: Project, brief: string): Promise<string[]> {
  const filas = await db
    .select({ title: knowledge.title, content: knowledge.content, source: knowledge.source })
    .from(knowledge)
    .where(and(eq(knowledge.orgId, project.orgId), eq(knowledge.campaignId, project.id)))
    .orderBy(desc(knowledge.createdAt))
    .limit(24)
    .catch(() => []);

  return filas
    .map((fila, posicion) => ({
      fila,
      posicion,
      score: relevancia(`${fila.title ?? ''} ${fila.content}`, brief),
    }))
    .sort((a, b) => b.score - a.score || a.posicion - b.posicion)
    .slice(0, 5)
    .map(({ fila }) =>
      [fila.title ? `${fila.title}:` : null, limpio(fila.content, 1200), fila.source ? `(fuente ${fila.source})` : null]
        .filter(Boolean)
        .join(' '),
    );
}

async function sitioOficial(project: Project): Promise<{ texto: string; fuente: string } | null> {
  if (!project.website) return null;
  try {
    assertPublicMediaUrl(project.website);
    const lectura = await leerWebPublica(project.website, 8_000);
    if (lectura.error || (!lectura.titulo && !lectura.descripcion)) return null;
    return {
      texto: [
        lectura.titulo ? `Título declarado: ${limpio(lectura.titulo, 300)}.` : null,
        lectura.descripcion ? `Descripción declarada: ${limpio(lectura.descripcion, 700)}.` : null,
      ].filter(Boolean).join(' '),
      fuente: lectura.url,
    };
  } catch {
    return null;
  }
}

/** Contexto acotado y con procedencia, compartido por copy, arte y QA. */
export async function contextoCreativoDelProyecto(input: {
  project: Project;
  kit: ProjectBrandKit | null;
  brief: string;
}): Promise<ContextoCreativo> {
  const [sitio, documentos, lecciones] = await Promise.all([
    sitioOficial(input.project),
    documentosDelProyecto(input.project, input.brief),
    leccionesParecidas(input.project.id, input.brief, 5).catch(() => []),
  ]);

  const bloques = [
    'VERDAD DEL PROYECTO — manda sobre clichés o inferencias del modelo:',
    fichaCreativa(input.project, input.kit),
    sitio?.texto ? `SITIO OFICIAL: ${sitio.texto}` : null,
    documentos.length ? `CONOCIMIENTO DEL PROYECTO:\n${documentos.map((d) => `· ${d}`).join('\n')}` : null,
    lecciones.length ? leccionesComoTexto(lecciones) : null,
    'Si el encargo contradice esta verdad o no trae evidencia suficiente, no inventes otro giro, producto, inmueble, persona, cifra ni interfaz.',
  ].filter(Boolean);

  return {
    texto: bloques.join('\n').slice(0, 7_500),
    fuentes: [input.project.website, sitio?.fuente]
      .filter((v): v is string => Boolean(v))
      .filter((v, i, all) => all.indexOf(v) === i),
  };
}
