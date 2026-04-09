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
import { renderJpSentence, getKnownWords, entityToToken } from './bootstrap-client.js';

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

/**
 * Show the existing creature popup for a PvP team creature.
 * Reuses dom.creaturePopup from creature-row.js pattern.
 * @param {object} creature - Creature data from the team snapshot
 * @param {HTMLElement} anchorEl - The ? button element to position near
 */
function showPvpCreaturePopup(creature, anchorEl) {
  if (!creature) return;

  const archetypeLabel = creature.archetype || 'Fighter';
  const popupSubtitle = creature.modifier
    ? renderJpSentence([entityToToken(creature.modifier)], getKnownWords(), new Map())
      + 'の'
      + renderJpSentence([entityToToken({ word: creature.baseWord, reading: creature.baseReading, nameEn: creature.baseMeaning })], getKnownWords(), new Map())
    : renderJpSentence([entityToToken({ word: creature.baseWord, reading: creature.baseReading, nameEn: creature.baseMeaning })], getKnownWords(), new Map());

  const movesHtml = (creature.moves || []).map(m => `
    <div class="creature-popup-move-row">
      <span style="color:${ELEMENT_COLORS[m.element] || '#888'}">●</span>
      ${m.name} (${m.nameEn}) — ${m.category || 'attack'} ${m.power || 0}pw ${m.mpCost ?? 0}mp
    </div>
  `).join('');

  const equipHtml = (creature.equippedItems || []).length > 0
    ? `<div class="creature-popup-equipment">
        <div class="creature-popup-equipment-label">Equipment:</div>
        ${creature.equippedItems.map(item =>
          `<div class="creature-popup-equipment-row">${escapeHtml(item.word || '')} (${escapeHtml(item.nameEn || '')}) <span class="equip-effect">${escapeHtml(item.description || '')}</span></div>`
        ).join('')}
      </div>`
    : '';

  dom.creaturePopup.innerHTML = `
    <div class="creature-popup-name">${escapeHtml(creature.name)} (${escapeHtml(creature.nameEn)})</div>
    <div class="creature-popup-subtitle">${popupSubtitle}</div>
    <div class="creature-popup-element">${ELEMENT_ICONS[creature.element] || ''} ${creature.element}</div>
    <div class="creature-popup-archetype">${archetypeLabel}</div>
    <div class="creature-popup-stats">
      HP: ${creature.hp}/${creature.maxHp} | ATK: ${creature.attack ?? creature.atk ?? '?'} | DEF: ${creature.defense ?? creature.def ?? 5} | MP: ${creature.mp}/${creature.maxMp}
    </div>
    ${equipHtml}
    ${movesHtml ? `<div class="creature-popup-moves"><div class="creature-popup-moves-label">Moves:</div>${movesHtml}</div>` : ''}
  `;

  // Position below the anchor element
  const rect = anchorEl.getBoundingClientRect();
  dom.creaturePopup.style.position = 'fixed';
  dom.creaturePopup.style.left = Math.max(8, Math.min(rect.left - 60, window.innerWidth - 260)) + 'px';
  dom.creaturePopup.style.top = (rect.bottom + 8) + 'px';
  dom.creaturePopup.style.bottom = 'auto';
  dom.creaturePopup.classList.add('visible');

  // Close on outside click
  const closeHandler = (e) => {
    if (!e.target.closest('.creature-popup') && !e.target.closest('.pvp-creature-info-btn')) {
      dom.creaturePopup.classList.remove('visible');
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 0);
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
      <input type="text" id="pvp-join-code" placeholder="Enter code"
        maxlength="4" autocapitalize="characters" autocomplete="off"
        style="width:100%;padding:10px 14px;border-radius:12px;border:1px solid var(--border-color);background:var(--surface);color:var(--text-primary);font-size:1.1em;text-transform:uppercase;text-align:center;letter-spacing:4px;font-weight:600;box-sizing:border-box;">
      <button class="action-btn action-btn-secondary" id="pvp-join-btn">
        Join Match
      </button>
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
        <div class="pvp-team-card pvp-team-empty pvp-team-slot" data-slot="${i}">
          <div class="pvp-team-header">
            <span class="pvp-team-label">Team ${i + 1}</span>
          </div>
          <div class="pvp-team-empty-msg">Empty</div>
        </div>
      `;
    }
    const creatures = team.creatureParty?.active || [];
    const creaturesHtml = creatures.map((c, ci) => {
      if (!c) return '';
      const sprite = creatureSpriteHtml(c.id, c.baseWord || c.name, c.element, 'pvp-mini-sprite');
      const name = escapeHtml(c.nameEn || c.name || '?');
      const elRgb = c.element === 'fire' ? '239,83,80' : c.element === 'water' ? '66,165,245' : c.element === 'wood' ? '102,187,106' : c.element === 'earth' ? '141,110,99' : '158,158,158';
      return `
        <div class="pvp-creature-mini" style="background:rgba(${elRgb},0.1)" data-team="${i}" data-creature="${ci}">
          <button class="pvp-creature-info-btn" data-team="${i}" data-creature="${ci}">?</button>
          <div class="pvp-sprite-frame">${sprite}</div>
          <div class="pvp-creature-name">${name}</div>
          <div class="pvp-creature-level" style="color:${ELEMENT_COLORS[c.element] || '#888'}">Lv${c.level || '?'}</div>
        </div>
      `;
    }).join('');

    // Party skills
    const skills = team.partySkills || [];
    const skillsHtml = skills.length > 0
      ? `<div class="pvp-party-skills">${skills.map(s => {
          const id = typeof s === 'string' ? s : (s?.id || s?.skillId || '');
          const name = PARTY_SKILL_NAMES[id] || id;
          return `<span class="pvp-skill-tag">${escapeHtml(name)}</span>`;
        }).join('')}</div>`
      : '';

    return `
      <div class="pvp-team-card pvp-team-slot" data-slot="${i}">
        <div class="pvp-team-header">
          <span class="pvp-team-label">Team ${i + 1}</span>
          <span class="pvp-team-count">${creatures.length} creatures</span>
        </div>
        <div class="pvp-creature-row">${creaturesHtml}</div>
        ${skillsHtml}
      </div>
    `;
  }).join('');

  actions.setContent(`
    <div class="pvp-team-select" style="display:flex;flex-direction:column;align-items:stretch;gap:10px;width:100%;max-width:380px;margin:0 auto;padding:8px 0;">
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
  document.querySelectorAll('.pvp-team-slot:not(.pvp-team-empty)').forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't select team if they clicked the ? button
      if (e.target.closest('.pvp-creature-info-btn')) return;
      playSFX('button-tap');
      // Deselect all
      document.querySelectorAll('.pvp-team-slot').forEach(b => b.classList.remove('selected'));
      // Select this one
      card.classList.add('selected');
      selectedSlot = parseInt(card.dataset.slot);

      // Send team to server
      const team = teams[selectedSlot];
      pvpSocket.selectTeam(selectedSlot, team);

      // Enable ready button
      const readyBtn = document.getElementById('pvp-ready-btn');
      if (readyBtn) readyBtn.disabled = false;
    });
  });

  // Wire up ? info buttons to show creature popup
  document.querySelectorAll('.pvp-creature-info-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      playSFX('button-tap');
      const teamIdx = parseInt(btn.dataset.team);
      const creatureIdx = parseInt(btn.dataset.creature);
      const team = teams[teamIdx];
      const creature = team?.creatureParty?.active?.[creatureIdx];
      if (creature) {
        showPvpCreaturePopup(creature, btn);
      }
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
