import * as speedReview from './speed-review.js';
import { WhackAMoleGame } from './whack-a-mole.js';
import { playSFX } from '../audio.js';
import { hapticLight } from '../native/index.js';
import { creatureBgUrl, itemSpriteHtml, creatureStaticPath, SPRITE_VERSION } from './sprite-utils.js';
import { hideEnemy } from './combat-dom.js';
import { showNpcInDisplay } from './exploration-dom.js';
import { t, isJapanified } from './i18n.js';
import * as chestsUI from './chests.js';
import * as crestsEquipUI from './crests-equip.js';
import { buildItemEffectPills } from './item-effect-pills.js';
import { playRoomTransition } from './room-transition.js';
import { renderButtons, renderChoices } from './ui-components.js';
import { buff, itemGained } from './event-popup.js';
import { pop, flashElement } from './dom-effects.js';
import { savePvpTeam, getPvpTeams } from '../api.js';
import { renderJpSentence, getKnownWords } from './bootstrap-client.js';
import { getTutorialNarration, getFormationNarration } from './tutorial-copy.js';
import { getSceneManager } from '../scenes/scene-manager.js';

/**
 * Resolve any active scene that owns an `npcs` layer. Every gameplay scene
 * (HubScene, ExplorationScene, BattleScene) provides this layer, so NPC
 * sprite operations should succeed across all non-combat phases that can
 * host a dialogue.
 *
 * The earlier `getExplorationScene` helper required `instanceof ExplorationScene`
 * and silently returned null when HubScene was active (prologue, hub,
 * area_selection, skillMaster) — which is exactly the state the returning
 * player hits at session start, causing Cid's Pixi sprite to never render.
 * Broadening the contract to "any scene with an npcs layer" is the
 * structural fix. See Bug #8 in docs/pr2-bulletproof-rendering-smoke-test.md.
 */
export function getSceneWithNpcs() {
  const scene = getSceneManager()?.currentScene;
  if (!scene || scene.disposed || scene._exiting || !scene.layers?.npcs) return null;
  return scene;
}

let getGameState = null;
let updateGameState = null;
let updateUI = null;
let actions = null;
let sceneModule = null;
let startEncounter = null;
let startNewRun = null;
let returnToHub = null;
let showAdventureReport = null;

// Discovery / shrine guards now live on ExplorationScene (scene-owned state).
// Moving them off the module scope means they reset naturally when we
// transition to a new ExplorationScene on room entry — the prior issue
// where `discoveryState.roomId !== roomId` comparison was needed is now
// structural (fresh scene = fresh state). See ExplorationScene constructor.

/** Show multi-page Cid tutorial narration. Optionally slides her sprite in/out. */
async function showTutorialNarration(pages, { showSprite = false } = {}) {
  // Any scene with an npcs layer owns the Pixi slide (HubScene during
  // prologue/skillMaster/hub, ExplorationScene inside rooms, BattleScene
  // during combat interjections). See getSceneWithNpcs() above.
  const scene = showSprite ? getSceneWithNpcs() : null;
  const cidSprite = `/assets/sprites/npcs/cid.webp?v=${SPRITE_VERSION}`;
  if (showSprite) {
    showNpcInDisplay('Cid', cidSprite, { skipPixi: true });
    if (scene) {
      await scene.showNpcSprite(cidSprite, { slideIn: true });
    }
  }

  for (const page of pages) {
    await sceneModule.showNarration(page, { speaker: 'Cid' });
  }

  if (showSprite) {
    const exitScene = getSceneWithNpcs();
    if (exitScene && exitScene.npcSprite) {
      await exitScene.hideNpcSprite({ slideOut: true });
    }
    hideEnemy();
  }
}

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
let apiGetWhackAMoleDialogue = null;
let apiSkipWhackAMole = null;

// Speed review API
let apiGetDueWords = null;
let apiGetVocabDueCount = null;
let apiStartSpeedReviewRoom = null;
let apiProgressSpeedReviewRoom = null;
let apiCompleteSpeedReviewRoom = null;

let apiGetCreatureCollection = null;
let showCollectionSelect = null;
let triggerCreatureSelect = null;

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

// Track whether CID's item-shop tutorial has already been shown this session
let cidItemShopTutorialShown = false;

// Tutorial API
let apiTutorialAdvance = null;

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
  apiGetVocabDueCount = callbacks.apiGetVocabDueCount;
  apiStartSpeedReviewRoom = callbacks.apiStartSpeedReviewRoom;
  apiProgressSpeedReviewRoom = callbacks.apiProgressSpeedReviewRoom;
  apiCompleteSpeedReviewRoom = callbacks.apiCompleteSpeedReviewRoom;
  apiGetCreatureCollection = callbacks.apiGetCreatureCollection;
  showCollectionSelect = callbacks.showCollectionSelect;
  triggerCreatureSelect = callbacks.triggerCreatureSelect;
  apiGetWhackAMolePool = callbacks.apiGetWhackAMolePool;
  apiCompleteWhackAMole = callbacks.apiCompleteWhackAMole;
  apiGetWhackAMoleDialogue = callbacks.apiGetWhackAMoleDialogue;
  apiSkipWhackAMole = callbacks.apiSkipWhackAMole;
  apiSkillMasterOffers = callbacks.apiSkillMasterOffers;
  apiSkillMasterChoose = callbacks.apiSkillMasterChoose;
  apiGetFriendlyNpcOffers = callbacks.apiGetFriendlyNpcOffers;
  apiChooseFriendlyNpcItem = callbacks.apiChooseFriendlyNpcItem;
  apiTutorialAdvance = callbacks.apiTutorialAdvance;
  showAdventureReport = callbacks.showAdventureReport;
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
  catalogById: { ...PARTY_SKILL_CATALOG_FALLBACK },
  promptTokens: null,
  promptShown: false
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

/** Hub phase — show Speed Review + PvP + Explore buttons */
export async function renderHub() {
  const gameState = getGameState();

  const pvpTeams = gameState.meta?.pvpTeams || [null, null, null];
  const hasPvpTeams = pvpTeams.some(t => t !== null);

  const dueCount = apiGetVocabDueCount ? (await apiGetVocabDueCount().catch(() => ({ count: 0 }))).count : 0;

  renderButtons([
    { label: `📚 Speed Review${dueCount > 0 ? ` (${dueCount})` : ''}`, onClick: async () => {
      // Tutorial step 4→5: advance when player clicks speed review
      if (getGameState().meta?.tutorialStep === 4) {
        await apiTutorialAdvance?.(4);
      }
      const result = await apiGetDueWords();
      if (result?.words?.length > 0) {
        speedReview.start(result.words);
      } else {
        sceneModule.showNarration('No words to review', { autoDismiss: 2000 });
      }
    }},
    { label: '⚔️ Multiplayer Battle', onClick: () => {
      const gs = getGameState();
      gs.phase = 'pvp_lobby';
      updateUI();
    }, disabled: !hasPvpTeams },
    { label: '⚡ Explore', onClick: () => startNewRun(), primary: true },
  ]);

  let tutorialStep = gameState.meta?.tutorialStep;

  // Tutorial step 3: encourage after first death, then auto-advance to 4
  if (tutorialStep === 3) {
    await showTutorialNarration(getTutorialNarration(3), { showSprite: true });
    await apiTutorialAdvance?.(3);
    tutorialStep = getGameState().meta?.tutorialStep;
  }

  // Tutorial step 4: introduce speed review (condition-gated on dueCount > 0)
  if (tutorialStep === 4 && dueCount > 0) {
    await showTutorialNarration(getTutorialNarration(4, { dueCount }), { showSprite: true });
    const buttons = document.querySelectorAll('.action-btn');
    buttons.forEach(btn => {
      if (btn.textContent.includes('Speed Review')) {
        btn.classList.add('tutorial-highlight');
      } else {
        btn.classList.add('tutorial-dimmed');
      }
    });
  }

  // Tutorial step 5: guide to formation and re-enter
  if (tutorialStep === 5) {
    const creatureCount = Math.min((gameState.meta?.creatureCollection || []).length, 3);
    await showTutorialNarration(getFormationNarration(creatureCount), { showSprite: true });
    const buttons = document.querySelectorAll('.action-btn');
    buttons.forEach(btn => {
      if (btn.textContent.includes('Explore')) {
        btn.classList.add('tutorial-highlight');
      } else {
        btn.classList.add('tutorial-dimmed');
      }
    });
  }
}

/** Area selection — show area cards, proceed button */
export async function renderAreaSelection() {
  const gameState = getGameState();

  if (gameState.run?.startingCreatureShop?.active) return;

  const areas = await apiGetAreaOptions();
  if (!areas || !areas.length) {
    actions.setContent('<p style="text-align:center">No areas available</p>');
    return;
  }

  const areasCompleted = gameState.run?.areasCompleted || 0;
  const areasToWin = gameState.run?.areasToWin || 10;

  actions.setContent(`
    <p style="text-align:center;color:var(--text-secondary);margin-bottom:0.5rem">
      Area ${areasCompleted + 1} / ${areasToWin}
    </p>
  `);

  const actionArea = document.getElementById('action-area');
  const choiceContainer = document.createElement('div');
  actionArea.appendChild(choiceContainer);

  renderChoices({
    cards: areas.map(a => ({
      title: `<strong>${a.nameEn || a.name}</strong>`,
      subtitle: a.theme || '',
    })),
    onSelect: async (index) => {
      const result = await apiSelectArea(areas[index].id);
      if (result?.state) {
        updateGameState(result.state);
        // Don't call updateUI() — trigger creature selection first.
        // The area selection UI stays visible underneath the modal overlay.
        await triggerCreatureSelect();
      }
    },
    container: choiceContainer,
  });
}

/** Exploring phase — show Proceed or Fight button */
export function renderExploring() {
  const gameState = getGameState();
  const room = gameState.run?.currentRoom;

  if (room?.encounter || gameState.phase === 'room_encounter') {
    renderButtons([
      { label: '📦 インベントリ', onClick: showInventory },
      { label: '🐾 モンスター装備', onClick: () => actions.triggerEquipBots() },
      { label: '⚔️ 戦う', onClick: () => startEncounter(), primary: true },
    ]);
    return;
  }

  renderButtons([
    { label: '📦 インベントリ', onClick: showInventory },
    { label: '🐾 モンスター装備', onClick: () => actions.triggerEquipBots() },
    { label: '➡️ 進む', onClick: async () => {
      const result = await apiProceed();
      if (result?.state) {
        updateGameState(result.state);
        await playRoomTransition(result.state);
        updateUI();
      }
    }, primary: true },
  ]);
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
  `);

  const actionArea = document.getElementById('action-area');
  const btnContainer = document.createElement('div');
  actionArea.appendChild(btnContainer);
  renderButtons([
    { label: '次のエリアへ', onClick: () => updateUI(), primary: true },
  ], { container: btnContainer });
}

/** Run complete (game victory) — offer PvP save, then show adventure report */
export function renderRunComplete() {
  if (!showAdventureReport) return;
  // Offer PvP team save before forfeit destroys run data
  renderButtons([
    { label: 'Save Team for PvP', onClick: () => showPvpTeamSaveSlots() },
    { label: 'View Report', onClick: () => showAdventureReport(true), primary: true },
  ]);
}

async function showPvpTeamSaveSlots() {
  const result = await getPvpTeams();
  const teams = result?.pvpTeams || [null, null, null];

  const slots = teams.map((team, i) => {
    const label = team
      ? team.creatureParty.active.map(c => c?.nameEn || '?').join(', ')
      : 'Empty';
    const levelInfo = team
      ? ` — Lv ${team.creatureParty.active.map(c => c?.level || '?').join('/')}`
      : '';
    return {
      label: `Team ${i + 1}${levelInfo}: ${label}`,
      onClick: async () => {
        if (team && !confirm(`Overwrite Team ${i + 1}?`)) return;
        await savePvpTeam(i);
        renderRunComplete();
      }
    };
  });

  slots.push({ label: 'Cancel', onClick: () => renderRunComplete() });
  renderButtons(slots);
}

/** Run ended — show adventure report (or fallback to simple button) */
export function renderRunEnded() {
  if (showAdventureReport) {
    showAdventureReport(false);
  } else {
    renderButtons([
      { label: 'ハブに戻る', onClick: () => returnToHub(), primary: true },
    ]);
  }
}

/** Shrine phase - show creature roster for level-up */
export function renderShrine() {
  const gameState = getGameState();
  const creatureParty = gameState.run?.creatureParty;

  if (!creatureParty) {
    renderButtons([
      { label: '続ける', onClick: async () => {
        const result = await apiProceed();
        if (result?.state) {
          updateGameState(result.state);
          await playRoomTransition(result.state);
          updateUI();
        }
      }, primary: true },
    ]);
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

  renderChoices({
    cards: allCreatures.map(creature => {
      const hpPercent = Math.floor((creature.hp / creature.maxHp) * 100);
      const spriteHtml = `<img src="${creatureStaticPath(creature.id)}" alt="" onerror="this.style.display='none'">`;
      return {
        sprite: spriteHtml,
        title: `${creature.nameEn} Lv.${creature.level} → Lv.${creature.level + 1}`,
        subtitle: `${creature.rarity} · ${creature.element} · HP: ${creature.hp}/${creature.maxHp} (${hpPercent}%) · ATK: ${shrineDisplayAtk(creature.attack)}`,
      };
    }),
    onSelect: async (index) => {
      const scene = getSceneWithNpcs();
      if (scene?.shrineInProgress) return;
      if (scene) scene.shrineInProgress = true;
      const creature = allCreatures[index];
      const result = await apiShrineUpgrade(creature.id);
      if (result?.state) { updateGameState(result.state); }
      sceneModule.showNarration(t('leveledUp', result?.creatureName || 'Creature', result?.newLevel || '?'), { autoDismiss: 2000 });
      if (scene && !scene.disposed) scene.shrineInProgress = false;
      updateUI();
    },
  });
}

/** Quiz phase - stubbed out (quiz rooms removed from bootstrap MVP) */
export async function renderQuiz() {
  // Quiz rooms are not in the room pool for the bootstrap language MVP.
  // If somehow reached, auto-proceed.
  const result = await apiProceed();
  if (result?.state) {
    updateGameState(result.state);
    await playRoomTransition(result.state);
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

  // Discovery state is scene-owned now (ExplorationScene.discoveryState),
  // so walking into a new room naturally gets a fresh scene + fresh state.
  // The fallback object is used if we're somehow outside an ExplorationScene
  // (the tutorial path can drive renderWordDiscovery before the scene catches
  // up during a transition window).
  const scene = getSceneWithNpcs();
  const fallback = {
    fetched: false,
    words: [],
    wordsLearned: 0,
    roomId: null,
    statusChecked: false,
    atLimit: false,
    todayCount: 0,
    dailyLimit: 10,
  };
  const discoveryState = scene?.discoveryState ?? fallback;

  // Belt-and-suspenders: if an old ExplorationScene survived (shouldn't, but
  // defensive) and its roomId lags behind the current room, snap it forward.
  const roomId = room.id || room.type || 'unknown';
  if (discoveryState.roomId !== roomId) {
    discoveryState.fetched = false;
    discoveryState.words = [];
    discoveryState.wordsLearned = 0;
    discoveryState.roomId = roomId;
    discoveryState.statusChecked = false;
    discoveryState.atLimit = false;
    discoveryState.todayCount = 0;
    discoveryState.dailyLimit = 10;
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
    renderButtons([
      { label: '続ける', onClick: async () => {
        const result = await apiProceed();
        if (result?.state) {
          updateGameState(result.state);
          await playRoomTransition(result.state);
          updateUI();
        }
      }, primary: true },
    ]);
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
    console.log(`[Discovery] Swiped ${direction} on "${currentWord.word}"`);
    try {
      // Grade as 'again' (first exposure — learning)
      const reviewResult = await apiSwipeWord(currentWord.word, 'again', true);
      console.log(`[Discovery] Review sent: word="${currentWord.word}", grade=again`);

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
              const progressResult = await apiProgressSpeedReviewRoom(room.id, word.word, commitIndex);
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

let whackAMoleState = {
  roomId: null,
  fetched: false,
  dialogue: null,
  yesLabel: 'Yes',
  noLabel: 'No',
  introShown: false
};

/** Whack-a-Mole mini game — match Japanese words to creature/item sprites */
export async function renderWhackAMole() {
  const gameState = getGameState();
  const room = gameState.run.rooms[gameState.run.currentRoom];
  const roomId = room?.id || room?.type || 'whackAMole';

  if (whackAMoleState.roomId !== roomId) {
    whackAMoleState = {
      roomId,
      fetched: false,
      dialogue: null,
      yesLabel: 'Yes',
      noLabel: 'No',
      introShown: false
    };
  }

  // Already completed — auto-proceed (matches renderQuiz pattern).
  if (room?.interacted) {
    try {
      const result = await apiProceed();
      if (result?.state) {
        updateGameState(result.state);
        await playRoomTransition(result.state);
      }
    } catch (err) {
      // Fall through to updateUI — server state may already have advanced.
    }
    updateUI();
    return;
  }

  const wordDict = new Map(Object.entries(window.gameState?.wordDictionary || {}));
  if (!whackAMoleState.fetched) {
    try {
      const resp = await apiGetWhackAMoleDialogue();
      whackAMoleState.fetched = true;
      whackAMoleState.dialogue = resp?.dialogue || null;
      whackAMoleState.yesLabel = resp?.yesTokens?.tokens?.length
        ? renderJpSentence(resp.yesTokens.tokens, getKnownWords(), wordDict, resp.yesTokens.overrides || {}, false)
        : 'Yes';
      whackAMoleState.noLabel = resp?.noTokens?.tokens?.length
        ? renderJpSentence(resp.noTokens.tokens, getKnownWords(), wordDict, resp.noTokens.overrides || {}, false)
        : 'No';
    } catch (err) {
      // Leave fetched=false so a later rerender can retry.
    }
  }

  // Show GM greeting in narration box
  if (!whackAMoleState.introShown && whackAMoleState.dialogue?.tokens?.length && sceneModule?.showNarration) {
    whackAMoleState.introShown = true;
    const html = renderJpSentence(whackAMoleState.dialogue.tokens, getKnownWords(), wordDict, whackAMoleState.dialogue.overrides || {}, false);
    await sceneModule.showNarration(html, { html: true, speaker: 'Game Master' });
  }

  renderButtons([
    {
      label: whackAMoleState.yesLabel,
      onClick: async () => {
        // Fetch pool and start game directly (no intermediate start screen)
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

        startWhackAMoleGame(pool);
      }
    },
    {
      label: whackAMoleState.noLabel,
      onClick: async () => {
        const scene = getSceneWithNpcs();
        if (scene && !scene.disposed && scene.npcSprite) {
          await scene.hideNpcSprite({ slideOut: true });
        }
        try {
          const result = await apiSkipWhackAMole();
          if (result?.state) {
            updateGameState(result.state);
          }
        } catch (err) {
          // Fallback: just update UI
        }
        updateUI();
      }
    }
  ]);
}

/** Show the どの能力？ prompt in the narration box, attributed to `speaker`. */
function showSkillSelectPrompt(prompt, speaker = 'Cid') {
  if (!prompt?.tokens?.length || !sceneModule?.showNarration) return;
  const wordDict = new Map(Object.entries(window.gameState?.wordDictionary || {}));
  const html = renderJpSentence(prompt.tokens, getKnownWords(), wordDict, prompt.overrides || {}, false);
  sceneModule.showNarration(html, { html: true, persistent: true, speaker });
}

/**
 * Slide the defeated NPC's sprite into the active scene before the skill-select
 * prompt. Mirrors showCidForSkillMaster — the defeated challenger is the one
 * offering the skill reward, so the player should see them on screen while
 * the `どの能力？` question is attributed to them.
 */
async function showDefeatedNpcForSkillSelect(npc) {
  if (!npc?.id) return;
  const scene = getSceneWithNpcs();
  const spritePath = `/assets/sprites/npcs/${npc.id}.webp?v=${SPRITE_VERSION}`;
  const displayName = npc.nameEn || npc.name || '';
  showNpcInDisplay(displayName, spritePath, { skipPixi: true });
  if (scene && !scene.npcSprite) {
    await scene.showNpcSprite(spritePath, { slideIn: true });
  }
}

/**
 * Slide Cid's sprite into the active scene for the non-tutorial skillMaster
 * path. Mirrors showTutorialNarration's sprite-show side but without the
 * multi-page narration loop — Cid just appears so the player has a visible
 * speaker for the `どの能力？` prompt.
 */
async function showCidForSkillMaster() {
  const scene = getSceneWithNpcs();
  const cidSprite = `/assets/sprites/npcs/cid.webp?v=${SPRITE_VERSION}`;
  showNpcInDisplay('Cid', cidSprite, { skipPixi: true });
  if (scene) {
    await scene.showNpcSprite(cidSprite, { slideIn: true });
  }
}

/** Skill Master room — placeholder UI (to be expanded in later task) */
export async function renderSkillMaster() {
  const gameState = getGameState();
  const run = gameState.run;
  const isInitialPick = run?.initialSkillPick && !run.initialSkillPick.chosenId;
  const room = isInitialPick ? null : (gameState.room || getActiveRoomFromRun(run));
  // Detect initial pick on the server side: phase is skillMaster but the
  // current room is NOT a skillMaster room (initialSkillPick is not sent
  // to the frontend, so we infer it).
  const isServerInitialPick = !isInitialPick
    && gameState.phase === 'skillMaster'
    && (!room || room.type !== 'skillMaster');
  const roomId = (isInitialPick || isServerInitialPick)
    ? 'initialSkillPick'
    : (room?.id || room?.type || 'unknown');

  // Reset per-room cache
  // For the initial skill pick, always reset — room IDs are deterministic per
  // area so the cache key collides across runs, serving stale offers that the
  // server no longer recognizes (causes "Invalid Skill Master offer" 400).
  if (skillMasterState.roomId !== roomId || isServerInitialPick) {
    skillMasterState.roomId = roomId;
    skillMasterState.fetched = false;
    skillMasterState.offered = null;
    skillMasterState.chosenId = null;
    skillMasterState.promptShown = false;
  }

  // If already completed, don't render choices
  const alreadyDone = isInitialPick
    ? run.initialSkillPick.chosenId
    : (room?.interacted || room?.skillMaster?.completed);
  if (alreadyDone) {
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

  // Tutorial step 0: start Cid narration early so it runs while offers load
  const tutorialStep = getGameState()?.meta?.tutorialStep;
  const cidNarrationPromise = tutorialStep === 0
    ? showTutorialNarration(getTutorialNarration(0), { showSprite: true })
    : null;

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
          <div style="text-align:center;color:var(--text-secondary);font-size:13px;">Failed to load offers.</div>
        </div>
      `);
      const retryContainer = document.createElement('div');
      document.getElementById('action-area').appendChild(retryContainer);
      renderButtons([
        { label: 'Retry', onClick: () => { skillMasterState.fetched = false; skillMasterState.offered = null; renderSkillMaster(); }, primary: true },
      ], { container: retryContainer });
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
          <div style="text-align:center;color:var(--text-secondary);font-size:13px;">Failed to load offers.</div>
        </div>
      `);
      const retryContainer = document.createElement('div');
      document.getElementById('action-area').appendChild(retryContainer);
      renderButtons([
        { label: 'Retry', onClick: () => { skillMasterState.fetched = false; skillMasterState.offered = null; renderSkillMaster(); }, primary: true },
      ], { container: retryContainer });
      return;
    }

    skillMasterState.offered = offered;
    skillMasterState.promptTokens = resp?.skillSelectPrompt || null;
    for (const s of offered) {
      if (!s?.id) continue;
      skillMasterState.catalogById[s.id] = {
        name: s.name || PARTY_SKILL_CATALOG_FALLBACK?.[s.id]?.name || s.id,
        desc: s.desc || PARTY_SKILL_CATALOG_FALLBACK?.[s.id]?.desc || ''
      };
    }
  }

  const offers = skillMasterState.offered || room?.skillMaster?.offered || [];

  // Don't wait for Cid narration — render skills immediately so the player
  // can see them while Cid is still talking.
  if (tutorialStep === 0) {
    renderTutorialSkillMaster(offers);
  } else {
    // Slide Cid in so the player sees who's offering them skills. Intentionally
    // not awaited — the choices render in parallel with the slide-in so UI
    // doesn't feel gated on animation.
    showCidForSkillMaster();
    if (!skillMasterState.promptShown) {
      skillMasterState.promptShown = true;
      showSkillSelectPrompt(skillMasterState.promptTokens);
    }

    renderChoices({
      cards: offers.slice(0, 3).map(s => ({
        title: s.name || skillMasterState.catalogById?.[s.id]?.name || s.id,
        subtitle: s.desc || skillMasterState.catalogById?.[s.id]?.desc || '',
      })),
      onSelect: async (index) => {
        const skillId = offers[index].id;
        let result;
        try {
          result = await apiSkillMasterChoose?.(skillId);
        } catch (err) {
          sceneModule?.showNarration?.('Failed to choose skill.', { autoDismiss: 1800 });
          renderSkillMaster();
          return;
        }
        if (result?.state) {
          updateGameState(result.state);
          updateUI();
        } else {
          sceneModule?.showNarration?.('Could not apply skill choice. Try again.', { autoDismiss: 2200 });
          renderSkillMaster();
        }
      },
    });
  }
}

/** Tutorial step 0: show all 3 skills but only the first is clickable (glows). */
function renderTutorialSkillMaster(offers) {
  const el = document.getElementById('action-area');
  el.innerHTML = '';

  const list = document.createElement('div');
  list.className = 'ui-choice-list';

  offers.slice(0, 3).forEach((s, i) => {
    const btn = document.createElement('div');
    btn.className = 'ui-choice';
    btn.setAttribute('role', 'button');
    btn.tabIndex = 0;

    if (i === 0) {
      btn.classList.add('tutorial-highlight');
    } else {
      btn.classList.add('tutorial-dimmed');
    }

    const name = s.name || skillMasterState.catalogById?.[s.id]?.name || s.id;
    const desc = s.desc || skillMasterState.catalogById?.[s.id]?.desc || '';
    btn.innerHTML = `
      <div class="ui-choice__info">
        <div class="ui-choice__title">${name}</div>
        <div class="ui-choice__subtitle">${desc}</div>
      </div>
    `;

    if (i === 0) {
      let clicked = false;
      btn.addEventListener('click', async () => {
        if (clicked) return;
        clicked = true;
        playSFX('button-tap');
        hapticLight();
        btn.classList.remove('tutorial-highlight');
        btn.classList.add('ui-choice--selected');
        list.querySelectorAll('.ui-choice').forEach(c => {
          c.style.pointerEvents = 'none';
        });

        let result;
        try {
          result = await apiSkillMasterChoose?.(s.id);
        } catch {
          sceneModule?.showNarration?.('Failed to choose skill.', { autoDismiss: 1800 });
          renderSkillMaster();
          return;
        }
        if (result?.state) {
          updateGameState(result.state);
          updateUI();
        } else {
          sceneModule?.showNarration?.('Could not apply skill choice. Try again.', { autoDismiss: 2200 });
          renderSkillMaster();
        }
      });
    }

    list.appendChild(btn);
  });

  el.appendChild(list);
}

// ============ FRIENDLY NPC ROOM ============

/** Module-level state to avoid refetch across re-renders */
let friendlyNpcState = {
  roomId: null,
  fetched: false,
  offered: null,
  greeting: null,
  choosing: false,
  greetingShown: false,
  renderedCards: null
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
      greeting: null,
      choosing: false,
      greetingShown: false,
      renderedCards: null
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
    <div style="display:flex;justify-content:center;padding:20px;">
      <div style="color:var(--text-muted);font-size:12px;">Loading...</div>
    </div>
  `);

  const wordDict = new Map(Object.entries(window.gameState?.wordDictionary || {}));

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
      friendlyNpcState.greeting = null;
      friendlyNpcState.renderedCards = null;
      friendlyNpcState.greetingShown = false;
      actions.setContent('');
      renderButtons([
        { label: 'Retry', onClick: () => { friendlyNpcState.fetched = false; friendlyNpcState.offered = null; renderFriendlyNpc(); }, primary: true },
      ]);
      return;
    }

    // Stale async guard: room changed while awaiting
    if (friendlyNpcState.roomId !== fetchRoomId) return;

    const offered = resp?.offered || room?.friendlyNpc?.offered;
    if (!Array.isArray(offered) || offered.length === 0) {
      friendlyNpcState.fetched = false;
      friendlyNpcState.offered = null;
      friendlyNpcState.greeting = null;
      friendlyNpcState.renderedCards = null;
      friendlyNpcState.greetingShown = false;
      actions.setContent('');
      renderButtons([
        { label: 'Retry', onClick: () => { friendlyNpcState.fetched = false; friendlyNpcState.offered = null; renderFriendlyNpc(); }, primary: true },
      ]);
      return;
    }

    friendlyNpcState.offered = offered;
    friendlyNpcState.greeting = resp?.greeting || null;
    friendlyNpcState.renderedCards = offered.map(item => ({
      sprite: itemSpriteHtml(item.id, item.word),
      title: item.nameToken
        ? renderJpSentence([item.nameToken], getKnownWords(), wordDict, {}, false)
        : `${item.word} (${item.reading})`,
      pills: buildItemEffectPills(item),
    }));
    if (resp?.state) {
      updateGameState(resp.state);
    }
  }

  const offers = friendlyNpcState.offered || [];
  const npc = room?.npc;
  const tutorialStep = getGameState()?.meta?.tutorialStep;

  // NPC greeting first (blocking during tutorial so player sees it before items)
  if (npc && sceneModule?.showNarration && !friendlyNpcState.greetingShown) {
    friendlyNpcState.greetingShown = true;
    const greetingTokens = friendlyNpcState.greeting?.tokens;
    let greetingContent;
    if (greetingTokens?.length) {
      greetingContent = renderJpSentence(greetingTokens, getKnownWords(), wordDict, friendlyNpcState.greeting?.overrides || {}, false);
    } else {
      greetingContent = 'こんにちは！';
    }
    const narrationOpts = greetingTokens?.length
      ? { html: true, speaker: npc.nameEn || npc.name }
      : { speaker: npc.nameEn || npc.name };
    if (tutorialStep === 2) {
      await sceneModule.showNarration(greetingContent, narrationOpts);
    } else {
      sceneModule.showNarration(greetingContent, narrationOpts);
    }
  }

  // Render item cards so they're visible
  renderChoices({
    cards: friendlyNpcState.renderedCards || offers.map(item => ({
      sprite: itemSpriteHtml(item.id, item.word),
      title: item.nameToken
        ? renderJpSentence([item.nameToken], getKnownWords(), wordDict, {}, false)
        : `${item.word} (${item.reading})`,
      pills: buildItemEffectPills(item),
    })),
    onSelect: async (index) => {
      if (friendlyNpcState.choosing) return;
      friendlyNpcState.choosing = true;
      const item = offers[index];
      playSFX('creature-equip');

      if (item.tokens?.length && sceneModule?.showNarration) {
        const wordDict = new Map(Object.entries(window.gameState?.wordDictionary || {}));
        const html = renderJpSentence(item.tokens, getKnownWords(), wordDict, item.overrides || {}, false);
        await sceneModule.showNarration(html, { html: true, speaker: 'You' });
      } else if (item.shopTokens?.length && sceneModule?.showNarration) {
        // Legacy fallback for in-progress game states
        const wordDict = new Map(Object.entries(window.gameState?.wordDictionary || {}));
        const html = renderJpSentence(item.shopTokens, getKnownWords(), wordDict, item.shopOverrides || {}, false);
        await sceneModule.showNarration(html, { html: true, speaker: 'You' });
      } else if (item.word && sceneModule?.showNarration) {
        await sceneModule.showNarration(`${item.word}、ください`, { speaker: 'You' });
      }

      const gameState = getGameState();
      const party = gameState.run?.creatureParty?.active || [];
      const isPartyWide = item.effect?.healAllPercent || item.effect?.mpRestorePercent;

      const applyItem = async (creatureIndex) => {
        let result;
        try {
          result = await apiChooseFriendlyNpcItem?.(item.id, creatureIndex);
        } catch (err) {
          friendlyNpcState.choosing = false;
          actions.clear();
          sceneModule?.showNarration?.('Failed to choose item.', { autoDismiss: 1800 });
          renderFriendlyNpc();
          return;
        }
        if (result?.state) {
          updateGameState(result.state);
          friendlyNpcState.choosing = false;
          actions.clear();
          updateUI();
        } else {
          friendlyNpcState.choosing = false;
          sceneModule?.showNarration?.('Could not apply item. Tap to try again.', { autoDismiss: 2200 });
          renderFriendlyNpc();
        }
      };

      if (isPartyWide || party.filter(Boolean).length <= 1) {
        await applyItem(0);
      } else {
        renderChoices({
          cards: party.filter(Boolean).map(creature => ({
            sprite: `<img src="${creatureStaticPath(creature.id)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain" onerror="this.style.display='none'">`,
            title: `${creature.name} (${creature.nameEn})`,
            subtitle: `Lv.${creature.level} · HP: ${creature.hp}/${creature.maxHp}`,
          })),
          onSelect: (creatureIndex) => applyItem(creatureIndex),
        });
      }
    },
  });

  // Tutorial step 2: Cid explains items AFTER cards are visible (once per session)
  if (tutorialStep === 2 && !cidItemShopTutorialShown) {
    cidItemShopTutorialShown = true;
    const cidSprite = `/assets/sprites/npcs/cid.webp?v=${SPRITE_VERSION}`;
    showNpcInDisplay('Cid', cidSprite, { skipPixi: true });
    const scene = getSceneWithNpcs();
    if (scene) {
      await scene.showNpcSprite(cidSprite, { slideIn: true });
    }

    const [itemShopCidLine] = getTutorialNarration(2);
    await sceneModule.showNarration(itemShopCidLine, { speaker: 'Cid' });

    const afterScene = getSceneWithNpcs();
    if (afterScene && !afterScene.disposed && afterScene.npcSprite) {
      await afterScene.hideNpcSprite({ slideOut: true });
    }

    // Restore NPC sprite so they're visible during item selection
    if (npc) {
      const npcSprite = npc.id
        ? `/assets/sprites/npcs/${npc.id}.webp?v=${SPRITE_VERSION}`
        : `/assets/sprites/enemies/systemExecutive.webp?v=${SPRITE_VERSION}`;
      showNpcInDisplay(npc.nameEn || npc.name, npcSprite, { skipPixi: true });
      // Re-fetch the current scene: a transition may have happened during the
      // await of the tutorial narration. If not in an ExplorationScene
      // (shouldn't normally happen here), only the DOM NPC display runs —
      // the legacy _defaultCtx fallback was removed in Task 18.
      const currentScene = getSceneWithNpcs();
      if (currentScene) {
        await currentScene.showNpcSprite(npcSprite, { slideIn: true });
      }
    }
  }
}

function startWhackAMoleGame(pool) {
  new WhackAMoleGame(pool, {
    actions,
    apiCompleteWhackAMole,
    apiProceed,
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
  choosing: false,
  promptTokens: null,
  promptShown: false
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
      choosing: false,
      promptTokens: null,
      promptShown: false
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
          <div style="text-align:center;color:var(--text-secondary);font-size:13px;">Failed to load offers.</div>
        </div>
      `);
      const retryContainer = document.createElement('div');
      document.getElementById('action-area').appendChild(retryContainer);
      renderButtons([
        { label: 'Retry', onClick: () => { npcBattleSkillState.fetched = false; npcBattleSkillState.offered = null; renderNpcBattleSkillSelection({ onSkillChosen, fetchOffers }); }, primary: true },
      ], { container: retryContainer });
      return;
    }

    // Stale async guard: room changed while awaiting
    if (npcBattleSkillState.roomId !== fetchRoomId) return;

    // If fetch returned null (dedup or network), show retry instead of using stale
    // room fallback. room.npcBattle.offered contains raw IDs, not display objects.
    if (!resp) {
      npcBattleSkillState.fetched = false;
      npcBattleSkillState.offered = null;
      actions.setContent(`
        <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:380px;">
          <div style="text-align:center;font-weight:800;letter-spacing:0.02em;">NPC Battle Reward</div>
          <div style="text-align:center;color:var(--text-secondary);font-size:13px;">Loading offers…</div>
        </div>
      `);
      const retryContainer = document.createElement('div');
      document.getElementById('action-area').appendChild(retryContainer);
      renderButtons([
        { label: 'Retry', onClick: () => { npcBattleSkillState.fetched = false; npcBattleSkillState.offered = null; renderNpcBattleSkillSelection({ onSkillChosen, fetchOffers }); }, primary: true },
      ], { container: retryContainer });
      return;
    }

    let offered = resp?.offered || resp?.offers || resp?.skills;
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
    npcBattleSkillState.promptTokens = resp?.skillSelectPrompt || null;
  }

  const offers = npcBattleSkillState.offered || [];

  // The defeated NPC offers the skill reward — resolve them from combat state
  // (available during the immediate post-combat flow) or the room record (for
  // page-reload recovery). Fall back to Cid so the prompt always has a speaker.
  const defeatedNpc = gameState.combat?.npcData || room?.npcBattle?.npc || room?.npc || null;
  const speakerName = defeatedNpc?.nameEn || defeatedNpc?.name || 'Cid';

  // Slide the defeated NPC sprite in (no-op if already on stage) so the
  // player can see who's asking the question. Intentionally not awaited.
  showDefeatedNpcForSkillSelect(defeatedNpc);

  if (!npcBattleSkillState.promptShown) {
    npcBattleSkillState.promptShown = true;
    showSkillSelectPrompt(npcBattleSkillState.promptTokens, speakerName);
  }

  renderChoices({
    cards: offers.slice(0, 3).map(s => ({
      title: s.name || s.id,
      subtitle: s.desc || '',
    })),
    onSelect: async (index) => {
      const skillId = offers[index].id;
      try {
        await onSkillChosen?.(skillId);
      } catch (err) {
        sceneModule?.showNarration?.('Failed to choose skill.', { autoDismiss: 1800 });
        renderNpcBattleSkillSelection({ onSkillChosen, fetchOffers });
      }
    },
  });
}
