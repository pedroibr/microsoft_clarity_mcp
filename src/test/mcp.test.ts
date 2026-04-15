import { describe, expect, it } from 'vitest';
import { buildServer } from '../server.js';
import { createMockClarityServer, createTestContext, seedClient } from './helpers.js';

async function withLiveServer<T>(
  server: Awaited<ReturnType<typeof buildServer>>,
  run: (baseUrl: string) => Promise<T>
) {
  await server.listen({ port: 0, host: '127.0.0.1' });
  const address = server.server.address();
  if (!address || typeof address === 'string') throw new Error('Could not resolve test server address');
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await server.close();
  }
}

async function postJson(
  baseUrl: string,
  path: string,
  options: { headers?: Record<string, string>; payload?: unknown }
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
    body: JSON.stringify(options.payload || {}),
  });
  return {
    status: response.status,
    body: await response.text(),
  };
}

describe('MCP routes', () => {
  it('hides source switch tools when the client has a single source', async () => {
    const upstream = await createMockClarityServer({
      'POST /mcp/dashboard/query': () => ({
        body: { success: true, rows: [{ metricName: 'Traffic' }] },
      }),
    });
    const ctx = await createTestContext({
      clarityApiBaseUrl: `${upstream.baseUrl}/mcp`,
    });
    const seeded = await seedClient({
      ctx,
      sources: [{ slug: 'main', displayName: 'Main Source', apiToken: 'clarity-main' }],
    });
    const server = await buildServer({ config: ctx.config, database: ctx.database });

    await withLiveServer(server, async (baseUrl) => {
      const response = await postJson(baseUrl, `/mcp/clarity/clients/${seeded.client.slug}`, {
        headers: { authorization: `Bearer ${seeded.bearerToken}` },
        payload: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      });

      const names = JSON.parse(response.body).result.tools.map((tool: any) => tool.name);
      expect(names).toContain('get_active_source');
      expect(names).not.toContain('list_accessible_sources');
      expect(names).not.toContain('set_active_source');
      expect(names).not.toContain('clear_active_source');

      const queryResponse = await postJson(baseUrl, `/mcp/clarity/clients/${seeded.client.slug}`, {
        headers: { authorization: `Bearer ${seeded.bearerToken}` },
        payload: {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'query_analytics_dashboard',
            arguments: { query: 'Traffic last day' },
          },
        },
      });

      expect(queryResponse.body).toContain('Traffic');
      expect(upstream.requests[0]?.auth).toBe('Bearer clarity-main');
      expect((upstream.requests[0]?.body as any).query).toBe('Traffic last day');
    });

    await upstream.close();
    await ctx.close();
  });

  it('shows source switch tools when the client has multiple sources and persists the active source per session', async () => {
    const upstream = await createMockClarityServer({
      'POST /mcp/documentation/query': (req) => ({
        body: { ok: true, auth: req.headers.authorization },
      }),
    });
    const ctx = await createTestContext({
      clarityApiBaseUrl: `${upstream.baseUrl}/mcp`,
    });
    const seeded = await seedClient({
      ctx,
      sources: [
        { slug: 'alpha', displayName: 'Alpha Source', apiToken: 'clarity-alpha' },
        { slug: 'beta', displayName: 'Beta Source', apiToken: 'clarity-beta' },
      ],
    });
    const server = await buildServer({ config: ctx.config, database: ctx.database });

    await withLiveServer(server, async (baseUrl) => {
      const listResponse = await postJson(baseUrl, `/mcp/clarity/clients/${seeded.client.slug}`, {
        headers: {
          authorization: `Bearer ${seeded.bearerToken}`,
          'mcp-session-id': 'session-1',
        },
        payload: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      });

      const names = JSON.parse(listResponse.body).result.tools.map((tool: any) => tool.name);
      expect(names).toContain('list_accessible_sources');
      expect(names).toContain('set_active_source');
      expect(names).toContain('clear_active_source');

      await postJson(baseUrl, `/mcp/clarity/clients/${seeded.client.slug}`, {
        headers: {
          authorization: `Bearer ${seeded.bearerToken}`,
          'mcp-session-id': 'session-1',
        },
        payload: {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'set_active_source',
            arguments: { source_slug: 'beta' },
          },
        },
      });

      const toolResponse = await postJson(baseUrl, `/mcp/clarity/clients/${seeded.client.slug}`, {
        headers: {
          authorization: `Bearer ${seeded.bearerToken}`,
          'mcp-session-id': 'session-1',
        },
        payload: {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'query_documentation_resources',
            arguments: { query: 'How to install Clarity?' },
          },
        },
      });

      expect(toolResponse.body).toContain('clarity-beta');

      await postJson(baseUrl, `/mcp/clarity/clients/${seeded.client.slug}`, {
        headers: {
          authorization: `Bearer ${seeded.bearerToken}`,
          'mcp-session-id': 'session-1',
        },
        payload: {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'clear_active_source',
            arguments: {},
          },
        },
      });

      await postJson(baseUrl, `/mcp/clarity/clients/${seeded.client.slug}`, {
        headers: {
          authorization: `Bearer ${seeded.bearerToken}`,
          'mcp-session-id': 'session-1',
        },
        payload: {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: {
            name: 'query_documentation_resources',
            arguments: { query: 'How to install Clarity?' },
          },
        },
      });

      expect(upstream.requests[1]?.auth).toBe('Bearer clarity-alpha');
    });

    await upstream.close();
    await ctx.close();
  });

  it('supports public auth on the MCP endpoint', async () => {
    const upstream = await createMockClarityServer({
      'POST /mcp/documentation/query': () => ({
        body: { success: true, snippets: ['step 1'] },
      }),
    });
    const ctx = await createTestContext({
      clarityApiBaseUrl: `${upstream.baseUrl}/mcp`,
    });
    const seeded = await seedClient({
      ctx,
      sources: [{ slug: 'public-main', displayName: 'Public Main', apiToken: 'clarity-public' }],
    });
    const server = await buildServer({ config: ctx.config, database: ctx.database });

    await withLiveServer(server, async (baseUrl) => {
      const response = await postJson(baseUrl, `/mcp/clarity/public/${seeded.publicToken}`, {
        payload: {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'query_documentation_resources',
            arguments: { query: 'setup' },
          },
        },
      });

      expect(response.body).toContain('step 1');
      expect(upstream.requests[0]?.auth).toBe('Bearer clarity-public');
    });

    await upstream.close();
    await ctx.close();
  });

  it('blocks requests when the source daily quota is exceeded', async () => {
    const upstream = await createMockClarityServer({
      'POST /mcp/dashboard/query': () => ({
        body: { success: true },
      }),
    });
    const ctx = await createTestContext({
      clarityApiBaseUrl: `${upstream.baseUrl}/mcp`,
      clarityDailyRequestLimit: 1,
    });
    const seeded = await seedClient({
      ctx,
      sources: [{ slug: 'main', displayName: 'Main Source', apiToken: 'clarity-main' }],
    });
    const server = await buildServer({ config: ctx.config, database: ctx.database });

    await withLiveServer(server, async (baseUrl) => {
      await postJson(baseUrl, `/mcp/clarity/clients/${seeded.client.slug}`, {
        headers: { authorization: `Bearer ${seeded.bearerToken}` },
        payload: {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'query_analytics_dashboard',
            arguments: { query: 'Traffic last day' },
          },
        },
      });

      const second = await postJson(baseUrl, `/mcp/clarity/clients/${seeded.client.slug}`, {
        headers: { authorization: `Bearer ${seeded.bearerToken}` },
        payload: {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'query_analytics_dashboard',
            arguments: { query: 'Traffic last day' },
          },
        },
      });

      expect(second.body).toContain('Daily Clarity request limit reached');
    });

    await upstream.close();
    await ctx.close();
  });

  it('exposes admin API flows for client, source, link, default source, and token issuance', async () => {
    const upstream = await createMockClarityServer({
      'POST /mcp/dashboard/query': () => ({
        body: { success: true },
      }),
    });
    const ctx = await createTestContext({
      clarityApiBaseUrl: `${upstream.baseUrl}/mcp`,
    });
    const server = await buildServer({ config: ctx.config, database: ctx.database });

    await withLiveServer(server, async (baseUrl) => {
      const auth = { authorization: `Bearer ${ctx.config.adminSessionSecret}` };

      const createClient = await postJson(baseUrl, '/api/admin/clients', {
        headers: auth,
        payload: { slug: 'acme', display_name: 'ACME' },
      });
      expect(createClient.status).toBe(201);

      const createSource = await postJson(baseUrl, '/api/admin/sources', {
        headers: auth,
        payload: {
          slug: 'main',
          display_name: 'Main Source',
          api_token: 'clarity-main',
          project_label: 'Main Project',
        },
      });
      expect(createSource.status).toBe(201);

      const linkSource = await postJson(baseUrl, '/api/admin/clients/acme/source-links', {
        headers: auth,
        payload: { source_slug: 'main', enabled: true, status: 'active' },
      });
      expect(linkSource.status).toBe(201);

      const clientDetail = await ctx.platformService.getClientAccess(ctx.database.db, 'acme');
      await ctx.platformService.upsertClientAccess(ctx.database.db, 'acme', {
        defaultSourceId: (await ctx.platformService.getSourceBySlug(ctx.database.db, 'main')).id,
      });
      await ctx.platformService.validateDefaultSourceRule(ctx.database.db, clientDetail.access.id);

      const rotateBearer = await postJson(baseUrl, '/api/admin/clients/acme/rotate-bearer', {
        headers: auth,
      });
      const rotateBody = JSON.parse(rotateBearer.body);
      expect(rotateBearer.status).toBe(200);
      expect(rotateBody.token).toMatch(/^cmcp_/);

      const validate = await postJson(baseUrl, '/api/admin/sources/main/validate', {
        headers: auth,
        payload: { client_slug: 'acme' },
      });
      expect(validate.status).toBe(200);
    });

    await upstream.close();
    await ctx.close();
  });
});
