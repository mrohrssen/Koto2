import { ADMIN_NAV, TOOL_LINKS } from '/js/admin-dashboard-data.js';

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

const state = {
  activeView: 'overview',
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
  if (!value) return '#';

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

function getToolGroups() {
  return {
    'language-qa': TOOL_LINKS.languageQa ?? [],
    'content-studio': TOOL_LINKS.contentStudio ?? [],
    'asset-pipeline': TOOL_LINKS.assetPipeline ?? [],
    simulators: TOOL_LINKS.simulators ?? [],
  };
}

function getToolCountForView(viewId) {
  return getToolGroups()[viewId]?.length ?? 0;
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
    ['Open Reports', '0', 'Live bug report data arrives in Task 3.', 'pending'],
    ['Language Tools', String(TOOL_LINKS.languageQa?.length ?? 0), 'Static frame and word exposure workflows.', 'ready'],
    ['Content Tools', String((TOOL_LINKS.contentStudio?.length ?? 0) + (TOOL_LINKS.assetPipeline?.length ?? 0)), 'Forge, content browser, sprites, and previews.', 'ready'],
    ['Simulators', String(TOOL_LINKS.simulators?.length ?? 0), 'Learning, comparison, and balance dashboards.', 'ready'],
  ];

  return `
    <div class="stats-grid">
      ${stats.map(([label, value, note, status]) => `
        <div class="stat-card">
          <div class="stat-label"><span>${escapeHtml(label)}</span><span>${escapeHtml(status)}</span></div>
          <div class="stat-value">${escapeHtml(value)}</div>
          <div class="stat-note">${escapeHtml(note)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderOverviewQueue() {
  const queueItems = [
    {
      title: 'Authorize bug reports inbox',
      meta: 'Task 3 will load report metadata, screenshots, viewport, DPR, user agent, and game state.',
      status: 'Blocked',
      tone: 'warn',
      view: 'bug-reports',
    },
    {
      title: 'Connect user data operations',
      meta: 'Task 3 will expose guarded search, knowledge review, and destructive user operations.',
      status: 'Auth',
      tone: 'warn',
      view: 'users-data',
    },
    {
      title: 'Review language safety tools',
      meta: 'Audit word exposure and generated dialogue frames from the production language QA pages.',
      status: 'Core',
      tone: 'good',
      view: 'language-qa',
    },
    {
      title: 'Open simulator dashboards',
      meta: 'Use the actual Learning, Compare, and Balance simulator cards from the dashboard data module.',
      status: 'Analysis',
      tone: 'purple',
      view: 'simulators',
    },
  ];

  return `
    <div class="list-stack">
      ${queueItems.map((item) => `
        <button class="row-item" type="button" data-nav-view="${escapeHtml(item.view)}">
          <span>
            <span class="row-title">${escapeHtml(item.title)}</span>
            <span class="row-meta">${escapeHtml(item.meta)}</span>
          </span>
          <span class="pill ${escapeHtml(item.tone)}">${escapeHtml(item.status)}</span>
        </button>
      `).join('')}
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
              <div class="panel-subtitle">Static admin shell. Live report and user data are intentionally deferred.</div>
            </div>
            <span class="pill warn">prioritized</span>
          </div>
          ${renderOverviewQueue()}
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
              <div class="callout-title">Current scope</div>
              <div class="row-meta">This page is static. Live authorization, fetching, and mutations belong to Task 3.</div>
            </div>
          </div>
        </div>
      </div>
    `,
    'bug-reports': `
      <div class="two-column">
        <div class="panel" data-bug-report-list>
          <div class="panel-header">
            <div>
              <div class="panel-title">Bug Reports Inbox</div>
              <div class="panel-subtitle">Prepared for production and dev report feeds after authorization.</div>
            </div>
            <span class="pill warn">Task 3</span>
          </div>
          <div class="empty-state">
            <strong>Bug report data will load after admin authorization.</strong>
            <span>This static shell does not call the bug report API. Task 3 will add report rows, screenshot actions, environment switching, and delete controls.</span>
          </div>
        </div>
        <div class="panel" data-selected-report-panel>
          <div class="panel-header">
            <div>
              <div class="panel-title">Selected Report</div>
              <div class="panel-subtitle">Future detail panel</div>
            </div>
          </div>
          <div class="empty-state">
            <strong>No report selected.</strong>
            <span>Authorized report details will show screenshot metadata, viewport, DPR, user agent, and captured game state.</span>
          </div>
        </div>
      </div>
    `,
    'users-data': `
      <div class="two-column">
        <div class="panel" data-user-results>
          <div class="panel-header">
            <div>
              <div class="panel-title">Users & Data</div>
              <div class="panel-subtitle">Guarded user operations surface for Task 3.</div>
            </div>
            <span class="pill warn">auth gated</span>
          </div>
          <div class="empty-state">
            <strong>User data will load after admin authorization.</strong>
            <span>This task keeps user search, save summaries, word knowledge, and destructive operations out of the static shell.</span>
          </div>
        </div>
        <div class="panel" data-user-detail>
          <div class="panel-header">
            <div>
              <div class="panel-title">User Operations</div>
              <div class="panel-subtitle">Static controls only</div>
            </div>
          </div>
          <div class="stacked-form" data-user-operations>
            <div class="input-row" data-user-search-form>
              <input type="search" value="" placeholder="Search users after authorization" aria-label="Search users" disabled>
              <button class="secondary-action" type="button" disabled>Find</button>
            </div>
            <button class="secondary-action" type="button" disabled>Load word knowledge</button>
            <button class="secondary-action" type="button" disabled>View save summary</button>
          </div>
        </div>
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
}

function applyGlobalSearchFilter() {
  const query = elements.search?.value.trim().toLowerCase() ?? '';
  document.querySelectorAll('.tool-card, .row-item').forEach((item) => {
    const matches = !query || item.textContent.toLowerCase().includes(query);
    item.hidden = !matches;
  });
}

function bindEvents() {
  document.addEventListener('click', (event) => {
    const navTarget = event.target.closest('[data-nav-view]');
    if (navTarget) {
      setActiveView(navTarget.dataset.navView);
    }
  });

  elements.refresh?.addEventListener('click', () => {
    renderStaticViews();
    setActiveView(state.activeView);
    applyGlobalSearchFilter();
  });

  elements.search?.addEventListener('input', () => {
    applyGlobalSearchFilter();
  });
}

renderNav();
renderStaticViews();
bindEvents();
setActiveView(state.activeView);
