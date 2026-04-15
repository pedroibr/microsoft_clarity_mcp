import { sql } from 'drizzle-orm';

type SqlExecutor = {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>;
};

async function ensureBaseSchema(db: SqlExecutor) {
  await db.execute(sql`
    create table if not exists clients (
      id bigint generated always as identity primary key,
      slug varchar(128) not null unique,
      display_name varchar(255) not null,
      description text,
      status varchar(32) not null default 'active',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create table if not exists clarity_sources (
      id bigint generated always as identity primary key,
      slug varchar(128) not null unique,
      display_name varchar(255) not null,
      encrypted_api_token text not null,
      token_hint varchar(32),
      project_label varchar(255),
      site_url text,
      status varchar(32) not null default 'active',
      last_validated_at timestamptz,
      last_validation_error text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create table if not exists client_access (
      id bigint generated always as identity primary key,
      client_id bigint not null unique,
      enabled boolean not null default true,
      read_enabled boolean not null default true,
      write_enabled boolean not null default false,
      delete_enabled boolean not null default false,
      status varchar(32) not null default 'active',
      default_source_id bigint,
      bearer_token_hash varchar(255),
      public_token_hash varchar(255) unique,
      public_enabled boolean not null default false,
      last_used_at timestamptz,
      last_public_used_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create table if not exists client_source_links (
      id bigint generated always as identity primary key,
      client_access_id bigint not null,
      source_id bigint not null,
      enabled boolean not null default true,
      status varchar(32) not null default 'active',
      last_validated_at timestamptz,
      last_validation_error text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (client_access_id, source_id)
    );
  `);

  await db.execute(sql`
    create table if not exists client_sessions (
      id bigint generated always as identity primary key,
      client_access_id bigint not null,
      session_key varchar(255) not null,
      active_source_id bigint,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (client_access_id, session_key)
    );
  `);

  await db.execute(sql`
    create table if not exists audit_logs (
      id bigint generated always as identity primary key,
      client_slug varchar(128),
      source_id bigint,
      auth_mode varchar(32),
      tool_name varchar(255) not null,
      status varchar(32) not null default 'ok',
      payload_json jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);
}

export async function bootstrapDatabase(db: SqlExecutor) {
  await ensureBaseSchema(db);
}
