import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { loadConfig, type AppConfig } from '../config.js';
import * as schema from './schema.js';

export interface DatabaseContext {
  pool: {
    end?: () => Promise<unknown>;
    close?: () => Promise<unknown>;
  };
  db: any;
}

export function makeDatabaseContext(pool: Pool): DatabaseContext {
  return {
    pool,
    db: drizzle(pool, { schema }),
  };
}

export function createDatabase(config: AppConfig = loadConfig()): DatabaseContext {
  const pool = new Pool({
    connectionString: config.databaseUrl,
  });
  return makeDatabaseContext(pool);
}
