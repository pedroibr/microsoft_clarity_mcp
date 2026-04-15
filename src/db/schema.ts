import {
  bigint,
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

export const clients = pgTable(
  'clients',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    slug: varchar('slug', { length: 128 }).notNull(),
    displayName: varchar('display_name', { length: 255 }).notNull(),
    description: text('description'),
    status: varchar('status', { length: 32 }).notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugIdx: uniqueIndex('clients_slug_idx').on(table.slug),
  })
);

export const claritySources = pgTable(
  'clarity_sources',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    slug: varchar('slug', { length: 128 }).notNull(),
    displayName: varchar('display_name', { length: 255 }).notNull(),
    encryptedApiToken: text('encrypted_api_token').notNull(),
    tokenHint: varchar('token_hint', { length: 32 }),
    projectLabel: varchar('project_label', { length: 255 }),
    siteUrl: text('site_url'),
    status: varchar('status', { length: 32 }).notNull().default('active'),
    lastValidatedAt: timestamp('last_validated_at', { withTimezone: true }),
    lastValidationError: text('last_validation_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugIdx: uniqueIndex('clarity_sources_slug_idx').on(table.slug),
  })
);

export const clientAccess = pgTable(
  'client_access',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    clientId: bigint('client_id', { mode: 'number' }).notNull(),
    enabled: boolean('enabled').notNull().default(true),
    readEnabled: boolean('read_enabled').notNull().default(true),
    writeEnabled: boolean('write_enabled').notNull().default(false),
    deleteEnabled: boolean('delete_enabled').notNull().default(false),
    status: varchar('status', { length: 32 }).notNull().default('active'),
    defaultSourceId: bigint('default_source_id', { mode: 'number' }),
    bearerTokenHash: varchar('bearer_token_hash', { length: 255 }),
    publicTokenHash: varchar('public_token_hash', { length: 255 }),
    publicEnabled: boolean('public_enabled').notNull().default(false),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    lastPublicUsedAt: timestamp('last_public_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    clientIdx: uniqueIndex('client_access_client_id_idx').on(table.clientId),
    publicTokenIdx: uniqueIndex('client_access_public_token_idx').on(table.publicTokenHash),
  })
);

export const clientSourceLinks = pgTable(
  'client_source_links',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    clientAccessId: bigint('client_access_id', { mode: 'number' }).notNull(),
    sourceId: bigint('source_id', { mode: 'number' }).notNull(),
    enabled: boolean('enabled').notNull().default(true),
    status: varchar('status', { length: 32 }).notNull().default('active'),
    lastValidatedAt: timestamp('last_validated_at', { withTimezone: true }),
    lastValidationError: text('last_validation_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    linkIdx: uniqueIndex('client_source_links_unique_idx').on(table.clientAccessId, table.sourceId),
  })
);

export const clientSessions = pgTable(
  'client_sessions',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    clientAccessId: bigint('client_access_id', { mode: 'number' }).notNull(),
    sessionKey: varchar('session_key', { length: 255 }).notNull(),
    activeSourceId: bigint('active_source_id', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sessionIdx: uniqueIndex('client_sessions_unique_idx').on(table.clientAccessId, table.sessionKey),
  })
);

export const auditLogs = pgTable('audit_logs', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  clientSlug: varchar('client_slug', { length: 128 }),
  sourceId: bigint('source_id', { mode: 'number' }),
  authMode: varchar('auth_mode', { length: 32 }),
  toolName: varchar('tool_name', { length: 255 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('ok'),
  payloadJson: jsonb('payload_json').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ClientRow = typeof clients.$inferSelect;
export type ClaritySourceRow = typeof claritySources.$inferSelect;
export type ClientAccessRow = typeof clientAccess.$inferSelect;
export type ClientSourceLinkRow = typeof clientSourceLinks.$inferSelect;
export type ClientSessionRow = typeof clientSessions.$inferSelect;
export type AuditLogRow = typeof auditLogs.$inferSelect;
