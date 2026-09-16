/**
 * Alta del primer proyecto real: V&LIVING (campaña Caribe).
 *
 *   npx tsx scripts/seed-vliving.ts --owner turbillon50@gmail.com
 *
 * Solo ids PÚBLICOS (página, formulario, cuenta publicitaria). Los tokens van a
 * env de Vercel — ver lib/project-secrets.ts. Idempotente: si ya existe, actualiza
 * los canales y deja las reglas que ya tenga.
 */
import '../src/env';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { campaigns, users } from '../src/db/schema';
import { createProject, setActiveProject, updateProject } from '../src/sales/projects';
import { systemOrgId } from '../src/orgs/system';

const CHANNELS = {
  meta_page_id: '1173019489236259',
  meta_form_ids: ['2146578942620117'],
  meta_ad_account: 'act_1719141675826755',
};

const PERSONA = [
  'Eres el asesor de V&LIVING, desarrollo de departamentos en el Caribe mexicano.',
  'Hablas como asesor inmobiliario mexicano: cálido, directo, sin floreo ni lenguaje de folleto.',
  'Tu meta en cada conversación es una sola: agendar una llamada o una visita con un asesor humano.',
  'No cierras ventas por WhatsApp ni das números de precio que no tengas confirmados.',
].join(' ');

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const email = arg('owner');
  if (!email) throw new Error('Falta --owner <email del tenant>.');

  const [owner] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!owner) throw new Error(`No existe el usuario ${email} en la base. Que entre una vez por Clerk primero.`);

  // El proyecto cuelga de la ORG, no del usuario. Se toma la org de sistema
  // (GOOSSIP_SYSTEM_ORG_ID o la única que haya) para no adivinar tenant.
  const orgId = await systemOrgId();

  const existing = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.orgId, orgId))
    .then((rows) => rows.find((r) => r.slug === 'vliving' || r.name.toLowerCase().includes('living')));

  const rules = {
    auto_reply: false,          // el vendedor PROPONE; Luis aprueba con un tap
    auto_first_contact: false,  // no sale nada solo hasta que exista la plantilla
    no_contact_hours: 2,
    no_reply_sms_hours: 72,
    no_reply_retarget_hours: 24 * 7,
    notify_owner_grade: 'A' as const,
    escalation_score: 70,
    twilio_mode: 'trial' as const,
  };

  if (existing) {
    const updated = await updateProject(orgId, existing.id, {
      kind: 'real_estate',
      sellerPersona: existing.sellerPersona ?? PERSONA,
      channels: { ...(existing.channels ?? {}), ...CHANNELS },
      rules: { ...rules, ...(existing.rules ?? {}) },
    });
    console.log(`actualizado: ${updated?.name} (${updated?.slug}) id=${updated?.id}`);
    return;
  }

  const project = await createProject(
    orgId,
    owner.id,
    {
      name: 'V&LIVING',
      kind: 'real_estate',
      description: 'Departamentos en el Caribe mexicano. Campaña Caribe.',
      audience: 'Compradores e inversionistas mexicanos y de EE. UU., 30-60 años.',
      sellerPersona: PERSONA,
      channels: CHANNELS,
      rules,
      mcpSources: [],
    },
    // Sin este cuarto argumento el proyecto nace SIN dueño en
    // `project_members`: funciona mientras quien lo creó mande en la
    // organización, y deja de funcionar el día que no.
    { clerkUserId: owner.clerkId, email: owner.email },
  );
  await setActiveProject(orgId, owner.clerkId, project.id);
  console.log(`creado: ${project.name} (${project.slug}) id=${project.id} — proyecto activo de ${email}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
