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
