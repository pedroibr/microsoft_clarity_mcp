import http from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { bootstrapDatabase } from '../db/bootstrap.js';
import type { AppConfig } from '../config.js';
import { PlatformService } from '../core/platformService.js';
import { ClientAuthService } from '../core/auth.js';
import * as schema from '../db/schema.js';

export async function createTestContext(overrides?: Partial<AppConfig>) {
  const pool = new PGlite();
  const database = {
    pool: {
      end: async () => {
        await pool.close();
      },
    },
    db: drizzle(pool, { schema }),
  };

  const config: AppConfig = {
    appEnv: 'test',
    appName: 'microsoft-clarity-multi-client-mcp-test',
    port: 0,
    host: '127.0.0.1',
    appBaseUrl: 'http://localhost:3000',
    databaseUrl: '',
    clientTokenSalt: 'test-salt',
    credentialsEncryptionKey: 'test-encryption-key',
    adminUiPassword: 'admin',
    adminSessionSecret: 'session-secret-must-be-at-least-32-chars',
    clarityApiBaseUrl: 'http://127.0.0.1:9/mcp',
    clarityDailyRequestLimit: 10,
    ...overrides,
  };

  await bootstrapDatabase(database.db);

  return {
    config,
    database,
    platformService: new PlatformService(config),
    authService: new ClientAuthService(config),
    async close() {
      await pool.close();
    },
  };
}

export async function seedClient(options: {
  ctx: Awaited<ReturnType<typeof createTestContext>>;
  clientSlug?: string;
  sources: Array<{
    slug: string;
    displayName: string;
    apiToken?: string;
    projectLabel?: string;
    siteUrl?: string;
    sourceStatus?: string;
    linkEnabled?: boolean;
    linkStatus?: string;
  }>;
  enabled?: boolean;
  readEnabled?: boolean;
  writeEnabled?: boolean;
  deleteEnabled?: boolean;
}) {
  const {
    ctx,
    clientSlug = 'acme',
    sources,
    enabled = true,
    readEnabled = true,
    writeEnabled = true,
    deleteEnabled = false,
  } = options;

  const client = await ctx.platformService.createClient(ctx.database.db, {
    slug: clientSlug,
    displayName: `Client ${clientSlug}`,
  });

  let access = await ctx.platformService.upsertClientAccess(ctx.database.db, client.slug, {
    enabled,
    readEnabled,
    writeEnabled,
    deleteEnabled,
    status: 'active',
  });

  const savedSources = [];
  for (const source of sources) {
    const saved = await ctx.platformService.saveSource(ctx.database.db, {
      slug: source.slug,
      displayName: source.displayName,
      apiToken: source.apiToken || `token-${source.slug}`,
      projectLabel: source.projectLabel,
      siteUrl: source.siteUrl,
      status: source.sourceStatus || 'active',
    });
    await ctx.platformService.upsertClientSourceLink(ctx.database.db, client.slug, saved.slug, {
      enabled: source.linkEnabled ?? true,
      status: source.linkStatus || 'active',
    });
    savedSources.push(saved);
  }

  await ctx.platformService.validateDefaultSourceRule(ctx.database.db, access.id);
  access = (await ctx.platformService.getClientAccess(ctx.database.db, client.slug)).access;

  const bearerToken = await ctx.authService.rotateBearerToken(ctx.database.db, access.id);
  const publicToken = await ctx.authService.enablePublicToken(ctx.database.db, access.id);

  return { client, access, sources: savedSources, bearerToken, publicToken };
}

export async function createMockClarityServer(
  routes: Record<
    string,
    (
      req: http.IncomingMessage,
      body: unknown
    ) => { status?: number; body: unknown }
  >
) {
  const requests: Array<{
    method: string;
    path: string;
    auth: string | undefined;
    body: unknown;
  }> = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const parsed = raw ? JSON.parse(raw) : null;
      const key = `${req.method || 'GET'} ${req.url || '/'}`;
      requests.push({
        method: req.method || 'GET',
        path: req.url || '/',
        auth: req.headers.authorization,
        body: parsed,
      });
      const handler = routes[key];
      const payload = handler
        ? handler(req, parsed)
        : { status: 404, body: { error: 'not found', key } };
      res.writeHead(payload.status || 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload.body));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not resolve test server address');

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    async close() {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    },
  };
}
