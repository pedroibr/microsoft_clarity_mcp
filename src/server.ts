import fastify from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import session from '@fastify/session';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { AppConfig } from './config.js';
import type { DatabaseContext } from './db/client.js';
import { renderClientDetail, renderClients, renderDashboard, renderLogin, renderSources } from './admin/views.js';
import { PlatformService } from './core/platformService.js';
import { ClientAuthService } from './core/auth.js';
import { AuditService } from './core/audit.js';
import { createClarityModule } from './modules/clarity/tools.js';
import { buildStreamableMcpServer } from './mcp/sdkServer.js';

export async function buildServer({
  config,
  database,
}: {
  config: AppConfig;
  database: DatabaseContext;
}) {
  const app = fastify();
  const platformService = new PlatformService(config);
  const authService = new ClientAuthService(config);
  const auditService = new AuditService();
  const clarityModule = createClarityModule(config);

  await app.register(cookie);
  await app.register(formbody);
  await app.register(session, {
    secret: config.adminSessionSecret,
    cookie: {
      secure: false,
      httpOnly: true,
      path: '/',
    },
  });

  function readFlash(request: any) {
    const flash = request.session.flash || null;
    delete request.session.flash;
    return flash;
  }

  function setFlash(request: any, kind: string, message: string) {
    request.session.flash = { kind, message };
  }

  function requireAdmin(request: any, reply: any) {
    if (!request.session.isAdmin) {
      reply.redirect('/admin/login');
      return false;
    }
    return true;
  }

  function isAuthorizedApi(request: any) {
    if (request.session?.isAdmin) return true;
    const authHeader = request.headers.authorization;
    const bearer = authHeader?.toLowerCase().startsWith('bearer ')
      ? authHeader.split(' ', 2)[1]
      : undefined;
    return bearer === config.adminSessionSecret || request.headers['x-admin-api-key'] === config.adminSessionSecret;
  }

  function parseCheckbox(body: Record<string, any>, key: string) {
    return body[key] === 'on' || body[key] === 'true' || body[key] === '1' || body[key] === true;
  }

  function parseNullableNumber(value: unknown): number | null | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value !== 'string') return undefined;
    if (!value.trim()) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function storeIssuedSecret(request: any, key: string, value: string | undefined) {
    if (!value) return;
    const current = request.session.issuedSecrets || {};
    current[key] = value;
    request.session.issuedSecrets = current;
  }

  function popIssuedSecret(request: any, key: string) {
    const current = request.session.issuedSecrets || {};
    const value = current[key];
    delete current[key];
    request.session.issuedSecrets = current;
    return value || null;
  }

  async function renderClientPage(request: any, reply: any, clientSlug: string) {
    const detail = await platformService.getClientAccess(database.db, clientSlug);
    const sourcesWithAccess = await platformService.listSourcesWithAccess(database.db, detail.access.id);
    const publicToken = popIssuedSecret(request, `${clientSlug}:public`);
    const bearerToken = popIssuedSecret(request, `${clientSlug}:bearer`);
    const urls = platformService.buildMcpUrls(clientSlug, publicToken);
    reply.type('text/html').send(
      renderClientDetail({
        client: detail.client,
        access: detail.access,
        sourcesWithAccess,
        flash: readFlash(request),
        issuedBearerToken: bearerToken,
        issuedPublicUrl: urls.publicUrl || null,
        authenticatedUrl: urls.authenticatedUrl,
      })
    );
  }

  function sendJson(reply: any, status: number, body: unknown) {
    reply.code(status).type('application/json').send(body);
  }

  app.get('/health', async () => ({ ok: true, service: config.appName }));
  app.get('/', async (_request, reply) => reply.redirect('/admin'));

  app.get('/admin/login', async (request, reply) => {
    if ((request.session as any).isAdmin) return reply.redirect('/admin');
    reply.type('text/html').send(renderLogin());
  });

  app.post('/admin/login', async (request, reply) => {
    const body = request.body as Record<string, any>;
    if ((body.password || '') !== config.adminUiPassword) {
      reply.type('text/html').send(renderLogin('Invalid password'));
      return;
    }
    (request.session as any).isAdmin = true;
    reply.redirect('/admin');
  });

  app.post('/admin/logout', async (request, reply) => {
    request.session.destroy(() => undefined);
    reply.redirect('/admin/login');
  });

  app.get('/admin', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const [clients, sources] = await Promise.all([
      platformService.listClients(database.db),
      platformService.listSources(database.db),
    ]);
    reply.type('text/html').send(renderDashboard({ clients, sources, flash: readFlash(request) }));
  });

  app.get('/admin/clients', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const clients = await platformService.listClients(database.db);
    reply.type('text/html').send(renderClients({ clients, flash: readFlash(request) }));
  });

  app.post('/admin/clients', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const body = request.body as Record<string, any>;
    try {
      await platformService.createClient(database.db, {
        slug: String(body.slug || ''),
        displayName: String(body.display_name || ''),
        description: String(body.description || ''),
      });
      setFlash(request, 'success', 'Client created');
    } catch (error) {
      setFlash(request, 'error', error instanceof Error ? error.message : 'Failed to create client');
    }
    reply.redirect('/admin/clients');
  });

  app.get('/admin/sources', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const sources = await platformService.listSources(database.db);
    reply.type('text/html').send(renderSources({ sources, flash: readFlash(request) }));
  });

  app.post('/admin/sources', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const body = request.body as Record<string, any>;
    try {
      await platformService.saveSource(database.db, {
        slug: String(body.slug || ''),
        displayName: String(body.display_name || ''),
        apiToken: String(body.api_token || ''),
        projectLabel: String(body.project_label || ''),
        siteUrl: String(body.site_url || ''),
        status: String(body.status || 'active'),
      });
      setFlash(request, 'success', 'Source created');
    } catch (error) {
      setFlash(request, 'error', error instanceof Error ? error.message : 'Failed to create source');
    }
    reply.redirect('/admin/sources');
  });

  app.post('/admin/sources/:sourceSlug', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { sourceSlug } = request.params as { sourceSlug: string };
    const body = request.body as Record<string, any>;
    try {
      const source = await platformService.getSourceBySlug(database.db, sourceSlug);
      await platformService.saveSource(
        database.db,
        {
          slug: String(body.slug || ''),
          displayName: String(body.display_name || ''),
          apiToken: String(body.api_token || ''),
          projectLabel: String(body.project_label || ''),
          siteUrl: String(body.site_url || ''),
          status: String(body.status || 'active'),
        },
        source.id
      );
      setFlash(request, 'success', 'Source updated');
    } catch (error) {
      setFlash(request, 'error', error instanceof Error ? error.message : 'Failed to update source');
    }
    reply.redirect('/admin/sources');
  });

  app.post('/admin/sources/:sourceSlug/delete', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { sourceSlug } = request.params as { sourceSlug: string };
    try {
      await platformService.deleteSource(database.db, sourceSlug);
      setFlash(request, 'success', 'Source deleted');
    } catch (error) {
      setFlash(request, 'error', error instanceof Error ? error.message : 'Failed to delete source');
    }
    reply.redirect('/admin/sources');
  });

  app.get('/admin/clients/:clientSlug', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { clientSlug } = request.params as { clientSlug: string };
    try {
      await renderClientPage(request, reply, clientSlug);
    } catch (error) {
      setFlash(request, 'error', error instanceof Error ? error.message : 'Unknown client');
      reply.redirect('/admin/clients');
    }
  });

  app.post('/admin/clients/:clientSlug', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { clientSlug } = request.params as { clientSlug: string };
    const body = request.body as Record<string, any>;
    try {
      const client = await platformService.updateClient(database.db, clientSlug, {
        displayName: String(body.display_name || ''),
        description: String(body.description || ''),
        status: String(body.status || 'active'),
      });
      const access = await platformService.getClientAccess(database.db, client.slug);
      await platformService.validateDefaultSourceRule(database.db, access.access.id);
      setFlash(request, 'success', 'Client updated');
    } catch (error) {
      setFlash(request, 'error', error instanceof Error ? error.message : 'Failed to update client');
    }
    reply.redirect(`/admin/clients/${clientSlug}`);
  });

  app.post('/admin/clients/:clientSlug/delete', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { clientSlug } = request.params as { clientSlug: string };
    try {
      await platformService.deleteClient(database.db, clientSlug);
      setFlash(request, 'success', 'Client deleted');
    } catch (error) {
      setFlash(request, 'error', error instanceof Error ? error.message : 'Failed to delete client');
    }
    reply.redirect('/admin/clients');
  });

  app.post('/admin/clients/:clientSlug/access', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { clientSlug } = request.params as { clientSlug: string };
    const body = request.body as Record<string, any>;
    try {
      const access = await platformService.upsertClientAccess(database.db, clientSlug, {
        enabled: parseCheckbox(body, 'enabled'),
        readEnabled: parseCheckbox(body, 'read_enabled'),
        writeEnabled: parseCheckbox(body, 'write_enabled'),
        deleteEnabled: parseCheckbox(body, 'delete_enabled'),
        status: String(body.status || 'active'),
        defaultSourceId: parseNullableNumber(body.default_source_id),
      });
      await platformService.validateDefaultSourceRule(database.db, access.id);
      setFlash(request, 'success', 'Client access updated');
    } catch (error) {
      setFlash(request, 'error', error instanceof Error ? error.message : 'Failed to update access');
    }
    reply.redirect(`/admin/clients/${clientSlug}`);
  });

  app.post('/admin/clients/:clientSlug/sources/:sourceSlug', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { clientSlug, sourceSlug } = request.params as { clientSlug: string; sourceSlug: string };
    const body = request.body as Record<string, any>;
    try {
      const link = await platformService.upsertClientSourceLink(database.db, clientSlug, sourceSlug, {
        enabled: parseCheckbox(body, 'enabled'),
        status: String(body.status || 'active'),
      });
      await platformService.validateDefaultSourceRule(database.db, link.clientAccessId);
      setFlash(request, 'success', 'Source link updated');
    } catch (error) {
      setFlash(
        request,
        'error',
        error instanceof Error ? error.message : 'Failed to update source link'
      );
    }
    reply.redirect(`/admin/clients/${clientSlug}`);
  });

  app.post('/admin/clients/:clientSlug/sources/:sourceSlug/validate', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { clientSlug, sourceSlug } = request.params as { clientSlug: string; sourceSlug: string };
    try {
      const source = await platformService.getDecryptedSourceForClient(database.db, clientSlug, sourceSlug);
      await clarityModule.testSource(database.db, source);
      await platformService.markSourceValidation(database.db, clientSlug, sourceSlug, { ok: true });
      await auditService.recordForSource(database.db, {
        clientSlug,
        sourceId: source.sourceId,
        authMode: 'admin',
        toolName: 'validate_source',
        status: 'ok',
        payload: { validated: true },
      });
      setFlash(request, 'success', 'Source validated');
    } catch (error) {
      await platformService
        .markSourceValidation(database.db, clientSlug, sourceSlug, {
          ok: false,
          message: error instanceof Error ? error.message : 'Source validation failed',
        })
        .catch(() => undefined);
      const source = await platformService.getSourceBySlug(database.db, sourceSlug).catch(() => null);
      if (source) {
        await auditService.recordForSource(database.db, {
          clientSlug,
          sourceId: source.id,
          authMode: 'admin',
          toolName: 'validate_source',
          status: 'error',
          payload: { message: error instanceof Error ? error.message : 'Source validation failed' },
        });
      }
      setFlash(
        request,
        'error',
        error instanceof Error ? error.message : 'Source validation failed'
      );
    }
    reply.redirect(`/admin/clients/${clientSlug}`);
  });

  app.post('/admin/clients/:clientSlug/rotate-bearer', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { clientSlug } = request.params as { clientSlug: string };
    try {
      const detail = await platformService.getClientAccess(database.db, clientSlug);
      const token = await authService.rotateBearerToken(database.db, detail.access.id);
      storeIssuedSecret(request, `${clientSlug}:bearer`, token);
      setFlash(request, 'success', 'Bearer token rotated');
    } catch (error) {
      setFlash(request, 'error', error instanceof Error ? error.message : 'Failed to rotate bearer token');
    }
    reply.redirect(`/admin/clients/${clientSlug}`);
  });

  app.post('/admin/clients/:clientSlug/enable-public-link', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { clientSlug } = request.params as { clientSlug: string };
    try {
      const detail = await platformService.getClientAccess(database.db, clientSlug);
      const token = await authService.enablePublicToken(database.db, detail.access.id);
      storeIssuedSecret(request, `${clientSlug}:public`, token);
      setFlash(request, 'success', 'Public link enabled');
    } catch (error) {
      setFlash(request, 'error', error instanceof Error ? error.message : 'Failed to enable public link');
    }
    reply.redirect(`/admin/clients/${clientSlug}`);
  });

  app.post('/admin/clients/:clientSlug/rotate-public-link', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { clientSlug } = request.params as { clientSlug: string };
    try {
      const detail = await platformService.getClientAccess(database.db, clientSlug);
      await authService.disablePublicToken(database.db, detail.access.id);
      const token = await authService.enablePublicToken(database.db, detail.access.id);
      storeIssuedSecret(request, `${clientSlug}:public`, token);
      setFlash(request, 'success', 'Public link rotated');
    } catch (error) {
      setFlash(request, 'error', error instanceof Error ? error.message : 'Failed to rotate public link');
    }
    reply.redirect(`/admin/clients/${clientSlug}`);
  });

  app.post('/admin/clients/:clientSlug/disable-public-link', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { clientSlug } = request.params as { clientSlug: string };
    try {
      const detail = await platformService.getClientAccess(database.db, clientSlug);
      await authService.disablePublicToken(database.db, detail.access.id);
      setFlash(request, 'success', 'Public link disabled');
    } catch (error) {
      setFlash(request, 'error', error instanceof Error ? error.message : 'Failed to disable public link');
    }
    reply.redirect(`/admin/clients/${clientSlug}`);
  });

  app.get('/api/admin/clients', async (request, reply) => {
    if (!isAuthorizedApi(request)) return sendJson(reply, 401, { detail: 'Unauthorized' });
    const rows = await platformService.listClients(database.db);
    sendJson(reply, 200, { clients: rows });
  });

  app.post('/api/admin/clients', async (request, reply) => {
    if (!isAuthorizedApi(request)) return sendJson(reply, 401, { detail: 'Unauthorized' });
    const body = (request.body || {}) as Record<string, any>;
    try {
      const client = await platformService.createClient(database.db, {
        slug: String(body.slug || ''),
        displayName: String(body.display_name || body.displayName || ''),
        description: String(body.description || ''),
      });
      sendJson(reply, 201, { client });
    } catch (error) {
      sendJson(reply, 400, { detail: error instanceof Error ? error.message : 'Failed to create client' });
    }
  });

  app.patch('/api/admin/clients/:clientSlug', async (request, reply) => {
    if (!isAuthorizedApi(request)) return sendJson(reply, 401, { detail: 'Unauthorized' });
    const { clientSlug } = request.params as { clientSlug: string };
    const body = (request.body || {}) as Record<string, any>;
    try {
      const client = await platformService.updateClient(database.db, clientSlug, {
        displayName:
          body.display_name !== undefined || body.displayName !== undefined
            ? String(body.display_name ?? body.displayName ?? '')
            : undefined,
        description: body.description !== undefined ? String(body.description || '') : undefined,
        status: body.status !== undefined ? String(body.status) : undefined,
      });
      sendJson(reply, 200, { client });
    } catch (error) {
      sendJson(reply, 400, { detail: error instanceof Error ? error.message : 'Failed to update client' });
    }
  });

  app.delete('/api/admin/clients/:clientSlug', async (request, reply) => {
    if (!isAuthorizedApi(request)) return sendJson(reply, 401, { detail: 'Unauthorized' });
    const { clientSlug } = request.params as { clientSlug: string };
    try {
      await platformService.deleteClient(database.db, clientSlug);
      sendJson(reply, 200, { deleted: true });
    } catch (error) {
      sendJson(reply, 400, { detail: error instanceof Error ? error.message : 'Failed to delete client' });
    }
  });

  app.get('/api/admin/sources', async (request, reply) => {
    if (!isAuthorizedApi(request)) return sendJson(reply, 401, { detail: 'Unauthorized' });
    const rows = await platformService.listSources(database.db);
    sendJson(reply, 200, { sources: rows });
  });

  app.post('/api/admin/sources', async (request, reply) => {
    if (!isAuthorizedApi(request)) return sendJson(reply, 401, { detail: 'Unauthorized' });
    const body = (request.body || {}) as Record<string, any>;
    try {
      const source = await platformService.saveSource(database.db, {
        slug: String(body.slug || ''),
        displayName: String(body.display_name || body.displayName || ''),
        apiToken: String(body.api_token || body.apiToken || ''),
        projectLabel: String(body.project_label || body.projectLabel || ''),
        siteUrl: String(body.site_url || body.siteUrl || ''),
        status: String(body.status || 'active'),
      });
      sendJson(reply, 201, { source });
    } catch (error) {
      sendJson(reply, 400, { detail: error instanceof Error ? error.message : 'Failed to create source' });
    }
  });

  app.patch('/api/admin/sources/:sourceSlug', async (request, reply) => {
    if (!isAuthorizedApi(request)) return sendJson(reply, 401, { detail: 'Unauthorized' });
    const { sourceSlug } = request.params as { sourceSlug: string };
    const body = (request.body || {}) as Record<string, any>;
    try {
      const source = await platformService.getSourceBySlug(database.db, sourceSlug);
      const updated = await platformService.saveSource(
        database.db,
        {
          slug: String(body.slug || source.slug),
          displayName: String(body.display_name || body.displayName || source.displayName),
          apiToken: body.api_token ?? body.apiToken,
          projectLabel: body.project_label ?? body.projectLabel ?? source.projectLabel ?? '',
          siteUrl: body.site_url ?? body.siteUrl ?? source.siteUrl ?? '',
          status: String(body.status || source.status),
        },
        source.id
      );
      sendJson(reply, 200, { source: updated });
    } catch (error) {
      sendJson(reply, 400, { detail: error instanceof Error ? error.message : 'Failed to update source' });
    }
  });

  app.delete('/api/admin/sources/:sourceSlug', async (request, reply) => {
    if (!isAuthorizedApi(request)) return sendJson(reply, 401, { detail: 'Unauthorized' });
    const { sourceSlug } = request.params as { sourceSlug: string };
    try {
      await platformService.deleteSource(database.db, sourceSlug);
      sendJson(reply, 200, { deleted: true });
    } catch (error) {
      sendJson(reply, 400, { detail: error instanceof Error ? error.message : 'Failed to delete source' });
    }
  });

  app.post('/api/admin/clients/:clientSlug/source-links', async (request, reply) => {
    if (!isAuthorizedApi(request)) return sendJson(reply, 401, { detail: 'Unauthorized' });
    const { clientSlug } = request.params as { clientSlug: string };
    const body = (request.body || {}) as Record<string, any>;
    const sourceSlug = String(body.source_slug || body.sourceSlug || '');
    try {
      const link = await platformService.upsertClientSourceLink(database.db, clientSlug, sourceSlug, {
        enabled: body.enabled !== undefined ? Boolean(body.enabled) : true,
        status: String(body.status || 'active'),
      });
      await platformService.validateDefaultSourceRule(database.db, link.clientAccessId);
      sendJson(reply, 201, { link });
    } catch (error) {
      sendJson(reply, 400, { detail: error instanceof Error ? error.message : 'Failed to link source' });
    }
  });

  app.patch('/api/admin/clients/:clientSlug/source-links/:sourceSlug', async (request, reply) => {
    if (!isAuthorizedApi(request)) return sendJson(reply, 401, { detail: 'Unauthorized' });
    const { clientSlug, sourceSlug } = request.params as { clientSlug: string; sourceSlug: string };
    const body = (request.body || {}) as Record<string, any>;
    try {
      const link = await platformService.upsertClientSourceLink(database.db, clientSlug, sourceSlug, {
        enabled: body.enabled !== undefined ? Boolean(body.enabled) : undefined,
        status: body.status !== undefined ? String(body.status) : undefined,
      });
      await platformService.validateDefaultSourceRule(database.db, link.clientAccessId);
      sendJson(reply, 200, { link });
    } catch (error) {
      sendJson(reply, 400, { detail: error instanceof Error ? error.message : 'Failed to update source link' });
    }
  });

  app.post('/api/admin/clients/:clientSlug/rotate-bearer', async (request, reply) => {
    if (!isAuthorizedApi(request)) return sendJson(reply, 401, { detail: 'Unauthorized' });
    const { clientSlug } = request.params as { clientSlug: string };
    try {
      const detail = await platformService.getClientAccess(database.db, clientSlug);
      const token = await authService.rotateBearerToken(database.db, detail.access.id);
      sendJson(reply, 200, { token });
    } catch (error) {
      sendJson(reply, 400, { detail: error instanceof Error ? error.message : 'Failed to rotate bearer token' });
    }
  });

  app.post('/api/admin/clients/:clientSlug/public-token/enable', async (request, reply) => {
    if (!isAuthorizedApi(request)) return sendJson(reply, 401, { detail: 'Unauthorized' });
    const { clientSlug } = request.params as { clientSlug: string };
    try {
      const detail = await platformService.getClientAccess(database.db, clientSlug);
      const token = await authService.enablePublicToken(database.db, detail.access.id);
      sendJson(reply, 200, { token, url: platformService.buildMcpUrls(clientSlug, token).publicUrl });
    } catch (error) {
      sendJson(reply, 400, { detail: error instanceof Error ? error.message : 'Failed to enable public token' });
    }
  });

  app.post('/api/admin/clients/:clientSlug/public-token/disable', async (request, reply) => {
    if (!isAuthorizedApi(request)) return sendJson(reply, 401, { detail: 'Unauthorized' });
    const { clientSlug } = request.params as { clientSlug: string };
    try {
      const detail = await platformService.getClientAccess(database.db, clientSlug);
      await authService.disablePublicToken(database.db, detail.access.id);
      sendJson(reply, 200, { disabled: true });
    } catch (error) {
      sendJson(reply, 400, { detail: error instanceof Error ? error.message : 'Failed to disable public token' });
    }
  });

  app.post('/api/admin/sources/:sourceSlug/validate', async (request, reply) => {
    if (!isAuthorizedApi(request)) return sendJson(reply, 401, { detail: 'Unauthorized' });
    const { sourceSlug } = request.params as { sourceSlug: string };
    const body = (request.body || {}) as Record<string, any>;
    const clientSlug =
      typeof body.client_slug === 'string'
        ? body.client_slug
        : typeof body.clientSlug === 'string'
          ? body.clientSlug
          : null;
    try {
      const source = clientSlug
        ? await platformService.getDecryptedSourceForClient(database.db, clientSlug, sourceSlug)
        : (() => {
            throw new Error('client_slug is required to validate a source');
          })();
      await clarityModule.testSource(database.db, source);
      await platformService.markSourceValidation(database.db, clientSlug, sourceSlug, { ok: true });
      await auditService.recordForSource(database.db, {
        clientSlug,
        sourceId: source.sourceId,
        authMode: 'admin',
        toolName: 'validate_source',
        status: 'ok',
        payload: { validated: true },
      });
      sendJson(reply, 200, { validated: true });
    } catch (error) {
      const source = await platformService.getSourceBySlug(database.db, sourceSlug).catch(() => null);
      if (source) {
        await auditService.recordForSource(database.db, {
          clientSlug,
          sourceId: source.id,
          authMode: 'admin',
          toolName: 'validate_source',
          status: 'error',
          payload: { message: error instanceof Error ? error.message : 'Source validation failed' },
        });
      }
      sendJson(reply, 400, {
        detail: error instanceof Error ? error.message : 'Source validation failed',
      });
    }
  });

  app.post('/mcp/clarity/clients/:clientSlug', async (request, reply) => {
    const { clientSlug } = request.params as { clientSlug: string };
    try {
      const auth = await authService.authenticateClientRequest(database.db, {
        clientSlug,
        headers: request.headers as Record<string, string | undefined>,
        body: (request.body || {}) as Record<string, unknown>,
      });
      const server = buildStreamableMcpServer({
        module: clarityModule,
        auth,
        request,
        services: { db: database.db },
      });
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await server.connect(transport);
      reply.hijack();
      await transport.handleRequest(request.raw, reply.raw, request.body);
      await transport.close();
      await server.close();
    } catch (error) {
      reply.code(401).send({ detail: error instanceof Error ? error.message : 'Unauthorized' });
    }
  });

  app.post('/mcp/clarity/public/:publicToken', async (request, reply) => {
    const { publicToken } = request.params as { publicToken: string };
    try {
      const auth = await authService.authenticateClientRequest(database.db, {
        publicToken,
        headers: request.headers as Record<string, string | undefined>,
        body: (request.body || {}) as Record<string, unknown>,
      });
      const server = buildStreamableMcpServer({
        module: clarityModule,
        auth,
        request,
        services: { db: database.db },
      });
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await server.connect(transport);
      reply.hijack();
      await transport.handleRequest(request.raw, reply.raw, request.body);
      await transport.close();
      await server.close();
    } catch (error) {
      reply.code(401).send({ detail: error instanceof Error ? error.message : 'Unauthorized' });
    }
  });

  app.get('/mcp/clarity/clients/:clientSlug', async (_request, reply) => {
    reply.code(405).header('Allow', 'POST').send('Method Not Allowed');
  });
  app.delete('/mcp/clarity/clients/:clientSlug', async (_request, reply) => {
    reply.code(405).header('Allow', 'POST').send('Method Not Allowed');
  });
  app.get('/mcp/clarity/public/:publicToken', async (_request, reply) => {
    reply.code(405).header('Allow', 'POST').send('Method Not Allowed');
  });
  app.delete('/mcp/clarity/public/:publicToken', async (_request, reply) => {
    reply.code(405).header('Allow', 'POST').send('Method Not Allowed');
  });

  return app;
}
