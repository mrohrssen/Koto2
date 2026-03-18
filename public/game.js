/**
 * @file game.js - Main Frontend Coordinator
 *
 * PURPOSE:
 * Central orchestrator for the game's frontend. Initializes all UI modules,
 * manages global game state, and coordinates interactions between subsystems.
 * This is the entry point loaded by game.html.
 *
 * KEY EXPORTS: None (entry point module)
 *
 * KEY FUNCTIONS:
 * - updateUI(): Refreshes all UI components based on current game state
 * - updateGameState(newState): Updates local state and syncs to store
 * - showVictoryModal/showGameOverModal: Display combat results
 * - showEnemyDialogue: Display AI-generated enemy dialogue
 *
 * DEPENDENCIES:
 * - js/store.js: Global state store
 * - js/api.js: Server API communication
 * - js/ui/*: UI modules (actions, scene, combat-loop, etc.)
 * - js/settings.js, js/tts.js, js/audio.js: Configuration and audio
 *
 * ARCHITECTURE:
 * On load, checks authentication, fetches game state from server, then
 * initializes all UI modules with dependency injection callbacks. The main
 * loop responds to user actions via UI callbacks and API responses.
 */

// Register service worker for asset caching with forced update checking
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js', {
    updateViaCache: 'none'  // Always fetch sw.js from network, never cache
  }).then((registration) => {
    // Check for updates immediately
    registration.update();

    // Auto-reload when new SW takes over
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
          // New SW activated, reload to get fresh code
          window.location.reload();
        }
      });
    });
  });

  // Listen for cache cleared message
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data === 'CACHES_CLEARED') {
      window.location.reload();
    }
  });

  // Reload when controller changes (new SW took over)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

// Global function to force refresh (can be called from console: forceRefresh())
window.forceRefresh = async function() {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage('CLEAR_ALL_CACHES');
  } else {
    // No service worker, just clear caches directly and reload
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }
    window.location.reload(true);
  }
};

// ============ IMPORTS ============
import { store } from './js/store.js';
import * as tts from './js/tts.js';
import * as settings from './js/settings.js';
import * as wordPractice from './js/word-practice.js';
import * as explorationUI from './js/ui/exploration.js';
import * as economyUI from './js/ui/economy.js';
import * as characterUI from './js/ui/character.js';
import * as modalsUI from './js/ui/modals.js';
import * as combatLoopUI from './js/ui/combat-loop.js';
import { playAttackSound, playUltimateSound } from './js/ui/combat-audio.js';
import { playUltimateAnimation, screenShake, showXpPopup, showLevelUpPopup, healEffect, poisonApplyEffect } from './js/ui/combat-effects.js';
import { dom } from './js/dom.js';
import * as actions from './js/ui/actions.js';
import * as takeover from './js/ui/takeover.js';
import * as creatureRow from './js/ui/creature-row.js';
import * as postCombatShop from './js/ui/post-combat-shop.js';
import * as scene from './js/ui/scene.js';
import * as audio from './js/audio.js';
import * as auth from './js/ui/auth.js';
import * as narrationBox from './js/ui/narration-box.js';
import * as leaderboard from './js/ui/leaderboard.js';
import * as lookup from './js/ui/lookup.js';
import * as bugReport from './js/ui/bug-report.js';
import * as speedReview from './js/ui/speed-review.js';
import * as metaShop from './js/ui/meta-shop.js';
import { configureCreatureImg, creatureSpritePath, probeIdleSprites } from './js/ui/sprite-utils.js';
import { setLang, t, isJapanified } from './js/ui/i18n.js';
import { setKnownWords, renderEnFirst, renderJpFirst, flushExposures } from './js/ui/bootstrap-client.js';

// API imports - these are the server communication functions
import {
  getGameState as apiGetGameState,
  createPlayer as apiCreatePlayer,
  startRun as apiStartRun,
  forfeitRun as apiForfeitRun,
  getAreaOptions as apiGetAreaOptions,
  selectArea as apiSelectArea,
  proceed as apiProceed,
  roomEncounter as apiRoomEncounter,
  startEncounter as apiStartEncounter,
  shopSkip as apiShopSkip,
  sendJpdbReview as apiSendJpdbReview,
  getDueWords as apiGetDueWords,
  getAuthHeaders,
  shrineUpgrade as apiShrineUpgrade,
  quizReward as apiQuizReward,
  getQuizQuestion as apiGetQuizQuestion,
  submitQuizAnswer as apiSubmitQuizAnswer,
  getDiscoveryWords as apiGetDiscoveryWords,
  getDiscoveryStatus as apiGetDiscoveryStatus,
  completeDiscovery as apiCompleteDiscovery,
  parseJpdbText,
  lookupJpdbWord,
  lookupJpdbBatch,
  getDealerState as apiGetDealerState,
  dealerSell as apiDealerSell,
  dealerBuy as apiDealerBuy,
  dealerLeave as apiDealerLeave,
  startCreatureEncounter as apiStartCreatureEncounter,
  creatureCombatCycle as apiCreatureCombatCycle,
  getCreatureCollection as apiGetCreatureCollection,
  rollPostCombatShop as apiRollPostCombatShop,
  selectShopItem as apiSelectShopItem,
  swapCreature as apiSwapCreature,
  rearrangeCreatures as apiRearrangeCreatures,
  swapCreatureEquip as apiSwapCreatureEquip,
  befriendReplace as apiBefriendReplace,
  getBefriendConversation as apiGetBefriendConversation,
  submitBefriendAnswer as apiSubmitBefriendAnswer,
  startNpcDialogue,
  respondNpcDialogue,
  getWhackAMolePool as apiGetWhackAMolePool,
  completeWhackAMole as apiCompleteWhackAMole,
} from './js/api.js';

const API_BASE = '';

// ============ STATE ============
let gameState = {
  player: null,
  run: null,
  combat: null,
  phase: 'no_save'
};

window.gameState = gameState;  // Expose immediately for debugging
store.set('gameState', gameState);

function updateGameState(newState) {
  console.log('[DEBUG] updateGameState called. phase:', newState.phase, 'pendingBranch:', newState.run?.pendingBranch, 'currentRoom:', newState.run?.currentRoom);
  gameState = newState;
  window.gameState = gameState;
  store.set('gameState', gameState);
}

// Enemy dialogue state
let enemyDialogueActive = false;
let dialogueDismissResolve = null;
let dialogueDismissPromise = null;

// Combat animation state
let combatAnimationActive = false;

// Flash card state
let currentFlashCardWord = null;

// Combat batch tracking for JPDB refresh
let combatReviewedBatch = [];

// ============ UTILITY ============
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getHpColor(pct) {
  if (pct > 60) return 'var(--hp-green)';
  if (pct > 30) return 'var(--hp-yellow)';
  return 'var(--hp-red)';
}

// ============ UI UPDATES ============
function updateUI() {
  // Clear any persistent narration on phase transitions
  narrationBox.forceHide();

  updateStatusBar();

  updateScene();
  updateCreatureRow();
  updatePlayerHP();
  updateGameContent();

  // Update BGM based on current phase
  audio.updateBGMForPhase(gameState.phase);
}

function updateStatusBar() {
  const run = gameState.run;
  if (run) {
    const currentRoomIdx = run.currentRoom || 0;
    const currentRoom = run.rooms?.[currentRoomIdx];
    const activeRoom = Array.isArray(currentRoom) ? currentRoom[0] : currentRoom;
    const subAreaNameEn = activeRoom?.subArea?.nameEn;
    const subAreaNameJa = activeRoom?.subArea?.name;
    dom.floorIndicator.textContent = subAreaNameEn || `Area ${(run.areasCompleted || 0) + 1}`;

    // Update area header pill
    const areaName = run.currentArea?.name;
    const area = run.currentArea;
    const sep = dom.areaHeaderPill.querySelector('.area-header-sep');
    if (areaName && subAreaNameJa) {
      if (area?.modifierWord?.meaning && area?.locationWord?.meaning) {
        dom.areaHeaderName.innerHTML =
          renderJpFirst(area.modifierWord.word, area.modifierWord.reading, area.modifierWord.meaning)
          + (area.particle || '')
          + renderJpFirst(area.locationWord.word, area.locationWord.reading, area.locationWord.meaning);
      } else {
        dom.areaHeaderName.textContent = areaName;
      }
      const subArea = activeRoom?.subArea;
      if (subArea?.modifier && subArea?.location) {
        dom.areaHeaderSub.innerHTML =
          renderJpFirst(subArea.modifier.word, subArea.modifier.reading, subArea.modifier.meaning)
          + renderJpFirst(subArea.location.word, subArea.location.reading, subArea.location.meaning);
      } else {
        dom.areaHeaderSub.textContent = subAreaNameJa;
      }
      if (sep) sep.style.display = '';
      dom.areaHeaderPill.classList.add('visible');
    } else if (areaName) {
      if (area?.modifierWord?.meaning && area?.locationWord?.meaning) {
        dom.areaHeaderName.innerHTML =
          renderJpFirst(area.modifierWord.word, area.modifierWord.reading, area.modifierWord.meaning)
          + (area.particle || '')
          + renderJpFirst(area.locationWord.word, area.locationWord.reading, area.locationWord.meaning);
      } else {
        dom.areaHeaderName.textContent = areaName;
      }
      dom.areaHeaderSub.textContent = '';
      if (sep) sep.style.display = 'none';
      dom.areaHeaderPill.classList.add('visible');
    } else {
      dom.areaHeaderPill.classList.remove('visible');
    }
  } else {
    dom.floorIndicator.textContent = 'Hub';
    dom.areaHeaderPill.classList.remove('visible');
  }
  dom.essenceDisplay.textContent = gameState.meta?.essence || gameState.player?.essence || 0;
}

function updateScene() {
  if (gameState.phase === 'combat') {
    // Creature combat uses enemies[] array; legacy uses single enemy
    const enemies = gameState.combat?.enemies;
    if (enemies?.length > 1) {
      scene.showEnemies(enemies);
    } else {
      const enemy = enemies?.[0] || gameState.combat?.enemy;
      if (enemy) scene.showEnemy(enemy);
    }
    // Show NPC skill bar if this encounter has an NPC
    const npcSkills = gameState.combat?.npcData?.skills;
    if (npcSkills?.length) {
      scene.showNpcSkills(npcSkills);
    }
  } else if (gameState.phase === 'shrine') {
    scene.showShrineFox();
  } else if (gameState.phase === 'quiz') {
    scene.showQuizMaster();
  } else if (gameState.phase === 'wordDiscovery') {
    scene.showWordDiscoveryNpc();
  } else if (gameState.phase === 'dealer') {
    scene.showDealer();
  } else {
    scene.hideEnemies();
  }
  if (gameState.phase === 'shrine') {
    scene.setBackground('/assets/backgrounds/shrine_background.webp');
  } else if (gameState.phase === 'quiz') {
    scene.setBackground('/assets/backgrounds/quiz_master_background.webp');
  } else if (gameState.phase === 'wordDiscovery') {
    scene.setBackground('/assets/backgrounds/word_discovery_background.webp');
  } else if (gameState.phase === 'dealer') {
    scene.setBackground('/assets/backgrounds/dealer_background.webp');
  } else if (gameState.run?.background) {
    scene.setBackground(`/assets/backgrounds/${gameState.run.background}`);
  } else if (!gameState.run) {
    scene.setBackground('/assets/backgrounds/hub.webp');
  }
}

function updateCreatureRow() {
  // Hide row on hub and non-run phases
  if (!gameState.run && (gameState.phase === 'hub' || gameState.phase === 'no_save' || gameState.phase === 'area_selection')) {
    dom.creatureRow.innerHTML = '';
    return;
  }

  if (gameState.run?.creatureParty?.active?.length > 0) {
    // Creature party active: render creature slots
    creatureRow.setReserves(gameState.run.creatureParty.reserves || []);
    creatureRow.render(gameState.run.creatureParty.active);
    return;
  }

  // No creatures - clear the row
  dom.creatureRow.innerHTML = '';
}

function updatePlayerHP() {
  // Player HP display is now handled by individual creature HP bars
}

function updateGameContent() {
  switch (gameState.phase) {
    case 'no_save':
      actions.setContent('<button class="action-btn action-btn-primary" id="new-game-btn">ニューゲーム</button>');
      document.getElementById('new-game-btn')?.addEventListener('click', createCharacter);
      break;
    case 'hub':
      explorationUI.renderHub();
      break;
    case 'area_selection':
      explorationUI.renderAreaSelection();
      break;
    case 'exploring':
      explorationUI.renderExploring();
      break;
    case 'room_encounter':
      // Auto-start combat — skip the "Fight" button
      startEncounter();
      break;
    case 'room':
      // Auto-advance past completed rooms — skip the "Proceed" dead state
      autoProceed();
      break;
    case 'shrine':
      explorationUI.renderShrine();
      break;
    case 'quiz':
      explorationUI.renderQuiz();
      break;
    case 'wordDiscovery':
      explorationUI.renderWordDiscovery();
      break;
    case 'dealer':
      economyUI.renderDealerRoom(actions);
      break;
    case 'whackAMole':
      explorationUI.renderWhackAMole();
      break;
    case 'combat':
      // Clear stale buttons; flash card will be rendered by combat-loop
      if (!combatLoopUI.isCombatActive()) {
        actions.clear();
      }
      break;
    case 'npc_dialogue':
      // Handled by combat-loop's runNpcDialogue()
      break;
    case 'area_complete':
      explorationUI.renderAreaComplete();
      break;
    case 'run_complete':
      explorationUI.renderRunComplete();
      break;
    case 'run_ended':
      explorationUI.renderRunEnded();
      break;
  }
}

// ============ AUTO-PROCEED ============
let autoProceedInFlight = false;
async function autoProceed() {
  if (autoProceedInFlight) return;
  autoProceedInFlight = true;
  try {
    const result = await apiProceed();
    if (result?.state) {
      updateGameState(result.state);
      updateUI();
    }
  } finally {
    autoProceedInFlight = false;
  }
}

// ============ ENEMY DIALOGUE ============
function showEnemyDialogue(text, type = 'possessed') {
  if (!text) return Promise.resolve();
  enemyDialogueActive = true;

  const speaker = gameState.combat?.enemy?.name || gameState.combat?.enemy?.nameEn;

  // Speak dialogue via TTS if enabled
  if (settings.isTtsEnabled()) {
    tts.speakText(text);
  }

  dialogueDismissPromise = narrationBox.show(text, { speaker }).then(() => {
    enemyDialogueActive = false;
    dialogueDismissResolve = null;
    dialogueDismissPromise = null;
    // Resume combat after mid-combat dialogue (e.g., glitching at 30% HP)
    if (combatLoopUI.isCombatActive() && !combatLoopUI.isCombatPausedForVocab()) {
      combatLoopUI.executeEnemyAttackThenPause();
    }
  });
  dialogueDismissResolve = () => narrationBox.forceHide();
  return dialogueDismissPromise;
}

// ============ API CALLS ============
async function loadKnownWords() {
  try {
    const resp = await fetch('/api/game/known-words', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    if (resp.ok) {
      const data = await resp.json();
      setKnownWords(data.words);
    }
  } catch (e) {
    console.warn('Failed to load known words:', e);
  }
}

async function loadGameState() {
  const data = await apiGetGameState();
  if (data.player) {
    updateGameState(data);
    // Probe which creatures have animated idle sprites (for background-image contexts)
    const allCreatureIds = [
      ...(data.creatureParty?.active || []),
      ...(data.creatureParty?.reserves || []),
    ].filter(Boolean).map(r => r.id);
    probeIdleSprites(allCreatureIds);
  } else {
    updateGameState({ ...gameState, phase: 'no_save' });
  }
}

// Warm JPDB cache on session start (uses server-side key like /api/jpdb/parse)
async function warmJpdbCache() {
  try {
    const response = await fetch(`${API_BASE}/api/game/session-start`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    const data = await response.json();
    console.log(`[Game] Session cache: ${data.warmed ? data.cachedWords + ' words' : data.reason || data.error}`);
  } catch (e) {
    console.warn('[Game] Failed to warm session cache:', e);
  }
}

// ============ PROLOGUE ============
let _prologueCache = null;

async function playPrologue() {
  if (!_prologueCache) {
    const resp = await fetch('/api/game/prologue', { headers: getAuthHeaders() });
    if (!resp.ok) return;
    _prologueCache = await resp.json();
  }

  let lastChoiceId = null;

  for (const prologueScene of _prologueCache) {
    if (prologueScene.conditional && prologueScene.conditional !== lastChoiceId) {
      continue;
    }

    // Show/hide Cid sprite based on speaker
    if (prologueScene.speaker === 'Cid') {
      scene.showCid();
    } else {
      scene.hideCid();
    }

    // Garbled lines: show raw text, no bootstrap rendering
    if (prologueScene.type === 'garbled') {
      await narrationBox.show(prologueScene.narration, {
        speaker: prologueScene.speaker || undefined,
        garbled: true
      });
      continue;
    }

    const showOpts = {
      html: true,
      speaker: prologueScene.speaker || undefined
    };
    if (prologueScene.choices) {
      showOpts.choices = prologueScene.choices;
    }

    const html = prologueScene.narration ? renderEnFirst(prologueScene.narration) : '';
    const result = await narrationBox.show(html, showOpts);
    if (prologueScene.choices) {
      lastChoiceId = result;
    }

    if (prologueScene.id === 'prologue-hiragana-question' && result === 'kana-no') {
      await fetch('/api/game/kana-mode', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true })
      });
    }

    flushExposures();
  }

  scene.hideCid();

  // Mark prologue as complete on server
  await fetch('/api/game/prologue-complete', {
    method: 'POST',
    headers: getAuthHeaders()
  });
}

// ============ GAME ACTIONS ============
async function createCharacter() {
  const result = await apiCreatePlayer('Hacker', {}, 0);
  if (result?.state) {
    updateGameState(result.state);
    await playPrologue();
    updateUI();
  }
}

function removeCollectionOverlay() {
  const gameApp = document.querySelector('.game-app');
  gameApp?.querySelector('.collection-select')?.remove();
}

async function startNewRun() {
  // Note: clearWordCache() moved to returnToHub() for earlier prefetching

  // Fetch creature collection for team select
  const collectionResult = await apiGetCreatureCollection();
  const catalog = collectionResult?.catalog;
  const collection = collectionResult?.collection;

  if (catalog && catalog.length > 0) {
    const starterIds = await showCollectionSelect(catalog, collection);
    if (!starterIds || starterIds.length === 0) {
      removeCollectionOverlay();
      return;
    }

    // Retry up to 3 times if isLoading blocks the call
    let result = null;
    for (let attempt = 0; attempt < 3 && !result?.state; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 300));
      result = await apiStartRun({ starterIds });
    }

    removeCollectionOverlay();
    if (result?.state) {
      updateGameState(result.state);
      updateUI();
    }
  }
}

function showCollectionSelect(catalog, collection) {
  const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  const MAX_POINTS = 10;

  return new Promise((resolve) => {
    const selected = new Set();
    let usedPoints = 0;
    let inspectedId = null;

    // Element emoji map
    const ELEMENT_EMOJI = { water: '\u{1F4A7}', fire: '\u{1F525}', earth: '\u{1F30D}', metal: '\u2699\uFE0F', wood: '\u{1F33F}' };

    // Rarity display names
    const RARITY_LABELS = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };

    // Build full display name: "Kamedor the Ancient Turtle"
    function fullName(r) {
      if (r.modifier && r.baseMeaning) {
        return `${r.nameEn} the ${r.modifier.meaning} ${r.baseMeaning.charAt(0).toUpperCase() + r.baseMeaning.slice(1)}`;
      }
      return r.nameEn;
    }

    // Render the owned creature card HTML
    function renderOwnedCard(r) {
      const el = ELEMENT_EMOJI[r.element] || '';
      const movesHtml = (r.learnset || []).slice(0, 4).map(entry => {
        const lvl = entry.level || '?';
        const name = entry.nameEn || entry.moveId || '';
        return `<span class="cc-move-tag">Lv${lvl} ${name}</span>`;
      }).join('');
      return `
        <div class="creature-card" data-element="${r.element}">
          <div class="cc-hero">
            <div class="cc-sprite"><img data-creature-id="${r.id}" alt="${r.nameEn}" /></div>
            <div class="cc-meta">
              <div class="cc-name">${fullName(r)}</div>
              <div class="cc-sub">${el} ${r.element.charAt(0).toUpperCase() + r.element.slice(1)} · ${r.archetype || ''}</div>
              <div class="cc-creature-stats">
                <span class="cc-stat"><span class="cc-stat-val">${r.baseHp}</span>&nbsp;<span class="cc-stat-lbl">HP</span></span>
                <span class="cc-stat"><span class="cc-stat-val">${r.baseAttack}</span>&nbsp;<span class="cc-stat-lbl">ATK</span></span>
                <span class="cc-stat"><span class="cc-stat-val">${r.baseMp || '?'}</span>&nbsp;<span class="cc-stat-lbl">MP</span></span>
                <span class="cc-stat"><span class="cc-stat-lbl">${RARITY_LABELS[r.rarity] || r.rarity}</span></span>
                <span class="cc-stat"><span class="cc-stat-lbl">${r.pointCost} pts</span></span>
              </div>
            </div>
          </div>
          <div class="cc-skills">
            <div class="cc-sk">
              <div class="cc-sk-head"><span class="cc-sk-tag atk">MOVES</span></div>
              <div class="cc-sk-meta cc-moves-list">${movesHtml || 'None'}</div>
            </div>
          </div>
          <div class="cc-foot">
            <span>${r.pointCost} pts</span>
            <span>Befriended ${r.befriendCount || 0}x</span>
          </div>
        </div>`;
    }

    // Render redacted card for unowned creatures
    function renderRedactedCard(r) {
      const el = ELEMENT_EMOJI[r.element] || '';
      return `
        <div class="creature-card cc-redacted" data-element="${r.element}">
          <div class="cc-qmarks">???</div>
          <div class="cc-unknown">Unknown Creature</div>
          <div class="cc-tags">
            <span class="cc-tag">${el} ${r.element.charAt(0).toUpperCase() + r.element.slice(1)}</span>
            <span class="cc-tag">${RARITY_LABELS[r.rarity] || r.rarity}</span>
          </div>
          <div class="cc-hint">Befriend this creature to unlock its details</div>
        </div>`;
    }

    // Sort: common first, then by element within rarity
    const sorted = [...catalog].sort((a, b) => {
      const ri = RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
      if (ri !== 0) return ri;
      return a.element.localeCompare(b.element);
    });

    function render() {
      const remaining = MAX_POINTS - usedPoints;
      const budgetClass = remaining <= 0 ? 'budget-full' : remaining <= 3 ? 'budget-tight' : 'budget-ok';

      const cellsHtml = sorted.map(r => {
        const owned = collection.includes(r.id);
        const isSelected = selected.has(r.id);
        const tooExpensive = owned && !isSelected && r.pointCost > remaining;
        const classes = [
          'collection-cell',
          !owned && 'unowned',
          isSelected && 'selected',
          tooExpensive && 'too-expensive'
        ].filter(Boolean).join(' ');

        return `
          <div class="${classes}" data-id="${r.id}" data-rarity="${r.rarity}" data-element="${r.element}">
            <img data-creature-id="${r.id}" alt="${r.nameEn}" />
            ${owned ? `<span class="point-badge">${r.pointCost}</span>` : ''}
            <span class="creature-name">${owned ? r.nameEn : '???'}</span>
          </div>
        `;
      }).join('');

      // Render into .game-app (not #action-area) so the overlay fills the full mobile container
      const gameApp = document.querySelector('.game-app');
      let overlay = gameApp.querySelector('.collection-select');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'collection-select';
        gameApp.appendChild(overlay);
      }
      // Card area
      let cardHtml;
      if (!inspectedId) {
        cardHtml = '<div class="creature-card-prompt">Tap a creature to view its stats</div>';
      } else {
        const inspected = sorted.find(r => r.id === inspectedId);
        if (inspected) {
          const owned = collection.includes(inspected.id);
          cardHtml = owned ? renderOwnedCard(inspected) : renderRedactedCard(inspected);
        } else {
          cardHtml = '<div class="creature-card-prompt">Tap a creature to view its stats</div>';
        }
      }

      overlay.innerHTML = `
        <div class="collection-header">
          <span class="collection-title">${t('selectTeam')}</span>
          <span class="collection-points ${budgetClass}">${usedPoints} / ${MAX_POINTS} pts</span>
        </div>
        ${cardHtml}
        <div class="collection-grid">${cellsHtml}</div>
        <button class="action-btn action-btn-primary" id="collection-confirm-btn" ${selected.size === 0 ? 'disabled' : ''}>
          ${t('startRun', selected.size, selected.size !== 1 ? 's' : '')}
        </button>
      `;

      // Configure animated idle sprites with static fallback
      overlay.querySelectorAll('img[data-creature-id]').forEach(img => {
        configureCreatureImg(img, img.dataset.creatureId, el => { el.style.display = 'none'; });
      });

      // Set background
      scene.setBackground('/assets/backgrounds/hub.webp');

      // Bind click handlers
      document.querySelectorAll('.collection-cell').forEach(cell => {
        cell.addEventListener('click', () => {
          const id = cell.dataset.id;
          const creature = sorted.find(r => r.id === id);
          if (!creature) return;

          // Always update inspection (even for unowned)
          inspectedId = id;

          // Only toggle selection for owned creatures
          const owned = collection.includes(id);
          if (owned) {
            if (selected.has(id)) {
              selected.delete(id);
              usedPoints -= creature.pointCost;
            } else {
              if (creature.pointCost > MAX_POINTS - usedPoints) {
                render();
                return;
              }
              selected.add(id);
              usedPoints += creature.pointCost;
            }
          }
          render();
        });
      });

      document.getElementById('collection-confirm-btn')?.addEventListener('click', () => {
        if (selected.size > 0) {
          resolve([...selected]);
        }
      });
    }

    render();
  });
}

function showCollectionToast(additions) {
  for (const creature of additions) {
    const toast = document.createElement('div');
    toast.className = 'collection-toast';
    toast.innerHTML = `
      <img />
      <span class="toast-text">${t('newCreature', creature.nameEn)}</span>
    `;
    configureCreatureImg(toast.querySelector('img'), creature.id);
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'toastSlideOut 0.3s ease-in forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

let encounterStarting = false;
async function startEncounter() {
  if (encounterStarting) return;
  encounterStarting = true;
  const hasCreatures = gameState.run?.creatureParty?.active?.length > 0;

  let result;
  if (hasCreatures) {
    result = await apiStartCreatureEncounter();
  } else if (gameState.phase === 'room_encounter') {
    result = await apiRoomEncounter();
  } else {
    result = await apiStartEncounter();
  }

  encounterStarting = false;
  if (result?.state) {
    updateGameState(result.state);
    updateUI();
    // Creature encounters don't have possessed dialogue
    if (!hasCreatures) {
      const enemy = gameState.combat?.enemy;
      if (result?.dialogue || enemy?.dialogue?.possessed) {
        const text = result.dialogue || (Array.isArray(enemy.dialogue.possessed)
          ? enemy.dialogue.possessed[Math.floor(Math.random() * enemy.dialogue.possessed.length)]
          : enemy.dialogue.possessed);
        await showEnemyDialogue(text, 'possessed');
      }
    }
    // Show NPC greeting before combat starts
    if (result?.npc) {
      await combatLoopUI.showNpcGreeting(result.npc);
    }
    await delay(300);
    startCombatLoop();
  }
}


async function returnToHub() {
  if (combatLoopUI.isCombatActive()) {
    combatLoopUI.cleanupCombat();
  }
  await apiForfeitRun();
  await loadGameState();
  updateUI();
  // Prefetch words now so they're ready when user starts next run
  wordPractice.clearWordCache();
  wordPractice.prefetchCombatWords();
}

// ============ COMBAT ============
function startCombatLoop() { combatLoopUI.startCombatLoop(); }
function resumeCombatAfterVocab() { combatLoopUI.resumeCombatAfterVocab(); }

function showVictoryModal(result) {
  audio.stopBGM();
  narrationBox.show('Victory!', { autoDismiss: 2000 });

  // Show collection toast for newly befriended creatures
  if (result.newCollectionAdditions?.length > 0) {
    showCollectionToast(result.newCollectionAdditions);
  }

  // Trigger batch refresh on combat end if any pending reviews
  if (combatReviewedBatch.length > 0) {
    const reviewedWords = combatReviewedBatch.map(w => ({ vid: w.vid, sid: w.sid }));
    combatReviewedBatch = [];
    apiGetDueWords(reviewedWords).catch(e => console.warn('[Combat] End batch refresh failed:', e));
  }
  setTimeout(async () => {
    await loadGameState();
    updateUI();
  }, 1500);
}

function showGameOverModal(result) {
  audio.stopBGM();
  audio.playSFX('defeat');

  // Trigger batch refresh on combat end if any pending reviews
  if (combatReviewedBatch.length > 0) {
    const reviewedWords = combatReviewedBatch.map(w => ({ vid: w.vid, sid: w.sid }));
    combatReviewedBatch = [];
    apiGetDueWords(reviewedWords).catch(e => console.warn('[Combat] End batch refresh failed:', e));
  }

  updateCreatureRow();
  takeover.open('gameover');
  const content = takeover.getContent('gameover');
  const floor = gameState.run?.currentFloor || 1;
  const roomsCleared = gameState.run?.currentRoom || 0;
  content.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;padding:0 24px;">
      <div style="font-size:48px;margin-bottom:8px;">💀</div>
      <h2 style="text-align:center;font-size:24px;font-weight:700;">${t('defeated')}</h2>
      <p style="text-align:center;color:var(--text-secondary);font-size:14px;">${t('runEnded')}</p>
      <div style="text-align:center;color:var(--text-muted);font-size:13px;">
        ${t('floorRooms', floor, roomsCleared)}
      </div>
      <button class="action-btn action-btn-primary" id="gameover-hub-btn" style="margin-top:24px;">ハブに戻る</button>
    </div>
  `;
  document.getElementById('gameover-hub-btn')?.addEventListener('click', async () => {
    takeover.close('gameover');
    await returnToHub();
  });
}

// ============ FLASH CARD HANDLERS ============
function handleCardFlip() {
  if (currentFlashCardWord?.word) {
    tts.speakText(currentFlashCardWord.word);
  }
}

// ============ CREATURE COMBAT HANDLERS ============
async function showPostCombatShopFlow() {
  try {
    const shopResult = await apiRollPostCombatShop();
    if (!shopResult?.items?.length) return;

    return new Promise((resolve) => {
      postCombatShop.init({
        itemSelectedCallback: async (index) => {
          const selectResult = await apiSelectShopItem(index);
          if (selectResult?.state) updateGameState(selectResult.state);
          postCombatShop.hide();
          resolve();
        }
      });
      postCombatShop.show(shopResult.items);
    });
  } catch (e) {
    console.error('Post-combat shop error:', e);
  }
}

// ============ CREATURE EQUIP UI ============
async function openCreatureEquipView() {
  const party = gameState.run?.creatureParty;
  if (!party) return;

  takeover.open('creatureEquip');
  const content = takeover.getContent('creatureEquip');

  function renderCreatureEquipContent() {
    const active = party.active || [];
    const reserves = party.reserves || [];

    const ELEMENT_ICONS = creatureRow.ELEMENT_ICONS || { wood: '🌿', fire: '🔥', earth: '⛰️', metal: '⚙️', water: '💧' };
    const ELEMENT_COLORS = creatureRow.ELEMENT_COLORS || { wood: '#4CAF50', fire: '#F44336', earth: '#8D6E63', metal: '#9E9E9E', water: '#2196F3' };
    const rarityStars = (rarity) => { const n = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 }[rarity]; return n ? `<span style="color:#FFD700">${n}★</span>` : ''; };

    const activeHtml = active.map((creature, i) => {
      if (!creature) return `<div class="creature-equip-slot empty" data-type="active" data-index="${i}"><span style="opacity:0.4">${t('emptySlot')}</span></div>`;
      const hpPct = Math.max(0, (creature.hp / creature.maxHp) * 100);
      return `
        <div class="creature-equip-slot" data-type="active" data-index="${i}" data-creature-id="${creature.id}"
             style="border-left: 3px solid ${ELEMENT_COLORS[creature.element] || '#666'}">
          <img class="creature-equip-sprite" data-creature-id="${creature.id}" alt="">
          <div class="creature-equip-info">
            <div class="creature-equip-name">${ELEMENT_ICONS[creature.element] || ''} ${creature.nameEn} ${rarityStars(creature.rarity)} <span style="opacity:0.6">Lv${creature.level}</span></div>
            <div class="creature-equip-stats">HP: ${creature.hp}/${creature.maxHp} | ATK: ${creature.attack}</div>
            <div class="creature-hp-bar" style="width:100%;height:4px;margin-top:2px">
              <div class="creature-hp-fill" style="width:${hpPct}%;background-color:${getHpColor(hpPct)}"></div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    const reservesHtml = reserves.length > 0 ? reserves.map((creature, i) => {
      if (!creature) return '';
      const hpPct = Math.max(0, (creature.hp / creature.maxHp) * 100);
      return `
        <div class="creature-equip-slot" data-type="reserve" data-index="${i}" data-creature-id="${creature.id}"
             style="border-left: 3px solid ${ELEMENT_COLORS[creature.element] || '#666'}">
          <img class="creature-equip-sprite" data-creature-id="${creature.id}" alt="">
          <div class="creature-equip-info">
            <div class="creature-equip-name">${ELEMENT_ICONS[creature.element] || ''} ${creature.nameEn} ${rarityStars(creature.rarity)} <span style="opacity:0.6">Lv${creature.level}</span></div>
            <div class="creature-equip-stats">HP: ${creature.hp}/${creature.maxHp} | ATK: ${creature.attack}</div>
            <div class="creature-hp-bar" style="width:100%;height:4px;margin-top:2px">
              <div class="creature-hp-fill" style="width:${hpPct}%;background-color:${getHpColor(hpPct)}"></div>
            </div>
          </div>
        </div>
      `;
    }).join('') : `<p style="padding:16px;opacity:0.6;text-align:center">${t('noReserves')}</p>`;

    content.innerHTML = `
      <h3 style="margin:16px">${t('equippedCreatures')}</h3>
      <div class="creature-equip-list">${activeHtml}</div>
      <h3 style="margin:16px">${t('reserveCreatures')}</h3>
      <div class="creature-equip-list">${reservesHtml}</div>
      <p style="padding:8px 16px;opacity:0.5;font-size:0.8em;text-align:center">${t('swapInstruction')}</p>
    `;

    // Configure animated idle sprites with static fallback
    content.querySelectorAll('.creature-equip-sprite[data-creature-id]').forEach(img => {
      configureCreatureImg(img, img.dataset.creatureId, el => { el.style.display = 'none'; });
    });

    // Selection logic: tap active then reserve to swap
    let selectedActive = null;
    let selectedReserve = null;

    content.querySelectorAll('.creature-equip-slot[data-type="active"]').forEach(el => {
      el.addEventListener('click', async () => {
        // Clear previous selections
        content.querySelectorAll('.creature-equip-slot').forEach(s => s.classList.remove('selected'));
        selectedActive = parseInt(el.dataset.index, 10);
        el.classList.add('selected');

        if (selectedReserve !== null) {
          // Both selected: perform swap
          const result = await apiSwapCreatureEquip(selectedActive, selectedReserve);
          if (result?.creatureParty) {
            // Update party data in gameState immediately (BUG C fix)
            party.active = result.creatureParty.active;
            party.reserves = result.creatureParty.reserves;
            if (result.state) updateGameState(result.state);
          }
          selectedActive = null;
          selectedReserve = null;
          renderCreatureEquipContent(); // Re-render with updated data
          updateCreatureRow(); // Update main UI creature row
        }
      });
    });

    content.querySelectorAll('.creature-equip-slot[data-type="reserve"]').forEach(el => {
      el.addEventListener('click', async () => {
        content.querySelectorAll('.creature-equip-slot[data-type="reserve"]').forEach(s => s.classList.remove('selected'));
        selectedReserve = parseInt(el.dataset.index, 10);
        el.classList.add('selected');

        if (selectedActive !== null) {
          // Both selected: perform swap
          const result = await apiSwapCreatureEquip(selectedActive, selectedReserve);
          if (result?.creatureParty) {
            // Update party data in gameState immediately (BUG C fix)
            party.active = result.creatureParty.active;
            party.reserves = result.creatureParty.reserves;
            if (result.state) updateGameState(result.state);
          }
          selectedActive = null;
          selectedReserve = null;
          renderCreatureEquipContent(); // Re-render with updated data
          updateCreatureRow(); // Update main UI creature row
        }
      });
    });

    // Also support rearranging: tap two active slots to swap positions
    let firstActiveClick = null;
    content.querySelectorAll('.creature-equip-slot[data-type="active"]').forEach(el => {
      el.addEventListener('dblclick', async () => {
        // Double-click to initiate rearrange mode (deselect reserve selection)
        selectedReserve = null;
        content.querySelectorAll('.creature-equip-slot').forEach(s => s.classList.remove('selected'));
      });
    });
  }

  renderCreatureEquipContent();
}

// ============ EVENT LISTENERS ============
function setupEventListeners() {
  // Menu sheet toggle
  modalsUI.initMenu();
  dom.menuBtn?.addEventListener('click', () => modalsUI.toggleMenu());

  // Bots button opens creature equip view
  dom.botsBtn?.addEventListener('click', () => {
    if (gameState.run?.creatureParty?.active?.length > 0) {
      openCreatureEquipView();
    }
  });

  // Menu items (menu auto-closes via delegation in modals.initMenu)
  dom.settingsBtn.addEventListener('click', () => modalsUI.openSettings());
  dom.resetRunBtn.addEventListener('click', async () => {
    if (confirm('Forfeit current run?')) {
      await returnToHub();
    }
  });
}

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', async () => {
  // Lock to portrait orientation (PWA + mobile browsers)
  if (screen.orientation?.lock) {
    screen.orientation.lock('portrait-primary').catch(() => {});
  }

  // Initialize auth UI
  auth.init({
    onAuthenticated: () => initGame()
  });

  // Check auth status
  const isAuth = await auth.checkAuth();
  if (isAuth) {
    auth.hideAuthScreen();
    await initGame();
  } else {
    auth.showAuthScreen();
  }
});

async function initGame() {
  // Initialize i18n language from settings
  setLang(settings.isJapanifyUIEnabled() ? 'ja' : 'en');

  takeover.init();
  leaderboard.init();
  bugReport.init();
  speedReview.init({
    sendReview: (vid, sid, grade, wordText) => apiSendJpdbReview(vid, sid, grade, wordText),
    playTTS: (word) => tts.playWord(word),
    prefetchTTS: (word) => tts.prefetchWord(word),
    refreshQueue: async (reviewedWords = []) => {
      const result = await apiGetDueWords(reviewedWords);
      return result?.words || [];
    }
  });

  // Initialize lookup mode
  lookup.init({
    parseText: parseJpdbText,
    lookupWord: lookupJpdbWord,
    lookupBatch: lookupJpdbBatch,
    showToast: (msg) => scene.showToast(msg, 3000),
    hasJpdbKey: () => !!localStorage.getItem('authToken')
  });

  actions.init({
    equipBots: () => {
      if (gameState.run?.creatureParty?.active?.length > 0) {
        openCreatureEquipView();
      }
    },
    contextAction: null,
    cardSwipe: (direction) => {
      // Word discovery mode uses its own handler via custom event
      if (gameState.phase === 'wordDiscovery') {
        document.dispatchEvent(new CustomEvent('discovery-card-swiped', { detail: direction }));
        return;
      }
      // Combat mode: grade based on swipe direction and pass action type
      const grade = direction === 'right' ? 4 : 1;
      const actionType = window._pendingCombatAction || 'attack';
      const reviewWord = window._pendingCombatWord;
      window._pendingCombatAction = null;
      window._pendingCombatWord = null;

      // Send JPDB review for the word that was just graded
      console.log('[JPDB Review] cardSwipe called:', { direction, grade, actionType, reviewWord });
      if (reviewWord?.vid !== undefined && reviewWord?.sid !== undefined) {
        console.log('[JPDB Review] Sending review:', { vid: reviewWord.vid, sid: reviewWord.sid, grade });
        apiSendJpdbReview(reviewWord.vid, reviewWord.sid, grade);

        // Track reviews for batch refresh
        combatReviewedBatch.push(reviewWord);

        // Check for batch refresh (every 50 reviews)
        if (combatReviewedBatch.length >= 50) {
          // Fire and forget - refresh queue in background
          const reviewedWords = combatReviewedBatch.map(w => ({ vid: w.vid, sid: w.sid }));
          combatReviewedBatch = [];
          apiGetDueWords(reviewedWords).then(result => {
            if (result?.words) {
              console.log('[Combat] Batch refresh: got', result.words.length, 'fresh words');
            }
          }).catch(e => console.warn('[Combat] Batch refresh failed:', e));
        }
      } else {
        console.warn('[JPDB Review] Missing vid/sid, cannot send review:', reviewWord);
      }

      // Play TTS for the reviewed word
      if (reviewWord?.word) {
        tts.playWord(reviewWord.word);
      }

      combatLoopUI.resumeCombatAfterVocab(grade, actionType);
    },
    cardFlip: handleCardFlip,
    dualCardSelect: (actionType, selectedWord) => {
      // Store the action type and word for when review completes
      window._pendingCombatAction = actionType;
      window._pendingCombatWord = selectedWord;
      console.log('[JPDB Review] dualCardSelect - stored word:', { actionType, selectedWord, hasVid: selectedWord?.vid !== undefined, hasSid: selectedWord?.sid !== undefined });

      // Return unchosen words to pool
      const words = wordPractice.getTwoCombatWords();
      if (actionType !== 'attack' && words?.attackWord) wordPractice.returnWordToPool(words.attackWord);
      if (actionType !== 'defend' && words?.defendWord) wordPractice.returnWordToPool(words.defendWord);

      // Remove selected word from queue
      wordPractice.removeWordFromCombatQueue(selectedWord);

      // Dual card flips in place - no separate flash card needed
    },
  });

  creatureRow.init({
    swapCreatureCallback: async (activeIndex, reserveIndex) => {
      const result = await apiSwapCreature(activeIndex, reserveIndex);
      if (result.error) {
        console.error('Swap failed:', result.error);
        return;
      }
      // Update game state with new party
      if (result.state) {
        updateGameState(result.state);
      }
      // Re-render creature row with updated active roster
      creatureRow.setReserves(result.creatureParty?.reserves || []);
      creatureRow.render(result.creatureParty?.active || []);
      // If paid swap triggered enemy attacks, show them
      if (result.enemyAttacks?.length > 0) {
        for (const atk of result.enemyAttacks) {
          const actionArea = document.getElementById('action-area');
          if (actionArea) {
            actionArea.innerHTML = `<div class="combat-creature-attack enemy">${atk.attackerName} deals <strong>${atk.damage}</strong></div>`;
          }
        }
      }
      if (result.combatEnded) {
        combatLoopUI.stopCombatLoop(result);
      }
      updateUI();
    },
    rearrangeCreatureCallback: async (indexA, indexB) => {
      const result = await apiRearrangeCreatures(indexA, indexB);
      if (result?.error) {
        console.error('Rearrange failed:', result.error);
        return;
      }
      if (result?.state) {
        updateGameState(result.state);
      }
      creatureRow.setReserves(result?.creatureParty?.reserves || []);
      creatureRow.render(result?.creatureParty?.active || []);
    },
  });

  wordPractice.init({
    apiBase: API_BASE,
    getGameState: () => gameState,
    showToast: (msg) => scene.showToast(msg),
    escapeHtml: escapeHtml,
    updatePlayerHPBar: (hp) => {
      if (gameState.player) {
        gameState.player.hp = hp;
      }
    },
    showDamageNumber: (dmg, isPlayer, isCrit) => scene.showDamageNumber(dmg, { isCrit }),
    resumeCombatAfterVocab: () => resumeCombatAfterVocab(),
    isCombatActive: () => combatLoopUI.isCombatActive(),
    isEnemyDialogueActive: () => enemyDialogueActive,
    shuffleArray: shuffleArray,
    sendJpdbReview: apiSendJpdbReview,
  });

  explorationUI.init({
    getGameState: () => gameState,
    updateGameState,
    updateUI,
    actions,
    scene: { ...scene, showNarration: (text, opts) => narrationBox.show(text, opts), forceHideNarration: () => narrationBox.forceHide() },
    startEncounter,
    startNewRun,
    returnToHub,
    apiGetAreaOptions,
    apiSelectArea,
    apiReturnToHub: returnToHub,
    apiProceed,
    apiRoomEncounter,
    apiShrineUpgrade,
    apiQuizReward,
    apiGetQuizQuestion,
    apiSubmitQuizAnswer,
    apiGetDiscoveryWords,
    apiGetDiscoveryStatus,
    apiCompleteDiscovery,
    apiSwipeWord: (vid, sid, grade, isDiscovery) => apiSendJpdbReview(vid, sid, grade, isDiscovery),
    apiPostCombatRefresh: (words) => fetch('/api/game/post-combat-refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ words })
    }),
    apiGetDueWords,
    apiGetCreatureCollection,
    showCollectionSelect,
    apiGetWhackAMolePool,
    apiCompleteWhackAMole,
  });

  metaShop.init({
    getGameState: () => gameState,
    updateGameState
  });

  economyUI.init({
    getGameState: () => gameState,
    updateGameState,
    updateUI,
    apiShopSkip,
    apiDealerSell,
    apiDealerBuy,
    apiDealerLeave,
    apiGetDealerState,
  });

  modalsUI.init({
    takeover,
    scene,
    settings,
  });

  characterUI.init({
    getGameState: () => gameState,
    scene,
  });

  combatLoopUI.init({
    getGameState: () => gameState,
    updateGameState,
    updateUI,
    settings,
    narration: { showNarration: (text, opts) => narrationBox.show(text, opts), forceHideNarration: () => narrationBox.forceHide() },
    wordPractice,
    characterUI,
    showDamageNumber: (dmg, isPlayer, isCrit, isDot, isHeal, specialType, tierClass) => scene.showDamageNumber(dmg, { isCrit, isHeal, tierClass }),
    showDotDamage: (dmg) => scene.showDamageNumber(dmg, { isCrit: false }),
    animateEnemyHurt: () => {},
    animatePlayerHurt: () => {},
    animateEnemyDefeat: () => scene.hideEnemies(),
    updateActionPanel: () => {},
    playNarrationAudio: (audioData) => {
      if (!audioData) return;
      try {
        const blob = new Blob([audioData], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const audioEl = new Audio(url);
        audioEl.onended = () => URL.revokeObjectURL(url);
        audioEl.onerror = () => URL.revokeObjectURL(url);
        audioEl.play().catch(e => console.warn('[TTS] Narration audio playback failed:', e.message));
      } catch (e) {
        console.warn('[TTS] Failed to play narration audio:', e.message);
      }
    },
    showVictoryModal,
    showGameOverModal,
    showEnemyDialogue,
    getEnemyDialogueActive: () => enemyDialogueActive,
    getDialogueDismissPromise: () => dialogueDismissPromise,
    delay,
    showFlashCards: (words, options) => {
      currentFlashCardWord = words.length === 1 ? words[0] : null;
      actions.showFlashCards(words, options);
    },
    setCombatAnimationActive: (active) => { combatAnimationActive = active; },
    apiCreatureCombatCycle,
    showPostCombatShop: showPostCombatShopFlow,
    apiBefriendReplace: (releaseCreatureId) => apiBefriendReplace(releaseCreatureId),
    apiGetBefriendConversation,
    apiSubmitBefriendAnswer,
    apiStartNpcDialogue: startNpcDialogue,
    apiRespondNpcDialogue: respondNpcDialogue,
    showNpcSprite: (name, id, npc) => scene.showNpcTrainer(name, id, npc),
    hideNpcSprite: () => scene.hideNpcTrainer(),
    updateCreatureRowData: (creatures) => creatureRow.updateData(creatures),
  });

  // Initialize move/target selection UI for Pokemon-style combat
  combatLoopUI.initMoveUI();

  setupEventListeners();

  // Wire logout button (in menu sheet — menu auto-closes via delegation)
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to log out?')) {
      auth.logout();
      auth.showAuthScreen();
    }
  });

  await loadKnownWords();
  await loadGameState();

  // Show prologue for returning players who haven't completed it
  if (gameState.player && !gameState.meta?.prologueComplete) {
    await playPrologue();
  }

  // Warm JPDB cache on session start
  warmJpdbCache();

  updateUI();

  // Prefetch words if in hub (ready for when user starts a run)
  if (gameState.phase === 'hub') {
    wordPractice.prefetchCombatWords();
  }

  // Initialize TTS and review type from server settings
  const serverSettings = await settings.loadServerSettings();
  tts.initSettings(serverSettings);
  const savedTtsVol = localStorage.getItem('jrpg_ttsVolume');
  if (savedTtsVol !== null) tts.setVolume(parseFloat(savedTtsVol));
  wordPractice.setReviewType?.(serverSettings.reviewType || 'flash-card');

  // Initialize audio on first user interaction (browser autoplay policy)
  let audioInitialized = false;
  async function ensureAudio() {
    if (audioInitialized) return;
    audioInitialized = true;
    await audio.initAudio();
    document.removeEventListener('click', ensureAudio);
    document.removeEventListener('touchstart', ensureAudio);
  }
  document.addEventListener('click', ensureAudio);
  document.addEventListener('touchstart', ensureAudio);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      audio.pauseBGM();
    } else {
      audio.resumeBGM();
    }
  });

  if (gameState.phase === 'combat' && gameState.combat?.enemy?.hp > 0) {
    startCombatLoop();
  }
}
