import { describe, expect, it } from 'vitest';
import { createTestContext } from './helpers.js';

describe('database bootstrap', () => {
  it('creates the expected base tables', async () => {
    const ctx = await createTestContext();

    const tables = await ctx.database.db.execute(`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
      order by table_name
    `);

    const names = new Set(
      (tables.rows as Array<{ table_name: string }>).map((row) => row.table_name)
    );

    expect(names.has('clients')).toBe(true);
    expect(names.has('clarity_sources')).toBe(true);
    expect(names.has('client_access')).toBe(true);
    expect(names.has('client_source_links')).toBe(true);
    expect(names.has('client_sessions')).toBe(true);
    expect(names.has('audit_logs')).toBe(true);

    await ctx.close();
  });
});
