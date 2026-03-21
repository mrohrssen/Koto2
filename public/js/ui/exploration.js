/**
 * @file exploration.js - Non-Combat Navigation UI
 *
 * PURPOSE:
 * Handles all non-combat game phases: hub, area selection, room exploration,
 * shrine upgrades, and quiz encounters. Renders appropriate buttons and
 * manages phase-specific interactions.
 *
 * KEY EXPORTS:
 * - init(callbacks): Initialize with game state and API callbacks
 * - renderHub(): Show hub phase (Equip Bots + Infiltrate buttons)
 * - renderAreaSelection(): Show area picker cards
 * - renderExploring(): Show Proceed/Fight buttons for room navigation
 * - renderAreaComplete(): Show Continue button after area cleared
 * - renderRunEnded(): Show Return to Hub button
 * - renderShrine(): Show creature level-up selection
 * - renderQuiz(): Show quiz question and reward selection
 *
 * DEPENDENCIES:
 * - Callbacks injected via init(): getGameState, updateGameState, updateUI
 * - API functions: apiGetAreaOptions, apiSelectArea, apiProceed, etc.
 * - actions module: For button rendering
 * - scene module: For narration display
 */

import * as speedReview from './speed-review.js';
import { WhackAMoleGame } from './whack-a-mole.js';
import { playSFX } from '../audio.js';
import { creatureBgUrl, replaceWithTextSprite } from './sprite-utils.js';
import { t, isJapanified } from './i18n.js';
import * as metaShop from './meta-shop.js';
import { buildItemEffectPills } from './item-effect-pills.js';

let getGameState = null;
let updateGameState = null;
let updateUI = null;
let actions = null;
let sceneModule = null;
let startEncounter = null;
let startNewRun = null;
let returnToHub = null;

// Module-level guard to prevent multiple shrine clicks across re-renders
let shrineInProgress = false;

// Module-level state for word discovery (persists across gameState updates)
// This prevents infinite narration loops when updateGameState() replaces room object
let discoveryState = {
  fetched: false,
  words: [],
  wordsLearned: 0,
  roomId: null,  // Reset when room changes
  statusChecked: false,
  atLimit: false,
  todayCount: 0,
  dailyLimit: 10
};

// API functions
let apiGetAreaOptions = null;
let apiSelectArea = null;
let apiReturnToHub = null;
let apiProceed = null;
let apiRoomEncounter = null;
let apiShrineUpgrade = null;
let apiQuizReward = null;
let apiGetQuizQuestion = null;
let apiSubmitQuizAnswer = null;
// Word discovery API functions
let apiGetDiscoveryWords = null;
let apiGetDiscoveryStatus = null;
let apiCompleteDiscovery = null;
let apiSwipeWord = null;
let apiPostCombatRefresh = null;

// Whack-a-Mole API
let apiGetWhackAMolePool = null;
let apiCompleteWhackAMole = null;

// Speed review API
let apiGetDueWords = null;
let apiStartSpeedReviewRoom = null;
let apiProgressSpeedReviewRoom = null;
let apiCompleteSpeedReviewRoom = null;

let apiGetCreatureCollection = null;
let showCollectionSelect = null;

let speedReviewRoomLaunchState = {
  roomId: null,
  starting: false
};
let speedReviewRoomCommitChain = Promise.resolve();
// Skill Master API
let apiSkillMasterOffers = null;
let apiSkillMasterChoose = null;

// Friendly NPC API
let apiGetFriendlyNpcOffers = null;
let apiChooseFriendlyNpcItem = null;

export function init(callbacks) {
  getGameState = callbacks.getGameState;
  updateGameState = callbacks.updateGameState;
  updateUI = callbacks.updateUI;
  actions = callbacks.actions;
  sceneModule = callbacks.scene;
  startEncounter = callbacks.startEncounter;
  startNewRun = callbacks.startNewRun;
  returnToHub = callbacks.returnToHub;
  apiGetAreaOptions = callbacks.apiGetAreaOptions;
  apiSelectArea = callbacks.apiSelectArea;
  apiReturnToHub = callbacks.apiReturnToHub;
  apiProceed = callbacks.apiProceed;
  apiRoomEncounter = callbacks.apiRoomEncounter;
  apiShrineUpgrade = callbacks.apiShrineUpgrade;
  apiQuizReward = callbacks.apiQuizReward;
  apiGetQuizQuestion = callbacks.apiGetQuizQuestion;
  apiSubmitQuizAnswer = callbacks.apiSubmitQuizAnswer;
  apiGetDiscoveryWords = callbacks.apiGetDiscoveryWords;
  apiGetDiscoveryStatus = callbacks.apiGetDiscoveryStatus;
  apiCompleteDiscovery = callbacks.apiCompleteDiscovery;
  apiSwipeWord = callbacks.apiSwipeWord;
  apiPostCombatRefresh = callbacks.apiPostCombatRefresh;
  apiGetDueWords = callbacks.apiGetDueWords;
  apiStartSpeedReviewRoom = callbacks.apiStartSpeedReviewRoom;
  apiProgressSpeedReviewRoom = callbacks.apiProgressSpeedReviewRoom;
  apiCompleteSpeedReviewRoom = callbacks.apiCompleteSpeedReviewRoom;
  apiGetCreatureCollection = callbacks.apiGetCreatureCollection;
  showCollectionSelect = callbacks.showCollectionSelect;
  apiGetWhackAMolePool = callbacks.apiGetWhackAMolePool;
  apiCompleteWhackAMole = callbacks.apiCompleteWhackAMole;
  apiSkillMasterOffers = callbacks.apiSkillMasterOffers;
  apiSkillMasterChoose = callbacks.apiSkillMasterChoose;
  apiGetFriendlyNpcOffers = callbacks.apiGetFriendlyNpcOffers;
  apiChooseFriendlyNpcItem = callbacks.apiChooseFriendlyNpcItem;
}

// ============ INVENTORY OVERLAY ============

/** Buff metadata: maps itemBuffs fields to display info */
const BUFF_DISPLAY = {
  attackMult:        { name: '攻撃強化',     nameEn: 'ATK Boost',       icon: '⚔️', default: 1.0, format: v => `+${Math.round((v - 1.0) * 100)}%` },
  hpMult:            { name: '体力強化',     nameEn: 'HP Boost',        icon: '❤️', default: 1.0, format: v => `+${Math.round((v - 1.0) * 100)}%` },
  elementEdge:       { name: '属性強化',     nameEn: 'Element Edge',    icon: '🔷', default: 0,   format: v => `+${v.toFixed(2)}` },
  flatDamageReduction: { name: '装甲強化',   nameEn: 'Thick Armor',     icon: '🛡️', default: 0,   format: v => `-${v} dmg` }
};

const PARTY_SKILL_CATALOG_FALLBACK = {
  superEffectiveMend: {
    name: 'Super-Effective Mend',
    desc: 'Strong hits can heal the whole party.'
  },
  hasteSpark: {
    name: 'Haste Spark',
    desc: 'Strong hits can grant the attacker haste.'
  },
  guardPulse: {
    name: 'Guard Pulse',
    desc: 'Strong hits can shield the whole party.'
  },
  battleRhythm: {
    name: 'Battle Rhythm',
    desc: 'Every 5th party attack deals bonus damage.'
  },
  finisherFeast: {
    name: 'Finisher Feast',
    desc: 'Defeating an enemy can heal the whole party.'
  }
};

// Skill master local cache (for inventory display + to avoid refetch loops)
let skillMasterState = {
  roomId: null,
  fetched: false,
  offered: null,
  chosenId: null,
  catalogById: { ...PARTY_SKILL_CATALOG_FALLBACK }
};

function getActiveRoomFromRun(run) {
  const idx = run?.currentRoom || 0;
  const room = run?.rooms?.[idx];
  return Array.isArray(room) ? room[0] : room;
}

/** Show inventory overlay listing all active persistent item buffs */
function showInventory() {
  // Remove existing overlay if any
  document.getElementById('inventory-overlay')?.remove();

  const gameState = getGameState();
  const itemBuffs = gameState.run?.itemBuffs;
  const partySkills = gameState.run?.partySkills || [];

  // Build list of active buffs (only those that differ from defaults)
  const activeBuffs = [];
  if (itemBuffs) {
    for (const [field, info] of Object.entries(BUFF_DISPLAY)) {
      const value = itemBuffs[field];
      if (value !== undefined && value !== info.default) {
        activeBuffs.push({
          icon: info.icon,
          name: info.name,
          nameEn: info.nameEn,
          value: info.format(value)
        });
      }
    }
  }

  // Collect temp effects from active creatures
  const tempEffects = [];
  const creatures = gameState.creatureParty?.active || [];
  for (const creature of creatures) {
    if (!creature?.activeEffects) continue;
    for (const eff of creature.activeEffects) {
      if (eff.type === 'temp_attack_flat') {
        tempEffects.push({
          icon: '⚔️',
          name: `${creature.nameEn || creature.name} ATK +${eff.value}`,
          turns: eff.remainingTurns
        });
      } else if (eff.type === 'poison') {
        tempEffects.push({
          icon: '☠️',
          name: `${creature.nameEn || creature.name} Poison`,
          turns: eff.remainingTurns
        });
      } else if (eff.type === 'attack_buff') {
        tempEffects.push({
          icon: '🔥',
          name: `${creature.nameEn || creature.name} ATK +${eff.percent}%`,
          turns: eff.remainingTurns
        });
      } else if (eff.type === 'shield' || eff.type === 'team_shield') {
        tempEffects.push({
          icon: '🛡️',
          name: `${creature.nameEn || creature.name} Shield`,
          turns: eff.remainingTurns
        });
      }
    }
  }

  const tempHtml = tempEffects.length > 0
    ? `<div class="inventory-section-label" style="font-size:11px;color:var(--text-secondary);margin:12px 0 4px;padding:0 4px">Active Effects</div>` +
      tempEffects.map(e => `
        <div class="inventory-item">
          <span class="inventory-item-icon">${e.icon}</span>
          <div class="inventory-item-info">
            <span class="inventory-item-name">${e.name}</span>
          </div>
          <span class="inventory-item-value" style="font-size:11px">${e.turns != null ? `${e.turns}t` : ''}</span>
        </div>
      `).join('')
    : '';

  const hasAnything = activeBuffs.length > 0 || tempEffects.length > 0 || partySkills.length > 0;

  const buffsHtml = activeBuffs.length > 0
    ? activeBuffs.map(b => `
        <div class="inventory-item">
          <span class="inventory-item-icon">${b.icon}</span>
          <div class="inventory-item-info">
            <span class="inventory-item-name">${isJapanified() ? b.name : b.nameEn}</span>
            <span class="inventory-item-name-ja">${b.name}</span>
          </div>
          <span class="inventory-item-value">${b.value}</span>
        </div>
      `).join('')
    : '';

  const partySkillsHtml = partySkills.length > 0
    ? `<div class="inventory-section-label" style="font-size:11px;color:var(--text-secondary);margin:12px 0 4px;padding:0 4px">Party Skills</div>` +
      partySkills.map(s => {
        const skillId = typeof s === 'string' ? s : (s?.id || s?.skillId);
        const meta = skillMasterState.catalogById?.[skillId] || PARTY_SKILL_CATALOG_FALLBACK?.[skillId];
        const name = meta?.name || skillId;
        const desc = meta?.desc || '';
        return `
          <div class="inventory-item">
            <span class="inventory-item-icon">✨</span>
            <div class="inventory-item-info">
              <span class="inventory-item-name">${name}</span>
              ${desc ? `<span class="inventory-item-name-ja" style="opacity:0.7">${desc}</span>` : ''}
            </div>
          </div>
        `;
      }).join('')
    : '';

  const emptyHtml = !hasAnything
    ? '<div class="inventory-empty">アイテムなし<br><small>No active buffs</small></div>'
    : '';

  const overlay = document.createElement('div');
  overlay.id = 'inventory-overlay';
  overlay.className = 'inventory-overlay';
  overlay.innerHTML = `
    <div class="inventory-backdrop"></div>
    <div class="inventory-panel">
      <div class="inventory-header">
        <span class="inventory-title">インベントリ</span>
        <button class="inventory-close" id="inventory-close-btn">&times;</button>
      </div>
      <div class="inventory-list">${buffsHtml}${tempHtml}${partySkillsHtml}${emptyHtml}</div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Close handlers
  overlay.querySelector('.inventory-backdrop').addEventListener('click', closeInventory);
  document.getElementById('inventory-close-btn').addEventListener('click', closeInventory);
  playSFX('button-tap');
}

/** Close the inventory overlay */
function closeInventory() {
  const overlay = document.getElementById('inventory-overlay');
  if (overlay) {
    overlay.classList.add('closing');
    setTimeout(() => overlay.remove(), 200);
  }
}

/** Hub phase — show Speed Review + Upgrades + Infiltrate buttons */
export function renderHub() {
  const gameState = getGameState();
  const tokens = gameState.meta?.progressionTokens || 0;

  actions.setContent(`
    <div style="display:flex;flex-direction:column;align-items:stretch;gap:12px;align-self:stretch;width:100%;max-width:340px;box-sizing:border-box;">
      <button class="action-btn action-btn-secondary" id="speed-review-btn">\uD83D\uDCDA 速習</button>
      <button class="action-btn action-btn-secondary" id="upgrades-btn">\u2B06\uFE0F 強化${tokens > 0 ? ` (${tokens})` : ''}</button>
      <button class="action-btn action-btn-primary" id="context-action-btn">\u26A1 潜入</button>
    </div>
  `);

  document.getElementById('speed-review-btn')?.addEventListener('click', async () => {
    playSFX('button-tap');
    // Fetch due words and start speed review
    const result = await apiGetDueWords();
    if (result?.words?.length > 0) {
      speedReview.start(result.words);
    } else {
      sceneModule.showNarration('復習する言葉がありません', { autoDismiss: 2000 });
    }
  });

  document.getElementById('upgrades-btn')?.addEventListener('click', () => {
    playSFX('button-tap');
    metaShop.show();
  });

  document.getElementById('context-action-btn')?.addEventListener('click', () => {
    playSFX('button-tap');
    startNewRun();
  });
}

/** Area selection — show area cards, proceed button */
export async function renderAreaSelection() {
  const gameState = getGameState();

  // Skip if starting creature shop is active - creature selection will render instead
  if (gameState.run?.startingCreatureShop?.active) {
    return;
  }

  const areas = await apiGetAreaOptions();

  if (!areas || !areas.length) {
    actions.setContent('<p style="text-align:center">No areas available</p>');
    return;
  }

  let selectedAreaId = null;

  const areaHtml = areas.map(a => `
    <div class="ward-option" data-area-id="${a.id}">
      <strong>${a.nameEn || a.name}</strong>
      <small>${a.theme || ''}</small>
    </div>
  `).join('');

  const areasCompleted = gameState.run?.areasCompleted || 0;
  const areasToWin = gameState.run?.areasToWin || 10;

  actions.setContent(`
    <p style="text-align:center;color:var(--text-secondary);margin-bottom:0.5rem">
      Area ${areasCompleted + 1} / ${areasToWin}
    </p>
    <div class="ward-selection-list">${areaHtml}</div>
    <button class="action-btn action-btn-primary" id="area-proceed-btn" disabled>進む</button>
  `);

  document.querySelectorAll('.ward-option').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.ward-option').forEach(o => o.classList.remove('selected'));
      el.classList.add('selected');
      selectedAreaId = el.dataset.areaId;
      const btn = document.getElementById('area-proceed-btn');
      if (btn) btn.disabled = false;
    });
  });

  document.getElementById('area-proceed-btn')?.addEventListener('click', async () => {
    if (!selectedAreaId) return;
    const result = await apiSelectArea(selectedAreaId);
    if (result?.state) {
      updateGameState(result.state);
      updateUI();
    }
  });
}

/** Exploring phase — show Proceed or Fight button */
export function renderExploring() {
  const gameState = getGameState();
  const room = gameState.run?.currentRoom;

  if (room?.encounter || gameState.phase === 'room_encounter') {
    actions.setContent(`
      <button class="action-btn action-btn-tertiary" id="inventory-btn">\uD83D\uDCE6 インベントリ</button>
      <button class="action-btn action-btn-secondary" id="equip-bots-btn">\uD83D\uDC3E モンスター装備</button>
      <button class="action-btn action-btn-primary" id="fight-btn">\u2694\uFE0F 戦う</button>
    `);
    document.getElementById('inventory-btn')?.addEventListener('click', showInventory);
    document.getElementById('equip-bots-btn')?.addEventListener('click', () => {
      actions.triggerEquipBots();
    });
    document.getElementById('fight-btn')?.addEventListener('click', () => {
      startEncounter();
    });
    return;
  }

  actions.setContent(`
    <button class="action-btn action-btn-tertiary" id="inventory-btn">\uD83D\uDCE6 インベントリ</button>
    <button class="action-btn action-btn-secondary" id="equip-bots-btn">\uD83D\uDC3E モンスター装備</button>
    <button class="action-btn action-btn-primary" id="proceed-btn">\u27A1\uFE0F 進む</button>
  `);
  document.getElementById('inventory-btn')?.addEventListener('click', showInventory);
  document.getElementById('equip-bots-btn')?.addEventListener('click', () => {
    actions.triggerEquipBots();
  });
  document.getElementById('proceed-btn')?.addEventListener('click', async () => {
    const result = await apiProceed();
    if (result?.state) {
      updateGameState(result.state);
      updateUI();
    }
  });
}

/** Area complete — proceed to area selection */
export function renderAreaComplete() {
  const gameState = getGameState();
  const areasCompleted = gameState.run?.areasCompleted || 0;
  const areasToWin = gameState.run?.areasToWin || 10;

  actions.setContent(`
    <p style="text-align:center;color:var(--accent-primary);margin-bottom:0.5rem">
      Area ${areasCompleted} / ${areasToWin} cleared!
    </p>
    <button class="action-btn action-btn-primary" id="next-area-btn">次のエリアへ</button>
  `);

  document.getElementById('next-area-btn')?.addEventListener('click', () => {
    updateUI();
  });
}

/** Run complete (game victory) — show Return to Hub */
export function renderRunComplete() {
  actions.setContent(`
    <p style="text-align:center;color:var(--accent-primary);margin-bottom:0.5rem">
      ゲームクリア！おめでとう！
    </p>
    <button class="action-btn action-btn-primary" id="victory-hub-btn">ハブに戻る</button>
  `);
  document.getElementById('victory-hub-btn')?.addEventListener('click', () => {
    apiReturnToHub();
  });
}

/** Run ended — show Return to Hub */
export function renderRunEnded() {
  actions.setContent(`
    <button class="action-btn action-btn-primary" id="return-hub-btn">ハブに戻る</button>
  `);
  document.getElementById('return-hub-btn')?.addEventListener('click', () => {
    returnToHub();
  });
}

/** Shrine phase - show creature roster for level-up */
export function renderShrine() {
  const gameState = getGameState();
  const creatureParty = gameState.run?.creatureParty;

  if (!creatureParty) {
    actions.setContent(`
      <p style="text-align:center;color:var(--text-secondary)">No creatures in party</p>
      <button class="action-btn action-btn-primary" id="shrine-skip-btn">続ける</button>
    `);
    document.getElementById('shrine-skip-btn')?.addEventListener('click', async () => {
      const result = await apiProceed();
      if (result?.state) { updateGameState(result.state); updateUI(); }
    });
    return;
  }

  const allCreatures = [
    ...(creatureParty.active || []),
    ...(creatureParty.reserves || [])
  ].filter(Boolean);

  const atkMult = Number(gameState.run?.itemBuffs?.attackMult) || 1;
  const shrineDisplayAtk = (base) => {
    const n = Math.max(1, Math.floor(Number(base) || 0));
    const raw = n * atkMult;
    if (atkMult <= 1) return Math.max(1, Math.floor(raw));
    let o = Math.floor(raw);
    if (o === n && raw > n + 1e-9) o = n + 1;
    return Math.max(1, o);
  };

  const creatureCards = allCreatures.map(creature => {
    const hpPercent = Math.floor((creature.hp / creature.maxHp) * 100);
    return `
      <div class="shrine-creature-option" data-creature-id="${creature.id}">
        <div class="shrine-creature-icon" style="border-color: var(--rarity-${creature.rarity || 'common'})">
          <img class="shrine-creature-img" data-creature-id="${creature.id}" alt="">
        </div>
        <div class="shrine-creature-info">
          <div class="shrine-creature-name">${creature.nameEn} Lv.${creature.level} <span class="shrine-creature-upgrade">\u2192 Lv.${creature.level + 1}</span></div>
          <div class="shrine-creature-rarity ${creature.rarity || 'common'}">${creature.rarity} \u00B7 ${creature.element}</div>
          <div class="shrine-creature-desc">HP: ${creature.hp}/${creature.maxHp} (${hpPercent}%) \u00B7 ATK: ${shrineDisplayAtk(creature.attack)}</div>
        </div>
      </div>
    `;
  }).join('');

  actions.setContent(`
    <h3 class="shrine-title">${t('chooseToTrain')}</h3>
    <div class="shrine-creature-list">${creatureCards}</div>
  `);

  // MVP: replace placeholder imgs with text sprites
  document.querySelectorAll('.shrine-creature-img').forEach(img => {
    const cid = img.dataset.creatureId;
    const creature = allCreatures.find(c => c.id === cid);
    replaceWithTextSprite(img, creature?.baseWord || creature?.name || cid, creature?.element);
  });

  if (shrineInProgress) return;
  const list = document.querySelector('.shrine-creature-list');
  if (list) {
    list.addEventListener('click', async (e) => {
      const option = e.target.closest('.shrine-creature-option');
      if (!option || shrineInProgress) return;
      shrineInProgress = true;

      document.querySelectorAll('.shrine-creature-option').forEach(o => {
        o.style.opacity = '0.5';
        o.style.pointerEvents = 'none';
      });

      const creatureId = option.dataset.creatureId;
      const result = await apiShrineUpgrade(creatureId);
      if (result?.state) { updateGameState(result.state); }
      sceneModule.showNarration(t('leveledUp', result?.creatureName || 'Creature', result?.newLevel || '?'), { autoDismiss: 2000 });
      shrineInProgress = false;
      updateUI(); // phase becomes 'room' → auto-proceed advances
    });
  }
}

/** Quiz phase - stubbed out (quiz rooms removed from bootstrap MVP) */
export async function renderQuiz() {
  // Quiz rooms are not in the room pool for the bootstrap language MVP.
  // If somehow reached, auto-proceed.
  const result = await apiProceed();
  if (result?.state) {
    updateGameState(result.state);
    updateUI();
  }
}

/** Word Discovery phase - show flash cards for new words */
export async function renderWordDiscovery() {
  const gameState = getGameState();
  const room = gameState.room;

  // Clear stale content immediately before any async operations
  actions.setContent('');

  if (!room) return;

  // Reset module-level discovery state when entering a new room
  const roomId = room.id || room.type || 'unknown';
  if (discoveryState.roomId !== roomId) {
    discoveryState = {
      fetched: false,
      words: [],
      wordsLearned: 0,
      roomId: roomId,
      statusChecked: false,
      atLimit: false,
      todayCount: 0,
      dailyLimit: 10
    };
  }

  // Stage tracking from server state
  const discovery = room.wordDiscovery || {
    wordsToLearn: 2,
    wordsLearned: 0,
    wordIds: [],
    completed: false
  };

  // If completed on server, show proceed
  if (discovery.completed) {
    actions.setContent(`
      <button class="action-btn action-btn-primary" id="proceed-btn">続ける</button>
    `);
    document.getElementById('proceed-btn')?.addEventListener('click', async () => {
      const result = await apiProceed();
      if (result?.state) {
        updateGameState(result.state);
        updateUI();
      }
    });
    return;
  }

  // Check discovery status first (only once per room)
  if (!discoveryState.statusChecked) {
    discoveryState.statusChecked = true;
    const status = await apiGetDiscoveryStatus();
    discoveryState.todayCount = status.todayCount;
    discoveryState.dailyLimit = status.dailyLimit;
    discoveryState.atLimit = status.atLimit;

    // If at limit, skip room silently
    if (status.atLimit) {
      const completeResult = await apiCompleteDiscovery();
      if (completeResult?.state) {
        updateGameState(completeResult.state);
      }
      updateUI(); // phase becomes 'room' → auto-proceed advances
      return;
    }
  }

  // If we hit the limit mid-room, stop
  if (discoveryState.atLimit) {
    const completeResult = await apiCompleteDiscovery();
    if (completeResult?.state) {
      updateGameState(completeResult.state);
    }
    updateUI(); // phase becomes 'room' → auto-proceed advances
    return;
  }

  // Fetch words if not already fetched (use module-level state, not room object)
  if (!discoveryState.fetched) {
    discoveryState.fetched = true;

    const result = await apiGetDiscoveryWords(discovery.wordsToLearn);

    if (!result.available || result.words.length === 0) {
      // No new words available - mark complete on server first
      const completeResult = await apiCompleteDiscovery();
      if (completeResult?.state) {
        updateGameState(completeResult.state);
      }
      updateUI(); // phase becomes 'room' → auto-proceed advances
      return;
    }

    // Store words in module-level state (survives gameState updates)
    discoveryState.words = result.words;
  }

  const words = discoveryState.words;
  const currentIndex = discoveryState.wordsLearned;

  if (currentIndex >= words.length) {
    // All words learned - mark complete on server first
    const completeResult = await apiCompleteDiscovery();
    if (completeResult?.state) {
      updateGameState(completeResult.state);
    }

    // Fire and forget: refresh cache for learned words
    const learnedWords = words.map(w => w.word);
    apiPostCombatRefresh?.(learnedWords).catch(() => {});

    updateUI(); // phase becomes 'room' → auto-proceed advances
    return;
  }

  // Show current word's flash card
  const currentWord = words[currentIndex];

  actions.showFlashCards([currentWord], { discoveryMode: true });

  // Set up swipe handler - we need to use the actions module's init callback mechanism
  // The actions module was initialized with cardSwipe callback, but we need discovery-specific behavior
  // Store original and override temporarily
  const handleDiscoverySwipe = async (direction) => {
    console.log(`[Discovery] Swiped ${direction} on "${currentWord.word}" (vid=${currentWord.vid}, sid=${currentWord.sid})`);
    try {
      // Pass isDiscovery: true to track the discovery
      const reviewResult = await apiSwipeWord(currentWord.vid, currentWord.sid, 1, true);
      console.log(`[Discovery] Review sent: vid=${currentWord.vid}, grade=1 (learning)`);

      // Check if we hit the limit
      if (reviewResult.atLimit) {
        discoveryState.atLimit = true;
        discoveryState.todayCount = reviewResult.todayCount;
      }
    } catch (e) {
      console.warn('[Discovery] Failed to submit review:', e);
    }

    discoveryState.wordsLearned++;
    console.log(`[Discovery] Progress: ${discoveryState.wordsLearned}/${discoveryState.words.length} words learned`);

    renderWordDiscovery();
  };

  // The actions module has a test-swipe event listener, but we need to hook into the actual swipe
  // We'll use a custom event approach - dispatch from here when flash card completes
  document.addEventListener('discovery-card-swiped', async function handler(e) {
    document.removeEventListener('discovery-card-swiped', handler);
    await handleDiscoverySwipe(e.detail);
  }, { once: true });

  // Monkey-patch the test-swipe for discovery mode
  const testSwipeHandler = async (e) => {
    document.dispatchEvent(new CustomEvent('discovery-card-swiped', { detail: e.detail }));
  };
  document.addEventListener('test-swipe', testSwipeHandler, { once: true });
}

function getActiveSpeedReviewRoom(gameState) {
  if (gameState.room?.type === 'speedReviewRoom') {
    return gameState.room;
  }

  const roomIndex = gameState.run?.currentRoom;
  const fromRun = Number.isInteger(roomIndex) ? gameState.run?.rooms?.[roomIndex] : null;
  if (fromRun?.type === 'speedReviewRoom') {
    return fromRun;
  }

  return null;
}

export async function renderSpeedReviewRoom() {
  const gameState = getGameState();
  const room = getActiveSpeedReviewRoom(gameState);
  if (!room?.id) {
    return;
  }

  if (speedReview.isActive() && speedReviewRoomLaunchState.roomId === room.id) {
    return;
  }

  if (speedReviewRoomLaunchState.starting) {
    return;
  }

  speedReviewRoomLaunchState.starting = true;
  speedReviewRoomLaunchState.roomId = room.id;
  speedReviewRoomCommitChain = Promise.resolve();
  actions.setContent('');

  try {
    const startResult = await apiStartSpeedReviewRoom(room.id);
    const hasValidSnapshot = Array.isArray(startResult?.snapshotWords);
    const startSucceeded = !!startResult && !startResult.error && hasValidSnapshot;
    if (startResult?.state) {
      updateGameState(startResult.state);
    }

    if (!startSucceeded) {
      console.warn('[SpeedReviewRoom] Start failed or returned invalid payload; skipping auto-complete');
      speedReviewRoomLaunchState.roomId = null;
      return;
    }

    const snapshotWords = startResult.snapshotWords;
    if (snapshotWords.length === 0) {
      const completeResult = await apiCompleteSpeedReviewRoom(room.id);
      if (completeResult?.state) {
        updateGameState(completeResult.state);
      }
      speedReviewRoomLaunchState.roomId = null;
      updateUI();
      return;
    }

    speedReview.start(snapshotWords, {
      mode: 'room',
      maxCards: 10,
      canCloseEarly: false,
      onCommittedReview: async ({ word, commitIndex }) => {
        speedReviewRoomCommitChain = speedReviewRoomCommitChain.then(async () => {
          let lastError = null;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const progressResult = await apiProgressSpeedReviewRoom(room.id, word.vid, word.sid, commitIndex);
              if (!progressResult || progressResult.error) {
                throw new Error(progressResult?.error || 'No response from speed review room progress API');
              }
              if (progressResult?.state) {
                updateGameState(progressResult.state);
              }
              return progressResult;
            } catch (error) {
              lastError = error;
              if (attempt < 3) {
                await new Promise(resolve => setTimeout(resolve, 250 * attempt));
              }
            }
          }
          throw lastError || new Error('Failed to commit speed review room progress');
        });
        try {
          return await speedReviewRoomCommitChain;
        } catch (error) {
          console.error('[SpeedReviewRoom] Commit failed after retries:', error);
          throw error;
        }
      },
      onComplete: async () => {
        const completeResult = await apiCompleteSpeedReviewRoom(room.id);
        if (completeResult?.state) {
          updateGameState(completeResult.state);
        }
        speedReviewRoomLaunchState.roomId = null;
        updateUI();
      }
    });
  } finally {
    speedReviewRoomLaunchState.starting = false;
  }
}

// ============ WHACK-A-MOLE MINI GAME ============

/** Whack-a-Mole mini game — match Japanese words to creature/item sprites */
export async function renderWhackAMole() {
  const gameState = getGameState();
  const room = gameState.run.rooms[gameState.run.currentRoom];

  // Already completed — just show proceed
  if (room?.interacted) {
    actions.setContent(`
      <div class="wam-results">
        <div class="wam-results-title">ゲーム完了!</div>
        <div class="wam-results-score">Score: ${room.whackAMole?.score || 0}</div>
      </div>
    `);
    return;
  }

  // Fetch pool from server
  let pool;
  try {
    const resp = await apiGetWhackAMolePool();
    pool = resp.pool;
  } catch (err) {
    actions.setContent('<div class="wam-error">Failed to load game data</div>');
    return;
  }

  if (!pool || pool.length < 9) {
    actions.setContent('<div class="wam-error">Not enough creatures/items for game</div>');
    return;
  }

  // Show start screen
  actions.setContent(`
    <div class="wam-container">
      <div class="wam-start">
        <div class="wam-start-title">ワードマッチ!</div>
        <div class="wam-start-desc">Match the word to the correct creature or item</div>
        <button class="action-btn action-btn-primary wam-start-btn">プレイ</button>
      </div>
    </div>
  `);

  document.querySelector('.wam-start-btn')?.addEventListener('click', () => {
    startWhackAMoleGame(pool);
  });
}

/** Skill Master room — placeholder UI (to be expanded in later task) */
export async function renderSkillMaster() {
  const gameState = getGameState();
  const room = gameState.room || getActiveRoomFromRun(gameState.run);
  const roomId = room?.id || room?.type || 'unknown';

  // Reset per-room cache
  if (skillMasterState.roomId !== roomId) {
    skillMasterState.roomId = roomId;
    skillMasterState.fetched = false;
    skillMasterState.offered = null;
    skillMasterState.chosenId = null;
  }

  // If room is already completed on server, don't render choices
  if (room?.interacted || room?.skillMaster?.completed) {
    actions.setContent(`
      <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:360px;">
        <div style="text-align:center;font-weight:800;letter-spacing:0.02em;">Skill Master</div>
        <div style="text-align:center;color:var(--text-secondary);font-size:13px;">
          Skill acquired.
        </div>
      </div>
    `);
    return;
  }

  // Render loading state immediately to avoid flashing old buttons
  actions.setContent(`
    <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:380px;">
      <div style="text-align:center;font-weight:800;letter-spacing:0.02em;">Skill Master</div>
      <div style="text-align:center;color:var(--text-secondary);font-size:13px;">
        Choose one skill.
      </div>
      <div style="text-align:center;color:var(--text-muted);font-size:12px;">Loading offers…</div>
    </div>
  `);

  // Fetch offers once per room
  if (!skillMasterState.fetched) {
    skillMasterState.fetched = true;
    const fetchRoomId = roomId;
    let resp;
    try {
      resp = await apiSkillMasterOffers?.();
    } catch (err) {
      // Allow retry on next render and avoid caching a bad state
      skillMasterState.fetched = false;
      skillMasterState.offered = null;
      actions.setContent(`
        <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:380px;">
          <div style="text-align:center;font-weight:800;letter-spacing:0.02em;">Skill Master</div>
          <div style="text-align:center;color:var(--text-secondary);font-size:13px;">
            Failed to load offers.
          </div>
          <button class="action-btn action-btn-primary" id="skillmaster-retry-btn">Retry</button>
        </div>
      `);
      document.getElementById('skillmaster-retry-btn')?.addEventListener('click', () => {
        skillMasterState.fetched = false;
        skillMasterState.offered = null;
        renderSkillMaster();
      });
      return;
    }

    // Stale async guard: room changed while awaiting offers
    if (skillMasterState.roomId !== fetchRoomId) return;

    const offered = resp?.offered || resp?.offers || resp?.skills || room?.skillMaster?.offered;
    if (!Array.isArray(offered) || offered.length === 0) {
      skillMasterState.fetched = false;
      skillMasterState.offered = null;
      actions.setContent(`
        <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:380px;">
          <div style="text-align:center;font-weight:800;letter-spacing:0.02em;">Skill Master</div>
          <div style="text-align:center;color:var(--text-secondary);font-size:13px;">
            Failed to load offers.
          </div>
          <button class="action-btn action-btn-primary" id="skillmaster-retry-btn">Retry</button>
        </div>
      `);
      document.getElementById('skillmaster-retry-btn')?.addEventListener('click', () => {
        skillMasterState.fetched = false;
        skillMasterState.offered = null;
        renderSkillMaster();
      });
      return;
    }

    skillMasterState.offered = offered;
    for (const s of offered) {
      if (!s?.id) continue;
      skillMasterState.catalogById[s.id] = {
        name: s.name || PARTY_SKILL_CATALOG_FALLBACK?.[s.id]?.name || s.id,
        desc: s.desc || PARTY_SKILL_CATALOG_FALLBACK?.[s.id]?.desc || ''
      };
    }
  }

  const offers = skillMasterState.offered || room?.skillMaster?.offered || [];
  const cardsHtml = offers.slice(0, 3).map(s => `
    <button class="ward-option" data-skill-id="${s.id}" style="text-align:left">
      <div style="font-weight:800">${s.name || skillMasterState.catalogById?.[s.id]?.name || s.id}</div>
      <div style="margin-top:4px;color:var(--text-secondary);font-size:12px;line-height:1.3">
        ${s.desc || skillMasterState.catalogById?.[s.id]?.desc || ''}
      </div>
    </button>
  `).join('');

  actions.setContent(`
    <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:420px;">
      <div style="text-align:center;font-weight:800;letter-spacing:0.02em;">Skill Master</div>
      <div style="text-align:center;color:var(--text-secondary);font-size:13px;">
        Choose one skill.
      </div>
      <div class="ward-selection-list" style="gap:10px">${cardsHtml}</div>
    </div>
  `);

  let choosing = false;
  document.querySelectorAll('.ward-option[data-skill-id]').forEach(el => {
    el.addEventListener('click', async () => {
      if (choosing) return;
      choosing = true;
      const skillId = el.dataset.skillId;
      playSFX('button-tap');
      const buttons = Array.from(document.querySelectorAll('.ward-option[data-skill-id]'));
      buttons.forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.6';
      });

      let result;
      try {
        result = await apiSkillMasterChoose?.(skillId);
      } catch (err) {
        choosing = false;
        buttons.forEach(btn => {
          btn.disabled = false;
          btn.style.opacity = '';
        });
        sceneModule?.showNarration?.('Failed to choose skill.', { autoDismiss: 1800 });
        return;
      }

      if (result?.state) {
        updateGameState(result.state);
        updateUI();
        choosing = false;
        return;
      }

      choosing = false;
      buttons.forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = '';
      });
      sceneModule?.showNarration?.('Could not apply skill choice. Try again.', { autoDismiss: 2200 });
    });
  });
}

// ============ FRIENDLY NPC ROOM ============

/** Module-level state to avoid refetch across re-renders */
let friendlyNpcState = {
  roomId: null,
  fetched: false,
  offered: null,
  choosing: false
};

const FRIENDLY_NPC_TYPE_ICONS = {
  heal: '💚',
  boost: '⬆️',
  mpRestore: '🔵',
  revive: '💫',
  keepsake: '🔒'
};

/**
 * Friendly NPC room — shows 3 item cards (food=heal or weapon=boost).
 * Player picks one; item is applied immediately.
 */
export async function renderFriendlyNpc() {
  const gameState = getGameState();
  const room = gameState.room || getActiveRoomFromRun(gameState.run);
  const roomId = room?.id || room?.type || 'unknown';

  // Reset per-room state when entering a new room
  if (friendlyNpcState.roomId !== roomId) {
    friendlyNpcState = {
      roomId,
      fetched: false,
      offered: null,
      choosing: false
    };
  }

  // If room already completed (e.g., after reload), show proceed
  if (room?.interacted || room?.friendlyNpc?.completed) {
    actions.setContent(`
      <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:360px;">
        <div style="text-align:center;font-weight:800;">アイテムをもらった！</div>
        <div style="text-align:center;color:var(--text-secondary);font-size:13px;">Item received.</div>
      </div>
    `);
    return;
  }

  // Show loading state immediately
  actions.setContent(`
    <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:380px;">
      <div style="text-align:center;font-weight:800;">フレンドリーNPC</div>
      <div style="text-align:center;color:var(--text-secondary);font-size:13px;">Choose a gift.</div>
      <div style="text-align:center;color:var(--text-muted);font-size:12px;">Loading offers…</div>
    </div>
  `);

  // Fetch offers once per room
  if (!friendlyNpcState.fetched) {
    friendlyNpcState.fetched = true;
    const fetchRoomId = roomId;
    let resp;
    try {
      resp = await apiGetFriendlyNpcOffers?.();
    } catch (err) {
      friendlyNpcState.fetched = false;
      friendlyNpcState.offered = null;
      actions.setContent(`
        <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:380px;">
          <div style="text-align:center;font-weight:800;">フレンドリーNPC</div>
          <div style="text-align:center;color:var(--text-secondary);font-size:13px;">Failed to load offers.</div>
          <button class="action-btn action-btn-primary" id="friendly-npc-retry-btn">Retry</button>
        </div>
      `);
      document.getElementById('friendly-npc-retry-btn')?.addEventListener('click', () => {
        friendlyNpcState.fetched = false;
        friendlyNpcState.offered = null;
        renderFriendlyNpc();
      });
      return;
    }

    // Stale async guard: room changed while awaiting
    if (friendlyNpcState.roomId !== fetchRoomId) return;

    const offered = resp?.offered || room?.friendlyNpc?.offered;
    if (!Array.isArray(offered) || offered.length === 0) {
      friendlyNpcState.fetched = false;
      friendlyNpcState.offered = null;
      actions.setContent(`
        <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:380px;">
          <div style="text-align:center;font-weight:800;">フレンドリーNPC</div>
          <div style="text-align:center;color:var(--text-secondary);font-size:13px;">No items available.</div>
          <button class="action-btn action-btn-primary" id="friendly-npc-retry-btn">Retry</button>
        </div>
      `);
      document.getElementById('friendly-npc-retry-btn')?.addEventListener('click', () => {
        friendlyNpcState.fetched = false;
        friendlyNpcState.offered = null;
        renderFriendlyNpc();
      });
      return;
    }

    friendlyNpcState.offered = offered;
    if (resp?.state) {
      updateGameState(resp.state);
    }
  }

  const offers = friendlyNpcState.offered || [];

  const cardsHtml = offers.map((item, i) => {
    const icon = FRIENDLY_NPC_TYPE_ICONS[item.type] || '📦';
    const pills = buildItemEffectPills(item);
    return `
      <div class="shop-item-card" data-item-id="${item.id}" data-index="${i}" style="position:relative;">
        <div class="text-sprite shop-item-sprite">${item.word || '？'}</div>
        <div class="shop-item-info">
          <div class="shop-item-word">${icon} ${item.word} <span style="color:var(--text-secondary);font-size:12px">(${item.reading})</span></div>
          <div class="shop-item-word" style="font-size:12px;opacity:0.8">${item.nameEn}</div>
          <div class="shop-item-effect">${pills}</div>
        </div>
      </div>
    `;
  }).join('');

  actions.setContent(`
    <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:420px;">
      <div style="text-align:center;font-weight:800;letter-spacing:0.02em;">フレンドリーNPC</div>
      <div style="text-align:center;color:var(--text-secondary);font-size:13px;">
        Choose a gift. (${room?.friendlyNpc?.offerCategory === 'food' ? '🍱 Food' : '🛡️ Equipment'})
      </div>
      <div class="shop-items" style="gap:10px">${cardsHtml}</div>
    </div>
  `);

  const cards = document.querySelectorAll('.shop-item-card[data-item-id]');
  cards.forEach(card => {
    card.addEventListener('click', async () => {
      if (friendlyNpcState.choosing) return;
      friendlyNpcState.choosing = true;
      const itemId = card.dataset.itemId;

      playSFX('creature-equip');

      // Visually mark selected and disable others
      cards.forEach(c => {
        c.style.pointerEvents = 'none';
        c.style.opacity = '0.5';
      });
      card.classList.add('selected');
      card.style.opacity = '1';

      // Show creature targeting UI
      const gameState = getGameState();
      const party = gameState.run?.creatureParty?.active || [];
      const creatureCards = party.map((creature, idx) => {
        if (!creature) return '';
        const hpPct = Math.round((creature.hp / creature.maxHp) * 100);
        return `
          <div class="shop-item-card creature-target-card" data-creature-index="${idx}"
               style="cursor:pointer;text-align:center;padding:12px;">
            <div style="font-weight:800;font-size:16px;">${creature.name}</div>
            <div style="font-size:12px;color:var(--text-secondary);">${creature.nameEn} Lv.${creature.level}</div>
            <div style="font-size:11px;margin-top:4px;">HP: ${creature.hp}/${creature.maxHp} (${hpPct}%)</div>
          </div>
        `;
      }).join('');

      actions.setContent(`
        <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:420px;">
          <div style="text-align:center;font-weight:800;">どのクリーチャーに？</div>
          <div style="text-align:center;color:var(--text-secondary);font-size:13px;">Choose a creature.</div>
          <div class="shop-items" style="gap:10px">${creatureCards}</div>
        </div>
      `);

      let creatureChoiceSent = false;
      document.querySelectorAll('.creature-target-card').forEach(tCard => {
        tCard.addEventListener('click', async () => {
          if (creatureChoiceSent) return;
          creatureChoiceSent = true;
          const targetIdx = parseInt(tCard.dataset.creatureIndex, 10);
          tCard.classList.add('selected');
          document.querySelectorAll('.creature-target-card').forEach(c => {
            c.style.pointerEvents = 'none';
          });

          let result;
          try {
            result = await apiChooseFriendlyNpcItem?.(itemId, targetIdx);
          } catch (err) {
            friendlyNpcState.choosing = false;
            sceneModule?.showNarration?.('Failed to choose item.', { autoDismiss: 1800 });
            renderFriendlyNpc();
            return;
          }

          if (result?.state) {
            updateGameState(result.state);
            friendlyNpcState.choosing = false;
            updateUI();
            return;
          }

          // API returned null (e.g. loading gate) or success body missing state — recover UI
          friendlyNpcState.choosing = false;
          sceneModule?.showNarration?.('Could not apply item. Tap to try again.', { autoDismiss: 2200 });
          renderFriendlyNpc();
        });
      });
    });
  });
}

function startWhackAMoleGame(pool) {
  new WhackAMoleGame(pool, {
    actions,
    apiCompleteWhackAMole,
    updateGameState,
    updateUI,
    playSFX
  }).start();
}

// ============ NPC BATTLE SKILL REWARD ============

/** Module-level state for npc battle skill selection to avoid refetch loops */
let npcBattleSkillState = {
  roomId: null,
  fetched: false,
  offered: null,
  choosing: false
};

/**
 * NPC Battle skill reward — shown after NPC dialogue completes.
 * Player picks 1 of 3 party skills as a reward for winning the NPC battle.
 * @param {object} opts - { onSkillChosen(skillId), fetchOffers() }
 */
export async function renderNpcBattleSkillSelection({ onSkillChosen, fetchOffers } = {}) {
  const gameState = getGameState();
  const room = gameState.room || getActiveRoomFromRun(gameState.run);
  const roomId = room?.id || room?.type || 'unknown-npcbattle';

  // Reset per-room cache when room changes
  if (npcBattleSkillState.roomId !== roomId) {
    npcBattleSkillState = {
      roomId,
      fetched: false,
      offered: null,
      choosing: false
    };
  }

  // If already completed (e.g. reload after choosing), just show confirmation
  if (!room?.npcBattle?.skillSelectionPending && room?.interacted) {
    actions.setContent(`
      <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:360px;">
        <div style="text-align:center;font-weight:800;letter-spacing:0.02em;">NPC Battle</div>
        <div style="text-align:center;color:var(--text-secondary);font-size:13px;">
          Skill acquired.
        </div>
      </div>
    `);
    return;
  }

  // Show loading state immediately
  actions.setContent(`
    <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:380px;">
      <div style="text-align:center;font-weight:800;letter-spacing:0.02em;">NPC Battle Reward</div>
      <div style="text-align:center;color:var(--text-secondary);font-size:13px;">
        Choose one skill.
      </div>
      <div style="text-align:center;color:var(--text-muted);font-size:12px;">Loading offers…</div>
    </div>
  `);

  // Fetch offers once per room
  if (!npcBattleSkillState.fetched) {
    npcBattleSkillState.fetched = true;
    const fetchRoomId = roomId;
    let resp;
    try {
      resp = await fetchOffers?.();
    } catch (err) {
      npcBattleSkillState.fetched = false;
      npcBattleSkillState.offered = null;
      actions.setContent(`
        <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:380px;">
          <div style="text-align:center;font-weight:800;letter-spacing:0.02em;">NPC Battle Reward</div>
          <div style="text-align:center;color:var(--text-secondary);font-size:13px;">
            Failed to load offers.
          </div>
          <button class="action-btn action-btn-primary" id="npcbattle-skill-retry-btn">Retry</button>
        </div>
      `);
      document.getElementById('npcbattle-skill-retry-btn')?.addEventListener('click', () => {
        npcBattleSkillState.fetched = false;
        npcBattleSkillState.offered = null;
        renderNpcBattleSkillSelection({ onSkillChosen, fetchOffers });
      });
      return;
    }

    // Stale async guard: room changed while awaiting
    if (npcBattleSkillState.roomId !== fetchRoomId) return;

    const offered = resp?.offered || resp?.offers || resp?.skills || room?.npcBattle?.offered;
    if (!Array.isArray(offered) || offered.length === 0) {
      npcBattleSkillState.fetched = false;
      npcBattleSkillState.offered = null;
      actions.setContent(`
        <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:380px;">
          <div style="text-align:center;font-weight:800;letter-spacing:0.02em;">NPC Battle Reward</div>
          <div style="text-align:center;color:var(--text-secondary);font-size:13px;">
            No skills available.
          </div>
        </div>
      `);
      return;
    }

    npcBattleSkillState.offered = offered;
  }

  const offers = npcBattleSkillState.offered || [];
  const cardsHtml = offers.slice(0, 3).map(s => `
    <button class="ward-option" data-skill-id="${s.id}" style="text-align:left">
      <div style="font-weight:800">${s.name || s.id}</div>
      <div style="margin-top:4px;color:var(--text-secondary);font-size:12px;line-height:1.3">
        ${s.desc || ''}
      </div>
    </button>
  `).join('');

  actions.setContent(`
    <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:420px;">
      <div style="text-align:center;font-weight:800;letter-spacing:0.02em;">NPC Battle Reward</div>
      <div style="text-align:center;color:var(--text-secondary);font-size:13px;">
        Victory! Choose one party skill.
      </div>
      <div class="ward-selection-list" style="gap:10px">${cardsHtml}</div>
    </div>
  `);

  document.querySelectorAll('.ward-option[data-skill-id]').forEach(el => {
    el.addEventListener('click', async () => {
      if (npcBattleSkillState.choosing) return;
      npcBattleSkillState.choosing = true;
      const skillId = el.dataset.skillId;
      playSFX('button-tap');

      const buttons = Array.from(document.querySelectorAll('.ward-option[data-skill-id]'));
      buttons.forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.6';
      });

      try {
        await onSkillChosen?.(skillId);
      } catch (err) {
        sceneModule?.showNarration?.('Failed to choose skill.', { autoDismiss: 1800 });
        buttons.forEach(btn => {
          btn.disabled = false;
          btn.style.opacity = '';
        });
      } finally {
        npcBattleSkillState.choosing = false;
      }
    });
  });
}
