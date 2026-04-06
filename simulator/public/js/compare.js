/**
 * Compare view: overlay multiple simulation results on a single chart.
 */
import { profiles as profilesApi, results } from './api.js';

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

const COLORS = ['#4a9eff', '#4ade80', '#fbbf24', '#f87171', '#a78bfa', '#fb923c'];

export async function renderCompare(appEl) {
  appEl.innerHTML = '<div class="empty-state">Loading profiles...</div>';

  let profileList;
  try {
    profileList = await profilesApi.list();
  } catch (err) {
    appEl.innerHTML = `<div class="empty-state">Error: ${esc(err.message)}</div>`;
    return;
  }

  // Filter to only profiles that have a completed or running simulation
  const withSims = profileList.filter(p => p.latestSimulation);

  if (withSims.length === 0) {
    appEl.innerHTML = '<div class="empty-state">No simulations to compare. Run at least two simulations first.</div>';
    return;
  }

  appEl.innerHTML = '';

  const container = document.createElement('div');
  container.innerHTML = '<h2>Compare Simulations</h2>';

  // Checkboxes
  const checkboxDiv = document.createElement('div');
  checkboxDiv.className = 'compare-checkboxes';

  for (const profile of withSims) {
    const label = document.createElement('label');
    label.innerHTML = `
      <input type="checkbox" value="${profile.latestSimulation.id}" data-profile-name="${esc(profile.name)}">
      ${esc(profile.name)}
      <span class="status-badge status-${profile.latestSimulation.status}">${profile.latestSimulation.status}</span>
    `;
    checkboxDiv.appendChild(label);
  }

  container.appendChild(checkboxDiv);

  const compareBtn = document.createElement('button');
  compareBtn.className = 'btn btn-primary';
  compareBtn.textContent = 'Compare Selected';
  container.appendChild(compareBtn);

  const resultArea = document.createElement('div');
  resultArea.style.marginTop = '16px';
  container.appendChild(resultArea);

  appEl.appendChild(container);

  compareBtn.addEventListener('click', async () => {
    const checked = checkboxDiv.querySelectorAll('input:checked');
    if (checked.length < 2) {
      alert('Select at least 2 profiles to compare.');
      return;
    }

    const simIds = Array.from(checked).map(cb => Number(cb.value));
    const nameMap = {};
    checked.forEach(cb => { nameMap[cb.value] = cb.dataset.profileName; });

    compareBtn.disabled = true;
    compareBtn.textContent = 'Loading...';

    try {
      const data = await results.compare(simIds);
      renderComparison(resultArea, data, simIds, nameMap);
    } catch (err) {
      resultArea.innerHTML = `<div class="empty-state">Error: ${esc(err.message)}</div>`;
    } finally {
      compareBtn.disabled = false;
      compareBtn.textContent = 'Compare Selected';
    }
  });
}

function renderComparison(container, data, simIds, nameMap) {
  container.innerHTML = '';

  // Group data by simulation
  const bySimId = new Map();
  for (const row of data) {
    const sid = row.simulation_id;
    if (!bySimId.has(sid)) bySimId.set(sid, []);
    bySimId.get(sid).push(row);
  }

  // Find max days across all sims
  let maxDays = 0;
  for (const snapshots of bySimId.values()) {
    const lastDay = snapshots[snapshots.length - 1]?.day || 0;
    if (lastDay > maxDays) maxDays = lastDay;
  }

  const labels = [];
  for (let d = 1; d <= maxDays; d++) labels.push(`Day ${d}`);

  // Build datasets
  const datasets = [];
  let colorIdx = 0;
  for (const simId of simIds) {
    const snapshots = bySimId.get(simId) || [];
    const color = COLORS[colorIdx % COLORS.length];
    const name = nameMap[simId] || snapshots[0]?.profile_name || `Sim ${simId}`;

    // Build a sparse array indexed by day
    const wordsByDay = new Array(maxDays).fill(null);
    for (const snap of snapshots) {
      if (snap.day >= 1 && snap.day <= maxDays) {
        wordsByDay[snap.day - 1] = snap.total_known_words || 0;
      }
    }

    datasets.push({
      label: name,
      data: wordsByDay,
      borderColor: color,
      backgroundColor: color + '20',
      tension: 0.3,
      pointRadius: 2,
      spanGaps: true,
    });

    colorIdx++;
  }

  // Chart
  const chartWrap = document.createElement('div');
  chartWrap.className = 'chart-container';
  chartWrap.innerHTML = '<canvas id="compare-chart" height="300"></canvas>';
  container.appendChild(chartWrap);

  const ctx = chartWrap.querySelector('canvas').getContext('2d');
  new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
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
          title: { display: true, text: 'Known Words', color: '#6b7a99' },
        },
      },
    },
  });

  // Summary table
  const table = document.createElement('table');
  table.className = 'compare-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Profile</th>
        <th>Days</th>
        <th>Words Known</th>
        <th>Avg Words/Day</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector('tbody');
  for (const simId of simIds) {
    const snapshots = bySimId.get(simId) || [];
    const name = nameMap[simId] || snapshots[0]?.profile_name || `Sim ${simId}`;
    const days = snapshots.length;
    const lastKnown = snapshots[snapshots.length - 1]?.total_known_words || 0;
    const totalNew = snapshots.reduce((sum, s) => sum + (s.new_words_today || 0), 0);
    const avgPerDay = days > 0 ? (totalNew / days).toFixed(1) : '0';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(name)}</td>
      <td>${days}</td>
      <td>${lastKnown}</td>
      <td>${avgPerDay}</td>
    `;
    tbody.appendChild(tr);
  }

  container.appendChild(table);
}
