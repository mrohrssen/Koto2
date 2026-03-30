/**
 * @file pvp-battle.js - PvP Battle UI
 *
 * PURPOSE:
 * Renders the PvP battle screen: formations, move selection, round results,
 * and end screen. Driven by socket events from the PvP match.
 *
 * KEY EXPORTS:
 * - init(callbacks): Initialize with game state and UI callbacks
 * - startPvpBattle(data): Begin a PvP battle with match-start data
 *
 * DEPENDENCIES:
 * - ../pvp-socket.js: Socket.IO PvP client
 * - ../audio.js: playSFX for sounds
 * - ./actions.js: setContent for rendering
 * - ./scene.js: setBackground, showFormation
 * - ./sprite-utils.js: creatureStaticPath, createTextSprite
 */

import * as pvpSocket from '../pvp-socket.js';
import { playSFX } from '../audio.js';
import { renderJpFirst } from './bootstrap-client.js';
import { buildMoveCell } from './move-select.js';
import { toRomaji } from './romaji.js';
import { escapeHtml } from './html-utils.js';

// Module-level references injected via init()
let getGameState = null;
let updateUI = null;
let actions = null;
let sceneModule = null;

// Module-level PvP battle state
let pvpState = null;

/**
 * Initialize PvP battle with callbacks from game.js.
 */
export function init(callbacks) {
  getGameState = callbacks.getGameState;
  updateUI = callbacks.updateUI;
  actions = callbacks.actions;
  sceneModule = callbacks.scene;
}

// ============ START BATTLE ============

/**
 * Start a PvP battle. Called when pvp:match-start is received.
 * @param {object} data - { yourTeam, opponentTeam, opponentName }
 */
export function startPvpBattle(data) {
  const { yourTeam, opponentTeam, opponentName } = data;

  pvpState = {
    allies: yourTeam,     // Array of creature objects
    enemies: opponentTeam, // Array of creature objects
    opponentName,
    moveChoices: [],       // Accumulates [{creatureIndex, moveId, targetIndex}]
    currentCreatureIdx: 0, // Which ally is currently selecting moves
    waitingForOpponent: false,
    roundNumber: 1
  };

  // Set arena background (will fall back if file doesn't exist yet)
  if (sceneModule?.setBackground) {
    sceneModule.setBackground('/assets/backgrounds/pvp-arena.webp');
  }

  // Show formations
  if (sceneModule?.showFormation) {
    sceneModule.showFormation('player', pvpState.allies);
    sceneModule.showFormation('enemy', pvpState.enemies);
  }

  // Register socket handlers for battle
  pvpSocket.on('pvp:opponent-submitted', () => {
    const statusEl = document.getElementById('pvp-battle-status');
    if (statusEl) {
      statusEl.textContent = 'Opponent has submitted moves!';
    }
  });

  pvpSocket.on('pvp:round-result', (result) => {
    handleRoundResult(result);
  });

  pvpSocket.on('pvp:match-end', (data) => {
    handleMatchEnd(data);
  });

  pvpSocket.on('pvp:opponent-disconnected', () => {
    actions.setContent(`
      <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:16px;max-width:340px;margin:0 auto;">
        <div style="color:var(--text-secondary);text-align:center;">
          Opponent disconnected. Waiting for reconnection...
        </div>
      </div>
    `);
  });

  pvpSocket.on('pvp:opponent-reconnected', () => {
    // Refresh formations and move select
    if (pvpState && !pvpState.waitingForOpponent) {
      showMoveSelection();
    }
  });

  // Start move selection
  showMoveSelection();
}

// ============ MOVE SELECTION ============

/**
 * Show move selection for the next alive ally creature.
 * Each alive creature picks a move and target, then all are submitted.
 */
function showMoveSelection() {
  if (!pvpState) return;

  // Find next alive creature that needs a move
  const aliveIndices = [];
  for (let i = 0; i < pvpState.allies.length; i++) {
    const c = pvpState.allies[i];
    if (c && c.hp > 0) {
      aliveIndices.push(i);
    }
  }

  // Reset move choices for this round
  if (pvpState.currentCreatureIdx === 0) {
    pvpState.moveChoices = [];
  }

  // Find the next creature that hasn't had a move assigned yet
  const assignedIndices = new Set(pvpState.moveChoices.map(m => m.creatureIndex));
  const nextIdx = aliveIndices.find(i => !assignedIndices.has(i));

  if (nextIdx === undefined) {
    // All alive creatures have moves — submit
    pvpState.waitingForOpponent = true;
    pvpSocket.submitMoves(pvpState.moveChoices);
    showWaitingForOpponent();
    return;
  }

  pvpState.currentCreatureIdx = nextIdx;
  const creature = pvpState.allies[nextIdx];

  // Build move grid using shared move-cell builder
  const moveCells = creature.moves.map((move, mi) => {
    const canAfford = (creature.mp ?? creature.currentMp ?? 99) >= (move.mpCost || 0);
    const cell = buildMoveCell(move, canAfford);
    cell.classList.add('pvp-move-btn');
    return cell;
  });

  const creatureName = creature.nameEn || creature.name || '???';
  const reading = creature.baseReading || creature.name || '';
  const nameDisplay = reading ? `${toRomaji(reading)} (${reading})` : creatureName;

  actions.setContent(`
    <div class="pvp-move-select" style="display:flex;flex-direction:column;gap:8px;width:100%;max-width:380px;margin:0 auto;padding:4px 0;">
      <div class="move-active-label" style="text-align:center;font-size:0.85em;color:var(--text-secondary);">
        ${escapeHtml(nameDisplay)}'s turn (Round ${pvpState.roundNumber})
      </div>
      <div class="move-grid"></div>
      <div id="pvp-battle-status" style="text-align:center;color:var(--text-secondary);font-size:0.8em;min-height:1em;">
      </div>
    </div>
  `);

  // Append move cells and wire click handlers
  const grid = document.querySelector('.pvp-move-select .move-grid');
  moveCells.forEach((cell, mi) => {
    if (!cell.classList.contains('disabled')) {
      cell.addEventListener('click', () => {
        playSFX('button-tap');
        const move = creature.moves[mi];
        handleMoveSelected(creature, nextIdx, move);
      });
    }
    grid.appendChild(cell);
  });
}

/**
 * Handle a move being selected. If the move targets a single enemy,
 * show target selection. Otherwise, auto-target and move to next creature.
 */
function handleMoveSelected(creature, creatureIndex, move) {
  const targetType = move.target || 'single_enemy';

  if (targetType === 'single_enemy') {
    showTargetSelection(creatureIndex, move);
  } else if (targetType === 'single_ally' || targetType === 'self') {
    // For ally-targeting or self moves, auto-select self or show ally targets
    if (targetType === 'self') {
      addMoveChoice(creatureIndex, move.id, creatureIndex);
    } else {
      showAllyTargetSelection(creatureIndex, move);
    }
  } else {
    // all_enemies, all_allies — no target selection needed
    addMoveChoice(creatureIndex, move.id, 0);
  }
}

/**
 * Show enemy target selection.
 */
function showTargetSelection(creatureIndex, move) {
  if (!pvpState) return;

  const nameHtml = renderJpFirst(move.name, move.reading, move.nameEn);

  const targetsHtml = pvpState.enemies.map((enemy, i) => {
    if (!enemy || enemy.hp <= 0) return '';
    const hpPct = Math.max(0, Math.round((enemy.hp / enemy.maxHp) * 100));
    const hpColor = hpPct > 50 ? 'var(--hp-green)' : hpPct > 25 ? 'var(--hp-yellow)' : 'var(--hp-red)';
    const eName = enemy.nameEn || enemy.name || '???';
    return `
      <button class="action-btn action-btn-secondary pvp-target-btn" data-target="${i}" style="text-align:left;padding:8px 12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>${escapeHtml(eName)}</strong>
          <span style="font-size:0.8em;color:${hpColor};">${hpPct}% HP</span>
        </div>
      </button>
    `;
  }).join('');

  actions.setContent(`
    <div style="display:flex;flex-direction:column;gap:8px;width:100%;max-width:340px;margin:0 auto;padding:8px 0;">
      <div style="text-align:center;font-size:0.85em;color:var(--text-secondary);">
        ${nameHtml} &rarr; Select target
      </div>
      ${targetsHtml}
      <button class="action-btn action-btn-tertiary pvp-target-cancel" style="font-size:0.85em;">
        Back
      </button>
    </div>
  `);

  document.querySelectorAll('.pvp-target-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      playSFX('button-tap');
      const targetIdx = parseInt(btn.dataset.target);
      addMoveChoice(creatureIndex, move.id, targetIdx);
    });
  });

  document.querySelector('.pvp-target-cancel')?.addEventListener('click', () => {
    playSFX('button-tap');
    showMoveSelection();
  });
}

/**
 * Show ally target selection for healing/buff moves.
 */
function showAllyTargetSelection(creatureIndex, move) {
  if (!pvpState) return;

  const nameHtml = renderJpFirst(move.name, move.reading, move.nameEn);

  const targetsHtml = pvpState.allies.map((ally, i) => {
    if (!ally || ally.hp <= 0) return '';
    const hpPct = Math.max(0, Math.round((ally.hp / ally.maxHp) * 100));
    const hpColor = hpPct > 50 ? 'var(--hp-green)' : hpPct > 25 ? 'var(--hp-yellow)' : 'var(--hp-red)';
    const aName = ally.nameEn || ally.name || '???';
    return `
      <button class="action-btn action-btn-secondary pvp-target-btn" data-target="${i}" style="text-align:left;padding:8px 12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>${escapeHtml(aName)}</strong>
          <span style="font-size:0.8em;color:${hpColor};">${hpPct}% HP</span>
        </div>
      </button>
    `;
  }).join('');

  actions.setContent(`
    <div style="display:flex;flex-direction:column;gap:8px;width:100%;max-width:340px;margin:0 auto;padding:8px 0;">
      <div style="text-align:center;font-size:0.85em;color:var(--text-secondary);">
        ${nameHtml} &rarr; Select ally
      </div>
      ${targetsHtml}
      <button class="action-btn action-btn-tertiary pvp-target-cancel" style="font-size:0.85em;">
        Back
      </button>
    </div>
  `);

  document.querySelectorAll('.pvp-target-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      playSFX('button-tap');
      const targetIdx = parseInt(btn.dataset.target);
      addMoveChoice(creatureIndex, move.id, targetIdx);
    });
  });

  document.querySelector('.pvp-target-cancel')?.addEventListener('click', () => {
    playSFX('button-tap');
    showMoveSelection();
  });
}

/**
 * Add a move choice and advance to next creature or submit.
 */
function addMoveChoice(creatureIndex, moveId, targetIndex) {
  if (!pvpState) return;

  pvpState.moveChoices.push({ creatureIndex, moveId, targetIndex });

  // Move to next creature
  showMoveSelection();
}

// ============ WAITING ============

function showWaitingForOpponent() {
  actions.setContent(`
    <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:24px;max-width:340px;margin:0 auto;">
      <div style="color:var(--text-secondary);text-align:center;animation:pulse 2s ease-in-out infinite;">
        Waiting for opponent's moves...
      </div>
      <div id="pvp-battle-status" style="text-align:center;color:var(--text-secondary);font-size:0.8em;min-height:1em;">
      </div>
    </div>
  `);
}

// ============ ROUND RESULT ============

/**
 * Handle round result from server.
 * @param {object} result - { allies, enemies, actions, winner }
 */
async function handleRoundResult(result) {
  if (!pvpState) return;

  // Update local state
  pvpState.allies = result.allies;
  pvpState.enemies = result.enemies;
  pvpState.waitingForOpponent = false;
  pvpState.roundNumber++;

  // Update formations
  if (sceneModule?.showFormation) {
    sceneModule.showFormation('player', pvpState.allies);
    sceneModule.showFormation('enemy', pvpState.enemies);
  }

  // Show attack results briefly
  const attacks = result.actions?.attacks || result.attacks || [];
  if (attacks.length > 0) {
    await showAttackSummary(attacks);
  }

  // If no winner, continue to next round's move selection
  if (!result.winner) {
    pvpState.currentCreatureIdx = 0;
    showMoveSelection();
  }
  // If there is a winner, pvp:match-end handler will take over
}

/**
 * Show a brief summary of all attacks in the round.
 * Each attack is shown for a short duration before advancing.
 * @param {object[]} attacks - Array of attack record objects
 */
async function showAttackSummary(attacks) {
  for (const atk of attacks) {
    const attackerName = atk.attackerName || atk.attackerNameJp || '???';
    const targetName = atk.targetName || atk.targetNameJp || '???';
    const moveName = atk.moveNameEn || atk.moveName || '???';

    let resultText;
    if (atk.healAmount > 0) {
      resultText = `<span style="color:var(--hp-green);">+${atk.healAmount} HP</span>`;
    } else if (atk.damage > 0) {
      resultText = `<span style="color:var(--hp-red);">-${atk.damage} HP</span>`;
    } else if (atk.effectApplied) {
      resultText = `<span style="color:var(--accent-primary);">${atk.effectApplied}</span>`;
    } else {
      resultText = '<span style="color:var(--text-secondary);">0</span>';
    }

    const skillNameHtml = atk.attackerSkillName
      ? renderJpFirst(atk.attackerSkillName, atk.attackerSkillReading, atk.attackerSkillEn)
      : escapeHtml(moveName);

    actions.setContent(`
      <div class="pvp-attack-card" style="display:flex;align-items:center;gap:12px;padding:12px 16px;max-width:380px;margin:0 auto;background:var(--surface);border-radius:12px;border:1px solid var(--border-color);">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:0.9em;">${escapeHtml(attackerName)}</div>
          <div style="font-size:0.85em;color:var(--text-secondary);">${skillNameHtml}</div>
        </div>
        <div style="font-size:0.85em;color:var(--text-secondary);">&rarr;</div>
        <div style="flex:1;min-width:0;text-align:right;">
          <div style="font-weight:600;font-size:0.9em;">${escapeHtml(targetName)}</div>
          <div style="font-size:1em;">${resultText}</div>
        </div>
      </div>
    `);

    // Update formations after each attack for visual feedback
    if (sceneModule?.showFormation) {
      sceneModule.showFormation('player', pvpState.allies);
      sceneModule.showFormation('enemy', pvpState.enemies);
    }

    await delay(800);
  }
}

// ============ MATCH END ============

/**
 * Handle match end.
 * @param {object} data - { winnerId, winnerName }
 */
function handleMatchEnd(data) {
  if (!pvpState) return;

  const { winnerName } = data;

  // Determine if we won by comparing winnerName to opponentName.
  // If winnerName === opponentName, we lost. If different, we won.
  // winnerId === 'draw' means a draw.
  let resultText;
  let resultColor;
  if (data.winnerId === 'draw') {
    resultText = 'Draw!';
    resultColor = 'var(--text-secondary)';
  } else if (winnerName === pvpState.opponentName) {
    resultText = 'Defeat';
    resultColor = 'var(--hp-red)';
  } else {
    resultText = 'Victory!';
    resultColor = 'var(--accent-primary)';
    playSFX('victory');
  }

  renderResult(resultText, resultColor, winnerName);
}

/**
 * Render the end-of-match result screen.
 */
function renderResult(resultText, resultColor, winnerName) {
  // Register rematch handlers
  pvpSocket.on('pvp:rematch-start', () => {
    // Both want rematch — go back to team select
    // Need to import renderPvpTeamSelect dynamically to avoid circular dependency
    import('./pvp-lobby.js').then(lobby => {
      lobby.renderPvpTeamSelect();
    });
  });

  pvpSocket.on('pvp:rematch-cancelled', () => {
    actions.setContent(`
      <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:24px;max-width:340px;margin:0 auto;">
        <div style="font-size:1.2em;color:var(--text-secondary);">Opponent left</div>
        <button class="action-btn action-btn-primary" id="pvp-end-hub-btn">
          Return to Hub
        </button>
      </div>
    `);
    document.getElementById('pvp-end-hub-btn')?.addEventListener('click', () => {
      returnToHub();
    });
  });

  pvpSocket.on('pvp:opponent-wants-rematch', () => {
    const statusEl = document.getElementById('pvp-result-status');
    if (statusEl) {
      statusEl.textContent = 'Opponent wants a rematch!';
      statusEl.style.color = 'var(--accent-primary)';
    }
  });

  const winnerLabel = winnerName
    ? `Winner: ${escapeHtml(winnerName)}`
    : '';

  actions.setContent(`
    <div class="pvp-result" style="display:flex;flex-direction:column;align-items:center;gap:14px;padding:16px;max-width:340px;margin:0 auto;">
      <div style="font-size:1.8em;font-weight:700;color:${resultColor};">
        ${resultText}
      </div>
      ${winnerLabel ? `<div style="font-size:0.95em;color:var(--text-secondary);">${winnerLabel}</div>` : ''}
      <div id="pvp-result-status" style="text-align:center;color:var(--text-secondary);font-size:0.85em;min-height:1.2em;">
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;width:100%;">
        <button class="action-btn action-btn-primary" id="pvp-rematch-btn">
          Rematch
        </button>
        <button class="action-btn action-btn-tertiary" id="pvp-result-hub-btn">
          Return to Hub
        </button>
      </div>
    </div>
  `);

  document.getElementById('pvp-rematch-btn')?.addEventListener('click', () => {
    playSFX('button-tap');
    pvpSocket.requestRematch();
    const btn = document.getElementById('pvp-rematch-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Waiting for opponent...';
    }
  });

  document.getElementById('pvp-result-hub-btn')?.addEventListener('click', () => {
    playSFX('button-tap');
    returnToHub();
  });
}

/**
 * Return to hub: clean up PvP state and socket, restore hub phase.
 */
function returnToHub() {
  pvpSocket.leaveMatch();
  pvpSocket.disconnect();
  pvpState = null;

  const gameState = getGameState();
  gameState.phase = 'hub';
  updateUI();
}

// ============ UTILITIES ============

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
