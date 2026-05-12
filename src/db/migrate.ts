import 'dotenv/config';
import { Client } from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const MIGRATIONS_DIR = path.resolve('drizzle');

async function ensureExtensions(client: Client) {
  await client.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
  await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
}

async function ensureMigrationsTable(client: Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS __migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function appliedSet(client: Client): Promise<Set<string>> {
  const { rows } = await client.query<{ id: string }>('SELECT id FROM __migrations');
  return new Set(rows.map((r) => r.id));
}

async function run() {
  if (!config.db.url) throw new Error('DATABASE_URL is not set.');
  if (!existsSync(MIGRATIONS_DIR)) {
    console.log(`No migrations folder at ${MIGRATIONS_DIR}. Run: npm run db:generate`);
    return;
  }

  const client = new Client({ connectionString: config.db.url });
  await client.connect();
  try {
    await ensureExtensions(client);
    await ensureMigrationsTable(client);
    const applied = await appliedSet(client);

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`-> applying ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO __migrations (id) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
    console.log('Migrations up to date.');
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
