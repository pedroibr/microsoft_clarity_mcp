import { describe, expect, it } from 'vitest';
import { createTestContext, seedClient } from './helpers.js';

describe('Client auth service', () => {
  it('authenticates bearer requests with a valid token', async () => {
    const ctx = await createTestContext();
    const seeded = await seedClient({
      ctx,
      sources: [{ slug: 'main', displayName: 'Main Source', apiToken: 'clarity-main' }],
    });

    const auth = await ctx.authService.authenticateClientRequest(ctx.database.db, {
      clientSlug: seeded.client.slug,
      headers: { authorization: `Bearer ${seeded.bearerToken}` },
      body: {},
    });

    expect(auth.clientSlug).toBe(seeded.client.slug);
    expect(auth.currentSource.sourceSlug).toBe('main');
    await ctx.close();
  });

  it('rejects invalid bearer tokens', async () => {
    const ctx = await createTestContext();
    const seeded = await seedClient({
      ctx,
      sources: [{ slug: 'main', displayName: 'Main Source', apiToken: 'clarity-main' }],
    });

    await expect(
      ctx.authService.authenticateClientRequest(ctx.database.db, {
        clientSlug: seeded.client.slug,
        headers: { authorization: 'Bearer wrong-token' },
        body: {},
      })
    ).rejects.toThrow('Invalid bearer token');

    await ctx.close();
  });

  it('supports public token auth when enabled', async () => {
    const ctx = await createTestContext();
    const seeded = await seedClient({
      ctx,
      sources: [{ slug: 'main', displayName: 'Main Source', apiToken: 'clarity-main' }],
    });

    const auth = await ctx.authService.authenticateClientRequest(ctx.database.db, {
      publicToken: seeded.publicToken,
      headers: {},
      body: {},
    });

    expect(auth.authMode).toBe('public');
    expect(auth.currentSource.sourceSlug).toBe('main');
    await ctx.close();
  });
});
