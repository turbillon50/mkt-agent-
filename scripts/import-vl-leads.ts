/**
 * Importación one-shot de `vl_leads_meta` (Neon de V&LIVING) a `sales_leads`.
 *
 *   VL_LEADS_DATABASE_URL=... npx tsx scripts/import-vl-leads.ts --project <slug|uuid> [--dry]
 *
 * Conserva las FECHAS ORIGINALES y los ESTADOS ACTUALES (contactado, respondió,
 * agendó, descartado, nota). No recalcula el puntaje: el que se ve en el panel
 * es el que se guarda, si no el histórico cambiaría solo.
 *
 * Es idempotente: `sales_leads_campaign_source_ref_uniq` impide duplicados, así
 * que se puede volver a correr sin miedo.
 */
import '../src/env';
import { Client } from 'pg';
import { eq, or } from 'drizzle-orm';
import { db } from '../src/db/client';
import { campaigns, type Project } from '../src/db/schema';
import { ingestLead } from '../src/sales/ingest';
import { recordEvent } from '../src/sales/repo';
import type { LeadGrade, LeadStage } from '../src/sales/types';

interface Row {
  id: string;
  nombre: string | null;
  telefono: string | null;
  tel_e164: string | null;
  email: string | null;
  plataforma: string | null;
  zona: string | null;
  lada: string | null;
  puntaje: number | null;
  grado: string | null;
  senales: unknown;
  creado_en: Date;
  contactado: boolean;
  respondio: boolean;
  agendo: boolean;
  descartado: boolean;
  nota: string | null;
  contactado_en: Date | null;
  form_id: string | null;
}

/** El estado del panel Python traducido al pipeline de Goossip. */
function stageOf(r: Row): LeadStage {
  if (r.descartado) return 'perdido';
  if (r.agendo) return 'cita_agendada';
  if (r.respondio) return 'interesado';
  if (r.contactado) return 'contactado';
  return 'nuevo';
}

function grade(v: string | null): LeadGrade {
  return v === 'A' || v === 'B' ? v : v === 'C' ? 'C' : 'C';
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function resolveProject(ref: string): Promise<Project> {
  const rows = await db
    .select()
    .from(campaigns)
    .where(
      /^[0-9a-f-]{36}$/i.test(ref) ? or(eq(campaigns.id, ref), eq(campaigns.slug, ref))! : eq(campaigns.slug, ref),
    )
    .limit(1);
  if (!rows[0]) throw new Error(`No existe el proyecto "${ref}". Créalo en /projects primero.`);
  return rows[0];
}

async function main() {
  const source = process.env.VL_LEADS_DATABASE_URL;
  if (!source) throw new Error('Falta VL_LEADS_DATABASE_URL (la base de V&LIVING donde vive vl_leads_meta).');
  const ref = arg('project');
  if (!ref) throw new Error('Falta --project <slug|uuid>.');
  const dry = process.argv.includes('--dry');

  const project = await resolveProject(ref);

  const client = new Client({ connectionString: source });
  await client.connect();
  let rows: Row[];
  try {
    const res = await client.query<Row>(`
      SELECT id, nombre, telefono, tel_e164, email, plataforma, zona, lada,
             puntaje, grado, senales, creado_en, contactado, respondio, agendo,
             descartado, nota, contactado_en, form_id
      FROM vl_leads_meta
      ORDER BY creado_en
    `);
    rows = res.rows;
  } finally {
    await client.end();
  }

  console.log(`origen: ${rows.length} filas en vl_leads_meta`);
  console.log(`destino: proyecto "${project.name}" (${project.slug})`);
  if (dry) {
    for (const r of rows) console.log(`  [dry] ${r.id} ${r.nombre ?? 's/n'} ${r.tel_e164 ?? ''} -> ${stageOf(r)} (${r.grado}/${r.puntaje})`);
    return;
  }

  let creados = 0;
  let repetidos = 0;
  const fallas: Array<{ id: string; error: string }> = [];

  for (const r of rows) {
    try {
      const result = await ingestLead({
        project,
        fullName: r.nombre,
        phone: r.tel_e164 ?? r.telefono,
        email: r.email,
        source: 'import',
        sourceRef: r.id,
        createdAt: r.creado_en,
        stageOverride: stageOf(r),
        skipLookup: true,
        skipQueue: true,
        scoreOverride: {
          score: r.puntaje ?? 0,
          grade: grade(r.grado),
          signals: Array.isArray(r.senales) ? (r.senales as string[]) : [],
          zone: r.zona ?? undefined,
        },
        raw: {
          origen: 'vl_leads_meta',
          form_id: r.form_id,
          plataforma: r.plataforma,
          lada: r.lada,
          contactado_en: r.contactado_en?.toISOString() ?? null,
        },
      });

      if (!result.created) {
        repetidos++;
        continue;
      }
      creados++;

      // La nota que Luis escribió a mano no se pierde.
      if (r.nota?.trim()) {
        await recordEvent({
          orgId: project.orgId,
          leadId: result.lead.id,
          type: 'note',
          actor: 'import',
          payload: { note: r.nota.trim(), origen: 'panel vl_leads_meta' },
        });
      }
      if (r.contactado_en) {
        await recordEvent({
          orgId: project.orgId,
          leadId: result.lead.id,
          type: 'stage_change',
          fromStage: 'nuevo',
          toStage: stageOf(r),
          actor: 'import',
          payload: { contactado_en: r.contactado_en.toISOString() },
        });
      }
    } catch (e) {
      fallas.push({ id: r.id, error: e instanceof Error ? e.message : 'error' });
    }
  }

  console.log(`\nimportados: ${creados}/${rows.length} · repetidos (ya estaban): ${repetidos} · fallas: ${fallas.length}`);
  for (const f of fallas) console.error(`  FALLA ${f.id}: ${f.error}`);
  if (fallas.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
