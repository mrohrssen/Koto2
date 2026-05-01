/**
 * Simulation results view with tabs: Progression, Daily Detail, Dialogue, Errors.
 */
import { simulations, results } from './api.js';
import { renderDialogueLog } from './dialogue-viewer.js';

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

const CHART_COLORS = {
  blue: '#4a9eff',
  green: '#4ade80',
  textDim: '#6b7a99',
  gridLine: '#1e2d4a',
};

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#e0e6f0', font: { family: "'SF Mono', monospace", size: 11 } } },
  },
  scales: {
    x: {
      ticks: { color: '#6b7a99', font: { family: "'SF Mono', monospace", size: 10 } },
      grid: { color: '#1e2d4a33' },
    },
    y: {
      ticks: { color: '#6b7a99', font: { family: "'SF Mono', monospace", size: 10 } },
      grid: { color: '#1e2d4a33' },
    },
  },
};

let refreshInterval = null;

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

function renderTabs(container, tabs, onSwitch) {
  const bar = document.createElement('div');
  bar.className = 'tab-bar';

  tabs.forEach((tab, i) => {
    const btn = document.createElement('button');
    btn.className = `tab ${i === 0 ? 'active' : ''}`;
    btn.textContent = tab.label;
    btn.addEventListener('click', () => {
      bar.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      onSwitch(tab.key);
    });
    bar.appendChild(btn);
  });

  container.appendChild(bar);
}

function formatNumber(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return Number.isInteger(number) ? String(number) : number.toFixed(digits);
}

function formatBossRounds(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? String(number) : 'N/A';
}

function formatMasteredWords(words) {
  if (!Array.isArray(words) || words.length === 0) return '';

  return words.map(entry => {
    if (typeof entry === 'string') return esc(entry);
    const word = entry?.word ?? '?';
    const meaning = entry?.meaning ? ` - ${entry.meaning}` : '';
    const exposures = Number.isFinite(Number(entry?.exposures)) ? ` (${entry.exposures} exposures)` : '';
    return `${esc(word)}${esc(meaning)}${esc(exposures)}`;
  }).join('<br>');
}

async function renderStatsTab(contentEl, simId) {
  contentEl.innerHTML = '<div class="empty-state">Loading stats...</div>';

  let snapshots, eventCounts;
  try {
    [snapshots, eventCounts] = await Promise.all([
      results.snapshots(simId),
      results.eventCounts(simId),
    ]);
  } catch (err) {
    contentEl.innerHTML = `<div class="empty-state">Error: ${esc(err.message)}</div>`;
    return;
  }

  if (!snapshots || snapshots.length === 0) {
    contentEl.innerHTML = '<div class="empty-state">No data yet. Wait for at least one simulated day.</div>';
    return;
  }

  const totalRuns = snapshots.reduce((s, d) => s + (d.runs_completed || 0), 0);
  const totalWipes = snapshots.reduce((s, d) => s + (d.runs_wiped || 0), 0);
  const totalAttempts = totalRuns + totalWipes;
  const winRate = totalAttempts > 0 ? Math.round((totalRuns / totalAttempts) * 100) : 0;
  const totalRooms = snapshots.reduce((s, d) => s + (d.rooms_explored || 0), 0);
  const totalExposures = snapshots.reduce((s, d) => s + (d.words_exposed_today || 0), 0);
  const totalNewWords = snapshots.reduce((s, d) => s + (d.new_words_today || 0), 0);
  const totalDialogue = snapshots.reduce((s, d) => s + (d.dialogue_lines_encountered || 0), 0);
  const totalSpeedReviews = snapshots.reduce((s, d) => s + (d.speed_reviews_completed || 0), 0);
  const latest = snapshots[snapshots.length - 1];
  const daysSimulated = snapshots.length;
  const avgWordsPerDay = daysSimulated > 0 ? (totalNewWords / daysSimulated).toFixed(1) : 0;
  const avgRunsPerDay = daysSimulated > 0 ? (totalAttempts / daysSimulated).toFixed(1) : 0;
  const avgRoomsPerRun = totalAttempts > 0 ? (totalRooms / totalAttempts).toFixed(1) : 0;

  const itemsAcquired = eventCounts.item_acquired || 0;
  const creaturesBefriended = eventCounts.creature_befriended || 0;

  contentEl.innerHTML = `
    <div class="stats-overview">
      <h3 style="margin: 0 0 12px; color: var(--text-primary); font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Run Stats</h3>
      <div class="summary-stats">
        <div class="stat-card">
          <div class="stat-value">${totalRuns}</div>
          <div class="stat-label">Runs Completed</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${totalWipes}</div>
          <div class="stat-label">Runs Wiped</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${winRate}%</div>
          <div class="stat-label">Win Rate</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${avgRunsPerDay}</div>
          <div class="stat-label">Avg Runs/Day</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${totalRooms}</div>
          <div class="stat-label">Total Rooms</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${avgRoomsPerRun}</div>
          <div class="stat-label">Avg Rooms/Run</div>
        </div>
      </div>

      <h3 style="margin: 20px 0 12px; color: var(--text-primary); font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Learning Stats</h3>
      <div class="summary-stats">
        <div class="stat-card">
          <div class="stat-value">${latest.total_known_words || 0}</div>
          <div class="stat-label">Total Known Words</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${totalNewWords}</div>
          <div class="stat-label">Words Learned</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${avgWordsPerDay}</div>
          <div class="stat-label">Avg Words/Day</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${totalExposures}</div>
          <div class="stat-label">Word Exposures</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${totalSpeedReviews}</div>
          <div class="stat-label">Speed Reviews</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${totalDialogue}</div>
          <div class="stat-label">Dialogue Lines</div>
        </div>
      </div>

      <h3 style="margin: 20px 0 12px; color: var(--text-primary); font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Collection</h3>
      <div class="summary-stats">
        <div class="stat-card">
          <div class="stat-value">${creaturesBefriended}</div>
          <div class="stat-label">Creatures Befriended</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${itemsAcquired}</div>
          <div class="stat-label">Items Acquired</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${daysSimulated}</div>
          <div class="stat-label">Days Simulated</div>
        </div>
      </div>
    </div>
  `;
}

async function renderProgressionTab(contentEl, simId) {
  contentEl.innerHTML = '<div class="empty-state">Loading chart...</div>';

  let snapshots;
  try {
    snapshots = await results.snapshots(simId);
  } catch (err) {
    contentEl.innerHTML = `<div class="empty-state">Error: ${esc(err.message)}</div>`;
    return;
  }

  if (!snapshots || snapshots.length === 0) {
    contentEl.innerHTML = '<div class="empty-state">No data yet. Wait for at least one simulated day.</div>';
    return;
  }

  const labels = snapshots.map(s => `Day ${s.day}`);
  const knownWords = snapshots.map(s => s.total_known_words || 0);
  const newWords = snapshots.map(s => s.new_words_today || 0);

  contentEl.innerHTML = '';

  // Summary stats
  const latest = snapshots[snapshots.length - 1];
  const statsHtml = `
    <div class="summary-stats">
      <div class="stat-card">
        <div class="stat-value">${latest.total_known_words || 0}</div>
        <div class="stat-label">Total Known Words</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${snapshots.length}</div>
        <div class="stat-label">Days Simulated</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${Math.round(knownWords.reduce((a, b, i) => a + (newWords[i] || 0), 0) / snapshots.length)}</div>
        <div class="stat-label">Avg Words/Day</div>
      </div>
    </div>
  `;
  contentEl.insertAdjacentHTML('beforeend', statsHtml);

  const chartWrap = document.createElement('div');
  chartWrap.className = 'chart-container';
  chartWrap.innerHTML = '<canvas id="progression-chart" height="300"></canvas>';
  contentEl.appendChild(chartWrap);

  const ctx = chartWrap.querySelector('canvas').getContext('2d');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Known Words',
          data: knownWords,
          borderColor: CHART_COLORS.blue,
          backgroundColor: CHART_COLORS.blue + '20',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
        },
        {
          label: 'New Words/Day',
          data: newWords,
          borderColor: CHART_COLORS.green,
          backgroundColor: CHART_COLORS.green + '20',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        ...CHART_DEFAULTS.scales,
        y: { ...CHART_DEFAULTS.scales.y, position: 'left', title: { display: true, text: 'Total Known', color: CHART_COLORS.textDim } },
        y1: { ...CHART_DEFAULTS.scales.y, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'New/Day', color: CHART_COLORS.textDim } },
      },
    },
  });
}

async function renderDailyDetailTab(contentEl, simId) {
  contentEl.innerHTML = '<div class="empty-state">Loading...</div>';

  let snapshots;
  try {
    snapshots = await results.snapshots(simId);
  } catch (err) {
    contentEl.innerHTML = `<div class="empty-state">Error: ${esc(err.message)}</div>`;
    return;
  }

  if (!snapshots || snapshots.length === 0) {
    contentEl.innerHTML = '<div class="empty-state">No data yet.</div>';
    return;
  }

  contentEl.innerHTML = '';

  // Day selector
  const selectorDiv = document.createElement('div');
  selectorDiv.className = 'day-selector';
  const select = document.createElement('select');
  for (const snap of snapshots) {
    const opt = document.createElement('option');
    opt.value = snap.day;
    opt.textContent = `Day ${snap.day} - ${snap.new_words_today || 0} new words`;
    select.appendChild(opt);
  }
  select.value = snapshots[snapshots.length - 1].day;
  selectorDiv.appendChild(select);
  contentEl.appendChild(selectorDiv);

  const detailDiv = document.createElement('div');
  contentEl.appendChild(detailDiv);

  function showDay(day) {
    const snap = snapshots.find(s => s.day === day);
    if (!snap) {
      detailDiv.innerHTML = '<div class="empty-state">No data for this day.</div>';
      return;
    }
    detailDiv.innerHTML = `
      <div class="summary-stats">
        <div class="stat-card">
          <div class="stat-value">${snap.new_words_today || 0}</div>
          <div class="stat-label">New Words</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${snap.runs_completed || 0}</div>
          <div class="stat-label">Runs Completed</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${snap.rooms_explored || 0}</div>
          <div class="stat-label">Rooms Explored</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${snap.speed_reviews_completed || 0}</div>
          <div class="stat-label">Speed Reviews</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${snap.dialogue_lines_encountered || 0}</div>
          <div class="stat-label">Dialogue Lines</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${snap.words_exposed_today || 0}</div>
          <div class="stat-label">Words Exposed</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${snap.runs_wiped || 0}</div>
          <div class="stat-label">Runs Wiped</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${snap.unknown_words_in_dialogue || 0}</div>
          <div class="stat-label">Unknown in Dialogue</div>
        </div>
      </div>
    `;
  }

  select.addEventListener('change', () => showDay(Number(select.value)));
  showDay(Number(select.value));
}

async function renderRunLogTab(contentEl, simId) {
  contentEl.innerHTML = '<div class="empty-state">Loading run log...</div>';

  let rows;
  try {
    rows = await results.runLog(simId);
  } catch (err) {
    contentEl.innerHTML = `<div class="empty-state">Error: ${esc(err.message)}</div>`;
    return;
  }

  if (!rows || rows.length === 0) {
    contentEl.innerHTML = '<div class="empty-state">No run summaries yet.</div>';
    return;
  }

  const totalCreatures = rows.reduce((sum, row) => sum + (Number(row.creaturesBefriended) || 0), 0);
  const totalItems = rows.reduce((sum, row) => sum + (Number(row.itemsCollected) || 0), 0);
  const totalMastered = rows.reduce((sum, row) => sum + (Number(row.wordsMasteredCount) || 0), 0);
  const regularMax = rows.reduce((max, row) => Math.max(max, Number(row.maxCombatRounds) || 0), 0);
  const bossMax = rows.reduce((max, row) => Math.max(max, Number(row.bossCombatRounds) || 0), 0);
  const rowsWithRegularCombat = rows.filter(row => (Number(row.combatCount) || 0) > 0);
  const avgRegular = rowsWithRegularCombat.length > 0
    ? rowsWithRegularCombat.reduce((sum, row) => sum + (Number(row.avgCombatRounds) || 0), 0) / rowsWithRegularCombat.length
    : 0;

  contentEl.innerHTML = `
    <div class="summary-stats">
      <div class="stat-card">
        <div class="stat-value">${rows.length}</div>
        <div class="stat-label">Runs Logged</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${regularMax}</div>
        <div class="stat-label">Max Regular Rounds</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${bossMax > 0 ? bossMax : 'N/A'}</div>
        <div class="stat-label">Max Boss Rounds</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${formatNumber(avgRegular)}</div>
        <div class="stat-label">Avg Regular Rounds</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalCreatures}</div>
        <div class="stat-label">Creatures Befriended</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalItems}</div>
        <div class="stat-label">Items Collected</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalMastered}</div>
        <div class="stat-label">Words Mastered</div>
      </div>
    </div>

    <div class="vocab-table-wrap">
      <table class="vocab-table">
        <thead>
          <tr>
            <th>Day / Run</th>
            <th>Area</th>
            <th>Outcome</th>
            <th>Furthest Room</th>
            <th>Befriended</th>
            <th>Items</th>
            <th>Mastered</th>
            <th>Regular Fights</th>
            <th>Avg Regular</th>
            <th>Max Regular</th>
            <th>Boss Rounds</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => {
            const masteredDetail = formatMasteredWords(row.wordsMastered);
            const masteredCell = masteredDetail
              ? `<details><summary>${row.wordsMasteredCount || 0}</summary>${masteredDetail}</details>`
              : String(row.wordsMasteredCount || 0);
            const outcome = row.wiped ? 'Wiped' : (row.completed ? 'Completed' : 'Stopped');
            return `
              <tr>
                <td>Day ${row.day}, Run ${row.run}</td>
                <td>${esc(row.areaName || row.areaId || 'Unknown')}</td>
                <td>${outcome}</td>
                <td>${row.furthestRoomReached || 0}</td>
                <td>${row.creaturesBefriended || 0}</td>
                <td>${row.itemsCollected || 0}</td>
                <td>${masteredCell}</td>
                <td>${row.combatCount || 0}</td>
                <td>${formatNumber(row.avgCombatRounds)}</td>
                <td>${row.maxCombatRounds || 0}</td>
                <td>${formatBossRounds(row.bossCombatRounds)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function renderDialogueTab(contentEl, simId) {
  contentEl.innerHTML = '<div class="empty-state">Loading dialogue...</div>';

  try {
    const events = await results.events(simId, { type: 'dialogue_seen', limit: 500 });
    renderDialogueLog(contentEl, events);
  } catch (err) {
    contentEl.innerHTML = `<div class="empty-state">Error: ${esc(err.message)}</div>`;
  }
}

async function renderVocabularyTab(contentEl, simId) {
  contentEl.innerHTML = '<div class="empty-state">Loading vocabulary...</div>';

  let data;
  try {
    data = await results.vocabulary(simId);
  } catch (err) {
    contentEl.innerHTML = `<div class="empty-state">Error: ${esc(err.message)}</div>`;
    return;
  }

  const words = data?.words || [];
  if (words.length === 0) {
    contentEl.innerHTML = '<div class="empty-state">No vocabulary data yet.</div>';
    return;
  }

  const knownCount = words.filter(w => w.known).length;
  const totalExposures = words.reduce((s, w) => s + w.exposures, 0);

  contentEl.innerHTML = '';

  // Summary stats
  const statsHtml = `
    <div class="summary-stats">
      <div class="stat-card">
        <div class="stat-value">${words.length}</div>
        <div class="stat-label">Words Seen</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${knownCount}</div>
        <div class="stat-label">Words Known</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalExposures}</div>
        <div class="stat-label">Total Exposures</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${words.length > 0 ? (totalExposures / words.length).toFixed(1) : 0}</div>
        <div class="stat-label">Avg Exp/Word</div>
      </div>
    </div>
  `;
  contentEl.insertAdjacentHTML('beforeend', statsHtml);

  // Sort state
  let sortKey = 'exposures';
  let sortAsc = false;

  function renderTable() {
    const sorted = [...words].sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });

    const arrow = (key) => sortKey === key ? (sortAsc ? ' ▲' : ' ▼') : '';

    let tableEl = contentEl.querySelector('.vocab-table-wrap');
    if (!tableEl) {
      tableEl = document.createElement('div');
      tableEl.className = 'vocab-table-wrap';
      contentEl.appendChild(tableEl);
    }

    tableEl.innerHTML = `
      <table class="vocab-table">
        <thead>
          <tr>
            <th data-sort="word">Word${arrow('word')}</th>
            <th data-sort="reading">Reading${arrow('reading')}</th>
            <th data-sort="meaning">Meaning${arrow('meaning')}</th>
            <th data-sort="exposures">Exposures${arrow('exposures')}</th>
            <th data-sort="known">Known${arrow('known')}</th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map(w => `
            <tr>
              <td class="vocab-word">${esc(w.word)}</td>
              <td class="vocab-reading">${esc(w.reading)}</td>
              <td class="vocab-meaning">${esc(w.meaning)}</td>
              <td class="vocab-exposures">${w.exposures}</td>
              <td class="vocab-known">${w.known ? '✓' : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    tableEl.querySelectorAll('th[data-sort]').forEach(th => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (sortKey === key) {
          sortAsc = !sortAsc;
        } else {
          sortKey = key;
          sortAsc = key === 'word' || key === 'reading' || key === 'meaning';
        }
        renderTable();
      });
    });
  }

  renderTable();
}

async function renderErrorsTab(contentEl, simId) {
  contentEl.innerHTML = '<div class="empty-state">Loading errors...</div>';

  let events;
  try {
    events = await results.events(simId, { type: 'api_error', limit: 200 });
  } catch (err) {
    contentEl.innerHTML = `<div class="empty-state">Error: ${esc(err.message)}</div>`;
    return;
  }

  if (!events || events.length === 0) {
    contentEl.innerHTML = '<div class="success-message">No errors recorded. Simulation ran cleanly.</div>';
    return;
  }

  contentEl.innerHTML = '';
  for (const evt of events) {
    const data = evt.data || {};
    const entry = document.createElement('div');
    entry.className = 'error-entry';
    entry.innerHTML = `
      <div>
        <span class="error-path">${esc(data.path || data.url || '?')}</span>
        <span class="error-status">${esc(String(data.status || ''))}</span>
      </div>
      <div class="error-meta">Day ${evt.day || '?'}, Run ${evt.run || '?'}, Room ${evt.room || '?'}</div>
      <div class="error-message">${esc(data.error || data.message || JSON.stringify(data))}</div>
    `;
    contentEl.appendChild(entry);
  }
}

export async function renderResults(appEl, { simId }) {
  stopAutoRefresh();

  if (!simId) {
    appEl.innerHTML = '<div class="empty-state">No simulation ID provided.</div>';
    return;
  }

  appEl.innerHTML = '<div class="empty-state">Loading simulation...</div>';

  let sim;
  try {
    sim = await simulations.get(simId);
  } catch (err) {
    appEl.innerHTML = `<div class="empty-state">Error: ${esc(err.message)}</div>`;
    return;
  }

  appEl.innerHTML = '';

  // Header
  const headerDiv = document.createElement('div');
  headerDiv.innerHTML = `
    <a href="#profiles" class="back-link">&larr; Back to Profiles</a>
    <div class="sim-header">
      <h2>Simulation #${simId}</h2>
      <span class="status-badge status-${sim.status || 'unknown'}">${sim.status || 'unknown'}</span>
    </div>
  `;
  appEl.appendChild(headerDiv);

  // Tabs
  const tabs = [
    { key: 'stats', label: 'Stats' },
    { key: 'progression', label: 'Progression' },
    { key: 'daily', label: 'Daily Detail' },
    { key: 'runLog', label: 'Run Log' },
    { key: 'vocabulary', label: 'Vocabulary' },
    { key: 'dialogue', label: 'Dialogue' },
    { key: 'errors', label: 'Errors' },
  ];

  const contentEl = document.createElement('div');
  let activeTab = 'stats';

  renderTabs(appEl, tabs, (key) => {
    activeTab = key;
    const renderers = {
      stats: () => renderStatsTab(contentEl, simId),
      progression: () => renderProgressionTab(contentEl, simId),
      daily: () => renderDailyDetailTab(contentEl, simId),
      runLog: () => renderRunLogTab(contentEl, simId),
      vocabulary: () => renderVocabularyTab(contentEl, simId),
      dialogue: () => renderDialogueTab(contentEl, simId),
      errors: () => renderErrorsTab(contentEl, simId),
    };
    if (renderers[key]) renderers[key]();
  });

  appEl.appendChild(contentEl);

  // Render default tab (Stats)
  renderStatsTab(contentEl, simId);

  // Auto-refresh if running (only refreshes the stats tab)
  if (sim.status === 'running') {
    refreshInterval = setInterval(() => {
      if (activeTab === 'stats') {
        renderStatsTab(contentEl, simId);
      }
    }, 5000);
  }
}
