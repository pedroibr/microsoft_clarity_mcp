import { and, eq, sql } from 'drizzle-orm';
import type { AppConfig } from '../config.js';
import { decryptSecret, encryptSecret } from './crypto.js';
import {
  auditLogs,
  claritySources,
  clientAccess,
  clientSessions,
  clientSourceLinks,
  clients,
  type ClientAccessRow,
  type ClientRow,
  type ClientSourceLinkRow,
  type ClaritySourceRow,
} from '../db/schema.js';

export interface CreateClientInput {
  slug: string;
  displayName: string;
  description?: string;
}

export interface UpdateClientInput {
  displayName?: string;
  description?: string;
  status?: string;
}

export interface SaveSourceInput {
  slug: string;
  displayName: string;
  apiToken?: string;
  projectLabel?: string;
  siteUrl?: string;
  status?: string;
}

export interface UpsertClientAccessInput {
  enabled?: boolean;
  readEnabled?: boolean;
  writeEnabled?: boolean;
  deleteEnabled?: boolean;
  status?: string;
  defaultSourceId?: number | null;
}

export interface UpsertClientSourceLinkInput {
  enabled?: boolean;
  status?: string;
}

export interface SourceWithAccess {
  source: ClaritySourceRow;
  clientSourceLink: ClientSourceLinkRow | null;
}

function tokenHint(token: string | null | undefined) {
  if (!token) return null;
  const trimmed = token.trim();
  if (trimmed.length <= 8) return trimmed;
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

export class PlatformService {
  constructor(private readonly config: AppConfig) {}

  async listClients(db: any) {
    return db.select().from(clients).orderBy(clients.slug);
  }

  async createClient(db: any, input: CreateClientInput): Promise<ClientRow> {
    const inserted = await db
      .insert(clients)
      .values({
        slug: input.slug.trim(),
        displayName: input.displayName.trim(),
        description: input.description?.trim() || null,
      })
      .returning();
    const client = inserted[0]!;
    await this.ensureClientAccess(db, client.id);
    return client;
  }

  async updateClient(db: any, clientSlug: string, input: UpdateClientInput): Promise<ClientRow> {
    const rows = await db
      .update(clients)
      .set({
        ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description.trim() || null }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(clients.slug, clientSlug))
      .returning();
    if (!rows[0]) throw new Error('Unknown client');
    return rows[0]!;
  }

  async getClientBySlug(db: any, clientSlug: string): Promise<ClientRow> {
    const row = await db.query.clients.findFirst({ where: eq(clients.slug, clientSlug) });
    if (!row) throw new Error('Unknown client');
    return row;
  }

  async deleteClient(db: any, clientSlug: string): Promise<void> {
    const client = await this.getClientBySlug(db, clientSlug);
    const access = await db.query.clientAccess.findFirst({
      where: eq(clientAccess.clientId, client.id),
    });

    if (access) {
      await db.delete(clientSourceLinks).where(eq(clientSourceLinks.clientAccessId, access.id));
      await db.delete(clientSessions).where(eq(clientSessions.clientAccessId, access.id));
      await db.delete(clientAccess).where(eq(clientAccess.id, access.id));
    }

    await db.delete(auditLogs).where(eq(auditLogs.clientSlug, client.slug));
    await db.delete(clients).where(eq(clients.id, client.id));
  }

  async listSources(db: any): Promise<ClaritySourceRow[]> {
    return db.query.claritySources.findMany({
      orderBy: sql`${claritySources.slug} asc`,
    });
  }

  async getSourceBySlug(db: any, sourceSlug: string): Promise<ClaritySourceRow> {
    const row = await db.query.claritySources.findFirst({
      where: eq(claritySources.slug, sourceSlug),
    });
    if (!row) throw new Error('Unknown source');
    return row;
  }

  async saveSource(
    db: any,
    input: SaveSourceInput,
    existingSourceId?: number
  ): Promise<ClaritySourceRow> {
    const current = existingSourceId
      ? await db.query.claritySources.findFirst({ where: eq(claritySources.id, existingSourceId) })
      : null;

    const trimmedToken = input.apiToken?.trim() || null;
    const encryptedApiToken = trimmedToken
      ? encryptSecret(trimmedToken, this.config.credentialsEncryptionKey)
      : current?.encryptedApiToken;
    if (!encryptedApiToken) {
      throw new Error('API token is required');
    }

    const payload = {
      slug: input.slug.trim(),
      displayName: input.displayName.trim(),
      encryptedApiToken,
      tokenHint: tokenHint(trimmedToken) || current?.tokenHint || null,
      projectLabel: input.projectLabel?.trim() || null,
      siteUrl: input.siteUrl?.trim() || null,
      status: input.status ?? 'active',
      updatedAt: new Date(),
    };

    if (existingSourceId) {
      const rows = await db
        .update(claritySources)
        .set(payload)
        .where(eq(claritySources.id, existingSourceId))
        .returning();
      return rows[0]!;
    }

    const inserted = await db.insert(claritySources).values(payload).returning();
    return inserted[0]!;
  }

  async deleteSource(db: any, sourceSlug: string): Promise<void> {
    const source = await this.getSourceBySlug(db, sourceSlug);
    await db
      .update(clientAccess)
      .set({ defaultSourceId: null, updatedAt: new Date() })
      .where(eq(clientAccess.defaultSourceId, source.id));
    await db
      .update(clientSessions)
      .set({ activeSourceId: null, updatedAt: new Date() })
      .where(eq(clientSessions.activeSourceId, source.id));
    await db.delete(clientSourceLinks).where(eq(clientSourceLinks.sourceId, source.id));
    await db.delete(claritySources).where(eq(claritySources.id, source.id));
  }

  async ensureClientAccess(db: any, clientId: number): Promise<ClientAccessRow> {
    const existing = await db.query.clientAccess.findFirst({
      where: eq(clientAccess.clientId, clientId),
    });
    if (existing) return existing;
    const inserted = await db
      .insert(clientAccess)
      .values({
        clientId,
        enabled: false,
        readEnabled: true,
        writeEnabled: false,
        deleteEnabled: false,
        status: 'active',
      })
      .returning();
    return inserted[0]!;
  }

  async getClientAccess(db: any, clientSlug: string) {
    const rows = await db
      .select({ client: clients, access: clientAccess })
      .from(clientAccess)
      .innerJoin(clients, eq(clientAccess.clientId, clients.id))
      .where(eq(clients.slug, clientSlug))
      .limit(1);

    if (rows[0]) return rows[0];

    const client = await this.getClientBySlug(db, clientSlug);
    const access = await this.ensureClientAccess(db, client.id);
    return { client, access };
  }

  async upsertClientAccess(
    db: any,
    clientSlug: string,
    input: UpsertClientAccessInput
  ): Promise<ClientAccessRow> {
    const detail = await this.getClientAccess(db, clientSlug);
    const rows = await db
      .update(clientAccess)
      .set({
        enabled: input.enabled ?? detail.access.enabled,
        readEnabled: input.readEnabled ?? detail.access.readEnabled,
        writeEnabled: input.writeEnabled ?? detail.access.writeEnabled,
        deleteEnabled: input.deleteEnabled ?? detail.access.deleteEnabled,
        status: input.status ?? detail.access.status,
        defaultSourceId:
          input.defaultSourceId !== undefined ? input.defaultSourceId : detail.access.defaultSourceId,
        updatedAt: new Date(),
      })
      .where(eq(clientAccess.id, detail.access.id))
      .returning();
    return rows[0]!;
  }

  async upsertClientSourceLink(
    db: any,
    clientSlug: string,
    sourceSlug: string,
    input: UpsertClientSourceLinkInput
  ): Promise<ClientSourceLinkRow> {
    const detail = await this.getClientAccess(db, clientSlug);
    const source = await this.getSourceBySlug(db, sourceSlug);
    const current = await db.query.clientSourceLinks.findFirst({
      where: and(
        eq(clientSourceLinks.clientAccessId, detail.access.id),
        eq(clientSourceLinks.sourceId, source.id)
      ),
    });

    if (current) {
      const rows = await db
        .update(clientSourceLinks)
        .set({
          enabled: input.enabled ?? current.enabled,
          status: input.status ?? current.status,
          updatedAt: new Date(),
        })
        .where(eq(clientSourceLinks.id, current.id))
        .returning();
      return rows[0]!;
    }

    const inserted = await db
      .insert(clientSourceLinks)
      .values({
        clientAccessId: detail.access.id,
        sourceId: source.id,
        enabled: input.enabled ?? true,
        status: input.status ?? 'active',
      })
      .returning();
    return inserted[0]!;
  }

  async listSourcesWithAccess(db: any, clientAccessId: number): Promise<SourceWithAccess[]> {
    const sourceRows = await this.listSources(db);
    if (sourceRows.length === 0) return [];
    const accessRows: ClientSourceLinkRow[] = await db.query.clientSourceLinks.findMany({
      where: eq(clientSourceLinks.clientAccessId, clientAccessId),
    });
    const accessBySourceId = new Map(accessRows.map((item) => [item.sourceId, item]));
    return sourceRows.map((source) => ({
      source,
      clientSourceLink: accessBySourceId.get(source.id) || null,
    }));
  }

  async getDecryptedSourceForClient(db: any, clientSlug: string, sourceSlug: string) {
    const detail = await this.getClientAccess(db, clientSlug);
    const source = await this.getSourceBySlug(db, sourceSlug);
    const link = await db.query.clientSourceLinks.findFirst({
      where: and(
        eq(clientSourceLinks.clientAccessId, detail.access.id),
        eq(clientSourceLinks.sourceId, source.id)
      ),
    });
    if (!link) throw new Error('Source is not linked to this client');

    return {
      sourceId: source.id,
      sourceSlug: source.slug,
      sourceDisplayName: source.displayName,
      projectLabel: source.projectLabel,
      siteUrl: source.siteUrl,
      encryptedApiToken: source.encryptedApiToken,
      sourceStatus: source.status,
      lastValidatedAt: link.lastValidatedAt,
      lastValidationError: link.lastValidationError,
      apiToken: decryptSecret(source.encryptedApiToken, this.config.credentialsEncryptionKey),
    };
  }

  async markSourceValidation(
    db: any,
    clientSlug: string | null,
    sourceSlug: string,
    result: { ok: boolean; message?: string | null }
  ) {
    const source = await this.getSourceBySlug(db, sourceSlug);
    await db
      .update(claritySources)
      .set({
        lastValidatedAt: result.ok ? new Date() : null,
        lastValidationError: result.ok ? null : result.message || 'Validation failed',
        updatedAt: new Date(),
      })
      .where(eq(claritySources.id, source.id));

    if (!clientSlug) return;

    const detail = await this.getClientAccess(db, clientSlug);
    await this.upsertClientSourceLink(db, clientSlug, sourceSlug, {});
    await db
      .update(clientSourceLinks)
      .set({
        lastValidatedAt: result.ok ? new Date() : null,
        lastValidationError: result.ok ? null : result.message || 'Validation failed',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(clientSourceLinks.clientAccessId, detail.access.id),
          eq(clientSourceLinks.sourceId, source.id)
        )
      );
  }

  async listEnabledSourcesForClient(db: any, clientSlug: string) {
    const detail = await this.getClientAccess(db, clientSlug);
    const rows = await db
      .select({ source: claritySources, link: clientSourceLinks })
      .from(clientSourceLinks)
      .innerJoin(claritySources, eq(clientSourceLinks.sourceId, claritySources.id))
      .where(
        and(
          eq(clientSourceLinks.clientAccessId, detail.access.id),
          eq(claritySources.status, 'active'),
          eq(clientSourceLinks.enabled, true),
          eq(clientSourceLinks.status, 'active')
        )
      )
      .orderBy(sql`${claritySources.slug} asc`);

    return rows.map((row: any) => ({
      sourceId: row.source.id,
      sourceSlug: row.source.slug,
      sourceDisplayName: row.source.displayName,
      projectLabel: row.source.projectLabel,
      siteUrl: row.source.siteUrl,
      encryptedApiToken: row.source.encryptedApiToken,
      sourceStatus: row.source.status,
      lastValidatedAt: row.link.lastValidatedAt,
      lastValidationError: row.link.lastValidationError,
    }));
  }

  async validateDefaultSourceRule(db: any, clientAccessId: number): Promise<void> {
    const access = await db.query.clientAccess.findFirst({
      where: eq(clientAccess.id, clientAccessId),
    });
    if (!access) throw new Error('Unknown client access');

    const activeSources = await db
      .select({ sourceId: claritySources.id })
      .from(clientSourceLinks)
      .innerJoin(claritySources, eq(clientSourceLinks.sourceId, claritySources.id))
      .where(
        and(
          eq(clientSourceLinks.clientAccessId, access.id),
          eq(clientSourceLinks.enabled, true),
          eq(clientSourceLinks.status, 'active'),
          eq(claritySources.status, 'active')
        )
      )
      .orderBy(sql`${claritySources.slug} asc`);

    let nextDefault = access.defaultSourceId;
    if (activeSources.length === 0) {
      nextDefault = null;
    } else if (activeSources.length === 1) {
      nextDefault = activeSources[0]!.sourceId;
    } else if (!nextDefault) {
      nextDefault = activeSources[0]!.sourceId;
    }

    if (nextDefault && !activeSources.some((item: any) => item.sourceId === nextDefault)) {
      nextDefault = activeSources[0]?.sourceId ?? null;
    }

    if (nextDefault !== access.defaultSourceId) {
      await db
        .update(clientAccess)
        .set({ defaultSourceId: nextDefault, updatedAt: new Date() })
        .where(eq(clientAccess.id, clientAccessId));
    }
  }

  buildMcpUrls(clientSlug: string, publicToken?: string | null) {
    const base = this.config.appBaseUrl.replace(/\/+$/, '');
    return {
      authenticatedUrl: base ? `${base}/mcp/clarity/clients/${clientSlug}` : '',
      publicUrl: base && publicToken ? `${base}/mcp/clarity/public/${publicToken}` : '',
    };
  }
}
