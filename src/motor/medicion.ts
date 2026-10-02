/**
 * Medición y aprendizaje: qué pasó con cada hipótesis, y qué se aprende de eso.
 *
 * Es la mitad que casi nadie construye. Publicar es fácil; volver a mirar lo que
 * se publicó, compararlo con lo que se esperaba y guardar la lección es lo que
 * separa un sistema que aprende de uno que acumula historial.
 *
 * Tres reglas:
 *
 *   1. **El resultado lo escribe la medición, nunca el modelo**, y trae su fuente.
 *      Un CHECK de la base no deja guardar un veredicto resuelto sin el número que
 *      lo resolvió.
 *   2. **Lo que una red no da, se dice.** LinkedIn hoy publica pero no devuelve
 *      métricas; la pantalla dice "no disponible" y qué permiso haría falta, en
 *      vez de enseñar un cero que se lee como un fracaso.
 *   3. **La lección se guarda solo cuando hay con qué.** Una hipótesis sin datos
 *      termina en `sin_datos`, que es un final legítimo, y no genera lección: un
 *      sistema que aprende de la nada aprende basura.
 */
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  lessons,
  postHypotheses,
  posts,
  salesLeads,
  type Audience,
  type ChannelPlan,
  type PostHypothesis,
  type Project,
  type VeredictoHipotesis,
} from '../db/schema';
import { RED_LABEL, type RedSlug } from '../creative/specs';
import { OBJETIVO_LABEL } from './plan';
import { formatearNumero, fecha, type Afirmacion } from './procedencia';

/* ---------------------------------------------------------------------------
   Qué puede medir cada red, HOY. Esto es verdad de código, no una promesa.

   La tabla está aquí y no repartida por el código porque es lo que la pantalla
   enseña cuando alguien pregunta "¿y esto por qué no tiene números?". Un "no
   disponible" sin explicación se lee como una falla del producto; con el permiso
   exacto al lado, se lee como lo que es: un trámite pendiente.
--------------------------------------------------------------------------- */
export type EstadoMetrica = 'disponible' | 'sin_permiso' | 'no_lo_da_la_red';

export interface CapacidadMetrica {
  red: string;
  estado: EstadoMetrica;
  /** En español y sin jerga: va directo a la pantalla. */
  leyenda: string;
  /** El paso EXACTO que destraba la medición. Nada de "revisa la configuración". */
  queFalta: string | null;
}

export const CAPACIDAD_METRICA: Record<string, CapacidadMetrica> = {
  facebook: {
    red: 'facebook',
    estado: 'disponible',
    leyenda: 'Se leen las métricas de la página y de cada publicación con la conexión que ya existe.',
    queFalta: null,
  },
  instagram: {
    red: 'instagram',
    estado: 'disponible',
    leyenda: 'Se leen las métricas de cada medio publicado con la conexión que ya existe.',
    queFalta: null,
  },
  twitter: {
    red: 'twitter',
    estado: 'disponible',
    leyenda: 'Se leen las métricas públicas de cada publicación con la API que ya está conectada.',
    queFalta: null,
  },
  linkedin: {
    red: 'linkedin',
    estado: 'no_lo_da_la_red',
    // Lo que pide la corrida, textual: que la pantalla lo diga claro.
    leyenda:
      'No disponible. La conexión de LinkedIn que tiene Goossip sirve para PUBLICAR, pero no ' +
      'devuelve métricas de lo publicado. No es que salgan en cero: es que no se pueden leer.',
    queFalta:
      'El permiso r_organization_social de LinkedIn, que exige una Community Management API ' +
      'aprobada por LinkedIn para la página de la empresa. Es trámite, no código.',
  },
  tiktok: {
    red: 'tiktok',
    estado: 'sin_permiso',
    leyenda: 'No disponible todavía: falta conectar la cuenta de TikTok para Empresas.',
    queFalta: 'Conectar TikTok en Conexiones con una cuenta de empresa (las personales no dan métricas).',
  },
  youtube: {
    red: 'youtube',
    estado: 'sin_permiso',
    leyenda: 'No disponible todavía: falta conectar el canal de YouTube.',
    queFalta: 'Conectar YouTube en Conexiones con el canal de la marca.',
  },
  metaads: {
    red: 'metaads',
    estado: 'sin_permiso',
    leyenda:
      'No disponible. La cuenta publicitaria contesta que el usuario de sistema de Goossip no ' +
      'tiene permiso de lectura sobre ella, así que no se pueden leer los resultados de los anuncios.',
    queFalta:
      'En el Administrador Comercial de Meta: Configuración → Cuentas publicitarias → la cuenta → ' +
      'Asignar activos → el usuario de sistema de Goossip → activar "Ver rendimiento" (ads_read).',
  },
};

export function capacidadDe(red: string): CapacidadMetrica {
  return (
    CAPACIDAD_METRICA[red] ?? {
      red,
      estado: 'no_lo_da_la_red',
      leyenda: `No sabemos leer métricas de ${red} todavía.`,
      queFalta: `Agregar ${red} a CAPACIDAD_METRICA en src/motor/medicion.ts y conectar su lectura.`,
    }
  );
}

/* ---------------------------------------------------------------------------
   Resolver una hipótesis.
--------------------------------------------------------------------------- */

export interface ResultadoMedido {
  valor: number;
  /** De dónde salió. Sin esto la base rechaza el renglón. */
  fuente: string;
  metodo: string;
  medidoEn?: Date;
}

/**
 * Compara lo que se esperaba con lo que pasó y deja el veredicto.
 *
 * El veredicto es de CÓDIGO: `resultado >= meta`. Se resiste la tentación de
 * dejar que el modelo "interprete" si se cumplió — un modelo al que le preguntas
 * si su apuesta salió bien encuentra la manera de decir que sí.
 *
 * Sin meta no hay veredicto posible: se guarda el número y queda `sin_datos`,
 * porque "salió 340" no es ni éxito ni fracaso si nadie dijo qué esperaba.
 */
export async function resolverHipotesis(
  h: PostHypothesis,
  r: ResultadoMedido | null,
  opts: { porque?: string } = {},
): Promise<PostHypothesis | null> {
  const ahora = new Date();

  if (!r) {
    const cap = capacidadDe(h.red);
    const [out] = await db
      .update(postHypotheses)
      .set({
        veredicto: 'sin_datos',
        veredictoPorque: cap.estado === 'disponible'
          ? 'La red sí da métricas, pero esta publicación todavía no devolvió ninguna.'
          : cap.leyenda,
        updatedAt: ahora,
      })
      .where(eq(postHypotheses.id, h.id))
      .returning();
    return out ?? null;
  }

  const meta = h.metaValor != null ? Number(h.metaValor) : null;
  let veredicto: VeredictoHipotesis;
  let porque: string;

  if (meta == null) {
    veredicto = 'sin_datos';
    porque = `Se midió ${formatearNumero(r.valor)} ${h.metaUnidad ?? ''}`.trim() +
      ', pero la hipótesis nació sin una meta, así que no hay contra qué compararlo.';
  } else if (r.valor >= meta) {
    veredicto = 'se_cumplio';
    porque = `Se esperaban ${formatearNumero(meta)} y salieron ${formatearNumero(r.valor)}.`;
  } else {
    veredicto = 'no_se_cumplio';
    porque = `Se esperaban ${formatearNumero(meta)} y salieron ${formatearNumero(r.valor)}: ` +
      `faltaron ${formatearNumero(meta - r.valor)}.`;
  }

  const [out] = await db
    .update(postHypotheses)
    .set({
      resultadoValor: String(r.valor),
      resultadoEn: r.medidoEn ?? ahora,
      resultadoFuente: r.fuente,
      resultadoMetodo: r.metodo,
      veredicto,
      veredictoPorque: opts.porque ? `${porque} ${opts.porque}` : porque,
      updatedAt: ahora,
    })
    .where(eq(postHypotheses.id, h.id))
    .returning();

  return out ?? null;
}

/**
 * Guarda la lección de una hipótesis que ya se resolvió.
 *
 * Solo de las que tienen número. `lessons` ya existía para las correcciones
 * humanas y se reusa: `refType='hipotesis'` la ata a su origen. Partir la memoria
 * del proyecto en dos tablas sería perder la mitad al preguntar.
 *
 * Y se guarda tanto lo que salió bien como lo que salió mal, a propósito: un
 * sistema que solo apunta sus aciertos aprende a felicitarse.
 */
export async function guardarLeccion(
  project: Project,
  h: PostHypothesis,
  publico: Audience | undefined,
): Promise<string | null> {
  if (h.veredicto !== 'se_cumplio' && h.veredicto !== 'no_se_cumplio') return null;
  if (h.leccionId) return h.leccionId;

  const red = RED_LABEL[h.red as RedSlug] ?? h.red;
  const aQuien = publico ? ` a ${publico.nombre}` : '';
  const leccion = h.veredicto === 'se_cumplio'
    ? `En ${red}${aQuien} funcionó: ${h.hipotesis} ${h.veredictoPorque ?? ''}`.trim()
    : `En ${red}${aQuien} NO funcionó: ${h.hipotesis} ${h.veredictoPorque ?? ''}`.trim();

  const [l] = await db
    .insert(lessons)
    .values({
      orgId: project.orgId,
      projectId: project.id,
      // La hipótesis resuelta es una corrección de la realidad sobre lo que
      // creíamos, así que entra por la misma puerta que las correcciones humanas.
      kind: 'cambios_pedidos',
      queHizo: h.hipotesis,
      queCorrigio: h.veredictoPorque ?? 'se midió el resultado',
      leccion,
      refType: 'hipotesis',
      refId: h.id,
      actor: 'medicion',
    })
    .returning();

  if (l) await db.update(postHypotheses).set({ leccionId: l.id }).where(eq(postHypotheses.id, h.id));
  return l?.id ?? null;
}

/* ---------------------------------------------------------------------------
   El cruce con las ventas: de la publicación al dinero.

   Es la pregunta que de verdad importa y la que casi ningún tablero contesta:
   "de lo que publicamos, ¿qué se volvió una conversación, y cuál de esas se
   volvió una venta?".

   Se cuenta con lo que el CRM ya tiene (`sales_leads`), no con una estimación.
   Y cuando un lead no dice de dónde vino, se cuenta aparte en vez de repartirlo
   entre los canales: repartir a ojo es inventar atribución.
--------------------------------------------------------------------------- */
export interface CruceVentas {
  desde: Date;
  leads: number;
  /** Los que sí dicen de qué canal llegaron. */
  conOrigen: number;
  /** Los que no lo dicen. Se cuentan, no se reparten. */
  sinOrigen: number;
  porFuente: Array<{ fuente: string; leads: number; ganados: number }>;
  ganados: number;
  metodo: string;
}

/** Las etapas que significan "ya es venta". Explícito y discutible. */
const ETAPAS_GANADAS = ['ganado', 'cerrado', 'vendido'];

export async function cruceConVentas(project: Project, desde: Date): Promise<CruceVentas> {
  const filas = await db
    .select({ source: salesLeads.source, stage: salesLeads.stage })
    .from(salesLeads)
    .where(and(eq(salesLeads.campaignId, project.id), gte(salesLeads.createdAt, desde)));

  const porFuente = new Map<string, { leads: number; ganados: number }>();
  let ganados = 0;
  let sinOrigen = 0;

  for (const f of filas) {
    const esGanado = ETAPAS_GANADAS.includes(String(f.stage));
    if (esGanado) ganados++;
    // `manual` significa que alguien lo capturó a mano: no dice de qué canal vino.
    if (!f.source || f.source === 'manual') {
      sinOrigen++;
      continue;
    }
    const a = porFuente.get(f.source) ?? { leads: 0, ganados: 0 };
    a.leads++;
    if (esGanado) a.ganados++;
    porFuente.set(f.source, a);
  }

  return {
    desde,
    leads: filas.length,
    conOrigen: filas.length - sinOrigen,
    sinOrigen,
    ganados,
    porFuente: [...porFuente.entries()]
      .map(([fuente, v]) => ({ fuente, ...v }))
      .sort((a, b) => b.leads - a.leads),
    metodo:
      `conteo de los leads del proyecto en sales_leads creados desde el ${fecha(desde)}; ` +
      `"ganado" son las etapas ${ETAPAS_GANADAS.join('/')}; ` +
      `los leads capturados a mano no dicen de qué canal vinieron y se cuentan aparte, no se reparten`,
  };
}

/* ---------------------------------------------------------------------------
   El reporte semanal, en lenguaje normal.

   "Ganó esto, apagué esto, propongo esto". Sin jerga, sin tablas de métricas que
   nadie lee, y con el veredicto de cada apuesta al lado de la apuesta.
--------------------------------------------------------------------------- */
export interface ReporteSemanal {
  proyecto: string;
  desde: Date;
  hasta: Date;
  gano: string[];
  noGano: string[];
  sinDatos: Array<{ que: string; porque: string; queFalta: string | null }>;
  propongo: string[];
  ventas: CruceVentas;
  lecciones: string[];
  /** Las afirmaciones con número, para que el arnés audite el reporte. */
  afirmaciones: Afirmacion[];
}

export async function reporteSemanal(
  project: Project,
  opts: { desde?: Date; hasta?: Date } = {},
): Promise<ReporteSemanal> {
  const hasta = opts.hasta ?? new Date();
  const desde = opts.desde ?? new Date(hasta.getTime() - 7 * 86_400_000);

  const hs = await db
    .select()
    .from(postHypotheses)
    .where(and(eq(postHypotheses.projectId, project.id), gte(postHypotheses.createdAt, desde)))
    .orderBy(desc(postHypotheses.createdAt));

  const gano: string[] = [];
  const noGano: string[] = [];
  const sinDatos: ReporteSemanal['sinDatos'] = [];
  const propongo: string[] = [];
  const afirmaciones: Afirmacion[] = [];

  for (const h of hs) {
    const red = RED_LABEL[h.red as RedSlug] ?? h.red;
    if (h.veredicto === 'se_cumplio') {
      gano.push(`${red}: ${h.hipotesis} ${h.veredictoPorque ?? ''}`.trim());
      propongo.push(`Repetir lo de ${red}: salió como se esperaba y conviene volver a probarlo antes de darlo por bueno.`);
    } else if (h.veredicto === 'no_se_cumplio') {
      noGano.push(`${red}: ${h.hipotesis} ${h.veredictoPorque ?? ''}`.trim());
      propongo.push(`Cambiar el ángulo en ${red} o mover ese público a otra red: la apuesta no salió.`);
    } else if (h.veredicto === 'sin_datos') {
      const cap = capacidadDe(h.red);
      sinDatos.push({ que: `${red}: ${h.hipotesis}`, porque: h.veredictoPorque ?? cap.leyenda, queFalta: cap.queFalta });
    }
  }

  const ventas = await cruceConVentas(project, desde);

  // Los números del reporte pasan por el arnés, igual que los de la pantalla.
  const fuenteVentas = {
    fuenteTipo: 'medicion_propia' as const,
    fuenteNombre: 'el CRM de Goossip (sales_leads)',
    medidoEn: hasta,
    metodo: ventas.metodo,
  };
  afirmaciones.push({
    etiqueta: 'Leads que llegaron en la semana',
    plantilla: '{cifra}',
    cifra: { ...fuenteVentas, valor: ventas.leads, unidad: 'leads', muestra: ventas.leads || undefined },
  });
  afirmaciones.push({
    etiqueta: 'De esos, los que se volvieron venta',
    plantilla: '{cifra}',
    cifra: { ...fuenteVentas, valor: ventas.ganados, unidad: 'ventas', muestra: ventas.leads || undefined },
  });
  if (ventas.sinOrigen > 0) {
    afirmaciones.push({
      etiqueta: 'Leads que no dicen de qué canal vinieron',
      plantilla: '{cifra}',
      cifra: { ...fuenteVentas, valor: ventas.sinOrigen, unidad: 'leads', muestra: ventas.leads || undefined },
    });
  }

  const ls = await db
    .select({ leccion: lessons.leccion })
    .from(lessons)
    .where(and(eq(lessons.projectId, project.id), gte(lessons.createdAt, desde)))
    .orderBy(desc(lessons.createdAt))
    .limit(20);

  if (!hs.length) {
    propongo.push('No hubo ninguna publicación con hipótesis esta semana. Sin hipótesis no hay nada que aprender: vale la pena arrancar el plan.');
  }

  return {
    proyecto: project.name,
    desde,
    hasta,
    gano,
    noGano,
    sinDatos,
    propongo: [...new Set(propongo)],
    ventas,
    lecciones: ls.map((l) => l.leccion),
    afirmaciones,
  };
}

/** El reporte en palabras, tal como se le manda al dueño. */
export function reporteEnPalabras(r: ReporteSemanal): string {
  const L: string[] = [];
  L.push(`Cómo nos fue del ${fecha(r.desde)} al ${fecha(r.hasta)} — ${r.proyecto}`);
  L.push('');

  L.push('GANÓ ESTO');
  if (!r.gano.length) L.push('  Nada cerró por arriba de lo que se esperaba esta semana.');
  for (const g of r.gano) L.push(`  · ${g}`);

  L.push('');
  L.push('ESTO NO SALIÓ');
  if (!r.noGano.length) L.push('  Nada se quedó por debajo de su meta.');
  for (const n of r.noGano) L.push(`  · ${n}`);

  if (r.sinDatos.length) {
    L.push('');
    L.push('DE ESTO NO PUDE SABER');
    for (const s of r.sinDatos) {
      L.push(`  · ${s.que}`);
      L.push(`    ${s.porque}`);
      if (s.queFalta) L.push(`    Qué haría falta: ${s.queFalta}`);
    }
  }

  L.push('');
  L.push('EL DINERO');
  L.push(`  Llegaron ${formatearNumero(r.ventas.leads)} leads y ${formatearNumero(r.ventas.ganados)} se volvieron venta.`);
  if (r.ventas.sinOrigen) {
    L.push(`  ${formatearNumero(r.ventas.sinOrigen)} no dicen de qué canal vinieron, así que no se le acreditan a nadie.`);
  }
  for (const f of r.ventas.porFuente) {
    L.push(`  · ${f.fuente}: ${formatearNumero(f.leads)} leads, ${formatearNumero(f.ganados)} ventas`);
  }
  L.push(`  Cómo se contó: ${r.ventas.metodo}`);

  L.push('');
  L.push('PROPONGO');
  for (const p of r.propongo) L.push(`  · ${p}`);

  if (r.lecciones.length) {
    L.push('');
    L.push('LO QUE APRENDIMOS');
    for (const l of r.lecciones) L.push(`  · ${l}`);
  }

  return L.join('\n');
}

/** Las hipótesis que siguen esperando resultado, para saber qué falta medir. */
export async function pendientesDeMedir(orgId: string, projectId: string): Promise<PostHypothesis[]> {
  return db
    .select()
    .from(postHypotheses)
    .where(and(
      eq(postHypotheses.orgId, orgId),
      eq(postHypotheses.projectId, projectId),
      eq(postHypotheses.veredicto, 'pendiente'),
    ))
    .orderBy(desc(postHypotheses.createdAt));
}
