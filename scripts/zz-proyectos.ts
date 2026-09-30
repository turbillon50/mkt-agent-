/**
 * Los dos proyectos de prueba de la aceptación 1, en la base de DESARROLLO.
 *
 *   npx tsx scripts/zz-proyectos.ts crear
 *   npx tsx scripts/zz-proyectos.ts borrar
 *   npx tsx scripts/zz-proyectos.ts ids
 *
 * La aceptación pide dos negocios MUY distintos que corran el motor sin que nadie
 * les explique nada, y que salgan estrategias distintas y argumentadas. Si salen
 * iguales, es plantilla y no motor.
 *
 *   · zz-Momentum — fábrica de apps en México. Vende servicio, ticket medio,
 *     comprador que compara proveedores y pelea precio.
 *   · zz-Miami    — departamentos en Miami para compradores mexicanos. Vende
 *     activo, ticket altísimo, ciclo largo, comprador que cruza frontera.
 *
 * Están hechos para no parecerse en nada: giro, precio, plaza, idioma y etapa del
 * comprador. Lo único que comparten es que ninguno trae explicación escrita a mano
 * para el motor: solo lo que un dueño pondría al darlos de alta.
 *
 * SEGURIDAD: todo cuelga de la organización `org_zz_motor` y los nombres llevan
 * prefijo `zz-`. Los proyectos reales de Luis (MOMENTUM, GOOSSIP, V&LIVING, TRAMA)
 * no se tocan ni se leen. `borrar` solo borra lo que empieza con `zz-`.
 */
import '../src/env';
import { and, eq, inArray, like } from 'drizzle-orm';
import { db } from '../src/db/client';
import {
  audiences,
  campaigns,
  channelPlan,
  marketSignals,
  organizations,
  postHypotheses,
  projectBrief,
  radarRuns,
  users,
  type Project,
} from '../src/db/schema';

export const ORG_ZZ = 'org_zz_motor';

/**
 * El alta, como la llenaría un dueño: pocos campos y en sus palabras. NADA de
 * instrucciones para el motor, ni públicos, ni estrategia. Eso es lo que el motor
 * tiene que sacar solo — si se lo damos, la prueba no prueba nada.
 */
const ALTAS = [
  {
    name: 'zz-Momentum',
    slug: 'zz-momentum',
    kind: 'servicios' as const,
    description: 'Hacemos aplicaciones móviles y web a la medida para empresas.',
    website: 'https://vmomentums.info',
    city: 'Ciudad de México',
    country: 'México',
    brandName: 'zz-Momentum',
    brandVoice: 'directo, técnico pero sin presumir',
    brandTopics: 'desarrollo de apps, software a la medida, automatización',
    brandLanguage: 'es',
  },
  {
    name: 'zz-Miami',
    slug: 'zz-miami',
    kind: 'servicios' as const,
    description: 'Vendemos departamentos de preventa en Miami a compradores mexicanos que quieren rentarlos en dólares.',
    website: 'https://www.miamirealestate.com',
    city: 'Miami',
    country: 'Estados Unidos',
    brandName: 'zz-Miami',
    brandVoice: 'cálido y serio, de asesor que cuida el patrimonio',
    brandTopics: 'preventa en Miami, renta en dólares, inversión inmobiliaria',
    brandLanguage: 'es',
  },
];

async function crear(): Promise<Project[]> {
  await db.insert(organizations).values({ id: ORG_ZZ, name: 'zz-Pruebas del motor' }).onConflictDoNothing();

  const [u] = await db
    .insert(users)
    .values({ clerkId: 'user_zz_motor', email: 'zz-motor@pruebas.local' })
    .onConflictDoNothing()
    .returning();

  let userId = u?.id;
  if (!userId) {
    const [existente] = await db.select().from(users).where(eq(users.clerkId, 'user_zz_motor')).limit(1);
    userId = existente!.id;
  }

  const salida: Project[] = [];
  for (const alta of ALTAS) {
    const [existente] = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.orgId, ORG_ZZ), eq(campaigns.slug, alta.slug)))
      .limit(1);
    if (existente) {
      salida.push(existente);
      continue;
    }
    const [p] = await db.insert(campaigns).values({ ...alta, orgId: ORG_ZZ, userId }).returning();
    salida.push(p!);
  }
  return salida;
}

async function idsZz(): Promise<Project[]> {
  return db.select().from(campaigns).where(and(eq(campaigns.orgId, ORG_ZZ), like(campaigns.slug, 'zz-%')));
}

async function borrar(): Promise<void> {
  const ps = await idsZz();
  const ids = ps.map((p) => p.id);
  if (!ids.length) {
    console.log('no hay proyectos zz- que borrar');
    return;
  }
  // El orden importa: primero lo que apunta a otras tablas del motor.
  await db.delete(postHypotheses).where(inArray(postHypotheses.projectId, ids));
  await db.delete(channelPlan).where(inArray(channelPlan.projectId, ids));
  await db.delete(audiences).where(inArray(audiences.projectId, ids));
  await db.delete(marketSignals).where(inArray(marketSignals.projectId, ids));
  await db.delete(radarRuns).where(inArray(radarRuns.projectId, ids));
  await db.delete(projectBrief).where(inArray(projectBrief.projectId, ids));
  await db.delete(campaigns).where(inArray(campaigns.id, ids));
  console.log(`borrados ${ids.length} proyectos zz- y todo lo que el motor les colgó`);
}

async function main() {
  const orden = process.argv[2] ?? 'ids';
  if (orden === 'crear') {
    const ps = await crear();
    for (const p of ps) console.log(`${p.slug}\t${p.id}\t${p.name}`);
  } else if (orden === 'borrar') {
    await borrar();
  } else {
    const ps = await idsZz();
    if (!ps.length) console.log('no hay proyectos zz- todavía; corre: npx tsx scripts/zz-proyectos.ts crear');
    for (const p of ps) console.log(`${p.slug}\t${p.id}\t${p.name}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
