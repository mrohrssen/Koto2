# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for execution. This plan is intentionally broken into checkbox steps so each worker can claim one focused task, write tests first, implement, verify, and commit.

**Goal:** Build the first production-facing admin dashboard at `/admin/`, using the approved modern sidebar dashboard mockup as the visual direction. The dashboard should consolidate relevant admin tools, bug reports, user/data operations, content/language tools, asset tools, and the existing simulator dashboards while removing the obsolete `/dev/mockups` surface.

**Architecture:** Keep this as a vanilla static admin app served from `public/admin/`, backed by existing Express APIs. Shared dashboard constants and pure formatting helpers live in `public/js/admin-dashboard-data.js` so they can be imported by both the browser dashboard and unit tests. No React or build step is introduced.

**Tech Stack:** Express, static HTML/CSS, browser ES modules, Node test runner, existing `/api/admin/*`, `/api/bug-reports`, and simulator pages on `localhost:3100`.

---

## Approved Product Shape

Use the approved temporary mockup at:

`tmp/admin-dashboard-tabs-mockup.html`

Port the design language from that mockup:

- Persistent left sidebar grouped by workflow, not top tabs.
- Sticky top command/search bar.
- Overview command center with operational cards and urgent queues.
- Dedicated views for Bug Reports, Users & Data, Language QA, Content Studio, Asset Pipeline, and Simulators.
- Compact production-tool aesthetic: dense, readable, restrained, no marketing hero.

The dashboard must not include legacy one-off tools that the user explicitly removed:

- `/dev/mockups`
- `/regen-review.html`
- `/assets/sprites/items/review.html`
- `/creatures-gallery.html`
- generic `Legacy Tools` section

The dashboard must include actual simulator dashboards, not the low-level simulator ops:

- Learning Simulator: `http://localhost:3100/#profiles`
- Simulator Compare: `http://localhost:3100/#compare`
- Balance Simulator: `http://localhost:3100/#balance`

---

## File Plan

Create:

- `public/admin/index.html`
- `public/admin/admin.css`
- `public/admin/admin-dashboard.js`
- `public/js/admin-dashboard-data.js`
- `tests/unit/admin-dashboard-data.test.js`
- `tests/unit/routes/dev-mockups-removal.test.js`

Modify:

- `src/routes/dev.js`
- `public/dev-hub.html`
- `public/dev-sprites.html`
- `public/dev-content.html`
- `public/forge.html`

Delete:

- `public/dev-mockups.html`

Do not modify:

- `data/dictionary.json`
- generated dialogue files
- simulator runtime code

---

## Task 1: Add Dashboard Data Helpers With Tests

### Red Phase

Create `tests/unit/admin-dashboard-data.test.js` with tests for the navigation model, simulator links, bug report sorting, user filtering, and exact delete confirmation.

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_NAV,
  TOOL_LINKS,
  canDeleteUser,
  filterUsers,
  getAllDashboardHrefs,
  normalizeBugReports,
} from '../../public/js/admin-dashboard-data.js';

describe('admin dashboard data helpers', () => {
  it('does not expose removed legacy surfaces', () => {
    const hrefs = getAllDashboardHrefs();
    const removed = [
      '/dev/mockups',
      '/regen-review.html',
      '/assets/sprites/items/review.html',
      '/creatures-gallery.html',
    ];

    for (const href of removed) {
      assert.equal(hrefs.includes(href), false, `${href} should not be linked`);
    }

    assert.equal(
      ADMIN_NAV.some((section) => /legacy/i.test(section.label)),
      false,
      'legacy navigation section should not exist',
    );
  });

  it('includes the actual simulator dashboards', () => {
    const simulatorHrefs = TOOL_LINKS.simulators.map((tool) => tool.href);

    assert.deepEqual(simulatorHrefs, [
      'http://localhost:3100/#profiles',
      'http://localhost:3100/#compare',
      'http://localhost:3100/#balance',
    ]);
  });

  it('normalizes bug reports newest first with device labels', () => {
    const reports = normalizeBugReports([
      {
        id: 'older',
        note: 'Old issue',
        timestamp: '2026-06-01T10:00:00.000Z',
        viewport: { width: 390, height: 844 },
        devicePixelRatio: 3,
        gameState: { phase: 'hub' },
      },
      {
        id: 'newer',
        note: 'New issue',
        timestamp: '2026-06-02T10:00:00.000Z',
        viewport: { width: 1024, height: 768 },
        devicePixelRatio: 2,
        gameState: { phase: 'combat' },
      },
    ]);

    assert.equal(reports[0].id, 'newer');
    assert.equal(reports[0].deviceLabel, '1024 x 768 @2x');
    assert.equal(reports[0].phaseLabel, 'combat');
    assert.equal(reports[1].deviceLabel, '390 x 844 @3x');
  });

  it('filters users by username or id', () => {
    const users = [
      { id: 'user-1', username: 'devtester' },
      { id: 'user-2', username: 'playtester' },
    ];

    assert.deepEqual(filterUsers(users, 'dev').map((user) => user.id), ['user-1']);
    assert.deepEqual(filterUsers(users, 'USER-2').map((user) => user.id), ['user-2']);
    assert.deepEqual(filterUsers(users, '').map((user) => user.id), ['user-1', 'user-2']);
  });

  it('requires exact username confirmation before deleting a user', () => {
    assert.equal(canDeleteUser({ username: 'devtester' }, 'devtester'), true);
    assert.equal(canDeleteUser({ username: 'devtester' }, 'DevTester'), false);
    assert.equal(canDeleteUser({ username: 'devtester' }, ' devtester '), false);
    assert.equal(canDeleteUser(null, 'devtester'), false);
  });
});
```

Run the failing test:

```bash
node --test tests/unit/admin-dashboard-data.test.js
```

### Green Phase

Create `public/js/admin-dashboard-data.js`.

```js
export const ADMIN_NAV = [
  {
    label: 'Command Center',
    items: [
      { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
      { id: 'bug-reports', label: 'Bug Reports', icon: 'bug' },
      { id: 'users-data', label: 'Users & Data', icon: 'database' },
    ],
  },
  {
    label: 'Production Tools',
    items: [
      { id: 'language-qa', label: 'Language QA', icon: 'languages' },
      { id: 'content-studio', label: 'Content Studio', icon: 'file-pen' },
      { id: 'asset-pipeline', label: 'Asset Pipeline', icon: 'image' },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { id: 'simulators', label: 'Simulators', icon: 'activity' },
    ],
  },
];

export const TOOL_LINKS = {
  languageQa: [
    {
      label: 'Word Exposure Audit',
      href: '/admin-word-exposures.html',
      description: 'Inspect vocabulary exposure by user and surface words that need pacing review.',
      status: 'Production',
    },
    {
      label: 'Static Frame Audit',
      href: '/admin-frame-audit.html',
      description: 'Review generated dialogue frames, tokenization, readings, and dictionary coverage.',
      status: 'Production',
    },
  ],
  contentStudio: [
    {
      label: 'Koto Forge',
      href: '/forge.html',
      description: 'Generate and review creature, item, area, NPC, and move content workflows.',
      status: 'Production',
    },
    {
      label: 'Dev Content Browser',
      href: '/dev/content',
      description: 'Browse content collections, validation state, and authoring references.',
      status: 'Dev',
    },
  ],
  assetPipeline: [
    {
      label: 'Sprite Tools',
      href: '/dev/sprites',
      description: 'Inspect sprite sheets, assets, and cache-busting-sensitive visual resources.',
      status: 'Dev',
    },
    {
      label: 'Move Preview',
      href: '/creature-move-preview.html',
      description: 'Preview creature combat move visuals and animation behavior.',
      status: 'Dev',
    },
  ],
  simulators: [
    {
      label: 'Learning Simulator',
      href: 'http://localhost:3100/#profiles',
      description: 'Inspect learner profiles and progression assumptions.',
      status: 'Simulator',
    },
    {
      label: 'Simulator Compare',
      href: 'http://localhost:3100/#compare',
      description: 'Compare simulation runs, outcomes, and tuning deltas.',
      status: 'Simulator',
    },
    {
      label: 'Balance Simulator',
      href: 'http://localhost:3100/#balance',
      description: 'Review balance curves, encounter pacing, and reward pressure.',
      status: 'Simulator',
    },
  ],
};

export function getAllDashboardHrefs() {
  return Object.values(TOOL_LINKS)
    .flat()
    .map((tool) => tool.href);
}

export function filterUsers(users, query) {
  const normalizedQuery = String(query || '').trim().toLowerCase();

  if (!normalizedQuery) {
    return [...users];
  }

  return users.filter((user) => {
    const username = String(user.username || '').toLowerCase();
    const id = String(user.id || '').toLowerCase();
    return username.includes(normalizedQuery) || id.includes(normalizedQuery);
  });
}

export function canDeleteUser(user, confirmation) {
  if (!user?.username) {
    return false;
  }

  return confirmation === user.username;
}

export function normalizeBugReports(reports) {
  return [...reports]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .map((report) => {
      const width = report.viewport?.width ?? '?';
      const height = report.viewport?.height ?? '?';
      const ratio = report.devicePixelRatio ?? '?';

      return {
        ...report,
        deviceLabel: `${width} x ${height} @${ratio}x`,
        phaseLabel: report.gameState?.phase || 'unknown',
        submittedAt: new Date(report.timestamp),
      };
    });
}
```

Run:

```bash
node --test tests/unit/admin-dashboard-data.test.js
node --check public/js/admin-dashboard-data.js
```

Commit:

```bash
/usr/bin/git add public/js/admin-dashboard-data.js tests/unit/admin-dashboard-data.test.js
/usr/bin/git commit -m "test: add admin dashboard data model"
```

---

## Task 2: Build Static Admin Dashboard Shell

### Red Phase

There is no DOM test framework in the current repo for static browser pages, so this step uses syntax checks plus browser verification later. Keep the implementation deterministic and powered by the already-tested dashboard data module from Task 1.

### Green Phase

Create `public/admin/index.html` with this structure. Port the final approved visual content from `tmp/admin-dashboard-tabs-mockup.html` into the marked regions, preserving the modern sidebar layout and removing any demo-only scripts.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Koto Admin</title>
    <link rel="stylesheet" href="/admin/admin.css">
  </head>
  <body>
    <div class="admin-app" data-admin-app>
      <aside class="sidebar" aria-label="Admin sections">
        <div class="brand-block">
          <div class="brand-mark" aria-hidden="true">光</div>
          <div>
            <div class="brand-title">Koto Admin</div>
            <div class="brand-subtitle">Operations console</div>
          </div>
        </div>
        <nav class="sidebar-nav" data-sidebar-nav></nav>
      </aside>

      <main class="main-shell">
        <header class="topbar">
          <div>
            <div class="eyebrow">Admin Dashboard</div>
            <h1 data-view-title>Overview</h1>
          </div>
          <div class="command-row">
            <label class="command-search">
              <span class="sr-only">Search admin dashboard</span>
              <input data-global-search type="search" placeholder="Search users, reports, tools">
            </label>
            <button class="secondary-action" type="button" data-refresh-view>Refresh</button>
          </div>
        </header>

        <section class="view active" data-view="overview" aria-label="Overview"></section>
        <section class="view" data-view="bug-reports" aria-label="Bug Reports"></section>
        <section class="view" data-view="users-data" aria-label="Users and Data"></section>
        <section class="view" data-view="language-qa" aria-label="Language QA"></section>
        <section class="view" data-view="content-studio" aria-label="Content Studio"></section>
        <section class="view" data-view="asset-pipeline" aria-label="Asset Pipeline"></section>
        <section class="view" data-view="simulators" aria-label="Simulators"></section>
      </main>
    </div>

    <script type="module" src="/admin/admin-dashboard.js"></script>
  </body>
</html>
```

Create `public/admin/admin.css`. Use the approved mockup as the exact visual reference; this code block defines the required production layout primitives and accessible states.

```css
:root {
  --surface: #f6f7f4;
  --panel: #ffffff;
  --panel-strong: #fdfbf7;
  --ink: #202521;
  --muted: #66716a;
  --line: #d8ded5;
  --accent: #2f7d68;
  --accent-strong: #1f5c4b;
  --warning: #b86720;
  --danger: #b94444;
  --shadow: 0 18px 55px rgba(38, 49, 42, 0.12);
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  min-width: 1180px;
  margin: 0;
  color: var(--ink);
  background:
    linear-gradient(135deg, rgba(47, 125, 104, 0.08), transparent 38%),
    var(--surface);
}

button,
input {
  font: inherit;
}

.admin-app {
  display: grid;
  min-height: 100vh;
  grid-template-columns: 280px minmax(0, 1fr);
}

.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  padding: 24px 18px;
  border-right: 1px solid var(--line);
  background: rgba(253, 251, 247, 0.92);
  backdrop-filter: blur(18px);
}

.brand-block {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 8px 24px;
}

.brand-mark {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 8px;
  color: white;
  background: var(--accent);
  font-weight: 800;
}

.brand-title {
  font-size: 16px;
  font-weight: 800;
}

.brand-subtitle,
.eyebrow,
.tool-meta,
.stat-label,
.empty-state {
  color: var(--muted);
  font-size: 12px;
}

.sidebar-section {
  margin: 18px 0;
}

.sidebar-heading {
  padding: 0 10px 8px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.nav-button {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 42px;
  margin: 2px 0;
  padding: 10px 12px;
  border: 0;
  border-radius: 8px;
  color: var(--ink);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.nav-button:hover,
.nav-button.active {
  background: rgba(47, 125, 104, 0.1);
  color: var(--accent-strong);
}

.main-shell {
  min-width: 0;
  padding: 28px 34px 48px;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin: -28px -34px 24px;
  padding: 24px 34px 18px;
  border-bottom: 1px solid rgba(216, 222, 213, 0.8);
  background: rgba(246, 247, 244, 0.92);
  backdrop-filter: blur(18px);
}

h1,
h2,
h3,
p {
  margin: 0;
}

h1 {
  margin-top: 4px;
  font-size: 26px;
  line-height: 1.15;
}

.command-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.command-search input {
  width: 340px;
  height: 40px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: white;
}

.secondary-action,
.primary-action,
.danger-action {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: white;
  cursor: pointer;
}

.primary-action {
  border-color: var(--accent);
  color: white;
  background: var(--accent);
}

.danger-action {
  border-color: rgba(185, 68, 68, 0.35);
  color: var(--danger);
}

.danger-action:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.view {
  display: none;
}

.view.active {
  display: block;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: 1.25fr 0.75fr;
  gap: 18px;
}

.panel,
.tool-card,
.stat-card {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: var(--shadow);
}

.panel {
  padding: 20px;
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.panel-title {
  font-size: 17px;
  font-weight: 800;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.stat-card {
  padding: 16px;
  box-shadow: none;
}

.stat-value {
  margin-top: 8px;
  font-size: 28px;
  font-weight: 850;
}

.list-stack {
  display: grid;
  gap: 10px;
}

.row-item {
  display: grid;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel-strong);
}

.row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.row-title {
  font-weight: 800;
}

.pill {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  color: var(--accent-strong);
  background: rgba(47, 125, 104, 0.1);
  font-size: 12px;
  font-weight: 750;
}

.pill.warning {
  color: var(--warning);
  background: rgba(184, 103, 32, 0.12);
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.tool-card {
  display: grid;
  min-height: 148px;
  gap: 12px;
  padding: 18px;
  color: inherit;
  text-decoration: none;
}

.tool-card:hover {
  border-color: rgba(47, 125, 104, 0.45);
  transform: translateY(-1px);
}

.tool-card h3 {
  font-size: 16px;
}

.tool-card p {
  color: var(--muted);
  line-height: 1.45;
}

.two-column {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 18px;
}

.stacked-form {
  display: grid;
  gap: 10px;
}

.stacked-form input,
.panel input {
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

Create `public/admin/admin-dashboard.js` with initial static rendering. The live-data functions are added in Task 3.

```js
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

const state = {
  activeView: 'overview',
};

const elements = {
  nav: document.querySelector('[data-sidebar-nav]'),
  viewTitle: document.querySelector('[data-view-title]'),
  refresh: document.querySelector('[data-refresh-view]'),
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderNav() {
  elements.nav.innerHTML = ADMIN_NAV.map((section) => `
    <div class="sidebar-section">
      <div class="sidebar-heading">${escapeHtml(section.label)}</div>
      ${section.items.map((item) => `
        <button class="nav-button ${item.id === state.activeView ? 'active' : ''}" type="button" data-nav-view="${escapeHtml(item.id)}">
          <span>${escapeHtml(item.label)}</span>
          <span aria-hidden="true">›</span>
        </button>
      `).join('')}
    </div>
  `).join('');
}

function renderToolCards(tools) {
  return `
    <div class="tool-grid">
      ${tools.map((tool) => `
        <a class="tool-card" href="${escapeHtml(tool.href)}">
          <div class="row-top">
            <h3>${escapeHtml(tool.label)}</h3>
            <span class="pill">${escapeHtml(tool.status)}</span>
          </div>
          <p>${escapeHtml(tool.description)}</p>
          <div class="tool-meta">${escapeHtml(tool.href)}</div>
        </a>
      `).join('')}
    </div>
  `;
}

function renderStaticViews() {
  document.querySelector('[data-view="overview"]').innerHTML = `
    <div class="dashboard-grid">
      <section class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">Operations Work Queue</div>
            <p class="tool-meta">Live bug and user data load after admin authorization.</p>
          </div>
        </div>
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-label">Bug reports</div><div class="stat-value" data-stat-bugs>--</div></div>
          <div class="stat-card"><div class="stat-label">Users</div><div class="stat-value" data-stat-users>--</div></div>
          <div class="stat-card"><div class="stat-label">Production tools</div><div class="stat-value">${Object.values(TOOL_LINKS).flat().length}</div></div>
        </div>
        <div class="list-stack" data-overview-queue>
          <div class="empty-state">Connect admin data to populate the queue.</div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">Primary Actions</div>
            <p class="tool-meta">The highest-frequency admin workflows.</p>
          </div>
        </div>
        ${renderToolCards([
          TOOL_LINKS.languageQa[0],
          TOOL_LINKS.contentStudio[0],
          TOOL_LINKS.simulators[1],
        ])}
      </section>
    </div>
  `;

  document.querySelector('[data-view="language-qa"]').innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <div>
          <div class="panel-title">Language QA</div>
          <p class="tool-meta">Japanese safety, frame validation, and i+1 exposure review.</p>
        </div>
      </div>
      ${renderToolCards(TOOL_LINKS.languageQa)}
    </section>
  `;

  document.querySelector('[data-view="content-studio"]').innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <div>
          <div class="panel-title">Content Studio</div>
          <p class="tool-meta">Forge workflows and content browser surfaces.</p>
        </div>
      </div>
      ${renderToolCards(TOOL_LINKS.contentStudio)}
    </section>
  `;

  document.querySelector('[data-view="asset-pipeline"]').innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <div>
          <div class="panel-title">Asset Pipeline</div>
          <p class="tool-meta">Sprites, combat previews, and visual inspection tools.</p>
        </div>
      </div>
      ${renderToolCards(TOOL_LINKS.assetPipeline)}
    </section>
  `;

  document.querySelector('[data-view="simulators"]').innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <div>
          <div class="panel-title">Simulators</div>
          <p class="tool-meta">Actual simulator dashboards for learning, comparison, and balance work.</p>
        </div>
      </div>
      ${renderToolCards(TOOL_LINKS.simulators)}
    </section>
  `;
}

function setActiveView(viewId) {
  state.activeView = viewId;
  elements.viewTitle.textContent = viewTitles[viewId];

  for (const view of document.querySelectorAll('[data-view]')) {
    view.classList.toggle('active', view.dataset.view === viewId);
  }

  renderNav();
}

function bindEvents() {
  elements.nav.addEventListener('click', (event) => {
    const button = event.target.closest('[data-nav-view]');
    if (!button) {
      return;
    }
    setActiveView(button.dataset.navView);
  });
}

renderNav();
renderStaticViews();
bindEvents();
setActiveView(state.activeView);
```

Run:

```bash
node --check public/admin/admin-dashboard.js
```

Commit:

```bash
/usr/bin/git add public/admin/index.html public/admin/admin.css public/admin/admin-dashboard.js
/usr/bin/git commit -m "feat: add admin dashboard shell"
```

---

## Task 3: Wire Bug Reports and Users/Data

### Red Phase

Extend `tests/unit/admin-dashboard-data.test.js` with one more pure helper test for overview queue construction before changing browser code.

Add these imports:

```js
import {
  buildOverviewQueue,
  // existing imports stay
} from '../../public/js/admin-dashboard-data.js';
```

Add this test:

```js
it('builds the overview queue from recent bug and user data', () => {
  const queue = buildOverviewQueue({
    bugReports: [
      { id: 'bug-1', note: 'Combat card stuck', timestamp: '2026-06-02T12:00:00.000Z' },
    ],
    users: [
      { id: 'user-1', username: 'devtester' },
    ],
  });

  assert.deepEqual(queue, [
    {
      kind: 'bug',
      title: 'Combat card stuck',
      meta: 'bug-1',
      view: 'bug-reports',
      priority: 'warning',
    },
    {
      kind: 'user',
      title: '1 user account available',
      meta: 'Users & Data',
      view: 'users-data',
      priority: 'normal',
    },
  ]);
});
```

Run:

```bash
node --test tests/unit/admin-dashboard-data.test.js
```

### Green Phase

Add this helper to `public/js/admin-dashboard-data.js`.

```js
export function buildOverviewQueue({ bugReports = [], users = [] }) {
  const queue = [];
  const latestBug = normalizeBugReports(bugReports)[0];

  if (latestBug) {
    queue.push({
      kind: 'bug',
      title: latestBug.note || 'Bug report without note',
      meta: latestBug.id,
      view: 'bug-reports',
      priority: 'warning',
    });
  }

  queue.push({
    kind: 'user',
    title: `${users.length} user account${users.length === 1 ? '' : 's'} available`,
    meta: 'Users & Data',
    view: 'users-data',
    priority: 'normal',
  });

  return queue;
}
```

Run:

```bash
node --test tests/unit/admin-dashboard-data.test.js
```

### Browser Implementation

Update `public/admin/admin-dashboard.js` imports:

```js
import {
  ADMIN_NAV,
  TOOL_LINKS,
  buildOverviewQueue,
  canDeleteUser,
  filterUsers,
  normalizeBugReports,
} from '/js/admin-dashboard-data.js';
```

Expand state:

```js
const state = {
  activeView: 'overview',
  adminSecret: sessionStorage.getItem('koto-admin-secret') || '',
  bugReports: [],
  users: [],
  selectedUser: null,
  selectedUserKnowledge: null,
  userQuery: '',
};
```

Add API helpers:

```js
async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${message}`);
  }
  return response.json();
}

async function ensureAdminSecret() {
  if (state.adminSecret) {
    return state.adminSecret;
  }

  const payload = await fetchJson('/api/admin/secret');
  state.adminSecret = payload.secret;
  sessionStorage.setItem('koto-admin-secret', state.adminSecret);
  return state.adminSecret;
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
```

Add live data functions:

```js
async function loadBugReports() {
  const payload = await fetchJson('/api/bug-reports');
  state.bugReports = normalizeBugReports(payload.reports || []);
  renderBugReports();
  renderOverviewData();
}

async function loadUsers() {
  const payload = await adminFetchJson('/api/admin/list-users');
  state.users = payload.users || [];
  renderUsers();
  renderOverviewData();
}

async function loadUserKnowledge(user) {
  state.selectedUser = user;
  state.selectedUserKnowledge = null;
  renderUserDetail();
  const payload = await adminFetchJson(`/api/admin/word-knowledge/${encodeURIComponent(user.id)}`);
  state.selectedUserKnowledge = payload;
  renderUserDetail();
}

async function deleteSelectedUser() {
  if (!canDeleteUser(state.selectedUser, document.querySelector('[data-delete-user-confirm]')?.value)) {
    return;
  }

  await adminFetchJson('/api/admin/delete-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: state.selectedUser.username }),
  });

  state.selectedUser = null;
  state.selectedUserKnowledge = null;
  await loadUsers();
}
```

Replace the seed Bug Reports and Users/Data view rendering with live renderers:

```js
function renderBugReports() {
  const view = document.querySelector('[data-view="bug-reports"]');
  view.innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <div>
          <div class="panel-title">Bug Reports</div>
          <p class="tool-meta">Recent mobile reports with viewport, phase, and screenshot links.</p>
        </div>
        <button class="secondary-action" type="button" data-load-bugs>Refresh reports</button>
      </div>
      <div class="list-stack">
        ${state.bugReports.length ? state.bugReports.map((report) => `
          <article class="row-item">
            <div class="row-top">
              <div>
                <div class="row-title">${escapeHtml(report.note || 'No note')}</div>
                <div class="tool-meta">${escapeHtml(report.id)} · ${escapeHtml(report.deviceLabel)} · ${escapeHtml(report.phaseLabel)}</div>
              </div>
              <span class="pill warning">${escapeHtml(report.submittedAt.toLocaleString())}</span>
            </div>
            <div class="command-row">
              <a class="secondary-action" href="/api/bug-reports/${encodeURIComponent(report.id)}/screenshot">Screenshot</a>
              <a class="secondary-action" href="/api/bug-reports/${encodeURIComponent(report.id)}">Metadata</a>
            </div>
          </article>
        `).join('') : '<div class="empty-state">No bug reports found.</div>'}
      </div>
    </section>
  `;
}

function renderUsers() {
  const users = filterUsers(state.users, state.userQuery);
  const view = document.querySelector('[data-view="users-data"]');
  view.innerHTML = `
    <div class="two-column">
      <section class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">Users</div>
            <p class="tool-meta">Search accounts and inspect vocabulary data.</p>
          </div>
        </div>
        <label class="stacked-form">
          <span class="sr-only">Filter users</span>
          <input data-user-filter type="search" value="${escapeHtml(state.userQuery)}" placeholder="Filter by username or id">
        </label>
        <div class="list-stack">
          ${users.map((user) => `
            <button class="row-item" type="button" data-user-id="${escapeHtml(user.id)}">
              <span class="row-top">
                <span class="row-title">${escapeHtml(user.username || user.id)}</span>
                <span class="pill">${escapeHtml(user.id)}</span>
              </span>
            </button>
          `).join('') || '<div class="empty-state">No users match this search.</div>'}
        </div>
      </section>
      <section class="panel" data-user-detail></section>
    </div>
  `;
  renderUserDetail();
}

function renderUserDetail() {
  const detail = document.querySelector('[data-user-detail]');
  if (!detail) {
    return;
  }

  if (!state.selectedUser) {
    detail.innerHTML = `
      <div class="panel-header">
        <div>
          <div class="panel-title">User Detail</div>
          <p class="tool-meta">Select a user to view word knowledge and data operations.</p>
        </div>
      </div>
      <div class="empty-state">No user selected.</div>
    `;
    return;
  }

  const words = state.selectedUserKnowledge?.words;
  const knownCount = words ? words.filter((word) => word.known).length : '--';
  const exposedCount = words
    ? words.reduce((sum, word) => sum + (Number(word.exposures) || 0), 0)
    : '--';

  detail.innerHTML = `
    <div class="panel-header">
      <div>
        <div class="panel-title">${escapeHtml(state.selectedUser.username || state.selectedUser.id)}</div>
        <p class="tool-meta">${escapeHtml(state.selectedUser.id)}</p>
      </div>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Known words</div><div class="stat-value">${knownCount}</div></div>
      <div class="stat-card"><div class="stat-label">Exposures</div><div class="stat-value">${exposedCount}</div></div>
      <div class="stat-card"><div class="stat-label">Actions</div><div class="stat-value">1</div></div>
    </div>
    <div class="panel">
      <div class="panel-title">Delete User</div>
      <p class="tool-meta">Type the exact username to enable deletion.</p>
      <div class="stacked-form">
        <input data-delete-user-confirm placeholder="${escapeHtml(state.selectedUser.username || '')}">
        <button class="danger-action" type="button" data-delete-user disabled>Delete user</button>
      </div>
    </div>
  `;
}

function renderOverviewData() {
  document.querySelector('[data-stat-bugs]').textContent = String(state.bugReports.length);
  document.querySelector('[data-stat-users]').textContent = String(state.users.length);

  const queue = buildOverviewQueue({ bugReports: state.bugReports, users: state.users });
  document.querySelector('[data-overview-queue]').innerHTML = queue.map((item) => `
    <button class="row-item" type="button" data-nav-view="${escapeHtml(item.view)}">
      <span class="row-top">
        <span class="row-title">${escapeHtml(item.title)}</span>
        <span class="pill ${item.priority === 'warning' ? 'warning' : ''}">${escapeHtml(item.kind)}</span>
      </span>
      <span class="tool-meta">${escapeHtml(item.meta)}</span>
    </button>
  `).join('');
}
```

Update event binding:

```js
function bindEvents() {
  document.body.addEventListener('click', async (event) => {
    const navButton = event.target.closest('[data-nav-view]');
    if (navButton) {
      setActiveView(navButton.dataset.navView);
      return;
    }

    const userButton = event.target.closest('[data-user-id]');
    if (userButton) {
      const user = state.users.find((candidate) => candidate.id === userButton.dataset.userId);
      if (user) {
        await loadUserKnowledge(user);
      }
      return;
    }

    if (event.target.closest('[data-load-bugs]')) {
      await loadBugReports();
      return;
    }

    if (event.target.closest('[data-delete-user]')) {
      await deleteSelectedUser();
    }
  });

  document.body.addEventListener('input', (event) => {
    if (event.target.matches('[data-user-filter]')) {
      state.userQuery = event.target.value;
      renderUsers();
      event.target.focus();
      return;
    }

    if (event.target.matches('[data-delete-user-confirm]')) {
      const deleteButton = document.querySelector('[data-delete-user]');
      if (deleteButton) {
        deleteButton.disabled = !canDeleteUser(state.selectedUser, event.target.value);
      }
    }
  });

  elements.refresh.addEventListener('click', () => refreshActiveView());
}
```

Add refresh and initialization:

```js
async function refreshActiveView() {
  try {
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

function renderError(error) {
  const view = document.querySelector(`[data-view="${state.activeView}"]`);
  view.innerHTML = `
    <section class="panel">
      <div class="panel-title">Unable to load admin data</div>
      <p class="tool-meta">${escapeHtml(error.message)}</p>
    </section>
  `;
}

renderNav();
renderStaticViews();
renderBugReports();
renderUsers();
bindEvents();
setActiveView(state.activeView);
refreshActiveView();
```

Run:

```bash
node --check public/admin/admin-dashboard.js
node --test tests/unit/admin-dashboard-data.test.js
```

Commit:

```bash
/usr/bin/git add public/js/admin-dashboard-data.js public/admin/admin-dashboard.js tests/unit/admin-dashboard-data.test.js
/usr/bin/git commit -m "feat: wire admin dashboard data"
```

---

## Task 4: Remove Dev Mockups Surface

### Red Phase

Create `tests/unit/routes/dev-mockups-removal.test.js`.

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createDevRouter } from '../../../src/routes/dev.js';

const root = process.cwd();

function createApp() {
  const app = express();
  app.use('/dev', createDevRouter({ password: '' }));
  return app;
}

describe('removed dev mockups surface', () => {
  it('does not serve the dev mockups page route', async () => {
    const response = await request(createApp()).get('/dev/mockups');
    assert.equal(response.status, 404);
  });

  it('does not serve the dev mockups API route', async () => {
    const response = await request(createApp()).get('/dev/api/mockups');
    assert.equal(response.status, 404);
  });

  it('removes mockups links from dev navigation files', () => {
    const navFiles = [
      'public/dev-hub.html',
      'public/dev-sprites.html',
      'public/dev-content.html',
      'public/forge.html',
    ];

    for (const file of navFiles) {
      const html = readFileSync(join(root, file), 'utf8');
      assert.equal(html.includes('/dev/mockups'), false, `${file} still links /dev/mockups`);
      assert.equal(/Feature Mockups/i.test(html), false, `${file} still labels Feature Mockups`);
    }
  });
});
```

Run and confirm it fails while `/dev/mockups` still exists:

```bash
node --test tests/unit/routes/dev-mockups-removal.test.js
```

### Green Phase

Edit `src/routes/dev.js` and remove the `/mockups` route and `/api/mockups` route entirely.

Remove blocks shaped like:

```js
router.get('/mockups', (_req, res) => {
  res.sendFile(join(__dirname, '../../public/dev-mockups.html'));
});

router.get('/api/mockups', (_req, res) => {
  const publicDir = join(__dirname, '../../public');
  const files = readdirSync(publicDir)
    .filter((file) => file.startsWith('mockup-') && file.endsWith('.html'))
    .map((file) => ({
      file,
      title: file
        .replace(/^mockup-/, '')
        .replace(/\.html$/, '')
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' '),
      href: `/${file}`,
    }));

  res.json({ files });
});
```

If `readdirSync` is only used for that endpoint, remove it from the import list.

Delete `public/dev-mockups.html` with `apply_patch`.

Remove the Mockups nav link from:

- `public/dev-hub.html`
- `public/dev-sprites.html`
- `public/dev-content.html`
- `public/forge.html`

Remove the Feature Mockups card from `public/dev-hub.html`.

Run:

```bash
node --test tests/unit/routes/dev-mockups-removal.test.js
node --check src/routes/dev.js
```

Commit:

```bash
/usr/bin/git add src/routes/dev.js public/dev-hub.html public/dev-sprites.html public/dev-content.html public/forge.html tests/unit/routes/dev-mockups-removal.test.js
/usr/bin/git add -u public/dev-mockups.html
/usr/bin/git commit -m "chore: remove dev mockups admin surface"
```

---

## Task 5: Full Verification

Run syntax checks:

```bash
node --check public/js/admin-dashboard-data.js
node --check public/admin/admin-dashboard.js
node --check src/routes/dev.js
```

Run focused tests:

```bash
node --test tests/unit/admin-dashboard-data.test.js tests/unit/routes/dev-mockups-removal.test.js
```

Run the project gate:

```bash
npm test
```

Start the dev server:

```bash
npm run dev
```

Verify the admin dashboard URL responds:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin/
```

Expected output:

```text
200
```

Open the browser to:

```text
http://localhost:3000/admin/
```

Visual verification checklist:

- Sidebar layout is visible and not a top-tab layout.
- Overview renders operation stats and primary action links.
- Bug Reports view loads from `/api/bug-reports`.
- Users & Data view loads users from `/api/admin/list-users`.
- Selecting a user loads vocabulary data from `/api/admin/word-knowledge/:userId`.
- Delete user button remains disabled until the exact username is typed.
- Language QA links to `/admin-word-exposures.html` and `/admin-frame-audit.html`.
- Content Studio links to `/forge.html` and `/dev/content`.
- Asset Pipeline links to `/dev/sprites` and `/creature-move-preview.html`.
- Simulators links show all three actual simulator dashboards.
- No Legacy Tools section appears.
- No `/dev/mockups` link appears.

Check the removed route:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/dev/mockups
```

Expected output:

```text
404
```

Commit any final visual or copy adjustments:

```bash
/usr/bin/git status --short
/usr/bin/git add public/admin/index.html public/admin/admin.css public/admin/admin-dashboard.js public/js/admin-dashboard-data.js
/usr/bin/git commit -m "polish: finalize admin dashboard presentation"
```

---

## Completion Criteria

The implementation is complete only when:

- `/admin/` serves the new dashboard.
- Dashboard navigation uses a sidebar, not top tabs.
- Dashboard includes Bug Reports, Users & Data, Language QA, Content Studio, Asset Pipeline, and Simulators.
- Dashboard excludes removed legacy and mockup surfaces.
- `/dev/mockups` and `/dev/api/mockups` return 404.
- Focused tests pass.
- `npm test` passes, or any unrelated failure is documented with exact output.
- Browser screenshot verification confirms the dashboard layout.

---

## Risk Notes

- The bug report list endpoint is currently not admin-secret protected. This plan uses the existing endpoint without changing auth semantics.
- The admin secret endpoint already exists and is used for the first dashboard pass. Hardening admin auth belongs in a later security pass.
- Simulator dashboards live outside the main app at `localhost:3100`; the admin dashboard links to them directly and does not embed them.
- The dashboard must not alter dictionary data, dialogue frames, or simulator behavior.
