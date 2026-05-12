import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import ws from 'ws';
import { config } from '../config.js';
import * as schema from './schema.js';

neonConfig.webSocketConstructor = ws;

if (!config.db.url) {
  throw new Error('DATABASE_URL is not set. Configure Neon connection string in .env');
}

const sql = neon(config.db.url);
export const db = drizzle(sql, { schema });
export { schema };
