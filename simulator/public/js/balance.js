import { balance } from './api.js';

let refreshInterval = null;
let sortKey = 'winRate';
let sortDir = 'desc';

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

export function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return '0%';
  return `${(number * 100).toFixed(1)}%`;
}

export function sortBalanceRows(rows, key = 'winRate', dir = 'desc') {
  const copy = [...(rows || [])];
  const direction = dir === 'asc' ? 1 : -1;
  copy.sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === 'number' || typeof bv === 'number') {
      return ((Number(av) || 0) - (Number(bv) || 0)) * direction;
    }
    return String(av ?? '').localeCompare(String(bv ?? '')) * direction;
  });
  return copy;
}

function stopRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

function renderRows(job) {
  const rows = sortBalanceRows(job?.results || [], sortKey, sortDir);
  if (rows.length === 0) {
    return '<div class="empty-state">No balance results yet. Start a run to generate aggregate win rates.</div>';
  }

  const header = [
    ['nameEn', 'Creature'],
    ['rarity', 'Rarity'],
    ['appearances', 'Appearances'],
    ['wins', 'Wins'],
    ['losses', 'Losses'],
    ['winRate', 'Win Rate'],
    ['lossRate', 'Loss Rate']
  ].map(([key, label]) => `<th><button class="table-sort" data-sort="${key}">${label}</button></th>`).join('');

  const body = rows.map(row => `
    <tr>
      <td><span class="vocab-word">${esc(row.nameEn || row.name || row.creatureId)}</span></td>
      <td>${esc(row.rarity)}</td>
      <td>${row.appearances || 0}</td>
      <td>${row.wins || 0}</td>
      <td>${row.losses || 0}</td>
      <td>${formatPercent(row.winRate)}</td>
      <td>${formatPercent(row.lossRate)}</td>
    </tr>
  `).join('');

  return `
    <div class="vocab-table-wrap">
      <table class="vocab-table balance-table">
        <thead><tr>${header}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function renderStatus(job) {
  if (!job || job.status === 'idle') {
    return '<div class="empty-state">No active balance simulation.</div>';
  }
  const total = Number(job.battleCount) || 0;
  const done = Number(job.completedBattles) || 0;
  const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0;
  return `
    <div class="balance-status">
      <span class="status-badge status-${esc(job.status)}">${esc(job.status)}</span>
      <strong>${done.toLocaleString()} / ${total.toLocaleString()}</strong>
      <span>Level ${esc(job.creatureLevel)}</span>
      <span>Draws: ${(job.draws || 0).toLocaleString()}</span>
      <div class="progress-bar"><div class="fill" style="width: ${pct}%"></div></div>
    </div>
  `;
}

async function refresh(appEl) {
  const job = await balance.current();
  const statusEl = appEl.querySelector('[data-balance-status]');
  const resultsEl = appEl.querySelector('[data-balance-results]');
  if (statusEl) statusEl.innerHTML = renderStatus(job);
  if (resultsEl) resultsEl.innerHTML = renderRows(job);

  if (job?.status === 'running' && !refreshInterval) {
    refreshInterval = setInterval(() => refresh(appEl).catch(console.error), 1000);
  }
  if (job?.status !== 'running') stopRefresh();
}

export async function renderBalance(appEl) {
  stopRefresh();
  appEl.innerHTML = `
    <section class="balance-panel">
      <div class="sim-header">
        <h2>Balance Simulator</h2>
      </div>
      <form class="balance-form">
        <div class="form-row">
          <div class="form-group">
            <label>Battle Count</label>
            <input name="battleCount" type="number" min="1" step="1" value="10000">
          </div>
          <div class="form-group">
            <label>Creature Level</label>
            <input name="creatureLevel" type="number" min="1" step="1" value="40">
          </div>
        </div>
        <div class="actions">
          <button class="btn btn-primary" type="submit">Start</button>
          <button class="btn btn-danger" type="button" data-cancel>Cancel</button>
        </div>
      </form>
      <div data-balance-status></div>
      <div data-balance-results></div>
    </section>
  `;

  appEl.querySelector('.balance-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const battleCount = Number(form.querySelector('[name="battleCount"]').value);
    const creatureLevel = Number(form.querySelector('[name="creatureLevel"]').value);
    await balance.start(battleCount, creatureLevel);
    await refresh(appEl);
  });

  appEl.querySelector('[data-cancel]').addEventListener('click', async () => {
    await balance.cancel();
    await refresh(appEl);
  });

  appEl.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-sort]');
    if (!button) return;
    const nextKey = button.dataset.sort;
    if (sortKey === nextKey) sortDir = sortDir === 'desc' ? 'asc' : 'desc';
    else {
      sortKey = nextKey;
      sortDir = nextKey === 'nameEn' || nextKey === 'rarity' ? 'asc' : 'desc';
    }
    await refresh(appEl);
  });

  await refresh(appEl);
}
