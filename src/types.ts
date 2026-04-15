import type { FastifyRequest } from 'fastify';
import type { ClientAccessRow } from './db/schema.js';

export type ToolAccess = 'read' | 'write' | 'delete';
export type AuthMode = 'bearer' | 'public';

export interface JsonSchema {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  enum?: string[];
}

export interface ToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

export interface ToolExecutionContext {
  request: FastifyRequest;
  auth: RequestAuthContext;
  db: any;
}

export interface ClarityToolDefinition {
  name: string;
  description: string;
  access: ToolAccess;
  inputSchema: JsonSchema;
  execute: (context: ToolExecutionContext, args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ClarityModule {
  pathSlug: 'clarity';
  displayName: string;
  tools: ClarityToolDefinition[];
  testSource: (db: any, source: DecryptedClaritySourceAccess) => Promise<void>;
}

export interface ResolvedClaritySourceAccess {
  sourceId: number;
  sourceSlug: string;
  sourceDisplayName: string;
  projectLabel: string | null;
  siteUrl: string | null;
  encryptedApiToken: string;
  sourceStatus: string;
  lastValidatedAt: Date | null;
  lastValidationError: string | null;
}

export interface DecryptedClaritySourceAccess extends ResolvedClaritySourceAccess {
  apiToken: string;
}

export interface RequestAuthContext {
  authMode: AuthMode;
  clientSlug: string;
  clientAccess: ClientAccessRow;
  allowedSources: ResolvedClaritySourceAccess[];
  defaultSourceId: number | null;
  currentSource: DecryptedClaritySourceAccess;
  sessionKey: string;
}
