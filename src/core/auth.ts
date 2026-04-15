import { and, eq } from 'drizzle-orm';
import { decryptSecret, hashToken, issueToken } from './crypto.js';
import { clientAccess, clients } from '../db/schema.js';
import type {
  AuthMode,
  DecryptedClaritySourceAccess,
  RequestAuthContext,
  ResolvedClaritySourceAccess,
} from '../types.js';
import type { AppConfig } from '../config.js';
import { SessionStateService } from './sessionState.js';
import { PlatformService } from './platformService.js';

export class ClientAuthService {
  private readonly platformService: PlatformService;

  constructor(
    private readonly config: AppConfig,
    private readonly sessionStateService = new SessionStateService()
  ) {
    this.platformService = new PlatformService(config);
  }

  async authenticateClientRequest(
    db: any,
    params: {
      clientSlug?: string;
      publicToken?: string;
      headers: Record<string, string | undefined>;
      body: Record<string, unknown>;
    }
  ): Promise<RequestAuthContext> {
    if (params.clientSlug) return this.authenticateBearer(db, params);
    if (params.publicToken) return this.authenticatePublic(db, params);
    throw new Error('Missing client or public token');
  }

  async rotateBearerToken(db: any, clientAccessId: number): Promise<string> {
    const token = issueToken('cmcp');
    await db
      .update(clientAccess)
      .set({
        bearerTokenHash: hashToken(token, this.config.clientTokenSalt),
        updatedAt: new Date(),
      })
      .where(eq(clientAccess.id, clientAccessId));
    return token;
  }

  async enablePublicToken(db: any, clientAccessId: number): Promise<string> {
    const token = issueToken('public');
    await db
      .update(clientAccess)
      .set({
        publicEnabled: true,
        publicTokenHash: hashToken(token, this.config.clientTokenSalt),
        updatedAt: new Date(),
      })
      .where(eq(clientAccess.id, clientAccessId));
    return token;
  }

  async disablePublicToken(db: any, clientAccessId: number): Promise<void> {
    await db
      .update(clientAccess)
      .set({
        publicEnabled: false,
        publicTokenHash: null,
        updatedAt: new Date(),
      })
      .where(eq(clientAccess.id, clientAccessId));
  }

  private async authenticateBearer(
    db: any,
    params: {
      clientSlug?: string;
      headers: Record<string, string | undefined>;
      body: Record<string, unknown>;
    }
  ) {
    const clientSlug = params.clientSlug!;
    const authHeader = params.headers.authorization || params.headers.Authorization;
    if (!authHeader?.toLowerCase().startsWith('bearer ')) {
      throw new Error('Missing bearer token');
    }
    const token = authHeader.split(' ', 2)[1]!;
    const row = await this.loadClientAccessBySlug(db, clientSlug);
    if (row.client.status !== 'active') throw new Error('Client is disabled');
    if (!row.access.enabled || row.access.status !== 'active') {
      throw new Error('Client access is disabled');
    }
    if (!row.access.bearerTokenHash) {
      throw new Error('Client has no bearer token configured');
    }
    if (hashToken(token, this.config.clientTokenSalt) !== row.access.bearerTokenHash) {
      throw new Error('Invalid bearer token');
    }
    return this.buildContext(db, row, 'bearer', params.headers, params.body);
  }

  private async authenticatePublic(
    db: any,
    params: {
      publicToken?: string;
      headers: Record<string, string | undefined>;
      body: Record<string, unknown>;
    }
  ) {
    const tokenHash = hashToken(params.publicToken!, this.config.clientTokenSalt);
    const rows = await db
      .select({ access: clientAccess, client: clients })
      .from(clientAccess)
      .innerJoin(clients, eq(clientAccess.clientId, clients.id))
      .where(
        and(
          eq(clientAccess.publicTokenHash, tokenHash),
          eq(clientAccess.publicEnabled, true)
        )
      )
      .limit(1);
    if (!rows[0]) throw new Error('Invalid public token');
    if (rows[0].client.status !== 'active') throw new Error('Client is disabled');
    if (!rows[0].access.enabled || rows[0].access.status !== 'active') {
      throw new Error('Client access is disabled');
    }
    return this.buildContext(db, rows[0], 'public', params.headers, params.body);
  }

  private async buildContext(
    db: any,
    row: { access: any; client: any },
    authMode: AuthMode,
    headers: Record<string, string | undefined>,
    body: Record<string, unknown>
  ): Promise<RequestAuthContext> {
    const allowedSources = await this.platformService.listEnabledSourcesForClient(db, row.client.slug);
    if (allowedSources.length === 0) {
      throw new Error('No active sources available for this client');
    }

    const sessionKey = extractSessionKey(headers, body, authMode, row.client.slug);
    const session = await this.sessionStateService.getOrCreate(db, row.access, sessionKey);
    const defaultSourceId =
      row.access.defaultSourceId ?? (allowedSources.length === 1 ? allowedSources[0]!.sourceId : null);
    const currentSourceId = session.activeSourceId ?? defaultSourceId ?? allowedSources[0]!.sourceId;

    const current = allowedSources.find(
      (item: ResolvedClaritySourceAccess) => item.sourceId === currentSourceId
    );
    if (!current) throw new Error('Resolved source is not active');

    const currentSource: DecryptedClaritySourceAccess = {
      ...current,
      apiToken: decryptSecret(current.encryptedApiToken, this.config.credentialsEncryptionKey),
    };

    await db
      .update(clientAccess)
      .set({
        lastUsedAt: new Date(),
        lastPublicUsedAt: authMode === 'public' ? new Date() : row.access.lastPublicUsedAt,
        updatedAt: new Date(),
      })
      .where(eq(clientAccess.id, row.access.id));

    return {
      authMode,
      clientSlug: row.client.slug,
      clientAccess: row.access,
      allowedSources,
      defaultSourceId,
      currentSource,
      sessionKey,
    };
  }

  private async loadClientAccessBySlug(db: any, clientSlug: string) {
    const rows = await db
      .select({ access: clientAccess, client: clients })
      .from(clientAccess)
      .innerJoin(clients, eq(clientAccess.clientId, clients.id))
      .where(eq(clients.slug, clientSlug))
      .limit(1);
    if (!rows[0]) throw new Error('Unknown client access');
    return rows[0];
  }
}

function extractSessionKey(
  headers: Record<string, string | undefined>,
  body: Record<string, unknown>,
  authMode: AuthMode,
  clientSlug: string
) {
  const params =
    typeof body.params === 'object' && body.params && !Array.isArray(body.params)
      ? (body.params as Record<string, unknown>)
      : {};
  const meta =
    typeof params._meta === 'object' && params._meta && !Array.isArray(params._meta)
      ? (params._meta as Record<string, unknown>)
      : {};
  const fromHeader =
    headers['mcp-session-id'] ||
    headers['x-session-id'] ||
    headers['Mcp-Session-Id'] ||
    headers['X-Session-Id'];
  const fromBody =
    (typeof params.session_id === 'string' && params.session_id) ||
    (typeof params.sessionId === 'string' && params.sessionId) ||
    (typeof meta.session_id === 'string' && meta.session_id) ||
    (typeof meta.sessionId === 'string' && meta.sessionId);
  return fromHeader || fromBody || `implicit:${authMode}:${clientSlug}:clarity`;
}
