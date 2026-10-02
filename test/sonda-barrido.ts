/**
 * Sonda de mano del recorrido. No es la suite: es el "córrelo de verdad contra
 * Google y enséñame los números" de antes de construir la pantalla.
 *
 *   npx tsx test/sonda-barrido.ts
 */
import '../src/env';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../src/db/client';
import {
  campaigns,
  organizations,
  prospectSearches,
  prospects,
  users,
  type Project,
} from '../src/db/schema';
import { barrer } from '../src/prospeccion/barrido';

const SUFIJO = `sonda-${Date.now()}`;
const ORG = `org_${SUFIJO}`;
const creados = { proyectos: [] as string[], usuarios: [] as string[] };

async function main() {
  await db.insert(organizations).values({ id: ORG, name: `Sonda ${SUFIJO}` }).onConflictDoNothing();
  const [u] = await db
    .insert(users)
    .values({ clerkId: `user_${SUFIJO}`, email: `sonda@${SUFIJO}.mx` })
    .returning();
  creados.usuarios.push(u!.id);
  const [p] = await db
    .insert(campaigns)
    .values({
      orgId: ORG,
      userId: u!.id,
      name: 'Sonda',
      slug: `sonda-${SUFIJO}`,
      kind: 'servicios',
      rules: { maps_search_cap: 60 } as never,
    })
    .returning();
  creados.proyectos.push(p!.id);

  const conteo: Record<string, number> = {};
  const negocios: string[] = [];
  let resumen: any = null;
  let inicio: any = null;

  const t0 = Date.now();
  try {
    for await (const e of barrer({
      project: p as Project,
      zona: 'Tulum',
      giros: ['restaurante'],
      filtros: { radioM: 3000, sinSitio: false },
      lado: 3,
      paginas: 1,
      demo: false,
      enriquecer: 3,
    })) {
      conteo[e.tipo] = (conteo[e.tipo] ?? 0) + 1;
      if (e.tipo === 'inicio') inicio = e;
      if (e.tipo === 'negocio') negocios.push(e.prospecto.name);
      if (e.tipo === 'cuadrante') console.log(`  → ${e.texto}`);
      if (e.tipo === 'cuadranteListo') console.log(`    ${e.texto}`);
      if (e.tipo === 'leido') console.log(`    ${e.texto}`);
      if (e.tipo === 'aviso') console.log(`  ! ${e.texto}`);
      if (e.tipo === 'error') console.log(`  ✗ ${e.mensaje}`);
      if (e.tipo === 'resumen') resumen = e;
    }
  } finally {
    const segundos = ((Date.now() - t0) / 1000).toFixed(1);
    console.log('\n--- eventos ---');
    console.log(conteo);
    console.log('cuadrantes:', inicio?.cuadrantes?.length, 'radio:', inicio?.radioM, 'via:', inicio?.via);
    console.log('negocios:', negocios.length, '· repetidos:', negocios.length - new Set(negocios).size);
    console.log('resumen:', resumen?.texto);
    console.log('hallazgos:', resumen?.hallazgos);
    console.log('costo:', resumen?.costo);
    const filas = await db.select().from(prospects).where(eq(prospects.projectId, p!.id));
    console.log('en la base:', filas.length, '· con place_id único:', new Set(filas.map((f) => f.placeId)).size);
    console.log('con sitio:', filas.filter((f) => f.website).length, '· con teléfono:', filas.filter((f) => f.phone).length);
    console.log('con correo leído:', filas.filter((f) => (f.enrichment as any)?.email).length);
    console.log('segundos:', segundos);

    await db.delete(prospects).where(inArray(prospects.projectId, creados.proyectos));
    await db.delete(prospectSearches).where(inArray(prospectSearches.projectId, creados.proyectos));
    await db.delete(campaigns).where(inArray(campaigns.id, creados.proyectos));
    await db.delete(users).where(inArray(users.id, creados.usuarios));
    await db.delete(organizations).where(eq(organizations.id, ORG));
  }
  process.exit(0);
}

void main();
