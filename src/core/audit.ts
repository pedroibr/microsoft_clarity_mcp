import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { auditLogs } from '../db/schema.js';
import type { RequestAuthContext } from '../types.js';

const REMOTE_TOOL_NAMES = [
  'query_analytics_dashboard',
  'list_session_recordings',
  'query_documentation_resources',
  'validate_source',
] as const;

export class AuditService {
  async record(
    db: any,
    context: RequestAuthContext,
    toolName: string,
    status: 'ok' | 'error',
    payload: Record<string, unknown>
  ) {
    await db.insert(auditLogs).values({
      clientSlug: context.clientSlug,
      sourceId: context.currentSource.sourceId,
      authMode: context.authMode,
      toolName,
      status,
      payloadJson: payload,
    });
  }

  async recordForSource(
    db: any,
    params: {
      clientSlug?: string | null;
      sourceId: number;
      authMode?: string | null;
      toolName: string;
      status: 'ok' | 'error';
      payload: Record<string, unknown>;
    }
  ) {
    await db.insert(auditLogs).values({
      clientSlug: params.clientSlug ?? null,
      sourceId: params.sourceId,
      authMode: params.authMode ?? null,
      toolName: params.toolName,
      status: params.status,
      payloadJson: params.payload,
    });
  }

  async countRemoteCallsForSourceToday(db: any, sourceId: number, now = new Date()) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.sourceId, sourceId),
          inArray(auditLogs.toolName, [...REMOTE_TOOL_NAMES]),
          gte(auditLogs.createdAt, start),
          lt(auditLogs.createdAt, end)
        )
      );

    return Number(rows[0]?.count || 0);
  }
}
