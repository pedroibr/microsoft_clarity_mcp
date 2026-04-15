import { SessionStateService } from '../core/sessionState.js';
import { AuditService, sanitizeAuditPayload } from '../core/audit.js';
import { textToolResult } from '../core/toolHelpers.js';
import type {
  ClarityModule,
  RequestAuthContext,
  ToolAccess,
} from '../types.js';

const DEFAULT_PROTOCOL_VERSION = '2024-11-05';
const auditService = new AuditService();
const sessionStateService = new SessionStateService();

interface Services {
  db: any;
}

const SOURCE_CONTEXT_TOOLS = [
  {
    name: 'get_active_source',
    description: 'Return the active Clarity source for this session.',
    access: 'read' as ToolAccess,
    inputSchema: { type: 'object', additionalProperties: false },
  },
  {
    name: 'list_accessible_sources',
    description: 'List the available Clarity sources for this client.',
    access: 'read' as ToolAccess,
    inputSchema: { type: 'object', additionalProperties: false },
  },
  {
    name: 'set_active_source',
    description: 'Switch the active Clarity source for this session.',
    access: 'write' as ToolAccess,
    inputSchema: {
      type: 'object',
      properties: {
        source_slug: { type: 'string' },
        query: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'clear_active_source',
    description: 'Reset the active source back to the client default.',
    access: 'write' as ToolAccess,
    inputSchema: { type: 'object', additionalProperties: false },
  },
];

export async function handleMcpRequest(
  body: any,
  module: ClarityModule,
  auth: RequestAuthContext,
  services: Services
) {
  const id = body.id ?? null;
  const method = body.method;

  if (!method) return jsonRpcError(id, -32600, 'Missing method');

  if (method === 'initialize') {
    return jsonRpcResult(id, {
      protocolVersion: DEFAULT_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: `${module.pathSlug}-mcp`, version: '0.1.0' },
      instructions:
        'Use the Microsoft Clarity tools exposed for this client and switch sources when needed.',
    });
  }

  if (method === 'tools/list') {
    return jsonRpcResult(id, {
      tools: listVisibleTools(module, auth).map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: buildAnnotations(tool.access),
      })),
    });
  }

  if (method === 'tools/call') {
    const params =
      typeof body.params === 'object' && body.params && !Array.isArray(body.params)
        ? (body.params as Record<string, unknown>)
        : {};
    return handleToolCall(id, params, module, auth, services);
  }

  return jsonRpcError(id, -32601, `Method not found: ${method}`);
}

async function handleToolCall(
  id: string | number | null,
  params: Record<string, unknown>,
  module: ClarityModule,
  auth: RequestAuthContext,
  services: Services
) {
  const toolName = typeof params.name === 'string' ? params.name : '';
  const args =
    typeof params.arguments === 'object' && params.arguments && !Array.isArray(params.arguments)
      ? (params.arguments as Record<string, unknown>)
      : {};
  if (!toolName) return jsonRpcError(id, -32602, 'params.name is required');

  const contextTool = SOURCE_CONTEXT_TOOLS.find((tool) => tool.name === toolName);
  if (contextTool) {
    try {
      const result = await executeSourceContextTool(toolName, args, auth, services);
      await auditService.record(services.db, auth, toolName, 'ok', result);
      return jsonRpcResult(id, textToolResult(result));
    } catch (error) {
      return jsonRpcError(id, -32000, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  const tool = module.tools.find((item) => item.name === toolName);
  if (!tool) return jsonRpcError(id, -32601, `Tool not found: ${toolName}`);
  if (!isToolAllowed(tool.access, auth)) {
    return jsonRpcError(id, -32000, `Tool ${toolName} is blocked for this client`);
  }

  try {
    const result = await tool.execute({ request: {} as any, auth, db: services.db }, args);
    await auditService.record(services.db, auth, toolName, 'ok', {
      source_id: auth.currentSource.sourceId,
      args: sanitizeAuditPayload(args),
    });
    return jsonRpcResult(id, result);
  } catch (error) {
    await auditService.record(services.db, auth, toolName, 'error', {
      message: error instanceof Error ? error.message : 'Unknown error',
      args: sanitizeAuditPayload(args),
    });
    return jsonRpcError(id, -32000, error instanceof Error ? error.message : 'Unknown error');
  }
}

function listVisibleTools(module: ClarityModule, auth: RequestAuthContext) {
  const canSwitch = auth.allowedSources.length > 1;
  const appTools = module.tools.filter((tool) => isToolAllowed(tool.access, auth));
  const contextTools = SOURCE_CONTEXT_TOOLS.filter((tool) =>
    tool.name === 'get_active_source' ? true : canSwitch
  );
  return [...contextTools, ...appTools];
}

function isToolAllowed(access: ToolAccess, auth: RequestAuthContext) {
  if (access === 'read') return auth.clientAccess.readEnabled;
  if (access === 'write') return auth.clientAccess.writeEnabled;
  return auth.clientAccess.deleteEnabled;
}

async function executeSourceContextTool(
  toolName: string,
  args: Record<string, unknown>,
  auth: RequestAuthContext,
  services: Services
) {
  const canSwitch = auth.allowedSources.length > 1;

  if (toolName === 'get_active_source') {
    return {
      client_slug: auth.clientSlug,
      session_key: auth.sessionKey,
      can_switch_source: canSwitch,
      default_source_id: auth.defaultSourceId,
      active_source: serializeSource(auth.currentSource),
    };
  }

  if (!canSwitch) {
    throw new Error('This client does not expose source-switching tools');
  }

  if (toolName === 'list_accessible_sources') {
    return {
      active_source_id: auth.currentSource.sourceId,
      sources: auth.allowedSources.map(serializeSource),
    };
  }

  if (toolName === 'set_active_source') {
    const requestedSlug =
      typeof args.source_slug === 'string' && args.source_slug.trim() ? args.source_slug.trim() : null;
    const query = typeof args.query === 'string' && args.query.trim() ? args.query.trim().toLowerCase() : null;
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
        return {
          resolved: false,
          query,
          candidates: matches.map(serializeSource),
        };
      }
      target = matches[0];
    }

    if (!target) throw new Error('source_slug or a uniquely matching query is required');

    await sessionStateService.updateActiveSource(
      services.db,
      auth.clientAccess.id,
      auth.sessionKey,
      target.sourceId
    );
    return {
      resolved: true,
      active_source: serializeSource(target),
      session_key: auth.sessionKey,
    };
  }

  if (toolName === 'clear_active_source') {
    await sessionStateService.updateActiveSource(
      services.db,
      auth.clientAccess.id,
      auth.sessionKey,
      auth.defaultSourceId
    );
    const fallback =
      auth.allowedSources.find((item) => item.sourceId === auth.defaultSourceId) || null;
    return {
      resolved: true,
      active_source: fallback ? serializeSource(fallback) : null,
      session_key: auth.sessionKey,
    };
  }

  throw new Error(`Unknown source context tool: ${toolName}`);
}

function serializeSource(source: {
  sourceId: number;
  sourceSlug: string;
  sourceDisplayName: string;
  projectLabel: string | null;
  siteUrl: string | null;
  sourceStatus?: string;
}) {
  return {
    id: source.sourceId,
    slug: source.sourceSlug,
    display_name: source.sourceDisplayName,
    project_label: source.projectLabel,
    site_url: source.siteUrl,
    status: source.sourceStatus ?? 'active',
  };
}

function buildAnnotations(access: ToolAccess) {
  return {
    readOnlyHint: access === 'read',
    destructiveHint: access === 'delete',
    idempotentHint: access !== 'delete',
  };
}

function jsonRpcResult(id: string | number | null, result: unknown) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id: string | number | null, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}
