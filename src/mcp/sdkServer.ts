import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FastifyRequest } from 'fastify';
import { AuditService, sanitizeAuditPayload } from '../core/audit.js';
import { textToolResult } from '../core/toolHelpers.js';
import type {
  ClarityModule,
  RequestAuthContext,
  ResolvedClaritySourceAccess,
  ToolAccess,
} from '../types.js';
import { jsonSchemaToZod } from './schemaToZod.js';

const auditService = new AuditService();

interface Services {
  db: any;
}

export function buildStreamableMcpServer({
  module,
  auth,
  request,
  services,
}: {
  module: ClarityModule;
  auth: RequestAuthContext;
  request: FastifyRequest;
  services: Services;
}) {
  const server = new McpServer(
    {
      name: `${module.pathSlug}-mcp`,
      version: '0.1.0',
    },
    {
      capabilities: { logging: {} },
    }
  );

  server.registerTool(
    'get_active_source',
    {
      description: 'Return the active Clarity source for this client.',
      inputSchema: jsonSchemaToZod({ type: 'object', additionalProperties: false }),
      annotations: buildAnnotations('read'),
    },
    async () => {
      const result = {
        client_slug: auth.clientSlug,
        active_source: serializeSource(auth.currentSource),
      };
      await auditService.record(services.db, auth, 'get_active_source', 'ok', result);
      return textToolResult(result) as any;
    }
  );

  const canSwitch = auth.allowedSources.length > 1;

  if (canSwitch) {
    server.registerTool(
      'list_accessible_sources',
      {
        description: 'List active Clarity sources available for this client.',
        inputSchema: jsonSchemaToZod({ type: 'object', additionalProperties: false }),
        annotations: buildAnnotations('read'),
      },
      async () => {
        const result = {
          active_source_id: auth.currentSource.sourceId,
          sources: auth.allowedSources.map(serializeSource),
        };
        await auditService.record(services.db, auth, 'list_accessible_sources', 'ok', result);
        return textToolResult(result) as any;
      }
    );

    server.registerTool(
      'set_active_source',
      {
        description: 'Switch the active Clarity source for this session.',
        inputSchema: jsonSchemaToZod({
          type: 'object',
          properties: {
            source_slug: { type: 'string' },
            query: { type: 'string' },
          },
          additionalProperties: false,
        }),
        annotations: buildAnnotations('write'),
      },
      async (args) => {
        const input = normalizeArgs(args);
        const requestedSlug =
          typeof input.source_slug === 'string' ? input.source_slug.trim() : '';
        const query = typeof input.query === 'string' ? input.query.trim().toLowerCase() : '';
        let target = requestedSlug
          ? auth.allowedSources.find((item) => item.sourceSlug === requestedSlug)
          : undefined;

        if (!target && query) {
          const matches = auth.allowedSources.filter(
            (item) =>
              item.sourceSlug.toLowerCase().includes(query) ||
              item.sourceDisplayName.toLowerCase().includes(query) ||
              (item.projectLabel || '').toLowerCase().includes(query) ||
              (item.siteUrl || '').toLowerCase().includes(query)
          );
          if (matches.length !== 1) {
            const unresolved = {
              resolved: false,
              query,
              candidates: matches.map(serializeSource),
            };
            await auditService.record(
              services.db,
              auth,
              'set_active_source',
              'ok',
              unresolved as any
            );
            return textToolResult(unresolved) as any;
          }
          target = matches[0];
        }

        if (!target) {
          throw new Error('source_slug or a uniquely matching query is required');
        }

        const { SessionStateService } = await import('../core/sessionState.js');
        const sessionStateService = new SessionStateService();
        await sessionStateService.updateActiveSource(
          services.db,
          auth.clientAccess.id,
          auth.sessionKey,
          target.sourceId
        );
        const result = {
          resolved: true,
          active_source: serializeSource(target),
          session_key: auth.sessionKey,
        };
        await auditService.record(services.db, auth, 'set_active_source', 'ok', result);
        return textToolResult(result) as any;
      }
    );

    server.registerTool(
      'clear_active_source',
      {
        description: 'Reset the active source back to the client default.',
        inputSchema: jsonSchemaToZod({ type: 'object', additionalProperties: false }),
        annotations: buildAnnotations('write'),
      },
      async () => {
        const { SessionStateService } = await import('../core/sessionState.js');
        const sessionStateService = new SessionStateService();
        await sessionStateService.updateActiveSource(
          services.db,
          auth.clientAccess.id,
          auth.sessionKey,
          auth.defaultSourceId
        );
        const fallback =
          auth.allowedSources.find((item) => item.sourceId === auth.defaultSourceId) || null;
        const result = {
          resolved: true,
          active_source: fallback ? serializeSource(fallback) : null,
          session_key: auth.sessionKey,
        };
        await auditService.record(services.db, auth, 'clear_active_source', 'ok', result);
        return textToolResult(result) as any;
      }
    );
  }

  for (const tool of module.tools.filter((item) => isToolAllowed(item.access, auth))) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: jsonSchemaToZod(tool.inputSchema),
        annotations: buildAnnotations(tool.access),
      },
      async (args) => {
        const input = normalizeArgs(args);
        try {
          const result = await tool.execute({ request, auth, db: services.db }, input);
          await auditService.record(services.db, auth, tool.name, 'ok', {
            source_id: auth.currentSource.sourceId,
            args: sanitizeAuditPayload(input),
          });
          return result as any;
        } catch (error) {
          await auditService.record(services.db, auth, tool.name, 'error', {
            message: error instanceof Error ? error.message : 'Unknown error',
            args: sanitizeAuditPayload(input),
          });
          return textToolResult(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            true
          ) as any;
        }
      }
    );
  }

  return server;
}

function normalizeArgs(args: unknown): Record<string, unknown> {
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  return {};
}

function isToolAllowed(access: ToolAccess, auth: RequestAuthContext) {
  if (access === 'read') return auth.clientAccess.readEnabled;
  if (access === 'write') return auth.clientAccess.writeEnabled;
  return auth.clientAccess.deleteEnabled;
}

function buildAnnotations(access: ToolAccess) {
  return {
    readOnlyHint: access === 'read',
    destructiveHint: access === 'delete',
    idempotentHint: access !== 'delete',
  };
}

function serializeSource(source: ResolvedClaritySourceAccess) {
  return {
    id: source.sourceId,
    slug: source.sourceSlug,
    display_name: source.sourceDisplayName,
    project_label: source.projectLabel,
    site_url: source.siteUrl,
    status: source.sourceStatus,
  };
}
