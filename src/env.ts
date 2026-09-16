/**
 * El entorno, para lo que corre FUERA de Next.
 *
 * Next lee `.env.local` solo. Los scripts y las pruebas usaban
 * `import 'dotenv/config'`, que lee `.env` y nada más — así que corrían sin las
 * llaves del proyecto salvo que alguien dejara un `.env` a mano.
 *
 * Eso fue exactamente el tropiezo de esta corrida: se dejó un enlace
 * `.env → .env.local` para que los scripts encontraran las llaves, el enlace se
 * subió a Vercel apuntando a un archivo que allá no existe (es privado, y bien
 * que lo sea) y el build murió con `ENOENT: stat '/vercel/path0/.env'`.
 *
 * Con esto no hace falta ningún enlace: se lee `.env.local` primero —que es lo
 * que Next usa y lo que la gente edita— y `.env` después, sin pisar lo que ya
 * esté puesto en el entorno de verdad. En Vercel no existe ninguno de los dos y
 * no pasa nada: las variables ya vienen inyectadas.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const RAIZ = process.cwd();

for (const archivo of ['.env.local', '.env']) {
  const p = path.join(RAIZ, archivo);
  // `override: false` es lo que hace que una variable puesta en la línea de
  // órdenes gane siempre: `DATABASE_URL=… npx tsx …` tiene que poder apuntar a
  // otra base sin editar ningún archivo.
  if (existsSync(p)) dotenv.config({ path: p, override: false });
}

export {};
