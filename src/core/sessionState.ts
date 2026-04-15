import { and, eq } from 'drizzle-orm';
import {
  clientSessions,
  type ClientAccessRow,
  type ClientSessionRow,
} from '../db/schema.js';

export class SessionStateService {
  async getOrCreate(
    db: any,
    access: ClientAccessRow,
    sessionKey: string
  ): Promise<ClientSessionRow> {
    const existing = await db.query.clientSessions.findFirst({
      where: and(
        eq(clientSessions.clientAccessId, access.id),
        eq(clientSessions.sessionKey, sessionKey)
      ),
    });
    if (existing) return existing;

    const inserted = await db
      .insert(clientSessions)
      .values({
        clientAccessId: access.id,
        sessionKey,
        activeSourceId: access.defaultSourceId ?? null,
      })
      .returning();
    return inserted[0]!;
  }

  async updateActiveSource(
    db: any,
    clientAccessId: number,
    sessionKey: string,
    activeSourceId: number | null
  ): Promise<void> {
    await db
      .update(clientSessions)
      .set({ activeSourceId, updatedAt: new Date() })
      .where(
        and(
          eq(clientSessions.clientAccessId, clientAccessId),
          eq(clientSessions.sessionKey, sessionKey)
        )
      );
  }
}
