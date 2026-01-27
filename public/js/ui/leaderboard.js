/**
 * @file leaderboard.js - Vocabulary Review Leaderboard
 *
 * PURPOSE:
 * Displays a competitive leaderboard showing vocabulary review counts.
 * Users can view daily or weekly rankings. Highlights current user's position.
 *
 * KEY EXPORTS:
 * - init(): Setup button handler and DOM references
 * - open(): Open leaderboard panel and fetch data
 * - close(): Close leaderboard panel
 *
 * DEPENDENCIES:
 * - ../api.js: getAuthHeaders for authenticated requests
 * - ../audio.js: Sound effects (takeover-open, takeover-close)
 *
 * DATA STRUCTURE:
 * API returns { entries: [{ rank, username, count }], currentUser: { rank } }
 *
 * FEATURES:
 * - Daily/Weekly tab toggle
 * - Top 3 ranks highlighted in accent color
 * - Current user's row highlighted with border
 */

import { getAuthHeaders } from '../api.js';
import { playSFX } from '../audio.js';

let currentPeriod = 'daily';
let leaderboardView;
let leaderboardContent;
let leaderboardClose;

/** Initialize leaderboard UI */
export function init() {
  leaderboardView = document.getElementById('leaderboard-view');
  leaderboardContent = document.getElementById('leaderboard-content');
  leaderboardClose = document.getElementById('leaderboard-close');

  document.getElementById('leaderboard-btn').addEventListener('click', open);
  leaderboardClose.addEventListener('click', close);
}

/** Open leaderboard panel and fetch data */
export async function open() {
  leaderboardView.classList.add('active');
  playSFX('takeover-open');
  await render();
}

/** Close leaderboard panel */
export function close() {
  leaderboardView.classList.remove('active');
  playSFX('takeover-close');
}

/** Fetch leaderboard data from API */
async function fetchLeaderboard(period) {
  try {
    const response = await fetch(`/api/game/leaderboard?period=${period}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch leaderboard');
    return await response.json();
  } catch (error) {
    console.error('Leaderboard fetch error:', error);
    return null;
  }
}

/** Render the leaderboard content */
async function render() {
  leaderboardContent.innerHTML = `
    <h2 style="margin: 0 0 16px; font-size: 20px; color: var(--text-primary);">Leaderboard</h2>
    <div class="leaderboard-tabs" style="display: flex; gap: 0; margin-bottom: 16px; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--text-secondary);">
      <button class="leaderboard-tab${currentPeriod === 'daily' ? ' active' : ''}" data-period="daily" style="flex: 1; padding: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; background: ${currentPeriod === 'daily' ? 'var(--accent-green)' : 'transparent'}; color: ${currentPeriod === 'daily' ? 'white' : 'var(--text-secondary)'};">Daily</button>
      <button class="leaderboard-tab${currentPeriod === 'weekly' ? ' active' : ''}" data-period="weekly" style="flex: 1; padding: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; background: ${currentPeriod === 'weekly' ? 'var(--accent-green)' : 'transparent'}; color: ${currentPeriod === 'weekly' ? 'white' : 'var(--text-secondary)'};">Weekly</button>
    </div>
    <div class="leaderboard-list" id="leaderboard-list" style="display: flex; flex-direction: column; gap: 4px;">
      <p style="color: var(--text-secondary); text-align: center;">Loading...</p>
    </div>
  `;

  // Attach tab listeners
  leaderboardContent.querySelectorAll('.leaderboard-tab').forEach(tab => {
    tab.addEventListener('click', async () => {
      currentPeriod = tab.dataset.period;
      await render();
    });
  });

  // Fetch and display data
  const data = await fetchLeaderboard(currentPeriod);
  const list = document.getElementById('leaderboard-list');

  if (!data) {
    list.innerHTML = `<p style="color: var(--accent-red); text-align: center;">Failed to load leaderboard</p>`;
    return;
  }

  if (data.entries.length === 0) {
    list.innerHTML = `<p style="color: var(--text-secondary); text-align: center;">No reviews yet ${currentPeriod === 'daily' ? 'today' : 'this week'}</p>`;
    return;
  }

  list.innerHTML = data.entries.map(entry => {
    const isMe = entry.rank === data.currentUser.rank;
    return `
      <div style="display: flex; align-items: center; padding: 10px 12px; border-radius: var(--radius-sm); background: ${isMe ? 'var(--bg-card-hover)' : 'var(--bg-card)'}; ${isMe ? 'border: 1px solid var(--accent-orange);' : ''}">
        <span style="font-weight: 700; width: 32px; color: ${entry.rank <= 3 ? 'var(--accent-orange)' : 'var(--text-secondary)'};">#${entry.rank}</span>
        <span style="flex: 1; font-weight: ${isMe ? '700' : '400'}; color: var(--text-primary);">${entry.username}</span>
        <span style="font-weight: 600; color: var(--accent-green);">${entry.count}</span>
      </div>
    `;
  }).join('');
}
