import type { AppConfig } from '../../config.js';
import { textToolResult } from '../../core/toolHelpers.js';
import type { ClarityModule, ClarityToolDefinition, JsonSchema } from '../../types.js';
import { ClarityApiClient } from './api.js';

const analyticsQuerySchema: JsonSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description:
        'Natural language query for Clarity dashboard data. Keep it focused and include a time range when possible.',
    },
  },
  required: ['query'],
  additionalProperties: false,
};

const recordingsSchema: JsonSchema = {
  type: 'object',
  properties: {
    filters: {
      type: 'object',
      description:
        'Clarity recording filters. Include date.start and date.end in UTC ISO 8601, plus optional browser, device, country, and other filters.',
    },
    sortBy: {
      type: 'string',
      enum: [
        'SessionStart_DESC',
        'SessionStart_ASC',
        'SessionDuration_ASC',
        'SessionDuration_DESC',
        'SessionClickCount_ASC',
        'SessionClickCount_DESC',
        'PageCount_ASC',
        'PageCount_DESC',
      ],
    },
    count: {
      type: 'number',
      description: 'Maximum number of recordings to return. Clarity supports up to 250.',
    },
  },
  required: ['filters'],
  additionalProperties: false,
};

function tool(definition: Omit<ClarityToolDefinition, 'access'> & { access?: ClarityToolDefinition['access'] }) {
  return {
    access: definition.access ?? 'read',
    ...definition,
  };
}

export function createClarityModule(config: AppConfig): ClarityModule {
  const api = new ClarityApiClient(config);

  const tools: ClarityToolDefinition[] = [
    tool({
      name: 'query_analytics_dashboard',
      description:
        'Fetch Microsoft Clarity analytics data using a focused natural language query.',
      inputSchema: analyticsQuerySchema,
      async execute(context, args) {
        const query = typeof args.query === 'string' ? args.query.trim() : '';
        if (!query) throw new Error('query is required');
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        const data = await api.queryAnalyticsDashboard(
          context.db,
          context.auth.currentSource,
          query,
          timezone
        );
        return textToolResult(data);
      },
    }),
    tool({
      name: 'list_session_recordings',
      description:
        'List Clarity session recordings using structured filters and an explicit UTC date range.',
      inputSchema: recordingsSchema,
      async execute(context, args) {
        const filters =
          typeof args.filters === 'object' && args.filters && !Array.isArray(args.filters)
            ? (args.filters as Record<string, unknown>)
            : null;
        if (!filters) throw new Error('filters is required');
        const date =
          typeof filters.date === 'object' && filters.date && !Array.isArray(filters.date)
            ? (filters.date as Record<string, unknown>)
            : null;
        const start = typeof date?.start === 'string' ? date.start : '';
        const end = typeof date?.end === 'string' ? date.end : '';
        if (!start || !end) {
          throw new Error('filters.date.start and filters.date.end are required');
        }
        const count = typeof args.count === 'number' ? args.count : undefined;
        if (count !== undefined && (!Number.isFinite(count) || count <= 0 || count > 250)) {
          throw new Error('count must be between 1 and 250');
        }
        const sortBy = typeof args.sortBy === 'string' ? args.sortBy : undefined;
        const data = await api.listSessionRecordings(context.db, context.auth.currentSource, {
          start,
          end,
          filters,
          sortBy: sortBy as any,
          count,
        });
        return textToolResult(data);
      },
    }),
    tool({
      name: 'query_documentation_resources',
      description:
        'Fetch Microsoft Clarity documentation snippets for setup, troubleshooting, and feature questions.',
      inputSchema: analyticsQuerySchema,
      async execute(context, args) {
        const query = typeof args.query === 'string' ? args.query.trim() : '';
        if (!query) throw new Error('query is required');
        const data = await api.queryDocumentationResources(
          context.db,
          context.auth.currentSource,
          query
        );
        return textToolResult(data);
      },
    }),
  ];

  return {
    pathSlug: 'clarity',
    displayName: 'Microsoft Clarity',
    tools,
    async testSource(db, source) {
      await api.validateSource(db, source);
    },
  };
}
