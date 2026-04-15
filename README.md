# Microsoft Clarity Multi-Client MCP

Gateway MCP remoto para Microsoft Clarity com:

- clientes com endpoint MCP próprio
- sources reutilizáveis por cliente
- source ativa por sessão MCP
- UI admin e API admin
- deploy simples em Railway + Postgres

## O que este serviço faz

1. UI admin
   - cria clientes
   - cria sources de Clarity
   - vincula sources a clientes
   - define a source default
   - gira bearer/public tokens
   - valida manualmente a source

2. Gateway MCP
   - `POST /mcp/clarity/clients/:clientSlug`
   - `POST /mcp/clarity/public/:publicToken`
   - autentica no gateway, não direto no Clarity
   - resolve a source ativa da sessão

3. Módulo Clarity
   - `query_analytics_dashboard`
   - `list_session_recordings`
   - `query_documentation_resources`
   - tools de contexto:
     - `get_active_source`
     - `list_accessible_sources`
     - `set_active_source`
     - `clear_active_source`

## Modelo de domínio

- `clients`: tenants que recebem token e endpoint MCP próprios
- `clarity_sources`: tokens/projetos de Clarity reutilizáveis
- `client_access`: permissões e tokens MCP do cliente
- `client_source_links`: vínculo cliente -> source
- `client_sessions`: source ativa por sessão
- `audit_logs`: log mínimo das execuções

## Configuração

Obrigatórias:

```env
APP_BASE_URL=https://your-domain.up.railway.app
DATABASE_URL=postgres://...
CLIENT_TOKEN_SALT=...
CREDENTIALS_ENCRYPTION_KEY=...
ADMIN_UI_PASSWORD=...
ADMIN_SESSION_SECRET=...
```

Opcionais:

```env
APP_ENV=production
APP_NAME=microsoft-clarity-multi-client-mcp
HOST=0.0.0.0
PORT=8080
CLARITY_API_BASE_URL=https://clarity.microsoft.com/mcp
CLARITY_DAILY_REQUEST_LIMIT=10
```

## Desenvolvimento local

```bash
npm install
npm run dev
```

Verificações:

```bash
npm run typecheck
npm test
```

## Admin API

Rotas:

- `GET/POST /api/admin/clients`
- `PATCH/DELETE /api/admin/clients/:clientSlug`
- `GET/POST /api/admin/sources`
- `PATCH/DELETE /api/admin/sources/:sourceSlug`
- `POST /api/admin/clients/:clientSlug/source-links`
- `PATCH /api/admin/clients/:clientSlug/source-links/:sourceSlug`
- `POST /api/admin/clients/:clientSlug/rotate-bearer`
- `POST /api/admin/clients/:clientSlug/public-token/enable`
- `POST /api/admin/clients/:clientSlug/public-token/disable`
- `POST /api/admin/sources/:sourceSlug/validate`

Auth:

- sessão da UI admin
- ou `Authorization: Bearer <ADMIN_SESSION_SECRET>`
- ou `X-Admin-Api-Key: <ADMIN_SESSION_SECRET>`
