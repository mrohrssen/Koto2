/**
 * @file adventure-report.js — End-of-Run Adventure Report
 *
 * Renders a positive, stats-rich report when a run ends (defeat or victory).
 * Replaces the old skull-emoji defeat screen and minimal victory screen.
 */

function formatDuration(ms) {
  const totalSec = Math.floor((ms || 0) / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${String(sec).padStart(2, '0')}s`;
}

function pct(n, total) {
  if (!total || !n) return 0;
  return Math.min(100, Math.round((n / total) * 100));
}

function renderMasteredList(words) {
  if (!words || words.length === 0) return '';
  return `<ul class="ar-mastered-list">${words.map(w => `
    <li class="ar-mastered-word">
      <div class="ar-mastered-dot"></div>
      <div class="ar-mastered-jp">${w.word || ''}</div>
      <div class="ar-mastered-meaning">${w.meaning || ''}</div>
      <div class="ar-mastered-exp">${w.exposures || 0}x</div>
    </li>
  `).join('')}</ul>`;
}

/**
 * Render the adventure report into a container element.
 * @param {HTMLElement} container
 * @param {object} summary - Run summary from server
 * @param {boolean} isVictory
 * @param {function} onReturnToHub
 */
export function renderAdventureReport(container, summary, isVictory, onReturnToHub) {
  const s = summary || {};
  const icon = isVictory ? '\u{1F3C6}' : '\u{1F4DC}';
  const title = isVictory ? 'Adventure Complete!' : 'Adventure Report';
  const flavor = isVictory
    ? 'You conquered every challenge!'
    : 'A valiant journey through the unknown!';
  const duration = formatDuration(s.durationMs);
  const el = s.elementsCollected || {};

  container.innerHTML = `
    <div class="adventure-report">
      <div class="ar-header">
        <div class="ar-icon">${icon}</div>
        <div class="ar-title">${title}</div>
        <div class="ar-subtitle">Run #${s.runNumber || '?'} &middot; ${duration}</div>
        <div class="ar-flavor">${flavor}</div>
      </div>

      <div class="ar-section">
        <div class="ar-section-label">RUN STATS</div>
        <div class="ar-metrics-grid">
          <div class="ar-metric featured">
            <div class="ar-metric-icon">\u{1F5FA}\uFE0F</div>
            <div class="ar-metric-value">${s.areasCompleted || 0} <span class="ar-metric-total">/ ${s.areasToWin || '?'}</span></div>
            <div class="ar-metric-label">Furthest Area</div>
          </div>
          <div class="ar-metric">
            <div class="ar-metric-icon">\u{1F91D}</div>
            <div class="ar-metric-value">${s.creaturesBefriended || 0}</div>
            <div class="ar-metric-label">Befriended</div>
          </div>
          <div class="ar-metric">
            <div class="ar-metric-icon">\u2694\uFE0F</div>
            <div class="ar-metric-value">${s.creaturesDefeated || 0}</div>
            <div class="ar-metric-label">Defeated</div>
          </div>
          <div class="ar-metric">
            <div class="ar-metric-icon">\u{1F392}</div>
            <div class="ar-metric-value">${s.itemsCollected || 0}</div>
            <div class="ar-metric-label">Items Collected</div>
          </div>
        </div>
        <div class="ar-elements-label">Elements Collected</div>
        <div class="ar-elements-row">
          <div class="ar-element"><div class="ar-element-icon fire">\u{1F525}</div><div class="ar-element-count">${el.fire || 0}</div></div>
          <div class="ar-element"><div class="ar-element-icon water">\u{1F4A7}</div><div class="ar-element-count">${el.water || 0}</div></div>
          <div class="ar-element"><div class="ar-element-icon earth">\u26F0\uFE0F</div><div class="ar-element-count">${el.earth || 0}</div></div>
          <div class="ar-element"><div class="ar-element-icon wood">\u{1F33F}</div><div class="ar-element-count">${el.wood || 0}</div></div>
          <div class="ar-element"><div class="ar-element-icon metal">\u2699\uFE0F</div><div class="ar-element-count">${el.metal || 0}</div></div>
        </div>
      </div>

      <div class="ar-section">
        <div class="ar-section-label">DISCOVERY</div>
        <div class="ar-discovery-row">
          <div class="ar-discovery-label">Creatures</div>
          <div class="ar-bar-track"><div class="ar-bar-fill creatures" style="width:${pct(s.creaturesDiscovered, s.totalCreatures)}%"></div></div>
          <div class="ar-discovery-count">${s.creaturesDiscovered || 0} / ${s.totalCreatures || '?'}</div>
        </div>
        <div class="ar-discovery-row">
          <div class="ar-discovery-label">Items</div>
          <div class="ar-bar-track"><div class="ar-bar-fill items" style="width:${pct(s.itemsDiscoveredCount, s.totalItems)}%"></div></div>
          <div class="ar-discovery-count">${s.itemsDiscoveredCount || 0} / ${s.totalItems || '?'}</div>
        </div>
      </div>

      <div class="ar-section">
        <div class="ar-section-label">WORD PROGRESS</div>
        <div class="ar-word-summary">
          <div class="ar-word-box">
            <div class="ar-word-value immersed">${s.wordsImmersed || 0}</div>
            <div class="ar-word-label">Words Immersed</div>
          </div>
          <div class="ar-word-box">
            <div class="ar-word-value mastered">${(s.wordsMastered || []).length}</div>
            <div class="ar-word-label">Words Mastered</div>
          </div>
        </div>
        ${renderMasteredList(s.wordsMastered)}
      </div>

      <button class="ar-btn" id="ar-hub-btn">Return to Hub</button>
    </div>
  `;

  container.querySelector('#ar-hub-btn')?.addEventListener('click', onReturnToHub);
}
