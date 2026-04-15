import type { AppConfig } from '../../config.js';
import { AuditService } from '../../core/audit.js';
import type { DecryptedClaritySourceAccess } from '../../types.js';

type SortOption =
  | 'SessionStart_DESC'
  | 'SessionStart_ASC'
  | 'SessionDuration_ASC'
  | 'SessionDuration_DESC'
  | 'SessionClickCount_ASC'
  | 'SessionClickCount_DESC'
  | 'PageCount_ASC'
  | 'PageCount_DESC';

export class ClarityApiClient {
  private readonly auditService = new AuditService();

  constructor(private readonly config: AppConfig) {}

  async queryAnalyticsDashboard(
    db: any,
    source: DecryptedClaritySourceAccess,
    query: string,
    timezone: string
  ) {
    await this.assertWithinQuota(db, source.sourceId);
    return this.post(source, '/dashboard/query', {
      query,
      timezone,
    });
  }

  async listSessionRecordings(
    db: any,
    source: DecryptedClaritySourceAccess,
    params: {
      start: string;
      end: string;
      filters?: Record<string, unknown>;
      sortBy?: SortOption;
      count?: number;
    }
  ) {
    await this.assertWithinQuota(db, source.sourceId);
    return this.post(source, '/recordings/sample', {
      sortBy: params.sortBy || 'SessionStart_DESC',
      start: params.start,
      end: params.end,
      filters: params.filters || {},
      count: params.count ?? 100,
    });
  }

  async queryDocumentationResources(
    db: any,
    source: DecryptedClaritySourceAccess,
    query: string
  ) {
    await this.assertWithinQuota(db, source.sourceId);
    return this.post(source, '/documentation/query', { query });
  }

  async validateSource(db: any, source: DecryptedClaritySourceAccess) {
    await this.assertWithinQuota(db, source.sourceId);
    await this.post(source, '/dashboard/query', {
      query: 'Traffic last day',
      timezone: 'UTC',
    });
  }

  private async assertWithinQuota(db: any, sourceId: number) {
    const count = await this.auditService.countRemoteCallsForSourceToday(db, sourceId);
    if (count >= this.config.clarityDailyRequestLimit) {
      throw new Error(
        `Daily Clarity request limit reached for this source (${this.config.clarityDailyRequestLimit}/day)`
      );
    }
  }

  private async post(
    source: DecryptedClaritySourceAccess,
    path: string,
    payload: Record<string, unknown>
  ) {
    const response = await fetch(`${this.config.clarityApiBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${source.apiToken}`,
      },
      body: JSON.stringify(payload),
    });

    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      throw new Error(
        `Clarity request failed (${response.status}): ${
          typeof body === 'string' ? body : JSON.stringify(body)
        }`
      );
    }

    return body;
  }
}
