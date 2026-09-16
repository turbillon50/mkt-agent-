/**
 * Deja el catálogo de Composio listo para que un usuario nuevo conecte.
 *
 *   npm run composio:bootstrap
 *
 * Idempotente: lista lo que hay, crea solo lo que falta y guarda cada `ac_xxx`
 * en `composio_auth_configs`. Correrlo dos veces seguidas tiene que dar los
 * mismos números con 0 creados la segunda vez — es la prueba de que no está
 * ensuciando la cuenta de Composio.
 *
 * También imprime, medido contra el catálogo REAL, qué toolkits del issue
 * tienen auth administrada y cuáles no. Los que no, salen "Próximamente" en la
 * pantalla; no se inventa una forma de conectarlos.
 */
import 'dotenv/config';
import {
  CONNECTORS,
  managedComposioSlugs,
  unmanagedComposioConnectors,
} from '../src/projects/catalog';
import { composioReady, getToolkit, toolkitIsManaged } from '../src/composio/client';
import { ensureCatalogAuthConfigs } from '../src/composio/auth-configs';

async function main() {
  if (!composioReady()) {
    console.error('FALTA COMPOSIO_API_KEY. Nada que hacer.');
    process.exit(2);
  }

  const composio = CONNECTORS.filter((c) => c.via === 'composio');
  console.log(`Catálogo del issue: ${composio.length} toolkits de Composio`);

  // 1. Comprobar contra el catálogo REAL lo que el código afirma. Si Composio
  //    habilita mañana la auth administrada de TikTok, esto lo caza aquí y no
  //    en una promesa rota en la pantalla del cliente.
  const desacuerdos: string[] = [];
  for (const c of composio) {
    const tk = await getToolkit(c.slug);
    if (!tk) {
      desacuerdos.push(`${c.slug}: NO EXISTE en el catálogo de Composio`);
      continue;
    }
    const managed = toolkitIsManaged(tk);
    if (managed !== c.managed) {
      desacuerdos.push(
        `${c.slug}: el catálogo dice managed=${managed} y nosotros teníamos ${c.managed}`,
      );
    }
    console.log(
      `  ${managed ? '✓' : '·'} ${c.slug.padEnd(24)} ${tk.name.padEnd(24)} ` +
        `managed=${managed} tools=${tk.meta?.tools_count ?? '?'}`,
    );
  }

  // 2. Crear lo que falte.
  const results = await ensureCatalogAuthConfigs(managedComposioSlugs());
  const cuenta = (accion: string) => results.filter((r) => r.accion === accion).length;
  console.log('');
  console.log(
    `Auth configs — ya estaban: ${cuenta('existente')} · adoptados de Composio: ${cuenta('adoptado')} · creados: ${cuenta('creado')} · sin managed: ${cuenta('sin_managed')} · error: ${cuenta('error')}`,
  );
  for (const r of results) {
    if (r.accion === 'creado' || r.accion === 'adoptado' || r.accion === 'error') {
      console.log(`  ${r.accion.padEnd(10)} ${r.toolkit.padEnd(24)} ${r.authConfigId ?? ''} ${r.detalle ?? ''}`);
    }
  }

  const proximamente = unmanagedComposioConnectors();
  console.log('');
  console.log(
    `Próximamente (sin auth administrada, no se inventan): ${proximamente.map((c) => c.slug).join(', ')}`,
  );

  if (desacuerdos.length > 0) {
    console.log('');
    console.log('DESACUERDOS con el catálogo real:');
    for (const d of desacuerdos) console.log(`  ! ${d}`);
    process.exit(1);
  }

  const errores = results.filter((r) => r.accion === 'error');
  process.exit(errores.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
