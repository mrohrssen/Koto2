import {
  ADMIN_NAV,
  TOOL_LINKS,
  buildOverviewQueue,
  canDeleteUser,
  filterUsers,
  getRestoredSelectionRange,
  isCurrentRequestToken,
  normalizeBugReports,
} from '/js/admin-dashboard-data.js';

const viewTitles = {
  overview: 'Overview',
  'bug-reports': 'Bug Reports',
  'users-data': 'Users & Data',
  'language-qa': 'Language QA',
  'content-studio': 'Content Studio',
  'asset-pipeline': 'Asset Pipeline',
  simulators: 'Simulators',
};

const navIcons = {
  'layout-dashboard': '⌂',
  bug: '!',
  database: 'D',
  languages: '文',
  'file-pen': 'C',
  image: 'A',
  activity: 'S',
};

const BUG_REPORT_ENVIRONMENTS = [
  { id: 'current', label: 'Current app', baseUrl: '' },
  { id: 'dev', label: 'Dev', baseUrl: 'https://jrpg-dev.up.railway.app' },
  { id: 'production', label: 'Production', baseUrl: 'https://jrpg-production.up.railway.app' },
];

const state = {
  activeView: 'overview',
  adminSecret: sessionStorage.getItem('koto-admin-secret') || '',
  bugReportEnvironment: sessionStorage.getItem('koto-admin-bug-report-environment') || 'current',
  bugReports: [],
  selectedBugReport: null,
  users: [],
  selectedUser: null,
  selectedUserKnowledge: null,
  userQuery: '',
  loading: {
    bugs: false,
    users: false,
  },
  requests: {
    bugReports: 0,
    users: 0,
    bugReportDetail: 0,
    userKnowledge: 0,
    adminSecret: 0,
  },
};

const elements = {
  nav: document.querySelector('[data-sidebar-nav]'),
  viewTitle: document.querySelector('[data-view-title]'),
  refresh: document.querySelector('[data-refresh-view]'),
  search: document.querySelector('[data-global-search]'),
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeHref(href) {
  const value = String(href || '').trim();
  if (!value || value.startsWith('//')) return '#';

  try {
    const url = new URL(value, window.location.origin);
    if (url.origin === window.location.origin && value.startsWith('/') && !value.startsWith('//')) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
    if (url.origin === 'http://localhost:3100') {
      return url.href;
    }
  } catch {
    return '#';
  }

  return '#';
}

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown time';
  }

  return date.toLocaleString();
}

function getToolGroups() {
  return {
    'language-qa': TOOL_LINKS.languageQa ?? [],
    'content-studio': TOOL_LINKS.contentStudio ?? [],
    'asset-pipeline': TOOL_LINKS.assetPipeline ?? [],
    simulators: TOOL_LINKS.simulators ?? [],
  };
}

function getToolCountForView(viewId) {
  if (viewId === 'bug-reports') return state.bugReports.length;
  if (viewId === 'users-data') return state.users.length;
  return getToolGroups()[viewId]?.length ?? 0;
}

function getBugReportEnvironment() {
  return BUG_REPORT_ENVIRONMENTS.find((environment) => environment.id === state.bugReportEnvironment)
    || BUG_REPORT_ENVIRONMENTS[0];
}

function bugReportApiPath(path) {
  return `${getBugReportEnvironment().baseUrl}${path}`;
}

function summarizeUserAgent(userAgent) {
  const value = String(userAgent || '').trim();
  if (!value) return 'unknown user agent';

  const device = /iphone/i.test(value) ? 'iPhone'
    : /ipad/i.test(value) ? 'iPad'
      : /android/i.test(value) ? 'Android'
        : /macintosh|mac os x/i.test(value) ? 'macOS'
          : /windows/i.test(value) ? 'Windows'
            : 'Device';
  const browser = /crios|chrome/i.test(value) ? 'Chrome'
    : /firefox/i.test(value) ? 'Firefox'
      : /safari/i.test(value) ? 'Safari'
        : 'Browser';

  return `${device} / ${browser}`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${message}`);
  }
  return response.json();
}

function getTypedAdminSecret() {
  return document.querySelector('[data-admin-secret-input]')?.value.trim() || '';
}

function storeAdminSecret(secret) {
  state.adminSecret = secret;
  if (secret) {
    sessionStorage.setItem('koto-admin-secret', secret);
  } else {
    sessionStorage.removeItem('koto-admin-secret');
  }
}

function saveAdminSecret(secret) {
  state.requests.adminSecret += 1;
  storeAdminSecret(secret);
}

function clearAdminSecret() {
  state.requests.adminSecret += 1;
  storeAdminSecret('');
}

async function ensureAdminSecret() {
  if (state.adminSecret) {
    return state.adminSecret;
  }

  const typedSecret = getTypedAdminSecret();
  if (typedSecret) {
    saveAdminSecret(typedSecret);
    return state.adminSecret;
  }

  const requestToken = state.requests.adminSecret;
  let payload = null;
  try {
    payload = await fetchJson('/api/admin/secret');
  } catch {
    // Remote deployments intentionally hide this endpoint. Fall through to manual entry.
  }

  if (!isCurrentRequestToken(requestToken, state.requests.adminSecret)) {
    throw new Error('Admin secret changed. Retry the admin action.');
  }

  if (payload) {
    if (payload.secret) {
      storeAdminSecret(payload.secret);
      return state.adminSecret;
    }
  }

  throw new Error('Admin secret required. Paste ADMIN_SECRET into Users & Data and retry.');
}

async function adminFetchJson(url, options = {}) {
  const secret = await ensureAdminSecret();
  return fetchJson(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'x-admin-secret': secret,
    },
  });
}

async function loadBugReports() {
  clearError();
  const requestToken = state.requests.bugReports + 1;
  state.requests.bugReports = requestToken;
  state.loading.bugs = true;
  renderBugReports();
  try {
    const payload = await fetchJson(bugReportApiPath('/api/bug-reports'));
    if (state.requests.bugReports !== requestToken) return;
    const reports = normalizeBugReports(payload.reports || []);
    state.bugReports = reports;

    if (state.selectedBugReport?.id) {
      const refreshed = reports.find((report) => report.id === state.selectedBugReport.id);
      state.selectedBugReport = refreshed
        ? { ...refreshed, ...state.selectedBugReport }
        : null;
    }
  } finally {
    if (state.requests.bugReports !== requestToken) return;
    state.loading.bugs = false;
    renderBugReports();
    renderOverviewData();
    renderNav();
    applyGlobalSearchFilter();
  }
}

async function loadUsers() {
  clearError();
  const requestToken = state.requests.users + 1;
  state.requests.users = requestToken;
  state.loading.users = true;
  renderUsers();
  try {
    const payload = await adminFetchJson('/api/admin/list-users');
    if (state.requests.users !== requestToken) return;
    const users = payload.users || [];
    state.users = users;

    if (state.selectedUser?.id) {
      const refreshed = users.find((user) => user.id === state.selectedUser.id);
      if (refreshed) {
        state.selectedUser = refreshed;
      } else {
        state.selectedUser = null;
        state.selectedUserKnowledge = null;
      }
    }
  } catch (error) {
    if (!isCurrentRequestToken(requestToken, state.requests.users)) return;
    throw error;
  } finally {
    if (!isCurrentRequestToken(requestToken, state.requests.users)) return;
    state.loading.users = false;
    renderUsers();
    renderOverviewData();
    renderNav();
    applyGlobalSearchFilter();
  }
}

async function loadUserKnowledge(user) {
  clearError();
  const requestToken = state.requests.userKnowledge + 1;
  state.requests.userKnowledge = requestToken;
  state.selectedUser = user;
  state.selectedUserKnowledge = null;
  renderUserDetail();
  let payload = null;
  try {
    payload = await adminFetchJson(`/api/admin/word-knowledge/${encodeURIComponent(user.id)}`);
  } catch (error) {
    if (!isCurrentRequestToken(requestToken, state.requests.userKnowledge) || state.selectedUser?.id !== user.id) return;
    throw error;
  }
  if (isCurrentRequestToken(requestToken, state.requests.userKnowledge) && state.selectedUser?.id === user.id) {
    state.selectedUserKnowledge = payload;
    renderUserDetail();
  }
}

async function deleteSelectedUser() {
  clearError();
  const confirmation = document.querySelector('[data-delete-user-confirm]')?.value;
  if (!canDeleteUser(state.selectedUser, confirmation)) {
    return;
  }

  const confirmed = window.confirm(`Delete user ${state.selectedUser.username}? This cannot be undone.`);
  if (!confirmed) return;

  await adminFetchJson('/api/admin/delete-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: state.selectedUser.username }),
  });

  state.selectedUser = null;
  state.selectedUserKnowledge = null;
  await loadUsers();
}

async function loadBugReportDetail(reportId) {
  clearError();
  const requestToken = state.requests.bugReportDetail + 1;
  state.requests.bugReportDetail = requestToken;
  const fallback = state.bugReports.find((report) => report.id === reportId) || { id: reportId };
  state.selectedBugReport = fallback;
  renderBugReports();
  const payload = await fetchJson(bugReportApiPath(`/api/bug-reports/${encodeURIComponent(reportId)}`));
  if (state.requests.bugReportDetail === requestToken && state.selectedBugReport?.id === reportId) {
    state.selectedBugReport = normalizeBugReports([{ ...fallback, ...payload }])[0];
    renderBugReports();
  }
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

async function copySelectedBugReportGameState() {
  if (!state.selectedBugReport) return;
  await copyText(JSON.stringify(state.selectedBugReport.gameState || state.selectedBugReport, null, 2));
}

async function setBugReportEnvironment(environmentId) {
  if (!BUG_REPORT_ENVIRONMENTS.some((environment) => environment.id === environmentId)) return;
  state.bugReportEnvironment = environmentId;
  sessionStorage.setItem('koto-admin-bug-report-environment', environmentId);
  state.selectedBugReport = null;
  state.bugReports = [];
  renderBugReports();
  renderOverviewData();
  renderNav();
  await loadBugReports();
}

async function deleteSelectedBugReport() {
  clearError();
  if (!state.selectedBugReport?.id) return;

  const confirmed = window.confirm(`Delete bug report ${state.selectedBugReport.id}?`);
  if (!confirmed) return;

  await adminFetchJson(bugReportApiPath(`/api/bug-reports/${encodeURIComponent(state.selectedBugReport.id)}`), {
    method: 'DELETE',
  });

  state.selectedBugReport = null;
  await loadBugReports();
}

async function refreshActiveView() {
  try {
    clearError();
    if (state.activeView === 'bug-reports' || state.activeView === 'overview') {
      await loadBugReports();
    }

    if (state.activeView === 'users-data' || state.activeView === 'overview') {
      await loadUsers();
    }
  } catch (error) {
    renderError(error);
  }
}

function renderNav() {
  elements.nav.innerHTML = ADMIN_NAV.map((section) => `
    <div class="sidebar-section">
      <div class="sidebar-heading">${escapeHtml(section.label)}</div>
      ${(section.items ?? []).map((item) => {
        const count = item.id === 'overview' ? '7' : getToolCountForView(item.id) || '0';
        const icon = navIcons[item.icon] ?? item.label.charAt(0);
        return `
          <button class="nav-button${item.id === state.activeView ? ' active' : ''}" type="button" data-nav-view="${escapeHtml(item.id)}">
            <span class="nav-icon" aria-hidden="true">${escapeHtml(icon)}</span>
            <span class="nav-text">${escapeHtml(item.label)}</span>
            <span class="nav-count">${escapeHtml(count)}</span>
          </button>
        `;
      }).join('')}
    </div>
  `).join('');
}

function renderToolCards(tools) {
  if (!tools?.length) {
    return `
      <div class="empty-state">
        <strong>No tools registered yet.</strong>
        <span>This workflow is ready for links from the dashboard data module.</span>
      </div>
    `;
  }

  return `
    <div class="tool-grid">
      ${tools.map((tool) => `
        <a class="tool-card" href="${escapeHtml(safeHref(tool.href))}">
          <span class="tool-meta">
            <span class="tool-title">${escapeHtml(tool.label)}</span>
            <span class="tool-description">${escapeHtml(tool.description)}</span>
          </span>
          <span class="pill ${getStatusClass(tool.status)}">${escapeHtml(tool.status)}</span>
        </a>
      `).join('')}
    </div>
  `;
}

function getStatusClass(status) {
  const normalized = String(status ?? '').toLowerCase();
  if (normalized.includes('production')) return 'good';
  if (normalized.includes('dev')) return 'warn';
  if (normalized.includes('simulator')) return 'purple';
  return '';
}

function renderStats() {
  const stats = [
    ['Open Reports', '0', 'Live bug report submissions.', 'pending', 'data-stat-bugs'],
    ['User Accounts', '0', 'Admin-visible user records.', 'auth', 'data-stat-users'],
    ['Language Tools', String(TOOL_LINKS.languageQa?.length ?? 0), 'Static frame and word exposure workflows.', 'ready', ''],
    ['Content Tools', String((TOOL_LINKS.contentStudio?.length ?? 0) + (TOOL_LINKS.assetPipeline?.length ?? 0)), 'Forge, content browser, sprites, and previews.', 'ready', ''],
  ];

  return `
    <div class="stats-grid">
      ${stats.map(([label, value, note, status, hook]) => `
        <div class="stat-card">
          <div class="stat-label"><span>${escapeHtml(label)}</span><span>${escapeHtml(status)}</span></div>
          <div class="stat-value" ${hook}>${escapeHtml(value)}</div>
          <div class="stat-note">${escapeHtml(note)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderQueueItems(queueItems) {
  if (!queueItems.length) {
    return `
      <div class="empty-state">
        <strong>No queue items.</strong>
        <span>Live bug and user data will populate this queue after refresh.</span>
      </div>
    `;
  }

  return `
    <div class="list-stack">
      ${queueItems.map((item) => {
        const tone = item.priority === 'warning' ? 'warn' : 'good';
        return `
          <button class="row-item" type="button" data-nav-view="${escapeHtml(item.view)}">
            <span>
              <span class="row-title">${escapeHtml(item.title)}</span>
              <span class="row-meta">${escapeHtml(item.meta)}</span>
            </span>
            <span class="pill ${tone}">${escapeHtml(item.kind)}</span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function renderOverviewData() {
  const bugStat = document.querySelector('[data-stat-bugs]');
  const userStat = document.querySelector('[data-stat-users]');
  const queue = document.querySelector('[data-overview-queue]');

  if (bugStat) bugStat.textContent = String(state.bugReports.length);
  if (userStat) userStat.textContent = String(state.users.length);
  if (queue) {
    queue.innerHTML = renderQueueItems(buildOverviewQueue({
      bugReports: state.bugReports,
      users: state.users,
    }));
  }
}

function renderJsonBlock(value) {
  return `<pre class="json-block">${escapeHtml(JSON.stringify(value || {}, null, 2))}</pre>`;
}

function renderBugReports() {
  const list = document.querySelector('[data-bug-report-list]');
  if (!list) return;

  const environmentOptions = BUG_REPORT_ENVIRONMENTS.map((environment) => `
    <option value="${escapeHtml(environment.id)}" ${environment.id === state.bugReportEnvironment ? 'selected' : ''}>
      ${escapeHtml(environment.label)}
    </option>
  `).join('');
  const reports = normalizeBugReports(state.bugReports);
  const rows = reports.map((report) => `
    <button class="row-item${state.selectedBugReport?.id === report.id ? ' active' : ''}" type="button" data-bug-report-id="${escapeHtml(report.id)}">
      <span>
        <span class="row-title">${escapeHtml(report.note || 'Bug report without note')}</span>
        <span class="row-meta">${escapeHtml(report.id)} · ${escapeHtml(report.deviceLabel)} · ${escapeHtml(summarizeUserAgent(report.userAgent))} · ${escapeHtml(report.phaseLabel)}</span>
      </span>
      <span class="row-meta">${escapeHtml(formatDate(report.submittedAt))}</span>
    </button>
  `).join('');

  list.innerHTML = `
    <div class="panel-header">
      <div>
        <div class="panel-title">Bug Reports Inbox</div>
        <div class="panel-subtitle">Live submissions from ${escapeHtml(getBugReportEnvironment().label)}.</div>
      </div>
      <div class="input-row">
        <label>
          <span class="sr-only">Bug report environment</span>
          <select data-bug-report-environment>${environmentOptions}</select>
        </label>
        <button class="secondary-action" type="button" data-load-bugs>${state.loading.bugs ? 'Loading' : 'Refresh'}</button>
      </div>
    </div>
    ${state.loading.bugs ? `
      <div class="empty-state">
        <strong>Loading bug reports.</strong>
        <span>Fetching the latest submitted reports.</span>
      </div>
    ` : ''}
    ${!state.loading.bugs && reports.length ? `<div class="list-stack">${rows}</div>` : ''}
    ${!state.loading.bugs && !reports.length ? `
      <div class="empty-state">
        <strong>No bug reports.</strong>
        <span>Submitted reports will appear here with screenshot and game state links.</span>
      </div>
    ` : ''}
  `;

  renderBugReportDetail();
}

function renderBugReportDetail() {
  const panel = document.querySelector('[data-selected-report-panel]');
  if (!panel) return;

  const report = state.selectedBugReport;
  if (!report) {
    panel.innerHTML = `
      <div class="panel-header">
        <div>
          <div class="panel-title">Selected Report</div>
          <div class="panel-subtitle">Metadata and screenshot actions</div>
        </div>
      </div>
      <div class="empty-state">
        <strong>No report selected.</strong>
        <span>Select a bug report to inspect its captured metadata.</span>
      </div>
    `;
    return;
  }

  const screenshotHref = `/api/bug-reports/${encodeURIComponent(report.id)}/screenshot`;
  const metadataHref = `/api/bug-reports/${encodeURIComponent(report.id)}`;
  const screenshotUrl = bugReportApiPath(screenshotHref);
  const metadataUrl = bugReportApiPath(metadataHref);
  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <div class="panel-title">${escapeHtml(report.note || 'Bug report without note')}</div>
        <div class="panel-subtitle">${escapeHtml(report.id)} · ${escapeHtml(formatDate(report.submittedAt || report.timestamp))}</div>
      </div>
      <button class="secondary-action danger" type="button" data-delete-bug-report>Delete</button>
    </div>
    <div class="detail-stack">
      <div class="detail-grid">
        <div><span class="row-meta">Device</span><strong>${escapeHtml(report.deviceLabel || 'unknown')}</strong></div>
        <div><span class="row-meta">User Agent</span><strong>${escapeHtml(summarizeUserAgent(report.userAgent))}</strong></div>
        <div><span class="row-meta">Phase</span><strong>${escapeHtml(report.phaseLabel || 'unknown')}</strong></div>
        <div><span class="row-meta">DPR</span><strong>${escapeHtml(report.devicePixelRatio ?? 'unknown')}</strong></div>
        <div><span class="row-meta">Viewport</span><strong>${escapeHtml(report.viewport ? `${report.viewport.width} x ${report.viewport.height}` : 'unknown')}</strong></div>
      </div>
      <div class="input-row">
        <a class="inline-action" href="${escapeHtml(metadataUrl)}">Metadata JSON</a>
        <a class="inline-action" href="${escapeHtml(screenshotUrl)}">Screenshot</a>
        <button class="inline-action" type="button" data-copy-game-state>Copy Game State</button>
      </div>
      ${renderJsonBlock(report.gameState || report)}
    </div>
  `;
}

function renderUsers() {
  const panel = document.querySelector('[data-user-results]');
  if (!panel) return;

  const users = filterUsers(state.users, state.userQuery);
  const secretStatus = state.adminSecret ? 'Secret stored for this tab' : 'No secret stored for this tab';
  const rows = users.map((user) => `
    <button class="row-item${state.selectedUser?.id === user.id ? ' active' : ''}" type="button" data-user-id="${escapeHtml(user.id)}">
      <span>
        <span class="row-title">${escapeHtml(user.username || 'Unnamed user')}</span>
        <span class="row-meta">${escapeHtml(user.id)}</span>
      </span>
      <span class="row-meta">${escapeHtml(user.createdAt ? formatDate(user.createdAt) : 'No createdAt')}</span>
    </button>
  `).join('');

  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <div class="panel-title">Users & Data</div>
        <div class="panel-subtitle">Live user records from the existing admin API.</div>
      </div>
      <span class="pill ${state.loading.users ? 'warn' : 'good'}">${state.loading.users ? 'loading' : `${state.users.length} users`}</span>
    </div>
    <div class="stacked-form admin-secret-controls">
      <label>
        <span class="row-meta">Admin secret</span>
        <input data-admin-secret-input type="password" autocomplete="off" placeholder="Paste ADMIN_SECRET" value="">
      </label>
      <div class="input-row">
        <button class="secondary-action" type="button" data-save-admin-secret>Save Secret</button>
        <button class="secondary-action" type="button" data-clear-admin-secret>Clear</button>
      </div>
      <span class="row-meta">${escapeHtml(secretStatus)}</span>
    </div>
    <div class="stacked-form">
      <label>
        <span class="sr-only">Search users</span>
        <input data-user-filter type="search" value="${escapeHtml(state.userQuery)}" placeholder="Search username or id">
      </label>
    </div>
    ${state.loading.users ? `
      <div class="empty-state">
        <strong>Loading users.</strong>
        <span>Fetching account records with the admin secret.</span>
      </div>
    ` : ''}
    ${!state.loading.users && users.length ? `<div class="list-stack">${rows}</div>` : ''}
    ${!state.loading.users && !users.length ? `
      <div class="empty-state">
        <strong>No users found.</strong>
        <span>Adjust the search or refresh the user list.</span>
      </div>
    ` : ''}
  `;

  renderUserDetail();
}

function renderUserDetail() {
  const panel = document.querySelector('[data-user-detail]');
  if (!panel) return;

  const user = state.selectedUser;
  if (!user) {
    panel.innerHTML = `
      <div class="panel-header">
        <div>
          <div class="panel-title">User Operations</div>
          <div class="panel-subtitle">Select a user to inspect word knowledge.</div>
        </div>
      </div>
      <div class="empty-state">
        <strong>No user selected.</strong>
        <span>User word knowledge and destructive operations appear after selection.</span>
      </div>
    `;
    return;
  }

  const words = state.selectedUserKnowledge?.words || [];
  const knownCount = words.filter((word) => word.known).length;
  const totalExposures = words.reduce((sum, word) => sum + Number(word.exposures || 0), 0);

  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <div class="panel-title">${escapeHtml(user.username || 'Unnamed user')}</div>
        <div class="panel-subtitle">${escapeHtml(user.id)}</div>
      </div>
      <span class="pill ${state.selectedUserKnowledge ? 'good' : 'warn'}">${state.selectedUserKnowledge ? 'loaded' : 'loading'}</span>
    </div>
    <div class="detail-stack">
      <div class="detail-grid">
        <div><span class="row-meta">Known words</span><strong>${escapeHtml(knownCount)}</strong></div>
        <div><span class="row-meta">Tracked words</span><strong>${escapeHtml(words.length)}</strong></div>
        <div><span class="row-meta">Total exposures</span><strong>${escapeHtml(totalExposures)}</strong></div>
        <div><span class="row-meta">Created</span><strong>${escapeHtml(user.createdAt ? formatDate(user.createdAt) : 'unknown')}</strong></div>
      </div>
      ${words.length ? `
        <div class="list-stack compact-list">
          ${words.slice(0, 20).map((word) => `
            <div class="row-item">
              <span>
                <span class="row-title">${escapeHtml(word.word)} ${word.reading ? `(${escapeHtml(word.reading)})` : ''}</span>
                <span class="row-meta">${escapeHtml(word.meaning || '')}</span>
              </span>
              <span class="pill ${word.known ? 'good' : 'warn'}">${escapeHtml(word.exposures ?? 0)} exp</span>
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="empty-state">
          <strong>${state.selectedUserKnowledge ? 'No word knowledge.' : 'Loading word knowledge.'}</strong>
          <span>${state.selectedUserKnowledge ? 'The admin API returned no words for this user.' : 'Fetching words, readings, meanings, exposures, and known state.'}</span>
        </div>
      `}
      <div class="stacked-form danger-zone">
        <label>
          <span class="row-meta">Type the exact username to delete this user.</span>
          <input data-delete-user-confirm type="text" autocomplete="off" placeholder="${escapeHtml(user.username || '')}">
        </label>
        <button class="secondary-action danger" type="button" data-delete-user disabled>Delete User</button>
      </div>
    </div>
  `;
}

function clearError() {
  document.querySelectorAll('[data-admin-error]').forEach((node) => node.remove());
}

function renderError(error) {
  const view = document.querySelector(`[data-view="${state.activeView}"]`);
  if (!view) return;

  let panel = view.querySelector('[data-admin-error]');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'panel admin-error';
    panel.dataset.adminError = '';
    view.prepend(panel);
  }

  panel.innerHTML = `
      <div class="panel-header">
        <div>
          <div class="panel-title">Admin Request Failed</div>
          <div class="panel-subtitle">Fix the issue and retry the current action.</div>
        </div>
        <span class="pill hot">error</span>
      </div>
      <div class="empty-state">
        <strong>${escapeHtml(error?.message || error)}</strong>
      </div>
  `;
}

function renderStaticViews() {
  const toolGroups = getToolGroups();
  const views = {
    overview: `
      ${renderStats()}
      <div class="dashboard-grid">
        <div class="panel">
          <div class="panel-header">
            <div>
              <div class="panel-title">Work Queue</div>
              <div class="panel-subtitle">Live report and user signals routed to the right admin surface.</div>
            </div>
            <span class="pill warn">prioritized</span>
          </div>
          <div data-overview-queue>${renderQueueItems(buildOverviewQueue({ bugReports: state.bugReports, users: state.users }))}</div>
        </div>
        <div class="panel">
          <div class="panel-header">
            <div>
              <div class="panel-title">Operational Snapshot</div>
              <div class="panel-subtitle">Dense, scannable status for the admin home view.</div>
            </div>
          </div>
          <div class="mini-chart" aria-hidden="true">
            <span class="chart-bar chart-bar-1"></span><span class="chart-bar chart-bar-2"></span><span class="chart-bar chart-bar-3"></span><span class="chart-bar chart-bar-4"></span>
            <span class="chart-bar chart-bar-5"></span><span class="chart-bar chart-bar-6"></span><span class="chart-bar chart-bar-7"></span><span class="chart-bar chart-bar-8"></span>
            <span class="chart-bar chart-bar-9"></span><span class="chart-bar chart-bar-10"></span><span class="chart-bar chart-bar-11"></span><span class="chart-bar chart-bar-12"></span>
            <span class="chart-bar chart-bar-13"></span><span class="chart-bar chart-bar-14"></span><span class="chart-bar chart-bar-15"></span><span class="chart-bar chart-bar-16"></span>
          </div>
          <div class="callout">
            <div class="callout-box">
              <div class="callout-title">Navigation model</div>
              <div class="row-meta">Persistent workflow sidebar, sticky command bar, and no legacy top-tab section.</div>
            </div>
            <div class="callout-box">
              <div class="callout-title">Live data scope</div>
              <div class="row-meta">Bug reports are unauthenticated; user operations use the existing admin secret endpoint.</div>
            </div>
          </div>
        </div>
      </div>
    `,
    'bug-reports': `
      <div class="two-column">
        <div class="panel" data-bug-report-list></div>
        <div class="panel" data-selected-report-panel></div>
      </div>
    `,
    'users-data': `
      <div class="two-column">
        <div class="panel" data-user-results></div>
        <div class="panel" data-user-detail></div>
      </div>
    `,
    'language-qa': `
      <div class="two-column">
        <div class="panel">
          <div class="panel-header">
            <div>
              <div class="panel-title">Language QA</div>
              <div class="panel-subtitle">Core language-learning safety and dictionary review surfaces.</div>
            </div>
          </div>
          ${renderToolCards(toolGroups['language-qa'])}
        </div>
        <div class="panel">
          <div class="panel-header">
            <div>
              <div class="panel-title">Review Guardrails</div>
              <div class="panel-subtitle">Operational reminders for language tooling.</div>
            </div>
          </div>
          <div class="callout">
            <div class="callout-box">
              <div class="callout-title">Comprehensible input</div>
              <div class="row-meta">Japanese text must stay vocabulary-validated before player display.</div>
            </div>
            <div class="callout-box">
              <div class="callout-title">Dictionary accuracy</div>
              <div class="row-meta">Admin language pages should make definition review deliberate and audit-friendly.</div>
            </div>
          </div>
        </div>
      </div>
    `,
    'content-studio': `
      <div class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">Content Studio</div>
            <div class="panel-subtitle">Content authoring and review tools grouped as production workflows.</div>
          </div>
        </div>
        ${renderToolCards(toolGroups['content-studio'])}
      </div>
    `,
    'asset-pipeline': `
      <div class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">Asset Pipeline</div>
            <div class="panel-subtitle">Visual asset review, sprite inspection, and combat move preview surfaces.</div>
          </div>
        </div>
        ${renderToolCards(toolGroups['asset-pipeline'])}
      </div>
    `,
    simulators: `
      <div class="two-column">
        <div class="panel">
          <div class="panel-header">
            <div>
              <div class="panel-title">Simulators</div>
              <div class="panel-subtitle">Actual simulator dashboards from the Task 1 data module.</div>
            </div>
            <span class="pill purple">separate service</span>
          </div>
          ${renderToolCards(toolGroups.simulators)}
        </div>
        <div class="panel">
          <div class="panel-header">
            <div>
              <div class="panel-title">Analysis Notes</div>
              <div class="panel-subtitle">Why this workflow is separate</div>
            </div>
          </div>
          <div class="callout">
            <div class="callout-box">
              <div class="callout-title">Standalone dashboards</div>
              <div class="row-meta">These links open the simulator views themselves, not legacy maintenance endpoints.</div>
            </div>
            <div class="callout-box">
              <div class="callout-title">Future integration</div>
              <div class="row-meta">Later tasks can embed recent simulation runs after live data behavior is approved.</div>
            </div>
          </div>
        </div>
      </div>
    `,
  };

  Object.entries(views).forEach(([viewId, html]) => {
    const view = document.querySelector(`[data-view="${viewId}"]`);
    if (view) {
      view.innerHTML = html;
    }
  });
}

function setActiveView(viewId) {
  if (!viewTitles[viewId]) return;

  state.activeView = viewId;
  elements.viewTitle.textContent = viewTitles[viewId];

  document.querySelectorAll('[data-view]').forEach((view) => {
    view.classList.toggle('active', view.dataset.view === viewId);
  });

  document.querySelectorAll('[data-nav-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.navView === viewId);
  });

  applyGlobalSearchFilter();
}

function applyGlobalSearchFilter() {
  const query = elements.search?.value.trim().toLowerCase() ?? '';
  document.querySelectorAll('.tool-card, .row-item').forEach((item) => {
    const matches = !query || item.textContent.toLowerCase().includes(query);
    item.hidden = !matches;
  });
}

function updateDeleteUserButton() {
  const confirmation = document.querySelector('[data-delete-user-confirm]')?.value;
  const button = document.querySelector('[data-delete-user]');
  if (button) {
    button.disabled = !canDeleteUser(state.selectedUser, confirmation);
  }
}

function restoreUserFilterFocus(selectionStart, selectionEnd) {
  const input = document.querySelector('[data-user-filter]');
  if (!input) return;
  input.focus();
  const { start, end } = getRestoredSelectionRange(selectionStart, selectionEnd, input.value.length);
  input.setSelectionRange(start, end);
}

function bindEvents() {
  document.body.addEventListener('click', async (event) => {
    const navTarget = event.target.closest('[data-nav-view]');
    if (navTarget) {
      setActiveView(navTarget.dataset.navView);
      return;
    }

    const bugTarget = event.target.closest('[data-bug-report-id]');
    if (bugTarget) {
      try {
        await loadBugReportDetail(bugTarget.dataset.bugReportId);
      } catch (error) {
        renderError(error);
      }
      return;
    }

    if (event.target.closest('[data-delete-bug-report]')) {
      try {
        await deleteSelectedBugReport();
      } catch (error) {
        renderError(error);
      }
      return;
    }

    const copyGameStateButton = event.target.closest('[data-copy-game-state]');
    if (copyGameStateButton) {
      try {
        await copySelectedBugReportGameState();
        copyGameStateButton.textContent = 'Copied';
        setTimeout(() => {
          copyGameStateButton.textContent = 'Copy Game State';
        }, 1200);
      } catch (error) {
        renderError(error);
      }
      return;
    }

    if (event.target.closest('[data-load-bugs]')) {
      try {
        await loadBugReports();
      } catch (error) {
        renderError(error);
      }
      return;
    }

    const userTarget = event.target.closest('[data-user-id]');
    if (userTarget) {
      const user = state.users.find((item) => String(item.id) === userTarget.dataset.userId);
      if (user) {
        try {
          await loadUserKnowledge(user);
        } catch (error) {
          renderError(error);
        }
      }
      return;
    }

    if (event.target.closest('[data-save-admin-secret]')) {
      const secret = getTypedAdminSecret();
      if (!secret) return;
      saveAdminSecret(secret);
      state.requests.userKnowledge += 1;
      renderUsers();
      try {
        await loadUsers();
      } catch (error) {
        renderError(error);
      }
      return;
    }

    if (event.target.closest('[data-clear-admin-secret]')) {
      clearAdminSecret();
      clearError();
      state.requests.users += 1;
      state.requests.userKnowledge += 1;
      state.loading.users = false;
      state.users = [];
      state.selectedUser = null;
      state.selectedUserKnowledge = null;
      renderUsers();
      renderOverviewData();
      renderNav();
      return;
    }

    if (event.target.closest('[data-delete-user]')) {
      try {
        await deleteSelectedUser();
      } catch (error) {
        renderError(error);
      }
    }
  });

  document.body.addEventListener('input', (event) => {
    if (event.target.matches('[data-user-filter]')) {
      const { selectionStart, selectionEnd } = event.target;
      state.userQuery = event.target.value;
      renderUsers();
      restoreUserFilterFocus(selectionStart, selectionEnd);
      applyGlobalSearchFilter();
      return;
    }

    if (event.target.matches('[data-delete-user-confirm]')) {
      updateDeleteUserButton();
      return;
    }

    if (event.target.matches('[data-global-search]')) {
      applyGlobalSearchFilter();
    }
  });

  document.body.addEventListener('change', async (event) => {
    if (event.target.matches('[data-bug-report-environment]')) {
      try {
        await setBugReportEnvironment(event.target.value);
      } catch (error) {
        renderError(error);
      }
    }
  });

  elements.refresh?.addEventListener('click', refreshActiveView);
}

renderNav();
renderStaticViews();
renderBugReports();
renderUsers();
bindEvents();
setActiveView(state.activeView);
refreshActiveView();
