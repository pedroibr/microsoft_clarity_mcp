function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function maybe(value: string | null | undefined) {
  return escapeHtml(value || '');
}

function checked(value: boolean) {
  return value ? 'checked' : '';
}

function selected(value: string | number | null | undefined, expected: string | number) {
  return value === expected ? 'selected' : '';
}

function layout(title: string, body: string, flash?: { kind: string; message: string } | null) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #081018;
      --panel: #101925;
      --line: #243245;
      --muted: #8ea2ba;
      --text: #f4f8fd;
      --accent: #00a8e8;
      --accent-2: #6fe3ff;
      --ok-bg: #123225;
      --ok-text: #9ff0bf;
      --err-bg: #3c1820;
      --err-text: #ffbec8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, sans-serif;
      background:
        radial-gradient(circle at top left, rgba(0,168,232,0.18), transparent 32%),
        linear-gradient(180deg, #071018, var(--bg));
      color: var(--text);
      min-height: 100vh;
    }
    header {
      position: sticky;
      top: 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 18px 28px;
      backdrop-filter: blur(14px);
      background: rgba(8, 16, 24, 0.86);
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    main { max-width: 1280px; margin: 0 auto; padding: 28px; }
    .brand { font-weight: 800; letter-spacing: 0.02em; }
    .nav { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .nav a {
      color: var(--muted);
      text-decoration: none;
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 999px;
      padding: 8px 12px;
      background: rgba(255,255,255,0.02);
    }
    .nav a:hover { color: var(--text); }
    .panel {
      background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015));
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 22px;
      margin-bottom: 22px;
    }
    .hero {
      padding: 28px;
      border-radius: 24px;
      border: 1px solid rgba(0,168,232,0.22);
      background:
        linear-gradient(145deg, rgba(0,168,232,0.18), rgba(111,227,255,0.06)),
        rgba(15, 22, 32, 0.72);
      margin-bottom: 22px;
    }
    .muted { color: var(--muted); }
    .grid { display: grid; gap: 20px; }
    .grid-2 { grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); }
    .grid-3 { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    table { width: 100%; border-collapse: collapse; }
    th, td {
      text-align: left;
      padding: 12px 10px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      vertical-align: top;
    }
    th { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; }
    tr:last-child td { border-bottom: none; }
    form { margin: 0; }
    input, textarea, select {
      width: 100%;
      margin-top: 8px;
      margin-bottom: 14px;
      padding: 11px 12px;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: #0a131d;
      color: var(--text);
    }
    textarea { min-height: 110px; resize: vertical; }
    label { display: block; font-weight: 600; }
    button {
      display: inline-block;
      padding: 10px 14px;
      border-radius: 12px;
      border: 1px solid rgba(0,168,232,0.28);
      background: linear-gradient(180deg, rgba(0,168,232,0.22), rgba(0,168,232,0.12));
      color: white;
      cursor: pointer;
      text-decoration: none;
      font-weight: 700;
    }
    button.secondary {
      border-color: rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.04);
    }
    button.danger { border-color: rgba(255,100,100,0.25); background: rgba(255,100,100,0.12); }
    .flash { padding: 14px 16px; border-radius: 14px; margin-bottom: 18px; }
    .flash.success { background: var(--ok-bg); color: var(--ok-text); }
    .flash.error { background: var(--err-bg); color: var(--err-text); }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 5px 9px;
      border-radius: 999px;
      font-size: 12px;
      margin-right: 8px;
      margin-bottom: 6px;
      background: rgba(255,255,255,0.05);
      color: var(--muted);
      border: 1px solid rgba(255,255,255,0.06);
    }
    .code {
      background: rgba(0,0,0,0.26);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 14px;
      padding: 14px;
      white-space: pre-wrap;
      word-break: break-word;
      overflow-x: auto;
    }
    .checkbox {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.06);
      background: rgba(255,255,255,0.02);
      margin-bottom: 10px;
    }
    .checkbox input { width: auto; margin: 0; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    a { color: var(--accent-2); text-decoration: none; }
  </style>
</head>
<body>
  <header>
    <div class="brand">Microsoft Clarity MCP</div>
    <div class="nav">
      <a href="/admin">Dashboard</a>
      <a href="/admin/clients">Clients</a>
      <a href="/admin/sources">Sources</a>
      <form method="post" action="/admin/logout"><button class="secondary" type="submit">Logout</button></form>
    </div>
  </header>
  <main>
    ${flash ? `<div class="flash ${escapeHtml(flash.kind)}">${escapeHtml(flash.message)}</div>` : ''}
    ${body}
  </main>
</body>
</html>`;
}

export function renderLogin(error?: string) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Admin Login</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: ui-sans-serif, system-ui, sans-serif;
      background:
        radial-gradient(circle at top left, rgba(0,168,232,0.2), transparent 28%),
        linear-gradient(180deg, #081018, #0b1118);
      color: white;
    }
    .card {
      width: min(420px, 92vw);
      padding: 26px;
      border-radius: 24px;
      border: 1px solid rgba(0,168,232,0.2);
      background: rgba(12, 19, 27, 0.92);
    }
    input {
      width: 100%;
      padding: 12px 14px;
      margin: 12px 0 16px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.08);
      background: #08121c;
      color: white;
    }
    button {
      width: 100%;
      padding: 12px 14px;
      border-radius: 12px;
      border: 1px solid rgba(0,168,232,0.28);
      background: linear-gradient(180deg, rgba(0,168,232,0.24), rgba(0,168,232,0.12));
      color: white;
      font-weight: 700;
    }
    .error { margin-top: 12px; padding: 12px; border-radius: 12px; background: rgba(255,100,100,0.12); color: #ffc1c7; }
  </style>
</head>
<body>
  <form class="card" method="post" action="/admin/login">
    <h1>Admin Login</h1>
    <p>Enter the admin password for the Clarity MCP gateway.</p>
    <label>Password <input type="password" name="password" required /></label>
    <button type="submit">Login</button>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
  </form>
</body>
</html>`;
}

export function renderDashboard(data: { clients: any[]; sources: any[]; flash?: any }) {
  return layout(
    'Dashboard',
    `
      <section class="hero">
        <h1>Gateway dashboard</h1>
        <p class="muted">Manage clients, reusable Clarity sources, and per-client MCP access from one deploy.</p>
      </section>
      <section class="grid grid-3">
        <div class="panel"><div class="muted">Clients</div><h2>${data.clients.length}</h2></div>
        <div class="panel"><div class="muted">Sources</div><h2>${data.sources.length}</h2></div>
        <div class="panel"><div class="muted">App</div><h2>Clarity</h2></div>
      </section>
    `,
    data.flash
  );
}

export function renderClients(data: { clients: any[]; flash?: any }) {
  return layout(
    'Clients',
    `
      <section class="panel">
        <h1>Clients</h1>
        <table>
          <thead><tr><th>Slug</th><th>Name</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${data.clients
              .map(
                (client) => `
                  <tr>
                    <td>${escapeHtml(client.slug)}</td>
                    <td>${escapeHtml(client.displayName)}</td>
                    <td>${escapeHtml(client.status)}</td>
                    <td><a href="/admin/clients/${encodeURIComponent(client.slug)}">Open</a></td>
                  </tr>
                `
              )
              .join('')}
          </tbody>
        </table>
      </section>
      <section class="panel">
        <h2>Create client</h2>
        <form method="post" action="/admin/clients">
          <label>Slug <input name="slug" required /></label>
          <label>Display name <input name="display_name" required /></label>
          <label>Description <textarea name="description"></textarea></label>
          <button type="submit">Create client</button>
        </form>
      </section>
    `,
    data.flash
  );
}

export function renderSources(data: { sources: any[]; flash?: any }) {
  return layout(
    'Sources',
    `
      <section class="panel">
        <h1>Reusable Clarity sources</h1>
        <table>
          <thead><tr><th>Slug</th><th>Name</th><th>Project</th><th>Site URL</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${data.sources
              .map(
                (source) => `
                  <tr>
                    <td>${escapeHtml(source.slug)}</td>
                    <td>${escapeHtml(source.displayName)}</td>
                    <td>${maybe(source.projectLabel)}</td>
                    <td>${maybe(source.siteUrl)}</td>
                    <td>${escapeHtml(source.status)}</td>
                    <td>
                      <form method="post" action="/admin/sources/${encodeURIComponent(source.slug)}/delete">
                        <button class="danger" type="submit">Delete</button>
                      </form>
                    </td>
                  </tr>
                  <tr>
                    <td colspan="6">
                      <form method="post" action="/admin/sources/${encodeURIComponent(source.slug)}">
                        <div class="grid grid-2">
                          <label>Slug <input name="slug" value="${escapeHtml(source.slug)}" required /></label>
                          <label>Display name <input name="display_name" value="${escapeHtml(source.displayName)}" required /></label>
                          <label>Project label <input name="project_label" value="${maybe(source.projectLabel)}" /></label>
                          <label>Site URL <input name="site_url" value="${maybe(source.siteUrl)}" /></label>
                          <label>Status
                            <select name="status">
                              <option value="active" ${selected(source.status, 'active')}>active</option>
                              <option value="disabled" ${selected(source.status, 'disabled')}>disabled</option>
                            </select>
                          </label>
                          <label>API token <input type="password" name="api_token" placeholder="Leave blank to keep existing token" /></label>
                        </div>
                        <button type="submit">Update source</button>
                      </form>
                    </td>
                  </tr>
                `
              )
              .join('')}
          </tbody>
        </table>
      </section>
      <section class="panel">
        <h2>Create source</h2>
        <form method="post" action="/admin/sources">
          <div class="grid grid-2">
            <label>Slug <input name="slug" required /></label>
            <label>Display name <input name="display_name" required /></label>
            <label>Project label <input name="project_label" /></label>
            <label>Site URL <input name="site_url" /></label>
            <label>Status
              <select name="status">
                <option value="active">active</option>
                <option value="disabled">disabled</option>
              </select>
            </label>
          </div>
          <label>API token <input type="password" name="api_token" required /></label>
          <button type="submit">Create source</button>
        </form>
      </section>
    `,
    data.flash
  );
}

export function renderClientDetail(data: {
  client: any;
  access: any;
  sourcesWithAccess: any[];
  flash?: any;
  issuedBearerToken?: string | null;
  issuedPublicUrl?: string | null;
  authenticatedUrl?: string | null;
}) {
  const linkedRows = data.sourcesWithAccess.filter((item) => item.clientSourceLink);
  return layout(
    `Client ${data.client.slug}`,
    `
      <section class="hero">
        <h1>${escapeHtml(data.client.displayName)}</h1>
        <p class="muted">${maybe(data.client.description) || 'No description set.'}</p>
        <div>
          <span class="badge">slug: ${escapeHtml(data.client.slug)}</span>
          <span class="badge">status: ${escapeHtml(data.client.status)}</span>
        </div>
      </section>
      <section class="grid grid-2">
        <div class="panel">
          <h2>Edit client</h2>
          <form method="post" action="/admin/clients/${encodeURIComponent(data.client.slug)}">
            <label>Display name <input name="display_name" value="${escapeHtml(data.client.displayName)}" required /></label>
            <label>Description <textarea name="description">${maybe(data.client.description)}</textarea></label>
            <label>Status
              <select name="status">
                <option value="active" ${selected(data.client.status, 'active')}>active</option>
                <option value="disabled" ${selected(data.client.status, 'disabled')}>disabled</option>
              </select>
            </label>
            <button type="submit">Save client</button>
          </form>
          <form method="post" action="/admin/clients/${encodeURIComponent(data.client.slug)}/delete" style="margin-top:12px;">
            <button class="danger" type="submit">Delete client</button>
          </form>
        </div>
        <div class="panel">
          <h2>Client access</h2>
          <form method="post" action="/admin/clients/${encodeURIComponent(data.client.slug)}/access">
            <label class="checkbox"><input type="checkbox" name="enabled" ${checked(data.access.enabled)} /> Enabled</label>
            <label class="checkbox"><input type="checkbox" name="read_enabled" ${checked(data.access.readEnabled)} /> Read tools enabled</label>
            <label class="checkbox"><input type="checkbox" name="write_enabled" ${checked(data.access.writeEnabled)} /> Write tools enabled</label>
            <label class="checkbox"><input type="checkbox" name="delete_enabled" ${checked(data.access.deleteEnabled)} /> Delete tools enabled</label>
            <label>Status
              <select name="status">
                <option value="active" ${selected(data.access.status, 'active')}>active</option>
                <option value="disabled" ${selected(data.access.status, 'disabled')}>disabled</option>
              </select>
            </label>
            <label>Default source
              <select name="default_source_id">
                <option value="">Auto</option>
                ${linkedRows
                  .map(
                    (item) =>
                      `<option value="${item.source.id}" ${selected(
                        data.access.defaultSourceId,
                        item.source.id
                      )}>${escapeHtml(item.source.displayName)} (${escapeHtml(item.source.slug)})</option>`
                  )
                  .join('')}
              </select>
            </label>
            <button type="submit">Save access</button>
          </form>
        </div>
      </section>

      <section class="panel">
        <h2>MCP access</h2>
        <div class="actions" style="margin-bottom:12px;">
          <form method="post" action="/admin/clients/${encodeURIComponent(data.client.slug)}/rotate-bearer">
            <button type="submit">Rotate bearer token</button>
          </form>
          <form method="post" action="/admin/clients/${encodeURIComponent(data.client.slug)}/enable-public-link">
            <button class="secondary" type="submit">Enable public link</button>
          </form>
          <form method="post" action="/admin/clients/${encodeURIComponent(data.client.slug)}/rotate-public-link">
            <button class="secondary" type="submit">Rotate public link</button>
          </form>
          <form method="post" action="/admin/clients/${encodeURIComponent(data.client.slug)}/disable-public-link">
            <button class="danger" type="submit">Disable public link</button>
          </form>
        </div>
        ${data.authenticatedUrl ? `<div class="code">${escapeHtml(data.authenticatedUrl)}</div>` : ''}
        ${data.issuedBearerToken ? `<div class="code" style="margin-top:12px;">${escapeHtml(data.issuedBearerToken)}</div>` : ''}
        ${data.issuedPublicUrl ? `<div class="code" style="margin-top:12px;">${escapeHtml(data.issuedPublicUrl)}</div>` : ''}
      </section>

      <section class="panel">
        <h2>Global sources</h2>
        <table>
          <thead><tr><th>Source</th><th>Project</th><th>Status</th><th>Validation</th><th>Link</th><th>Actions</th></tr></thead>
          <tbody>
            ${data.sourcesWithAccess
              .map((item) => {
                const link = item.clientSourceLink;
                return `
                  <tr>
                    <td>
                      <strong>${escapeHtml(item.source.displayName)}</strong><br />
                      <span class="muted">${escapeHtml(item.source.slug)}</span><br />
                      <span class="muted">${maybe(item.source.siteUrl)}</span>
                    </td>
                    <td>${maybe(item.source.projectLabel)}</td>
                    <td>${escapeHtml(item.source.status)}</td>
                    <td>${maybe(link?.lastValidationError) || (link?.lastValidatedAt ? 'ok' : 'not tested')}</td>
                    <td>
                      <form method="post" action="/admin/clients/${encodeURIComponent(data.client.slug)}/sources/${encodeURIComponent(item.source.slug)}">
                        <label class="checkbox"><input type="checkbox" name="enabled" ${checked(link?.enabled ?? false)} /> Enabled</label>
                        <label>Status
                          <select name="status">
                            <option value="active" ${selected(link?.status, 'active')}>active</option>
                            <option value="disabled" ${selected(link?.status, 'disabled')}>disabled</option>
                          </select>
                        </label>
                        <button type="submit">${link ? 'Update link' : 'Link source'}</button>
                      </form>
                    </td>
                    <td>
                      <form method="post" action="/admin/clients/${encodeURIComponent(data.client.slug)}/sources/${encodeURIComponent(item.source.slug)}/validate">
                        <button class="secondary" type="submit">Validate</button>
                      </form>
                    </td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </section>
    `,
    data.flash
  );
}
