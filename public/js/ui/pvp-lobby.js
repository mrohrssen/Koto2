/**
 * @file pvp-lobby.js - PvP Lobby UI
 *
 * PURPOSE:
 * Renders the PvP lobby screens: lobby (create/join), waiting room,
 * and team selection. Handles socket events for match lifecycle.
 *
 * KEY EXPORTS:
 * - init(callbacks): Initialize with game state and UI callbacks
 * - renderPvpLobby(): Show the lobby screen (create/join)
 * - renderPvpTeamSelect(): Show team selection screen
 *
 * DEPENDENCIES:
 * - ../pvp-socket.js: Socket.IO PvP client
 * - ../api.js: getPvpTeams for loading saved teams
 * - ../audio.js: playSFX for button sounds
 * - ./actions.js: setContent for rendering into action area
 */

import * as pvpSocket from '../pvp-socket.js';
import { getPvpTeams } from '../api.js';
import { playSFX } from '../audio.js';
import { startPvpBattle } from './pvp-battle.js';
import { escapeHtml } from './html-utils.js';
import { creatureSpriteHtml } from './sprite-utils.js';
import { dom } from '../dom.js';
import { ELEMENT_COLORS, ELEMENT_ICONS } from './creature-row.js';
import { renderJpFirst } from './bootstrap-client.js';

/** Party skill names for display (matches server PARTY_SKILLS_CATALOG) */
const PARTY_SKILL_NAMES = {
  superEffectiveMend: 'Super-Effective Mend',
  hasteSpark: 'Haste Spark',
  guardPulse: 'Guard Pulse',
  battleRhythm: 'Battle Rhythm',
  finisherFeast: 'Finisher Feast'
};

let getGameState = null;
let updateUI = null;
let actions = null;
let sceneModule = null;

/**
 * Initialize PvP lobby with callbacks from game.js.
 * Follows the same pattern as exploration.js init().
 */
export function init(callbacks) {
  getGameState = callbacks.getGameState;
  updateUI = callbacks.updateUI;
  actions = callbacks.actions;
  sceneModule = callbacks.scene;
}

// ============ LOBBY SCREEN ============

/**
 * Render the main lobby screen with Create Match and Join Match options.
 */
export function renderPvpLobby() {
  // Connect socket when entering lobby
  pvpSocket.connect();

  // Register socket event handlers for lobby
  pvpSocket.on('pvp:match-created', ({ code }) => {
    renderWaitingScreen(code);
  });

  pvpSocket.on('pvp:opponent-joined', () => {
    renderPvpTeamSelect();
  });

  pvpSocket.on('pvp:match-joined', () => {
    renderPvpTeamSelect();
  });

  pvpSocket.on('pvp:error', ({ message }) => {
    alert(message);
  });

  // Wire up match-start for transition to battle
  pvpSocket.on('pvp:match-start', (data) => {
    startPvpBattle(data);
  });

  actions.setContent(`
    <div class="pvp-lobby" style="display:flex;flex-direction:column;align-items:stretch;gap:14px;width:100%;max-width:340px;margin:0 auto;padding:8px 0;">
      <div style="text-align:center;color:var(--text-secondary);font-size:0.9em;margin-bottom:4px;">
        PvP Battle Lobby
      </div>
      <button class="action-btn action-btn-primary" id="pvp-create-btn">
        Create Match
      </button>
      <div style="display:flex;gap:8px;align-items:stretch;">
        <input type="text" id="pvp-join-code" placeholder="Enter code"
          maxlength="4" autocapitalize="characters" autocomplete="off"
          style="flex:1;padding:10px 14px;border-radius:12px;border:1px solid var(--border-color);background:var(--surface);color:var(--text-primary);font-size:1.1em;text-transform:uppercase;text-align:center;letter-spacing:4px;font-weight:600;">
        <button class="action-btn action-btn-secondary" id="pvp-join-btn" style="flex:0 0 auto;min-width:80px;">
          Join
        </button>
      </div>
      <button class="action-btn action-btn-tertiary" id="pvp-back-btn">
        Back
      </button>
    </div>
  `);

  document.getElementById('pvp-create-btn')?.addEventListener('click', () => {
    playSFX('button-tap');
    pvpSocket.createMatch();
  });

  document.getElementById('pvp-join-btn')?.addEventListener('click', () => {
    playSFX('button-tap');
    const code = document.getElementById('pvp-join-code')?.value?.trim().toUpperCase();
    if (!code || code.length !== 4) {
      alert('Enter a 4-character match code');
      return;
    }
    pvpSocket.joinMatch(code);
  });

  // Also allow Enter key in the code input
  document.getElementById('pvp-join-code')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('pvp-join-btn')?.click();
    }
  });

  document.getElementById('pvp-back-btn')?.addEventListener('click', () => {
    playSFX('button-tap');
    pvpSocket.disconnect();
    // Return to hub
    const gameState = getGameState();
    gameState.phase = 'hub';
    updateUI();
  });

  // Set a neutral background
  if (sceneModule?.setBackground) {
    sceneModule.setBackground('/assets/backgrounds/hub.webp');
  }
}

// ============ WAITING SCREEN ============

/**
 * Show the waiting screen with the match code displayed prominently.
 * @param {string} code - 4-character match code
 */
function renderWaitingScreen(code) {
  actions.setContent(`
    <div class="pvp-waiting" style="display:flex;flex-direction:column;align-items:center;gap:16px;width:100%;max-width:340px;margin:0 auto;padding:16px 0;">
      <div style="text-align:center;color:var(--text-secondary);font-size:0.9em;">
        Share this code with your opponent
      </div>
      <div style="font-size:2.5em;font-weight:700;letter-spacing:8px;color:var(--accent-primary);font-family:monospace;background:var(--surface);padding:12px 24px;border-radius:16px;border:2px solid var(--border-color);">
        ${escapeHtml(code)}
      </div>
      <div style="color:var(--text-secondary);font-size:0.85em;animation:pulse 2s ease-in-out infinite;">
        Waiting for opponent...
      </div>
      <button class="action-btn action-btn-tertiary" id="pvp-cancel-btn">
        Cancel
      </button>
    </div>
  `);

  document.getElementById('pvp-cancel-btn')?.addEventListener('click', () => {
    playSFX('button-tap');
    pvpSocket.leaveMatch();
    renderPvpLobby();
  });
}

// ============ TEAM SELECT SCREEN ============

/**
 * Render the team selection screen. Shows saved PvP team slots.
 * Player picks a team then hits Ready.
 */
export async function renderPvpTeamSelect() {
  // Re-register match-start handler (in case we came from rematch)
  pvpSocket.on('pvp:match-start', (data) => {
    startPvpBattle(data);
  });

  pvpSocket.on('pvp:opponent-ready', () => {
    const statusEl = document.getElementById('pvp-team-status');
    if (statusEl) {
      statusEl.textContent = 'Opponent is ready!';
      statusEl.style.color = 'var(--accent-primary)';
    }
  });

  pvpSocket.on('pvp:error', ({ message }) => {
    alert(message);
  });

  // Show loading state
  actions.setContent(`
    <div style="display:flex;align-items:center;justify-content:center;padding:24px;color:var(--text-secondary);">
      Loading teams...
    </div>
  `);

  // Fetch saved PvP teams
  const result = await getPvpTeams();
  const teams = result?.pvpTeams || [null, null, null];
  let selectedSlot = null;

  const slotsHtml = teams.map((team, i) => {
    if (!team) {
      return `
        <button class="action-btn action-btn-tertiary pvp-team-slot" data-slot="${i}" disabled style="text-align:left;opacity:0.5;">
          <div><strong>Team ${i + 1}</strong></div>
          <div style="font-size:0.85em;color:var(--text-secondary);">Empty</div>
        </button>
      `;
    }
    const creatures = team.creatureParty?.active || [];
    const label = creatures.map(c => c?.nameEn || '?').join(', ');
    const levels = creatures.map(c => `Lv${c?.level || '?'}`).join('/');
    return `
      <button class="action-btn action-btn-secondary pvp-team-slot" data-slot="${i}" style="text-align:left;">
        <div><strong>Team ${i + 1}</strong> <span style="font-size:0.85em;color:var(--text-secondary);">${levels}</span></div>
        <div style="font-size:0.85em;color:var(--text-secondary);">${escapeHtml(label)}</div>
      </button>
    `;
  }).join('');

  actions.setContent(`
    <div class="pvp-team-select" style="display:flex;flex-direction:column;align-items:stretch;gap:10px;width:100%;max-width:340px;margin:0 auto;padding:8px 0;">
      <div style="text-align:center;color:var(--text-secondary);font-size:0.9em;margin-bottom:2px;">
        Select your team
      </div>
      ${slotsHtml}
      <div id="pvp-team-status" style="text-align:center;color:var(--text-secondary);font-size:0.85em;min-height:1.2em;">
      </div>
      <button class="action-btn action-btn-primary" id="pvp-ready-btn" disabled>
        Ready
      </button>
      <button class="action-btn action-btn-tertiary" id="pvp-team-cancel-btn">
        Leave Match
      </button>
    </div>
  `);

  // Wire up team slot selection
  document.querySelectorAll('.pvp-team-slot:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      playSFX('button-tap');
      // Deselect all
      document.querySelectorAll('.pvp-team-slot').forEach(b => {
        b.style.outline = 'none';
        b.style.outlineOffset = '0';
      });
      // Select this one
      btn.style.outline = '2px solid var(--accent-primary)';
      btn.style.outlineOffset = '2px';
      selectedSlot = parseInt(btn.dataset.slot);

      // Send team to server
      const team = teams[selectedSlot];
      pvpSocket.selectTeam(selectedSlot, team);

      // Enable ready button
      const readyBtn = document.getElementById('pvp-ready-btn');
      if (readyBtn) readyBtn.disabled = false;
    });
  });

  document.getElementById('pvp-ready-btn')?.addEventListener('click', () => {
    playSFX('button-tap');
    pvpSocket.ready();
    const readyBtn = document.getElementById('pvp-ready-btn');
    if (readyBtn) {
      readyBtn.disabled = true;
      readyBtn.textContent = 'Waiting...';
    }
  });

  document.getElementById('pvp-team-cancel-btn')?.addEventListener('click', () => {
    playSFX('button-tap');
    pvpSocket.leaveMatch();
    pvpSocket.disconnect();
    const gameState = getGameState();
    gameState.phase = 'hub';
    updateUI();
  });
}

// ============ UTILITIES ============
