export interface AppConfig {
  appEnv: string;
  appName: string;
  port: number;
  host: string;
  appBaseUrl: string;
  databaseUrl: string;
  clientTokenSalt: string;
  credentialsEncryptionKey: string;
  adminUiPassword: string;
  adminSessionSecret: string;
  clarityApiBaseUrl: string;
  clarityDailyRequestLimit: number;
}

function required(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${name} is required`);
  }
  return normalized;
}

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('PORT must be a positive integer');
  }
  return parsed;
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    appEnv: env.APP_ENV?.trim() || 'development',
    appName: env.APP_NAME?.trim() || 'microsoft-clarity-multi-client-mcp',
    port: parsePort(env.PORT, 8080),
    host: env.HOST?.trim() || '0.0.0.0',
    appBaseUrl: env.APP_BASE_URL?.trim().replace(/\/+$/, '') || '',
    databaseUrl:
      env.DATABASE_URL?.trim() ||
      'postgres://postgres:postgres@localhost:5432/microsoft_clarity_mcp',
    clientTokenSalt: required(env.CLIENT_TOKEN_SALT, 'CLIENT_TOKEN_SALT'),
    credentialsEncryptionKey: required(
      env.CREDENTIALS_ENCRYPTION_KEY,
      'CREDENTIALS_ENCRYPTION_KEY'
    ),
    adminUiPassword: required(env.ADMIN_UI_PASSWORD, 'ADMIN_UI_PASSWORD'),
    adminSessionSecret: required(env.ADMIN_SESSION_SECRET, 'ADMIN_SESSION_SECRET'),
    clarityApiBaseUrl:
      env.CLARITY_API_BASE_URL?.trim().replace(/\/+$/, '') || 'https://clarity.microsoft.com/mcp',
    clarityDailyRequestLimit: parsePositiveInteger(
      env.CLARITY_DAILY_REQUEST_LIMIT,
      10,
      'CLARITY_DAILY_REQUEST_LIMIT'
    ),
  };
}
