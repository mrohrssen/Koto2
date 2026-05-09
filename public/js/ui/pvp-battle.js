import * as pvpSocket from '../pvp-socket.js';
import { playSFX } from '../audio.js';
import { showMoves, setActiveLabel } from './move-select.js';
import { escapeHtml } from './html-utils.js';
import { init as initTargetSelect, showEnemies as showEnemyTargets, showAllies as showAllyTargets } from './target-select.js';
import { showAttackDisplay } from './combat-loop.js';
import { getHpColor } from './combat-ui-utils.js';
import { getSceneManager } from '../scenes/scene-manager.js';
import { BattleScene } from '../scenes/battle-scene.js';

// Module-level references injected via init()
let getGameState = null;
let updateUI = null;
let actions = null;
let sceneModule = null;
let onPvpBattleStart = null;

// Module-level PvP battle state
let pvpState = null;

// Pending move state for target selection callbacks
let pendingMove = null;
let pendingCreatureIndex = null;

/**
 * Initialize PvP battle with callbacks from game.js.
 */
export function init(callbacks) {
  getGameState = callbacks.getGameState;
  updateUI = callbacks.updateUI;
  actions = callbacks.actions;
  sceneModule = callbacks.scene;
  onPvpBattleStart = callbacks.onPvpBattleStart || null;
}

/** True while a PvP match UI session is active (until returnToHub clears pvpState). */
export function isPvpBattleActive() {
  return pvpState !== null;
}

// ============ START BATTLE ============

/**
 * Start a PvP battle. Called when pvp:match-start is received.
 * @param {object} data - { yourTeam, opponentTeam, opponentName }
 */
export function startPvpBattle(data) {
  const { yourTeam, opponentTeam, opponentName, mySide } = data;

  // Initialize shared target-select with PvP callbacks
  initTargetSelect({
    onTargetSelectCb: (targetIndex) => {
      addMoveChoice(pendingCreatureIndex, pendingMove.id, targetIndex);
      pendingMove = null;
      pendingCreatureIndex = null;
    },
    onCancelCb: () => {
      pendingMove = null;
      pendingCreatureIndex = null;
      showMoveSelection();
    }
  });

  pvpState = {
    allies: yourTeam,     // Array of creature objects
    enemies: opponentTeam, // Array of creature objects
    opponentName,
    mySide: mySide || 'sideA', // Which side we are (for attack card perspective)
    actionCursor: data.actionCursor || null,
    openingResolved: data.openingResolved === true,
    waitingForOpponent: false,
    actionPlaybackActive: false
  };

  if (typeof onPvpBattleStart === 'function') {
    onPvpBattleStart();
  }

  // Show formations
  if (sceneModule?.showFormation) {
    sceneModule.showFormation('player', pvpState.allies);
    sceneModule.showFormation('enemy', pvpState.enemies);
  }
  syncPvpBattleScene({ initial: true });

  // Clean up stale rematch handlers from a previous match's renderResult()
  pvpSocket.off('pvp:rematch-start');
  pvpSocket.off('pvp:rematch-cancelled');
  pvpSocket.off('pvp:opponent-wants-rematch');

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

  pvpSocket.on('pvp:opening-action-submitted', () => {
    showWaitingForOpponent('Opponent chose their opening move. Waiting for your opening move...');
  });

  pvpSocket.on('pvp:action-result', (result) => {
    handleActionResult(result);
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

function showMoveSelection() {
  if (!pvpState || pvpState.actionPlaybackActive) return;

  const cursor = pvpState.actionCursor;
  const needsOpening = !pvpState.openingResolved;
  const creatureIndex = needsOpening
    ? findHighestDexLivingIndex(pvpState.allies)
    : cursor?.side === pvpState.mySide
      ? cursor.index
      : null;

  if (creatureIndex === null || creatureIndex === undefined) {
    showWaitingForOpponent(needsOpening
      ? 'Waiting for both opening moves...'
      : 'Waiting for opponent action...');
    return;
  }

  const creature = pvpState.allies[creatureIndex];

  showMoves(creature, creatureIndex, {
    includeItems: false,
    onMoveSelect: (move, creatureIndex) => {
      playSFX('button-tap');
      handleMoveSelected(creature, creatureIndex, move);
    }
  });
  setActiveLabel(creature);
}

function findHighestDexLivingIndex(creatures) {
  let bestIndex = null;
  let bestDex = -Infinity;
  let bestLevel = -Infinity;
  for (let i = 0; i < creatures.length; i++) {
    const c = creatures[i];
    if (!c || c.hp <= 0) continue;
    const dex = c.dex || 1;
    const level = c.level || 1;
    if (dex > bestDex || (dex === bestDex && level > bestLevel)) {
      bestIndex = i;
      bestDex = dex;
      bestLevel = level;
    }
  }
  return bestIndex;
}

/**
 * Handle a move being selected. If the move targets a single enemy,
 * show target selection. Otherwise, auto-target and move to next creature.
 */
function handleMoveSelected(creature, creatureIndex, move) {
  // Rest pseudo-move: no target selection, push action entry, advance.
  if (move.isRest) {
    addMoveChoice(creatureIndex, null, null, { action: 'rest' });
    return;
  }

  const targetType = move.target || 'single_enemy';

  if (targetType === 'single_enemy') {
    pendingMove = move;
    pendingCreatureIndex = creatureIndex;
    showEnemyTargets(pvpState.enemies, move);
  } else if (targetType === 'single_ally' || targetType === 'self') {
    if (targetType === 'self') {
      addMoveChoice(creatureIndex, move.id, creatureIndex);
    } else {
      pendingMove = move;
      pendingCreatureIndex = creatureIndex;
      showAllyTargets(pvpState.allies, move);
    }
  } else {
    // all_enemies, all_allies — no target selection needed
    addMoveChoice(creatureIndex, move.id, 0);
  }
}

/**
 * Add a move choice and advance to next creature or submit.
 */
function addMoveChoice(creatureIndex, moveId, targetIndex, extra = {}) {
  if (!pvpState) return;

  pvpState.waitingForOpponent = true;
  const action = { creatureIndex, ...extra };
  if (moveId) action.moveId = moveId;
  if (typeof targetIndex === 'number') action.targetIndex = targetIndex;
  pvpSocket.submitAction(action);
  showWaitingForOpponent(pvpState.openingResolved ? 'Action submitted...' : 'Opening move submitted...');
}

// ============ WAITING ============

function showWaitingForOpponent(message = "Waiting for opponent's moves...") {
  actions.setContent(`
    <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:24px;max-width:340px;margin:0 auto;">
      <div style="color:var(--text-secondary);text-align:center;animation:pulse 2s ease-in-out infinite;">
        ${escapeHtml(message)}
      </div>
      <div id="pvp-battle-status" style="text-align:center;color:var(--text-secondary);font-size:0.8em;min-height:1em;">
      </div>
    </div>
  `);
}

// ============ ROUND RESULT ============

/**
 * Handle round result from server.
 * @param {object} result - { allies, enemies, attacks, winner }
 */
async function handleRoundResult(result) {
  if (!pvpState) return;

  pvpState.waitingForOpponent = false;

  // Show attacks with progressive HP drain (pre-round state still in pvpState)
  const attacks = result.attacks || [];
  if (attacks.length > 0) {
    await showAttackSummary(attacks);
  }

  // NOW apply final server state and refresh formations
  pvpState.allies = result.allies;
  pvpState.enemies = result.enemies;
  if (sceneModule?.showFormation) {
    sceneModule.showFormation('player', pvpState.allies);
    sceneModule.showFormation('enemy', pvpState.enemies);
  }
  syncPvpBattleScene();

  syncAllStatusLabels();

  // If no winner, continue to next round's move selection
  if (!result.winner) {
    showMoveSelection();
  }
  // If there is a winner, pvp:match-end handler will take over
}

async function handleActionResult(result) {
  if (!pvpState) return;
  pvpState.actionPlaybackActive = true;
  pvpState.waitingForOpponent = false;

  await showActionSegments(result.actionSegments || [{
    actor: { side: pvpState.mySide, index: 0 },
    attacks: result.attacks || []
  }]);

  pvpState.allies = result.allies;
  pvpState.enemies = result.enemies;
  pvpState.actionCursor = result.actionCursor;
  pvpState.openingResolved = result.openingResolved === true;

  if (sceneModule?.showFormation) {
    sceneModule.showFormation('player', pvpState.allies);
    sceneModule.showFormation('enemy', pvpState.enemies);
  }
  syncPvpBattleScene();
  syncAllStatusLabels();

  pvpState.actionPlaybackActive = false;

  if (!result.winner) {
    showMoveSelection();
  }
}

async function showActionSegments(segments) {
  for (const segment of segments) {
    const attacks = [
      ...(segment.attacks || []),
      ...(segment.counterAttacks || [])
    ];
    if (attacks.length > 0) {
      await showAttackSummary(attacks);
    }
  }
}

async function syncPvpBattleScene({ initial = false } = {}) {
  if (!pvpState) return;
  try {
    const mgr = getSceneManager();
    if (!(mgr.currentScene instanceof BattleScene)) {
      await mgr.transition(BattleScene, {
        allies: pvpState.allies,
        enemies: pvpState.enemies,
        isBoss: false,
      });
      return;
    }
    await mgr.currentScene.syncCreatures({
      allies: pvpState.allies,
      enemies: pvpState.enemies,
      initial,
    });
  } catch (err) {
    console.warn('[PvP] BattleScene sync failed:', err);
  }
}

/**
 * Show attacks using the shared display sequence (same as PvE).
 * Each attack: card → sound → effects → damage → STAB → effectiveness → tap.
 * HP bars drain progressively per hit via running HP maps.
 * @param {object[]} attacks - Array of attack record objects from resolveRound
 */
async function showAttackSummary(attacks) {
  // Build running HP maps from pre-round state (before server results applied)
  const allyHp = pvpState.allies.map(c => ({ hp: c.hp, maxHp: c.maxHp }));
  const enemyHp = pvpState.enemies.map(c => ({ hp: c.hp, maxHp: c.maxHp }));

  for (const atk of attacks) {
    const isEnemy = (atk.side !== pvpState.mySide);

    // Resolve source/target DOM elements
    let sourceEl, targetEl, hpTracker;
    if (isEnemy) {
      sourceEl = document.querySelector(`#enemy-formation .formation-slot[data-index="${atk.attackerIndex}"]`);
      targetEl = document.querySelector(`#player-formation .formation-slot[data-index="${atk.targetIndex}"]`);
      hpTracker = { map: allyHp, formation: 'player-formation' };
    } else {
      sourceEl = document.querySelector(`#player-formation .formation-slot[data-index="${atk.attackerIndex}"]`);
      targetEl = document.querySelector(`#enemy-formation .formation-slot[data-index="${atk.targetIndex}"]`);
      hpTracker = { map: enemyHp, formation: 'enemy-formation' };
    }

    const targetMaxHp = hpTracker.map[atk.targetIndex]?.maxHp || 100;

    // Shared display: card, sound, effects, damage number, STAB, effectiveness, tap
    let hpUpdated = false;
    await showAttackDisplay(atk, {
      isEnemy, sourceEl, targetEl, targetMaxHp,
      allies: pvpState.allies, enemies: pvpState.enemies,
      onImpact: () => {
        if (atk.damage > 0 && hpTracker.map[atk.targetIndex]) {
          hpTracker.map[atk.targetIndex].hp = Math.max(0, hpTracker.map[atk.targetIndex].hp - atk.damage);
          updateSlotHp(hpTracker.formation, atk.targetIndex, hpTracker.map[atk.targetIndex].hp, hpTracker.map[atk.targetIndex].maxHp);
          hpUpdated = true;
        }
      }
    });

    // Fallback: if onImpact didn't fire (no sprite/element), update HP now
    if (!hpUpdated && atk.damage > 0 && hpTracker.map[atk.targetIndex]) {
      hpTracker.map[atk.targetIndex].hp = Math.max(0, hpTracker.map[atk.targetIndex].hp - atk.damage);
      updateSlotHp(hpTracker.formation, atk.targetIndex, hpTracker.map[atk.targetIndex].hp, hpTracker.map[atk.targetIndex].maxHp);
    }
  }
}

/**
 * Update a single formation slot's HP bar without rebuilding the DOM.
 * Same approach PvE uses for progressive HP drain during attack playback.
 */
function updateSlotHp(formationId, index, hp, maxHp) {
  const slot = document.querySelector(`#${formationId} .formation-slot[data-index="${index}"]`);
  if (!slot) return;
  const hpPct = maxHp > 0 ? Math.max(0, (hp / maxHp) * 100) : 0;
  const fill = slot.querySelector('.formation-hp-fill');
  if (fill) {
    fill.style.width = `${hpPct}%`;
    fill.style.backgroundColor = getHpColor(
      hpPct,
      formationId === 'enemy-formation' ? 'enemy' : 'player'
    );
  }
  const sprite = slot.querySelector('.formation-sprite');
  if (sprite) {
    if (hp <= 0) sprite.classList.add('ko');
    else sprite.classList.remove('ko');
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
  // PvP currently renders status via DOM slots (it doesn't own a
  // BattleScene-style Pixi formation ctx). The legacy
  // clearAllPixiStatusLabels target was the removed _defaultCtx sprite
  // map — always empty, so the call was a no-op. Dropped in Task 18.
  pvpSocket.leaveMatch();
  pvpSocket.disconnect();
  pvpState = null;

  const gameState = getGameState();
  gameState.phase = 'hub';
  updateUI();
}

// ============ UTILITIES ============

// getCreatureStatusKeys imported from combat-ui-utils.js

function syncAllStatusLabels() {
  if (!pvpState) return;
  // PvP renders DOM-only; the legacy syncPixiStatusLabels calls targeted the
  // removed _defaultCtx sprite map (always empty) so this function is kept
  // as a stub for call-site parity with PvE. DOM status pills are rendered
  // via combat-dom's formation rebuilds. Dropped legacy calls in Task 18.
}
