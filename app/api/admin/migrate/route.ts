import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle');

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'DATABASE_URL not set' }, { status: 500 });
  }
  if (!existsSync(MIGRATIONS_DIR)) {
    return NextResponse.json({ error: 'no migrations folder' }, { status: 500 });
  }

  const { Client } = await import('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const applied: string[] = [];
  const skipped: string[] = [];
  const errors: { file: string; error: string }[] = [];

  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
    await client.query(`
      CREATE TABLE IF NOT EXISTS __migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const { rows } = await client.query<{ id: string }>('SELECT id FROM __migrations');
    const appliedSet = new Set(rows.map((r) => r.id));

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (appliedSet.has(file)) {
        skipped.push(file);
        continue;
      }
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO __migrations (id) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (e) {
        await client.query('ROLLBACK');
        errors.push({ file, error: e instanceof Error ? e.message : String(e) });
        break;
      }
    }

    const tables = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`,
    );

    return NextResponse.json({
      ok: errors.length === 0,
      applied,
      skipped,
      errors,
      tables: tables.rows.map((r) => r.table_name),
    });
  } finally {
    await client.end();
  }
}
