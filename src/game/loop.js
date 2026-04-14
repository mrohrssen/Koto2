/**
 * @fileoverview GameManager - Game Coordinator
 * @module src/game/loop
 *
 * PURPOSE:
 * Central coordinator for the game. Delegates domain logic to specialized services
 * while managing cross-cutting concerns like state assembly, run lifecycle, and
 * meta-progression. This is the main interface between server endpoints and game logic.
 *
 * ARCHITECTURE:
 * GameManager coordinates:
 * - ExplorationService (~950 lines) - Room navigation, shops, inventory
 *
 * GameManager retains:
 * - State assembly (getState, getPhase)
 * - Run lifecycle (startRun, forfeitRun)
 * - Meta-progression (achievements) - cross-cutting concern
 * - Player management (createPlayer, loadPlayer)
 * - API surface (delegate methods for server compatibility)
 *
 * KEY EXPORTS:
 * - GameManager (class) - Main coordinator, singleton instance used by server
 * - gameManager (instance) - Pre-instantiated singleton
 *
 * STATE STRUCTURE:
 * - this.player - Base player (persists between runs)
 * - this.run - Current run state (null when in hub)
 * - this.combat - Current combat (null when not fighting)
 * - this.meta - Meta-progression (achievements, creature collection)
 *
 * GAME PHASES (via phase-machine.js):
 * - 'no_save' - No player exists
 * - 'hub' - In town between runs
 * - 'area_selection' - Choosing area
 * - 'exploring' / 'room' / 'room_encounter' - Dungeon navigation
 * - 'combat' / 'victory' / 'defeat' - Battle states
 * - 'post_combat_shop' - Buying drops after combat
 * - 'area_complete' / 'run_complete' - Victory states
 *
 * DEPENDENCIES:
 * - ./services/exploration-service.js - Exploration logic
 * - ./phase-machine.js - Phase derivation
 * - ./state.js - State factories and meta-progression
 */

import {
  createNewPlayer,
  createNewRun,
  createCombatState,
  createMetaProgression,
  ACHIEVEMENTS,
  BASE_STARTING_CREDITS
} from './state.js';

import { getRoomActions, getAreaSelectionOptions, ROOM_TYPES, AREAS } from './rooms.js';
import { derivePhase } from './phase-machine.js';
import { ExplorationService } from './services/index.js';
import { logger } from '../logger.js';
import {
  instantiateCreature,
  generateEnemyCreature,
  generateEnemyCreatures,
  getEnemyLevel,
  syncPartyCreatureDefense,
  syncCreatureDefense,
  CREATURES_BY_ID
} from './creatures.js';
import { processInterleavedPvERound, processDefendTurn, processEnemyTurn, processBefriend, awardBattleXp, handleCreatureKO, tickAllEffects, executeNpcSkill, CREDITS_PER_KILL, applyPartySkillsAfterPlayerAttacks, applyAfterEnemyAttacks, applyRoundStartSkills, shouldTriggerBefriendQuiz, generateBefriendQuiz, processBefriendQuizAnswer, resolveBefriendFight } from './services/creature-combat-service.js';
import { resetStatStages } from './combat/effects.js';
import { buildRunSummary } from './adventure-report.js';
import { rollShopItems, applyItem, createItemBuffs } from './services/item-service.js';
import { addToCollection } from './services/creature-collection-service.js';
import { selectNpcForEncounter, updateBond, recordEncounter, loadNpcs, rollNpcSkill, getNpcSkillsForNpc } from './services/npc-service.js';
import { getCrestMultipliers, applyCrestBonuses } from './services/crest-service.js';
import { shouldProtectBefriend, advanceTutorial as advanceTutorialStep, getTutorialStep } from './services/tutorial-service.js';
import { exposeWords as exposeWords_fn, getKnownWordsFromFsrs } from './bootstrap/word-knowledge.js';
import { selectBark } from './dialogue-filter.js';
import { getBarkPool, getBefriendFrames } from './dialogue-loader.js';
import { selectBestFrame } from './token-format.js';

// ============ GAME MANAGER ============

/**
 * Apply +100 baseAttackBonus to all creatures that haven't received it yet.
 * Uses a _debugAtkApplied flag to prevent stacking across combats.
 */
export function applyDebugSuperAttack(creatures) {
  for (const c of creatures) {
    if (!c || c._debugAtkApplied) continue;
    if (!c.itemBuffs) c.itemBuffs = createItemBuffs();
    c.itemBuffs.baseAttackBonus = (c.itemBuffs.baseAttackBonus || 0) + 100;
    c._debugAtkApplied = true;
  }
}

export class GameManager {
  constructor() {
    this.player = null;
    this.run = null;
    this.combat = null;
    this.meta = null;               // Meta-progression (persists across runs)
    this.narrationCallback = null;  // Called with narration text
    this.stateCallback = null;      // Called when state changes
    this.userId = null;             // Set by manager-registry after construction

    // Services (extracted from monolithic GameManager)
    this.explorationService = new ExplorationService(this);
  }

  // ============ META-PROGRESSION ============

  /**
   * Initialize or load meta-progression
   */
  initMeta(metaData = null) {
    this.meta = metaData || createMetaProgression();
    // Ensure creatureCollection exists for saves created before this feature
    if (!this.meta.creatureCollection) {
      this.meta.creatureCollection = ['hikaribon', 'hanatchi', 'tsukimochi'];
    }
    return this.meta;
  }

  /**
   * Get meta-progression state
   */
  getMeta() {
    return this.meta || createMetaProgression();
  }


  /**
   * Update lifetime stats after a run
   */
  updateLifetimeStats(isVictory = false) {
    if (!this.meta || !this.run) return;

    const stats = this.meta.lifetimeStats;
    const runStats = this.run.stats;

    stats.totalRuns++;
    if (isVictory) {
      stats.runsCompleted++;
    } else {
      stats.runsFailed++;
    }

    stats.totalDamageDealt += runStats.damageDealt || 0;
    stats.totalDamageTaken += runStats.damageTaken || 0;
    stats.totalCreditsEarned += runStats.creditsEarned || 0;

    const areasCleared = this.run.areasCompleted || 0;
    if (areasCleared > (stats.highestAreasCleared || 0)) {
      stats.highestAreasCleared = areasCleared;
    }

    // Unlock next area on victory
    if (isVictory && this.meta.levels && this.run.currentArea?.id) {
      const areaIndex = AREAS.findIndex(a => a.id === this.run.currentArea.id);
      if (areaIndex >= 0) {
        const unlock = areaIndex + 2; // 1-based: beating area 0 unlocks level 2 (areas 0+1)
        this.meta.levels.highestUnlocked = Math.max(this.meta.levels.highestUnlocked || 1, unlock);
      }
    }

    // Play time
    if (runStats.startTime && runStats.endTime) {
      stats.totalPlayTime += (runStats.endTime - runStats.startTime);
    }

    stats.lastPlayDate = new Date().toISOString();
    if (!stats.firstPlayDate) {
      stats.firstPlayDate = stats.lastPlayDate;
    }
  }

  _onRunDefeat() {
    // Tutorial: advance to step 3 (death → hub)
    if (getTutorialStep(this.meta) === 2) {
      advanceTutorialStep(this.meta);
      // giftTutorialFireDrops(this.meta); // Deprecated: elements are no longer a thing
    }
  }

  /**
   * Check and award new achievements
   */
  checkAchievements(runStats = null) {
    if (!this.meta) return [];

    const newAchievements = [];
    const stats = this.meta.lifetimeStats;

    for (const [id, achievement] of Object.entries(ACHIEVEMENTS)) {
      // Skip if already earned
      if (this.meta.achievements.includes(id)) continue;

      // Check if earned
      if (achievement.check(stats, runStats)) {
        this.meta.achievements.push(id);

        newAchievements.push({
          id,
          name: achievement.name,
          nameEn: achievement.nameEn,
          description: achievement.description,
          reward: achievement.reward
        });
      }
    }

    return newAchievements;
  }

  /**
   * Set callback for narration updates
   */
  onNarration(callback) {
    this.narrationCallback = callback;
  }

  /**
   * Set callback for state changes
   */
  onStateChange(callback) {
    this.stateCallback = callback;
  }

  /**
   * Emit narration
   */
  narrate(text) {
    if (this.narrationCallback) {
      this.narrationCallback(text);
    }
  }

  /**
   * Emit state change
   */
  emitState() {
    if (this.stateCallback) {
      this.stateCallback(this.getState());
    }
  }

  /**
   * Get current game state
   */
  getState() {
    const currentRoom = this.run?.rooms?.[this.run?.currentRoom] || null;
    const hasPendingSpeedReviewKeys = this.run?.rooms?.some(
      room => room?.type === ROOM_TYPES.speedReviewRoom && (room.speedReviewRoom?.pendingReviewKeys?.length || 0) > 0
    );
    const shouldSettleSpeedReview = currentRoom?.type === ROOM_TYPES.speedReviewRoom || hasPendingSpeedReviewKeys;

    if (shouldSettleSpeedReview) {
      this.settleSpeedReviewRoomPendingRewards();
    }

    // Keep DEF in sync with level (rounded scaling + backfill for saves missing defense / baseDefenseTemplate).
    if (this.run?.creatureParty) {
      syncPartyCreatureDefense(this.run.creatureParty);
    }
    if (this.combat?.allies?.length) {
      for (const c of this.combat.allies) {
        if (c) syncCreatureDefense(c);
      }
    }
    if (this.combat?.enemies?.length) {
      for (const c of this.combat.enemies) {
        if (c) syncCreatureDefense(c);
      }
    }

    const player = this.run?.player || this.player;

    return {
      player: player,
      run: this.run ? {
        // Area system
        currentArea: this.run.currentArea,
        areasCompleted: this.run.areasCompleted,
        areasToWin: this.run.areasToWin,
        areaPath: this.run.areaPath,
        areaSelectionRequired: this.run.areaSelectionRequired,
        areaCleared: this.run.areaCleared,
        background: this.run.background || 'floor1.webp',
        // Room state
        currentRoom: this.run.currentRoom,
        totalRooms: this.run.rooms?.length || 0,
        roomsExplored: this.run.roomsExplored,
        currentAreaEncounters: this.run.currentAreaEncounters,
        encountersNeeded: this.run.encountersNeeded,
        totalEncounters: this.run.totalEncounters || 0,
        active: this.run.active,
        stats: this.run.stats,
        rooms: this.run.rooms,
        runStats: this.run.runStats,
        creatureParty: this.run.creatureParty,
        partySkills: this.run.partySkills || [],
        itemBuffs: this.run.itemBuffs || null,
        npcDialogue: this.run?.npcDialogue || null,
        postCombatShop: this.run.postCombatShop || null
      } : null,
      room: currentRoom ? {
        ...currentRoom,
        actions: getRoomActions(currentRoom)
      } : null,
      combat: this.combat ? {
        active: this.combat.active,
        turn: this.combat.turn,
        turnCount: this.combat.turnCount,
        enemy: this.combat.enemy,
        allies: this.combat.allies || [],
        enemies: this.combat.enemies || [],
        isCreatureCombat: this.combat.isCreatureCombat || false,
        intent: this.combat.intent,
        lastAction: this.combat.lastAction,
        npcId: this.combat.npcId || null,
        npcData: this.combat.npcData || null,
        befriendAttemptedSlots: this.combat.befriendAttemptedSlots || {}
      } : null,
      meta: this.meta ? {
        lifetimeStats: this.meta.lifetimeStats,
        achievements: this.meta.achievements,
        levels: this.meta.levels || { highestUnlocked: 1, completed: [], current: null },
        prologueComplete: this.meta.prologueComplete || false,
        elementDrops: this.meta.elementDrops || { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 },
        crests: this.meta.crests || [],
        equippedCrests: this.meta.equippedCrests || { fire: null, water: null, earth: null, wood: null, metal: null },
        kanaMode: this.meta.kanaMode || false,
        pvpTeams: this.meta.pvpTeams || [null, null, null],
        tutorialStep: this.meta.tutorialStep ?? 7
      } : null,
      phase: this.getPhase()
    };
  }

  /**
   * Get current game phase
   * Delegates to phase-machine.js for centralized phase logic
   */
  getPhase() {
    return derivePhase({
      player: this.player,
      run: this.run,
      combat: this.combat
    });
  }

  // ============ INITIALIZATION ============

  /**
   * Create a new player save
   * @param {string} name - Player name
   * @param {object} stats - Custom stats from character creation (optional)
   * @param {number} statPoints - Remaining stat points (optional)
   */
  createPlayer(name = 'Hunter', stats = null, statPoints = null) {
    this.player = createNewPlayer(name, stats, statPoints);
    logger.info('[GameManager] Player created:', { name, hp: this.player.hp });
    this.emitState();
    return this.player;
  }

  /**
   * Load existing player
   */
  loadPlayer(playerData) {
    this.player = playerData;
    logger.debug('[GameManager] Player loaded:', { name: this.player.name, credits: this.player.credits });
    this.emitState();
    return this.player;
  }

  // ============ RUN MANAGEMENT ============

  /**
   * Start a new dungeon run
   */
  startRun(levelId = null, starterId = null, starterIds = null) {
    if (!this.player) {
      throw new Error('No player exists');
    }

    this.run = createNewRun(this.player);

    logger.info('[GameManager] Run started:', { playerHp: this.run.player.hp });

    // Reset credits to base starting value
    this.run.player.credits = BASE_STARTING_CREDITS;

    // Reset HP to full at start of run
    this.run.player.hp = this.run.player.maxHp;

    // Area selection is required at start
    this.run.areaSelectionRequired = true;

    // Creature initialization is deferred until after area selection.
    // If starterIds are provided (legacy/test path), initialize immediately.
    // NOTE: the old metaStarterId fallback is intentionally removed — creature
    // selection now always happens explicitly after area selection.
    const ids = starterIds || (starterId ? [starterId] : null);
    const crestMults = getCrestMultipliers(this.meta);
    this.run.crestMults = crestMults;
    this.run.itemBuffs.xpMultiplier = crestMults.xpMult;

    if (ids && ids.length > 0) {
      this.run.creatureParty.active = ids.map(id => instantiateCreature(id));
      for (const creature of this.run.creatureParty.active) {
        applyCrestBonuses(creature, crestMults);
      }
    }
    // else: bare run — creatures will be confirmed via confirmCreatures() after area selection

    this.emitState();

    return {
      run: this.run,
      areaSelectionRequired: true,
      areaOptions: getAreaSelectionOptions(null, this.meta?.levels?.highestUnlocked || 1)
    };
  }

  /**
   * Confirm creature selection after area has been chosen.
   * Initializes the creature party for the current run.
   */
  confirmCreatures(starterIds) {
    if (!this.run) {
      throw new Error('No active run');
    }
    if (!this.run.currentArea) {
      throw new Error('No area selected — select an area first');
    }
    if (this.run.creatureParty.active.length > 0) {
      throw new Error('Creatures already confirmed');
    }
    if (!starterIds || starterIds.length === 0) {
      throw new Error('No creatures selected');
    }

    this.run.creatureParty.active = starterIds.map(id => instantiateCreature(id));

    // Apply crest bonuses (crestMults was set during startRun)
    for (const creature of this.run.creatureParty.active) {
      applyCrestBonuses(creature, this.run.crestMults);
    }

    this.emitState();
    return { success: true };
  }

  // ============ AREA SELECTION ============

  getAreaOptions() {
    return this.explorationService.getAreaOptions();
  }

  selectArea(areaId, forceRoomType = null) {
    return this.explorationService.selectArea(areaId, forceRoomType);
  }

  // ============ ROOM EXPLORATION ============

  /**
   * Get current room info
   */
  getCurrentRoom() {
    return this.explorationService.getCurrentRoom();
  }

  /**
   * Proceed to next room
   */
  proceedToNextRoom(forceRoomType = null) {
    return this.explorationService.proceedToNextRoom(forceRoomType);
  }

  // ============ POST-COMBAT SHOP ============

  /**
   * Buy an item from the post-combat shop
   * @param {number} itemIndex - Index of item to buy (0, 1, or 2)
   */
  buyFromPostCombatShop(itemIndex) {
    return this.explorationService.buyFromPostCombatShop(itemIndex);
  }

  /**
   * Skip the post-combat shop without buying
   */
  skipShop() {
    if (!this.run) throw new Error('No run');
    this.run._pendingShopItems = null;
    this.run.postCombatShop = null;
    this.emitState();
    return { skipped: true };
  }

  /**
   * Refresh the post-combat shop with 3 new random creatures
   */
  refreshPostCombatShop() {
    return this.explorationService.refreshPostCombatShop();
  }

  /**
   * Use a shrine to level up a creature
   */
  useShrine(creatureId) {
    return this.explorationService.useShrine(creatureId);
  }

  useQuizReward(rewardType, creatureId) {
    return this.explorationService.useQuizReward(rewardType, creatureId);
  }

  /**
   * Mark word discovery room as complete
   */
  completeWordDiscovery() {
    return this.explorationService.completeWordDiscovery();
  }

  async startSpeedReviewRoom({ roomId, userId, jpdbApiKey, dueWordsProvider } = {}) {
    return this.explorationService.startSpeedReviewRoom({ roomId, userId, jpdbApiKey, dueWordsProvider });
  }

  recordSpeedReviewRoomCommit({ roomId, vid, sid, commitIndex } = {}) {
    return this.explorationService.recordSpeedReviewRoomCommit({ roomId, vid, sid, commitIndex });
  }

  completeSpeedReviewRoom({ roomId } = {}) {
    return this.explorationService.completeSpeedReviewRoom({ roomId });
  }

  settleSpeedReviewRoomPendingRewards({ roomId } = {}) {
    return this.explorationService.settleSpeedReviewRoomPendingRewards({ roomId });
  }

  completeWhackAMole(score) {
    return this.explorationService.completeWhackAMole(score);
  }

  skipWhackAMole() {
    return this.explorationService.skipWhackAMole();
  }

  // Dealer room delegates
  getDealerState() {
    return this.explorationService.getDealerState();
  }

  dealerSell(creatureId) {
    return this.explorationService.dealerSell(creatureId);
  }

  dealerBuy(creatureId) {
    return this.explorationService.dealerBuy(creatureId);
  }

  leaveDealer() {
    return this.explorationService.leaveDealer();
  }

  /**
   * Start room encounter
   */
  startRoomEncounter() {
    return this.explorationService.startRoomEncounter();
  }


  // ============ CREATURE COMBAT ============

  /**
   * Start a creature encounter
   * Generates an enemy creature and sets up combat state
   */
  startCreatureEncounter() {
    if (!this.run || !this.run.active) {
      throw new Error('No active run');
    }
    if (this.combat?.active) {
      throw new Error('Combat already active');
    }

    // Check if current room is a boss room or npcBattle room
    const currentRoom = this.run.rooms?.[this.run.currentRoom];
    const isBoss = currentRoom?.type === 'boss' && !!currentRoom?.boss?.creatureId;
    const isNpcBattle = currentRoom?.type === 'npcBattle';

    const highestLevel = Math.max(...this.run.creatureParty.active.map(r => r.level), 1);
    const isFirstBattle = (this.run.currentAreaEncounters || 0) === 0;
    const creaturePool = this.run.currentArea?.creatures || null;
    const stage = this.run.currentArea?.stage || null;
    const encounterIndex = this.run.currentAreaEncounters || 0;
    const totalEncounters = this.run.totalEncounters || 0;

    let enemyCreatures;
    if (isBoss) {
      // Boss: solo creature, level × 1.25, double HP
      const bossLevel = Math.round(
        getEnemyLevel({ totalEncounters, enemyCount: 1 }) * 1.25
      );
      const bossCreature = generateEnemyCreature(bossLevel, [currentRoom.boss.creatureId], stage);
      bossCreature.hp = bossCreature.maxHp *= 2;
      enemyCreatures = [bossCreature];
    } else if (isNpcBattle) {
      // NPC Battle: always 3 enemies at level × 1.1
      const baseLevel = getEnemyLevel({ totalEncounters, enemyCount: 3 });
      const npcBattleLevel = Math.round(baseLevel * 1.1);
      enemyCreatures = [
        generateEnemyCreature(npcBattleLevel, creaturePool, stage),
        generateEnemyCreature(npcBattleLevel, creaturePool, stage),
        generateEnemyCreature(npcBattleLevel, creaturePool, stage)
      ];
    } else {
      // New player protection: if player only has 1 creature, force 1 enemy
      const totalCreatures = this.run.creatureParty.active.length + (this.run.creatureParty.reserves?.length || 0);
      const isStarterOnly = totalCreatures <= 1;
      enemyCreatures = generateEnemyCreatures(highestLevel, {
        maxEnemies: isStarterOnly ? 1 : (isFirstBattle ? 2 : undefined),
        creaturePool,
        stage,
        encounterIndex,
        totalEncounters
      });
    }

    // Expose enemy creature names to SRS
    const enemyNameWords = enemyCreatures
      .filter(e => e && e.name)
      .map(e => ({ word: e.name, meaning: e.nameEn || '' }));
    if (enemyNameWords.length > 0) {
      this.exposeWords(enemyNameWords);
    }

    this.combat = createCombatState(enemyCreatures[0]);
    this.combat.allies = this.run.creatureParty.active;
    this.combat.enemies = enemyCreatures;
    this.combat.isCreatureCombat = true;
    this.combat.isBoss = isBoss;
    this.combat.swapPhase = true; // Free swap available before first action

    // Reset stat stages for all combatants at battle start
    for (const c of [...this.combat.allies, ...this.combat.enemies]) {
      if (c) resetStatStages(c);
    }

    // Debug: +100 ATK mode
    if (this._debugSuperAttack) {
      applyDebugSuperAttack(this.combat.allies);
    }

    // NPC Battle rooms: always assign an NPC from the area's roster
    if (isNpcBattle) {
      const areaId = this.run.currentArea?.id || null;
      const allNpcs = loadNpcs();
      const areaEntries = Object.values(allNpcs).filter(npc => !areaId || npc.area === areaId || !npc.area);
      const fallbackEntries = areaEntries.length > 0 ? areaEntries : Object.values(allNpcs);
      if (fallbackEntries.length > 0) {
        const npc = fallbackEntries[Math.floor(Math.random() * fallbackEntries.length)];
        this.combat.npcId = npc.id;
        this.combat.npcData = {
          id: npc.id, name: npc.name, nameEn: npc.nameEn,
          greeting: npc.greeting, speakerId: npc.speakerId
        };
      }
    }
    // Note: for regular encounters, random NPC overlay is disabled (Koto2 MVP).
    // NPCs only appear in deterministic npcBattle rooms.

    // Boss speaks on encounter
    if (isBoss && enemyCreatures[0]) {
      const bossTemplate = CREATURES_BY_ID[currentRoom.boss.creatureId];
      if (bossTemplate?.bossDialogue?.appear) {
        this.narrate(bossTemplate.bossDialogue.appear);
      }
    }

    this.emitState();

    return {
      enemy: enemyCreatures[0],
      enemies: enemyCreatures,
      allies: this.run.creatureParty.active,
      playerGoesFirst: true,
      npc: this.combat.npcData,
      isBoss,
      isNpcBattle
    };
  }

  /**
   * Complete NPC dialogue and update bond
   */
  completeNpcDialogue() {
    if (!this.run?.npcDialogue) return;
    const { npcId, totalDelta } = this.run.npcDialogue;
    updateBond(this.meta, npcId, totalDelta);
    recordEncounter(this.meta, npcId);
    this.run.npcDialogue = null;
    this.emitState();
  }

  /**
   * Move pending captures into party and collection after victory.
   * @returns {Array} New collection additions
   */
  _flushPendingCaptures() {
    const pending = this.run.creatureParty.pendingCaptures || [];
    const newAdditions = [];
    for (const creature of pending) {
      const total = this.run.creatureParty.active.length + this.run.creatureParty.reserves.length;
      if (total >= this.run.creatureParty.maxTotal) break;
      if (this.run.creatureParty.active.length < 3) {
        this.run.creatureParty.active.push(creature);
      } else {
        this.run.creatureParty.reserves.push(creature);
      }
      applyCrestBonuses(creature, this.run.crestMults);
      if (this.meta && !creature.temporary) {
        // Increment befriend counter (always, even if already owned)
        if (!this.meta.befriendCount) this.meta.befriendCount = {};
        this.meta.befriendCount[creature.id] = (this.meta.befriendCount[creature.id] || 0) + 1;

        if (this.run?.runSummary) {
          this.run.runSummary.creaturesBefriended++;
        }

        const result = addToCollection(this.meta.creatureCollection || [], creature.id);
        if (result.added) {
          this.meta.creatureCollection = result.collection;
          newAdditions.push({ id: creature.id, name: creature.name, nameEn: creature.nameEn, element: creature.element, rarity: creature.rarity });
        }
      }
    }
    this.run.creatureParty.pendingCaptures = [];
    return newAdditions;
  }

  /**
   * Execute one creature combat cycle
   * @param {string} actionType - 'attack' | 'defend' | 'befriend'
   */
  creatureCombatCycle(actionType = 'attack', moveChoices = []) {
    if (!this.combat?.active) {
      throw new Error('No active combat');
    }

    // Once an action is committed, free swap window closes
    this.combat.swapPhase = false;

    // Tick active effects at start of round (poison damage, etc.)
    const effectEvents = tickAllEffects(this.combat.allies, this.combat.enemies);

    switch (actionType) {
      case 'attack':  return this._handleCreatureAttackTurn(effectEvents, moveChoices);
      case 'defend':  return this._handleCreatureDefendTurn(effectEvents);
      case 'befriend': return this._handleCreatureBefriendTurn(effectEvents);
      default: throw new Error(`Unknown action: ${actionType}`);
    }
  }

  /**
   * Handle attack action in creature combat.
   * Player attacks, checks victory, then enemy turn with defeat/continuation.
   * @param {Array} effectEvents - Effect tick events from start of round
   * @returns {Object} Combat cycle result
   * @private
   */
  _handleCreatureAttackTurn(effectEvents, moveChoices) {
    // New player move round — each creature may try はなす again
    this.combat.befriendAttemptedSlots = {};

    // Party skills: round-start (Erosion, Momentum, Overflow Vitality)
    const roundStartEvents = applyRoundStartSkills({
      allies: this.combat.allies,
      enemies: this.combat.enemies,
      runPartySkills: this.run.partySkills,
      combat: this.combat
    });

    const metaMults = this.run.crestMults || { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 };
    const playerResult = processInterleavedPvERound(
      this.combat.allies,
      this.combat.enemies,
      moveChoices,
      this.run.itemBuffs,
      this.run.creatureParty,
      metaMults,
      { runPartySkills: this.run.partySkills, combat: this.combat }
    );

    // Party skills proc only on player attack records (post-process round output)
    applyPartySkillsAfterPlayerAttacks({
      attacks: playerResult.attacks,
      allies: this.combat.allies,
      enemies: this.combat.enemies,
      runPartySkills: this.run.partySkills,
      combat: this.combat
    });

    // Award credits for kills
    if (playerResult.xpEvents?.length > 0) {
      const killCredits = playerResult.xpEvents.length * CREDITS_PER_KILL;
      this.run.player.credits = (this.run.player.credits || 0) + killCredits;
    }

    // Expose combat words to SRS
    const combatWordsToExpose = [];
    const allRoundAttacks = [...(playerResult.attacks || []), ...(playerResult.enemyAttacks || [])];
    for (const atk of allRoundAttacks) {
      if (atk.attackerBaseWord) {
        combatWordsToExpose.push({
          word: atk.attackerBaseWord,
          meaning: atk.attackerBaseMeaning || ''
        });
      }
      if ((atk.attackerSkillName || atk.moveName) && (atk.attackerSkillName || atk.moveName) !== atk.attackerBaseWord) {
        combatWordsToExpose.push({
          word: atk.attackerSkillName || atk.moveName,
          meaning: atk.attackerSkillEn || ''
        });
      }
    }
    if (combatWordsToExpose.length > 0) {
      this.exposeWords(combatWordsToExpose);
    }

    // Pick combat barks server-side
    let barks = [];
    const barkPool = getBarkPool();
    if (barkPool && Object.keys(barkPool).length > 0 && this.userId) {
      const knownWords = new Set(getKnownWordsFromFsrs(this.userId));
      if (!this.combat.usedBarks) this.combat.usedBarks = new Set();

      // Determine triggers from this round
      const triggers = ['onAttack']; // Player always attacks in attack turn
      const allyTookDamage = (playerResult.enemyAttacks || []).some(a => a.damage > 0);
      if (allyTookDamage) triggers.push('onHit');
      const allyKOd = (playerResult.enemyAttacks || []).some(a => a.targetDefeated);
      if (allyKOd) triggers.push('onKO');
      if (playerResult.allEnemiesDefeated) triggers.push('onVictory');
      const allyLowHp = this.combat.allies.some(a => a && a.hp > 0 && a.hp / a.maxHp < 0.25);
      if (allyLowHp) triggers.push('onLowHP');

      const barkWordsToExpose = [];
      for (const trigger of triggers) {
        if (Math.random() >= 0.25) continue; // 25% chance per trigger
        const bark = selectBark(barkPool, trigger, knownWords, { usedThisCombat: this.combat.usedBarks });
        if (bark) {
          barks.push({ trigger, text: bark.raw, tokens: bark.tokens || [], words: bark.words || [] });
          this.combat.usedBarks.add(bark.raw);
          for (const w of (bark.words || [])) {
            barkWordsToExpose.push({ word: w, meaning: '' });
          }
        }
      }
      if (barkWordsToExpose.length > 0) {
        this.exposeWords(barkWordsToExpose);
      }
    }

    // Check if all enemies defeated after player attack
    if (playerResult.allEnemiesDefeated) {
      // Befriend quiz trigger: 25% chance when killing blow would end combat
      // Not for boss fights or NPC battles
      // New player protection: guarantee befriend when player only has 1 creature
      const totalOwnedCreatures = this.run.creatureParty.active.length + (this.run.creatureParty.reserves?.length || 0);
      const guaranteeBefriend = totalOwnedCreatures <= 1 || shouldProtectBefriend(this.meta);
      const befriendEligible = !this.combat.isBoss && !this.combat.npcId;
      const befriendTriggerRoll = befriendEligible
        ? shouldTriggerBefriendQuiz(this.combat.enemies, { guaranteed: guaranteeBefriend })
        : false;
      if (befriendEligible && befriendTriggerRoll) {
        // Find the creature killed by the player's last killing blow
        const killingAttacks = (playerResult.attacks || []).filter(a => a.targetDefeated);
        const lastKillAtk = killingAttacks[killingAttacks.length - 1];
        const lastKilled = lastKillAtk
          ? this.combat.enemies[lastKillAtk.targetIndex]
          : [...this.combat.enemies].reverse().find(e => e.hp <= 0 && !e.befriended);
        if (lastKilled) {
          lastKilled.hp = 1;
          const targetIndex = this.combat.enemies.indexOf(lastKilled);

          // Un-award the XP for this creature (it didn't actually die)
          // The xpEvents for this creature will be re-awarded if the player fights
          const revokedXpEvents = playerResult.xpEvents.filter(ev =>
            (typeof ev.enemyIndex === 'number' ? ev.enemyIndex !== targetIndex : ev.enemyId !== lastKilled.id)
          );

          // Generate the quiz
          const quiz = generateBefriendQuiz(lastKilled, this.combat.enemies);
          this.combat.befriendQuiz = {
            targetIndex,
            creatureId: lastKilled.id,
            triggered: true,
            options: quiz.options,
            creatureName: quiz.creatureName
          };

          // Select best befriend prompts via i+1
          const befriendFrames = getBefriendFrames();
          const befriendKnownSet = new Set(getKnownWordsFromFsrs(this.userId));
          const waitPrompt = selectBestFrame(befriendFrames.wait, befriendKnownSet);
          const namePrompt = selectBestFrame(befriendFrames.name, befriendKnownSet);
          const successPrompt = selectBestFrame(befriendFrames.success, befriendKnownSet);
          const wrongPrompt = selectBestFrame(befriendFrames.wrong, befriendKnownSet);

          // Expose befriend prompt words to SRS
          const allPrompts = [waitPrompt, namePrompt, successPrompt, wrongPrompt];
          const befriendPromptWords = allPrompts
            .flatMap(p => (p?.words || []).map(w => {
              const token = (p?.tokens || []).find(t => t.base === w);
              return { word: w, meaning: token?.meaning || '' };
            }));
          if (befriendPromptWords.length > 0) this.exposeWords(befriendPromptWords);

          this.emitState();
          return {
            actionType: 'attack',
            barks,
            playerAttacks: playerResult.attacks || [],
            npcSkillAttacks: [],
            npcSkillUsed: null,
            xpEvents: revokedXpEvents,
            mpRegens: playerResult.mpRegens || [],
            effectEvents,
            roundStartEvents,
            befriendQuizTriggered: true,
            befriendQuiz: {
              targetIndex,
              creatureId: lastKilled.id,
              creatureName: lastKilled.name,
              creatureNameEn: lastKilled.nameEn,
              options: quiz.options.map(o => ({ id: o.id, name: o.name })), // Don't send correct flag
              waitPrompt: waitPrompt ? { text: waitPrompt.raw, tokens: waitPrompt.tokens, words: waitPrompt.words } : null,
              namePrompt: namePrompt ? { text: namePrompt.raw, tokens: namePrompt.tokens, words: namePrompt.words } : null,
              successPrompt: successPrompt ? { text: successPrompt.raw, tokens: successPrompt.tokens, words: successPrompt.words } : null,
              wrongPrompt: wrongPrompt ? { text: wrongPrompt.raw, tokens: wrongPrompt.tokens, words: wrongPrompt.words } : null,
            },
            combatEnded: false,
            allies: this.combat.allies,
            enemies: this.combat.enemies,
            creatureParty: this.run.creatureParty
          };
        }
      }

      // XP already awarded per-kill during the interleaved round
      const newCollectionAdditions = this._flushPendingCaptures();

      // Collect element drops from defeated enemies
      if (this.meta) {
        if (!this.meta.elementDrops) {
          this.meta.elementDrops = { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 };
        }
        for (const enemy of this.combat.enemies || []) {
          if (enemy.hp <= 0 && enemy.element && enemy.element !== 'neutral') {
            this.meta.elementDrops[enemy.element] = (this.meta.elementDrops[enemy.element] || 0) + 1;
          }
          // Track for adventure report
          if (enemy.hp <= 0 && this.run?.runSummary) {
            this.run.runSummary.creaturesDefeated++;
            if (enemy.element && enemy.element !== 'neutral') {
              this.run.runSummary.elementsCollected[enemy.element] =
                (this.run.runSummary.elementsCollected[enemy.element] || 0) + 1;
            }
          }
        }
      }

      this.combat.active = false;
      this.run.currentAreaEncounters++;
      const currentRoom = this.run.rooms?.[this.run.currentRoom];
      if (currentRoom) {
        currentRoom.interacted = true;
      }

      // Boss defeat: dialogue + track for befriend-on-rematch
      if (this.combat.isBoss && this.combat.enemies?.[0]?.id) {
        const bossId = this.combat.enemies[0].id;
        const bossTemplate = CREATURES_BY_ID[bossId];
        if (bossTemplate?.bossDialogue?.defeat) {
          this.narrate(bossTemplate.bossDialogue.defeat);
        }
        if (!this.run.bossesDefeated) this.run.bossesDefeated = [];
        if (!this.run.bossesDefeated.includes(bossId)) {
          this.run.bossesDefeated.push(bossId);
        }
      }

      this.emitState();
      return {
        actionType: 'attack',
        barks,
        playerAttacks: playerResult.attacks || [],
        npcSkillAttacks: [],
        npcSkillUsed: null,
        xpEvents: playerResult.xpEvents || [],
        mpRegens: playerResult.mpRegens || [],
        effectEvents,
        roundStartEvents,
        combatEnded: true,
        victory: true,
        creatureParty: this.run.creatureParty,
        enemies: this.combat.enemies,
        newCollectionAdditions,
        elementDropsCollected: (this.combat.enemies || [])
          .filter(e => e.hp <= 0 && e.element && e.element !== 'neutral')
          .map(e => e.element)
      };
    }

    // === NPC SKILL PHASE ===
    let npcSkillAttacks = [];
    let npcSkillUsed = null;
    if (this.combat.npcId && this.combat.npcData) {
      const fullNpc = loadNpcs()[this.combat.npcId];
      if (fullNpc) {
        const skill = rollNpcSkill(fullNpc);
        if (skill) {
          const npcCombat = {
            id: fullNpc.id,
            name: fullNpc.name,
            nameEn: fullNpc.nameEn,
            attack: fullNpc.attack || 10,
            element: fullNpc.element || 'neutral',
            baseWord: fullNpc.baseWord || '',
            baseReading: fullNpc.baseReading || '',
            baseMeaning: fullNpc.baseMeaning || ''
          };
          const skillResult = executeNpcSkill(npcCombat, skill, this.combat.allies, this.combat.enemies);
          npcSkillAttacks = skillResult.attacks;
          npcSkillUsed = {
            skillId: skill.id,
            skillName: skill.name,
            skillNameEn: skill.nameEn,
            npcName: fullNpc.nameEn,
            npcNameJp: fullNpc.name
          };
          logger.info('[CreatureCombat] NPC skill used:', skill.nameEn, '→', npcSkillAttacks.length, 'hits');
        }
      }
    }

    // Check if NPC skill KO'd all player creatures
    if (npcSkillAttacks.length > 0) {
      const allAlliesKOAfterNpc = this.combat.allies.every(a => !a || a.hp <= 0);
      if (allAlliesKOAfterNpc) {
        this.combat.active = false;
        this.run.active = false;
        this._onRunDefeat();
        this.emitState();
        return {
          actionType: 'attack',
          barks,
          playerAttacks: playerResult.attacks || [],
          npcSkillAttacks,
          npcSkillUsed,
          enemyAttacks: [],
          xpEvents: playerResult.xpEvents || [],
          mpRegens: playerResult.mpRegens || [],
          effectEvents,
          roundStartEvents,
          counterAttacks: [],
          koSwaps: [],
          koRemovals: [],
          combatEnded: true,
          victory: false,
          turnCount: this.combat.turnCount,
          creatureParty: this.run.creatureParty
        };
      }
    }

    // Enemy strikes already resolved in processInterleavedPvERound (level-based initiative with allies)
    const enemyResult = {
      attacks: playerResult.enemyAttacks || [],
      allAlliesDefeated: this.combat.allies.every(a => !a || a.hp <= 0)
    };

    // Party skills: counter attacks (now computed inline in processInterleavedPvERound)
    const counterAttacks = playerResult.inlineCounters || [];

    // Handle KO'd allies — swap reserves in or permanently remove
    const koSwaps = [];
    const koRemovals = [];
    for (let i = 0; i < this.combat.allies.length; i++) {
      if (this.combat.allies[i] && this.combat.allies[i].hp <= 0) {
        const deadName = this.combat.allies[i].nameEn || this.combat.allies[i].name;
        const replacement = handleCreatureKO(this.run.creatureParty, i);
        if (replacement) {
          koSwaps.push({ slot: i, replacement: replacement.nameEn });
          logger.info('[CreatureCombat] KO swap: slot', i, '→', replacement.nameEn);
        } else {
          koRemovals.push({ slot: i, name: deadName });
          logger.info('[CreatureCombat] KO removed: slot', i, deadName, '(no reserves)');
        }
      }
    }
    this.run.creatureParty.active = this.run.creatureParty.active.filter(c => c != null);
    this.combat.allies = this.run.creatureParty.active;

    // Check if all enemies died during enemy phase (e.g. confusion self-hit)
    const allEnemiesDown = this.combat.enemies.every(e => e.hp <= 0 || e.befriended);
    if (allEnemiesDown) {
      const newCollectionAdditions = this._flushPendingCaptures();

      // Collect element drops from defeated enemies
      if (this.meta) {
        if (!this.meta.elementDrops) {
          this.meta.elementDrops = { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 };
        }
        for (const enemy of this.combat.enemies || []) {
          if (enemy.hp <= 0 && enemy.element && enemy.element !== 'neutral') {
            this.meta.elementDrops[enemy.element] = (this.meta.elementDrops[enemy.element] || 0) + 1;
          }
          // Track for adventure report
          if (enemy.hp <= 0 && this.run?.runSummary) {
            this.run.runSummary.creaturesDefeated++;
            if (enemy.element && enemy.element !== 'neutral') {
              this.run.runSummary.elementsCollected[enemy.element] =
                (this.run.runSummary.elementsCollected[enemy.element] || 0) + 1;
            }
          }
        }
      }

      this.combat.active = false;
      this.run.currentAreaEncounters++;
      const currentRoom = this.run.rooms?.[this.run.currentRoom];
      if (currentRoom) currentRoom.interacted = true;
      this.emitState();
      return {
        actionType: 'attack',
        barks,
        playerAttacks: playerResult.attacks || [],
        npcSkillAttacks,
        npcSkillUsed,
        enemyAttacks: enemyResult.attacks || [],
        xpEvents: playerResult.xpEvents || [],
        mpRegens: playerResult.mpRegens || [],
        effectEvents,
        roundStartEvents,
        counterAttacks,
        koSwaps,
        koRemovals,
        combatEnded: true,
        victory: true,
        creatureParty: this.run.creatureParty,
        enemies: this.combat.enemies,
        newCollectionAdditions,
        elementDropsCollected: (this.combat.enemies || [])
          .filter(e => e.hp <= 0 && e.element && e.element !== 'neutral')
          .map(e => e.element)
      };
    }

    // Check defeat — only if ALL allies (including swapped-in reserves) are KO'd
    const allAlliesKO = this.combat.allies.length === 0 || this.combat.allies.every(a => !a || a.hp <= 0);
    if (allAlliesKO) {
      // Save any befriended creatures to permanent collection before defeat
      const pending = this.run.creatureParty.pendingCaptures || [];
      for (const creature of pending) {
        if (this.meta && !creature.temporary) {
          const result = addToCollection(this.meta.creatureCollection || [], creature.id);
          if (result.added) {
            this.meta.creatureCollection = result.collection;
          }
        }
      }
      this.run.creatureParty.pendingCaptures = [];

      this.combat.active = false;
      this.run.active = false;
      this._onRunDefeat();
      this.emitState();
      return {
        actionType: 'attack',
        barks,
        playerAttacks: playerResult.attacks || [],
        npcSkillAttacks,
        npcSkillUsed,
        enemyAttacks: enemyResult.attacks || [],
        xpEvents: playerResult.xpEvents || [],
        mpRegens: playerResult.mpRegens || [],
        effectEvents,
        roundStartEvents,
        counterAttacks,
        koSwaps,
        koRemovals,
        combatEnded: true,
        victory: false,
        turnCount: this.combat.turnCount,
        creatureParty: this.run.creatureParty
      };
    }

    this.combat.turnCount++;
    this.combat.swapPhase = true;
    this.emitState();

    return {
      actionType: 'attack',
      barks,
      playerAttacks: playerResult.attacks || [],
      npcSkillAttacks,
      npcSkillUsed,
      enemyAttacks: enemyResult.attacks || [],
      xpEvents: playerResult.xpEvents || [],
      mpRegens: playerResult.mpRegens || [],
      effectEvents,
      roundStartEvents,
      counterAttacks,
      befriend: null,
      koSwaps,
      koRemovals,
      combatEnded: false,
      turnCount: this.combat.turnCount,
      allies: this.combat.allies,
      enemies: this.combat.enemies,
      creatureParty: this.run.creatureParty
    };
  }

  /**
   * Handle defend action in creature combat.
   * Player defends (reduces incoming damage), then enemy turn with defeat/continuation.
   * @param {Array} effectEvents - Effect tick events from start of round
   * @returns {Object} Combat cycle result
   * @private
   */
  _handleCreatureDefendTurn(effectEvents) {
    this.combat.befriendAttemptedSlots = {};

    // Party skills: round-start (Erosion, Momentum, Overflow Vitality)
    const roundStartEvents = applyRoundStartSkills({
      allies: this.combat.allies,
      enemies: this.combat.enemies,
      runPartySkills: this.run.partySkills,
      combat: this.combat
    });

    processDefendTurn(this.combat.allies);

    // Enemy phase (defendActive = true reduces damage)
    const enemyResult = processEnemyTurn(this.combat.enemies, this.combat.allies, true, this.run.itemBuffs);

    // Party skills: counter attacks
    const counterAttacks = applyAfterEnemyAttacks({
      enemyAttacks: enemyResult.attacks,
      allies: this.combat.allies,
      enemies: this.combat.enemies,
      runPartySkills: this.run.partySkills,
      combat: this.combat
    }) || [];

    // Handle KO'd allies — swap reserves in or permanently remove
    const koSwaps = [];
    const koRemovals = [];
    for (let i = 0; i < this.combat.allies.length; i++) {
      if (this.combat.allies[i] && this.combat.allies[i].hp <= 0) {
        const deadName = this.combat.allies[i].nameEn || this.combat.allies[i].name;
        const replacement = handleCreatureKO(this.run.creatureParty, i);
        if (replacement) {
          koSwaps.push({ slot: i, replacement: replacement.nameEn });
          logger.info('[CreatureCombat] KO swap: slot', i, '→', replacement.nameEn);
        } else {
          koRemovals.push({ slot: i, name: deadName });
          logger.info('[CreatureCombat] KO removed: slot', i, deadName, '(no reserves)');
        }
      }
    }
    this.run.creatureParty.active = this.run.creatureParty.active.filter(c => c != null);
    this.combat.allies = this.run.creatureParty.active;

    // Check defeat — only if ALL allies (including swapped-in reserves) are KO'd
    const allAlliesKO = this.combat.allies.length === 0 || this.combat.allies.every(a => !a || a.hp <= 0);
    if (allAlliesKO) {
      // Save any befriended creatures to permanent collection before defeat
      const pending = this.run.creatureParty.pendingCaptures || [];
      for (const creature of pending) {
        if (this.meta && !creature.temporary) {
          const result = addToCollection(this.meta.creatureCollection || [], creature.id);
          if (result.added) {
            this.meta.creatureCollection = result.collection;
          }
        }
      }
      this.run.creatureParty.pendingCaptures = [];

      this.combat.active = false;
      this.run.active = false;
      this._onRunDefeat();
      this.emitState();
      return {
        actionType: 'defend',
        playerAttacks: [],
        enemyAttacks: enemyResult.attacks || [],
        xpEvents: [],
        effectEvents,
        roundStartEvents,
        counterAttacks,
        koSwaps,
        koRemovals,
        combatEnded: true,
        victory: false,
        turnCount: this.combat.turnCount,
        creatureParty: this.run.creatureParty
      };
    }

    this.combat.turnCount++;
    this.combat.swapPhase = true;
    this.emitState();

    return {
      actionType: 'defend',
      playerAttacks: [],
      enemyAttacks: enemyResult.attacks || [],
      xpEvents: [],
      effectEvents,
      roundStartEvents,
      counterAttacks,
      befriend: null,
      koSwaps,
      koRemovals,
      combatEnded: false,
      turnCount: this.combat.turnCount,
      allies: this.combat.allies,
      enemies: this.combat.enemies,
      creatureParty: this.run.creatureParty
    };
  }

  /**
   * Handle befriend action in creature combat.
   * Attempt to capture an enemy. If last enemy captured, victory.
   * Otherwise, enemy turn with defeat/continuation.
   * @param {Array} effectEvents - Effect tick events from start of round
   * @returns {Object} Combat cycle result
   * @private
   */
  _handleCreatureBefriendTurn(effectEvents) {
    // Boss can only be befriended on rematch (after first defeat)
    if (this.combat.isBoss) {
      const bossId = this.combat.enemies?.[0]?.id;
      if (!this.run.bossesDefeated?.includes(bossId)) {
        this.combat.befriendAttemptedSlots = {};
        return {
          actionType: 'befriend',
          befriend: { success: false, reason: 'boss_first_defeat' },
          effectEvents,
          roundStartEvents: [],
          combatEnded: false,
          allies: this.combat.allies,
          enemies: this.combat.enemies,
          creatureParty: this.run.creatureParty
        };
      }
    }

    // Party skills: round-start (Erosion, Momentum, Overflow Vitality)
    const roundStartEvents = applyRoundStartSkills({
      allies: this.combat.allies,
      enemies: this.combat.enemies,
      runPartySkills: this.run.partySkills,
      combat: this.combat
    });

    const targetIdx =
      typeof this.combat.befriendConversation?.targetEnemyIndex === 'number'
        ? this.combat.befriendConversation.targetEnemyIndex
        : this.combat.lastBefriendTargetIndex;
    if (typeof targetIdx === 'number') this.combat.lastBefriendTargetIndex = targetIdx;
    const befriendResult = processBefriend(this.combat.enemies, this.run.creatureParty, targetIdx);

    // Captured last enemy — immediate victory
    if (befriendResult.success && befriendResult.allEnemiesDefeated) {
      awardBattleXp(this.run.creatureParty, this.run.crestMults || { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 }, this.run.itemBuffs);
      const newCollectionAdditions = this._flushPendingCaptures();

      // Collect element drops from defeated enemies
      if (this.meta) {
        if (!this.meta.elementDrops) {
          this.meta.elementDrops = { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 };
        }
        for (const enemy of this.combat.enemies || []) {
          if (enemy.hp <= 0 && enemy.element && enemy.element !== 'neutral') {
            this.meta.elementDrops[enemy.element] = (this.meta.elementDrops[enemy.element] || 0) + 1;
          }
          // Track for adventure report
          if (enemy.hp <= 0 && this.run?.runSummary) {
            this.run.runSummary.creaturesDefeated++;
            if (enemy.element && enemy.element !== 'neutral') {
              this.run.runSummary.elementsCollected[enemy.element] =
                (this.run.runSummary.elementsCollected[enemy.element] || 0) + 1;
            }
          }
        }
      }

      this.combat.active = false;
      this.run.currentAreaEncounters++;
      const currentRoom = this.run.rooms?.[this.run.currentRoom];
      if (currentRoom) {
        currentRoom.interacted = true;
      }
      this.emitState();
      return {
        actionType: 'befriend',
        befriend: befriendResult,
        effectEvents,
        roundStartEvents,
        combatEnded: true,
        victory: true,
        creatureParty: this.run.creatureParty,
        enemies: this.combat.enemies,
        newCollectionAdditions,
        elementDropsCollected: (this.combat.enemies || [])
          .filter(e => e.hp <= 0 && e.element && e.element !== 'neutral')
          .map(e => e.element)
      };
    }

    // Enemy phase
    const enemyResult = processEnemyTurn(this.combat.enemies, this.combat.allies, false, this.run.itemBuffs);

    // Party skills: counter attacks
    const counterAttacks = applyAfterEnemyAttacks({
      enemyAttacks: enemyResult.attacks,
      allies: this.combat.allies,
      enemies: this.combat.enemies,
      runPartySkills: this.run.partySkills,
      combat: this.combat
    }) || [];

    // Handle KO'd allies — swap reserves in or permanently remove
    const koSwaps = [];
    const koRemovals = [];
    for (let i = 0; i < this.combat.allies.length; i++) {
      if (this.combat.allies[i] && this.combat.allies[i].hp <= 0) {
        const deadName = this.combat.allies[i].nameEn || this.combat.allies[i].name;
        const replacement = handleCreatureKO(this.run.creatureParty, i);
        if (replacement) {
          koSwaps.push({ slot: i, replacement: replacement.nameEn });
          logger.info('[CreatureCombat] KO swap: slot', i, '→', replacement.nameEn);
        } else {
          koRemovals.push({ slot: i, name: deadName });
          logger.info('[CreatureCombat] KO removed: slot', i, deadName, '(no reserves)');
        }
      }
    }
    this.run.creatureParty.active = this.run.creatureParty.active.filter(c => c != null);
    this.combat.allies = this.run.creatureParty.active;

    // Check defeat — only if ALL allies (including swapped-in reserves) are KO'd
    const allAlliesKO = this.combat.allies.length === 0 || this.combat.allies.every(a => !a || a.hp <= 0);
    if (allAlliesKO) {
      // Save any befriended creatures to permanent collection before defeat
      const pending = this.run.creatureParty.pendingCaptures || [];
      for (const creature of pending) {
        if (this.meta && !creature.temporary) {
          const result = addToCollection(this.meta.creatureCollection || [], creature.id);
          if (result.added) {
            this.meta.creatureCollection = result.collection;
          }
        }
      }
      this.run.creatureParty.pendingCaptures = [];

      this.combat.active = false;
      this.run.active = false;
      this._onRunDefeat();
      this.emitState();
      return {
        actionType: 'befriend',
        playerAttacks: [],
        enemyAttacks: enemyResult.attacks || [],
        xpEvents: [],
        effectEvents,
        roundStartEvents,
        counterAttacks,
        koSwaps,
        koRemovals,
        combatEnded: true,
        victory: false,
        turnCount: this.combat.turnCount,
        creatureParty: this.run.creatureParty
      };
    }

    this.combat.turnCount++;
    this.combat.swapPhase = true;
    this.combat.befriendAttemptedSlots = {};
    this.emitState();

    return {
      actionType: 'befriend',
      playerAttacks: [],
      enemyAttacks: enemyResult.attacks || [],
      xpEvents: [],
      effectEvents,
      roundStartEvents,
      counterAttacks,
      befriend: befriendResult,
      koSwaps,
      koRemovals,
      combatEnded: false,
      turnCount: this.combat.turnCount,
      allies: this.combat.allies,
      enemies: this.combat.enemies,
      creatureParty: this.run.creatureParty
    };
  }

  /**
   * Roll 3 random items for the post-combat shop.
   * Koto2 MVP: post-combat shop disabled, friendly NPC rooms replace this.
   * When re-enabled, this sets run.postCombatShop so the phase machine
   * can recover the shop on page reload.
   */
  rollPostCombatShop() {
    // If shop items are already active (e.g. page reload), return them
    if (this.run?.postCombatShop?.active) {
      return { items: this.run.postCombatShop.items };
    }
    // MVP: shop disabled — return null
    return null;
  }

  /**
   * Player selects one item from the post-combat shop
   * @param {number} itemIndex - 0, 1, or 2
   * @param {number} targetIndex - which active creature receives the item
   */
  selectShopItem(itemIndex, targetIndex = 0) {
    if (!this.run) throw new Error('No run');
    const items = this.run._pendingShopItems;
    if (!items || !items[itemIndex]) throw new Error('Invalid shop item');

    const selectedItem = items[itemIndex];
    const totalEncounters = this.run.currentAreaEncounters || 0;
    const enemyLevel = getEnemyLevel({ totalEncounters });
    const applyResult = applyItem(selectedItem, this.run.creatureParty, null, targetIndex, { enemyLevel });
    this.run._pendingShopItems = null;
    this.run.postCombatShop = null;

    if (this.run?.runSummary) {
      this.run.runSummary.itemsCollected++;
    }
    if (this.meta && selectedItem?.id) {
      if (!this.meta.itemsDiscovered) this.meta.itemsDiscovered = [];
      if (!this.meta.itemsDiscovered.includes(selectedItem.id)) {
        this.meta.itemsDiscovered.push(selectedItem.id);
      }
    }

    this.emitState();
    return {
      selected: selectedItem,
      creatureParty: this.run.creatureParty
    };
  }

  /**
   * Swap an active creature with a reserve
   * @param {number} activeIndex - Index in creatureParty.active (0-2)
   * @param {number} reserveIndex - Index in creatureParty.reserves (0-2)
   * @returns {Object} Result with updated party and whether enemy attacks
   */
  swapCreature(activeIndex, reserveIndex) {
    if (!this.combat?.active) throw new Error('No active combat');
    if (!this.run?.creatureParty) throw new Error('No creature party');

    const party = this.run.creatureParty;
    if (!party.active[activeIndex]) throw new Error('Invalid active creature index');
    if (!party.reserves[reserveIndex]) throw new Error('Invalid reserve creature index');

    // Perform the swap
    const temp = party.active[activeIndex];
    party.active[activeIndex] = party.reserves[reserveIndex];
    party.reserves[reserveIndex] = temp;

    // Refresh combat allies reference
    this.combat.allies = party.active;

    const isFreeSwap = this.combat.swapPhase;

    if (!isFreeSwap) {
      // Paid swap: enemy attacks, no player action
      const enemyResult = processEnemyTurn(
        this.combat.enemies,
        this.combat.allies,
        false,
        this.run.itemBuffs
      );

      // Handle KO'd allies after enemy attack
      for (let i = 0; i < this.combat.allies.length; i++) {
        if (this.combat.allies[i].hp <= 0) {
          handleCreatureKO(this.run.creatureParty, i);
        }
      }
      this.combat.allies = this.run.creatureParty.active;

      // Check defeat
      const allAlliesKO = this.combat.allies.every(a => a.hp <= 0);
      if (allAlliesKO) {
        this.combat.active = false;
        this.run.active = false;
        this._onRunDefeat();
      }

      this.combat.turnCount++;
      this.emitState();

      return {
        swapped: true,
        freeSwap: false,
        enemyAttacks: enemyResult.attacks,
        combatEnded: allAlliesKO,
        victory: false,
        creatureParty: party,
        allies: this.combat.allies,
        enemies: this.combat.enemies
      };
    }

    this.emitState();
    return {
      swapped: true,
      freeSwap: true,
      creatureParty: party,
      allies: this.combat.allies,
      enemies: this.combat.enemies
    };
  }

  /**
   * Rearrange two active creatures by swapping their positions (no reserves needed).
   * Works both in and out of combat.
   * @param {number} indexA - First active slot index (0-2)
   * @param {number} indexB - Second active slot index (0-2)
   * @returns {Object} Result with updated party
   */
  rearrangeCreatures(indexA, indexB) {
    if (!this.run?.creatureParty) throw new Error('No creature party');
    const party = this.run.creatureParty;
    if (!party.active[indexA]) throw new Error('Invalid creature index A');
    if (!party.active[indexB]) throw new Error('Invalid creature index B');

    // Swap positions
    const temp = party.active[indexA];
    party.active[indexA] = party.active[indexB];
    party.active[indexB] = temp;

    // Refresh combat allies reference if in combat
    if (this.combat?.active) {
      this.combat.allies = party.active;
    }

    this.emitState();
    return {
      rearranged: true,
      creatureParty: party
    };
  }

  /**
   * Swap an active creature with a reserve OUTSIDE of combat (equip screen).
   * @param {number} activeIndex - Index in creatureParty.active (0-2)
   * @param {number} reserveIndex - Index in creatureParty.reserves (0-2)
   * @returns {Object} Result with updated party
   */
  swapCreatureOutOfCombat(activeIndex, reserveIndex) {
    if (!this.run?.creatureParty) throw new Error('No creature party');
    const party = this.run.creatureParty;
    if (!party.active[activeIndex]) throw new Error('Invalid active creature index');
    if (!party.reserves[reserveIndex]) throw new Error('Invalid reserve creature index');

    // Perform the swap
    const temp = party.active[activeIndex];
    party.active[activeIndex] = party.reserves[reserveIndex];
    party.reserves[reserveIndex] = temp;

    this.emitState();
    return {
      swapped: true,
      creatureParty: party
    };
  }

  /**
   * Replace an existing creature with a befriended creature when roster is full.
   * @param {string} releaseCreatureId - ID of creature to release (must be in party)
   * @param {Object} capturedCreature - The befriended enemy creature to add
   * @returns {Object} Result with updated party
   */
  befriendReplace(releaseCreatureId) {
    if (!this.combat?.active) throw new Error('No active combat');
    if (!this.run?.creatureParty) throw new Error('No creature party');

    const party = this.run.creatureParty;
    const enemies = this.combat.enemies;

    // Use the stored target from the befriend conversation
    const targetIdx = this.combat.lastBefriendTargetIndex;
    let captured;
    if (typeof targetIdx === 'number' && enemies[targetIdx]?.hp > 0 && !enemies[targetIdx]?.befriended) {
      captured = enemies[targetIdx];
    } else {
      // Fallback: find any eligible enemy
      const eligible = enemies
        .filter(e => e.hp > 0 && (e.hp / e.maxHp) <= 0.5)
        .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
      if (eligible.length === 0) {
        return { success: false, reason: 'No enemy at <=50% HP' };
      }
      captured = eligible[0];
    }

    // Find the creature to release
    let releaseIndex = party.active.findIndex(r => r && r.id === releaseCreatureId);
    let releaseFrom = 'active';
    if (releaseIndex === -1) {
      releaseIndex = party.reserves.findIndex(r => r && r.id === releaseCreatureId);
      releaseFrom = 'reserves';
    }
    if (releaseIndex === -1) {
      return { success: false, reason: 'Creature to release not found in party' };
    }

    // Mark enemy as befriended (don't splice — preserve indices for frontend)
    captured.hp = 0;
    captured.befriended = true;

    // Create a clean copy for when it joins the party after combat
    const capturedCopy = { ...captured, hp: captured.maxHp, befriended: false };
    // Release the old creature and queue the captured one for post-combat
    if (releaseFrom === 'active') {
      party.active.splice(releaseIndex, 1);
    } else {
      party.reserves.splice(releaseIndex, 1);
    }
    if (!party.pendingCaptures) party.pendingCaptures = [];
    party.pendingCaptures.push(capturedCopy);

    // Refresh combat allies reference
    this.combat.allies = party.active;

    const allEnemiesDefeated = enemies.filter(e => e.hp > 0 && !e.befriended).length === 0;

    let newCollectionAdditions = [];
    if (allEnemiesDefeated) {
      awardBattleXp(party, this.run.crestMults || { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 }, this.run.itemBuffs);
      newCollectionAdditions = this._flushPendingCaptures();

      // Collect element drops from defeated enemies
      if (this.meta) {
        if (!this.meta.elementDrops) {
          this.meta.elementDrops = { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 };
        }
        for (const enemy of enemies || []) {
          if (enemy.hp <= 0 && enemy.element && enemy.element !== 'neutral') {
            this.meta.elementDrops[enemy.element] = (this.meta.elementDrops[enemy.element] || 0) + 1;
          }
          // Track for adventure report
          if (enemy.hp <= 0 && this.run?.runSummary) {
            this.run.runSummary.creaturesDefeated++;
            if (enemy.element && enemy.element !== 'neutral') {
              this.run.runSummary.elementsCollected[enemy.element] =
                (this.run.runSummary.elementsCollected[enemy.element] || 0) + 1;
            }
          }
        }
      }

      this.combat.active = false;
      this.run.currentAreaEncounters++;
      // Mark room as interacted
      const currentRoom = this.run.rooms?.[this.run.currentRoom];
      if (currentRoom) {
        currentRoom.interacted = true;
      }
    }

    this.emitState();
    return {
      success: true,
      captured: capturedCopy,
      released: releaseCreatureId,
      allEnemiesDefeated,
      combatEnded: allEnemiesDefeated,
      victory: allEnemiesDefeated,
      creatureParty: party,
      enemies,
      newCollectionAdditions,
      elementDropsCollected: allEnemiesDefeated
        ? (enemies || []).filter(e => e.hp <= 0 && e.element && e.element !== 'neutral').map(e => e.element)
        : []
    };
  }

  // ============ BEFRIEND NAME QUIZ ============

  /**
   * Get the current befriend quiz state (for the /befriend-quiz route)
   * @returns {object|null}
   */
  getBefriendQuiz() {
    if (!this.combat?.befriendQuiz) return null;
    const quiz = this.combat.befriendQuiz;
    return {
      creatureId: quiz.creatureId,
      creatureName: quiz.creatureName,
      options: quiz.options.map(o => ({ id: o.id, name: o.name })) // Don't expose correct flag
    };
  }

  /**
   * Process a befriend quiz answer (Talk path)
   * @param {string} answerId - The selected option's id
   * @returns {object} Result
   */
  handleBefriendQuizAnswer(answerId) {
    if (!this.combat?.befriendQuiz) {
      return { error: 'No active befriend quiz' };
    }

    const tutorialProtect = shouldProtectBefriend(this.meta);
    const result = processBefriendQuizAnswer(answerId, this.combat, this.run.creatureParty, { tutorialProtect });

    // Tutorial step 1 → 2: advance after successful befriend
    if (result.correct && shouldProtectBefriend(this.meta)) {
      advanceTutorialStep(this.meta);
    }

    if (result.correct && result.allEnemiesDefeated) {
      // Victory via befriend
      awardBattleXp(this.run.creatureParty, this.run.crestMults || { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 }, this.run.itemBuffs);
      const newCollectionAdditions = this._flushPendingCaptures();

      // Collect element drops from defeated enemies
      if (this.meta) {
        if (!this.meta.elementDrops) {
          this.meta.elementDrops = { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 };
        }
        for (const enemy of this.combat.enemies || []) {
          if (enemy.hp <= 0 && enemy.element && enemy.element !== 'neutral') {
            this.meta.elementDrops[enemy.element] = (this.meta.elementDrops[enemy.element] || 0) + 1;
          }
          // Track for adventure report
          if (enemy.hp <= 0 && this.run?.runSummary) {
            this.run.runSummary.creaturesDefeated++;
            if (enemy.element && enemy.element !== 'neutral') {
              this.run.runSummary.elementsCollected[enemy.element] =
                (this.run.runSummary.elementsCollected[enemy.element] || 0) + 1;
            }
          }
        }
      }

      this.combat.active = false;
      this.run.currentAreaEncounters++;
      const currentRoom = this.run.rooms?.[this.run.currentRoom];
      if (currentRoom) currentRoom.interacted = true;

      this.emitState();
      return {
        ...result,
        combatEnded: true,
        victory: true,
        creatureParty: this.run.creatureParty,
        enemies: this.combat.enemies,
        newCollectionAdditions,
        elementDropsCollected: (this.combat.enemies || [])
          .filter(e => e.hp <= 0 && e.element && e.element !== 'neutral')
          .map(e => e.element)
      };
    }

    if (!result.correct) {
      // Wrong answer: handle KO swaps from counter-attack
      const koSwaps = [];
      for (let i = 0; i < this.combat.allies.length; i++) {
        if (this.combat.allies[i] && this.combat.allies[i].hp <= 0) {
          const replacement = handleCreatureKO(this.run.creatureParty, i);
          if (replacement) {
            koSwaps.push({ slot: i, replacement: replacement.nameEn });
          }
        }
      }
      this.combat.allies = this.run.creatureParty.active;

      const allAlliesKO = this.combat.allies.every(a => !a || a.hp <= 0);
      if (allAlliesKO) {
        this.combat.active = false;
        this.run.active = false;
        this._onRunDefeat();
      }

      this.emitState();
      return {
        ...result,
        koSwaps,
        combatEnded: allAlliesKO,
        victory: false,
        allies: this.combat.allies,
        enemies: this.combat.enemies,
        creatureParty: this.run.creatureParty
      };
    }

    // Correct but not all defeated (shouldn't happen in normal flow, but handle gracefully)
    this.emitState();
    return result;
  }

  /**
   * Resolve the "Fight" choice — kill the creature and finalize combat
   * @returns {object} Result
   */
  handleBefriendFight() {
    if (!this.combat?.befriendQuiz) {
      return { error: 'No active befriend quiz' };
    }

    const result = resolveBefriendFight(this.combat);

    if (result.allEnemiesDefeated) {
      // Award XP for the kill that was deferred
      const target = this.combat.enemies.find(e => e.hp <= 0 && !e.befriended);
      // Note: XP was already awarded for other kills in the original processMoveTurn;
      // the last creature's XP was revoked. Re-award it now would double-count since
      // the target is already dead. The kill XP from the original turn was stripped.
      // For simplicity, we just end combat as victory.
      const newCollectionAdditions = this._flushPendingCaptures();

      // Collect element drops from defeated enemies
      if (this.meta) {
        if (!this.meta.elementDrops) {
          this.meta.elementDrops = { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 };
        }
        for (const enemy of this.combat.enemies || []) {
          if (enemy.hp <= 0 && enemy.element && enemy.element !== 'neutral') {
            this.meta.elementDrops[enemy.element] = (this.meta.elementDrops[enemy.element] || 0) + 1;
          }
          // Track for adventure report
          if (enemy.hp <= 0 && this.run?.runSummary) {
            this.run.runSummary.creaturesDefeated++;
            if (enemy.element && enemy.element !== 'neutral') {
              this.run.runSummary.elementsCollected[enemy.element] =
                (this.run.runSummary.elementsCollected[enemy.element] || 0) + 1;
            }
          }
        }
      }

      this.combat.active = false;
      this.run.currentAreaEncounters++;
      const currentRoom = this.run.rooms?.[this.run.currentRoom];
      if (currentRoom) currentRoom.interacted = true;

      this.emitState();
      return {
        killed: true,
        combatEnded: true,
        victory: true,
        creatureParty: this.run.creatureParty,
        enemies: this.combat.enemies,
        newCollectionAdditions,
        elementDropsCollected: (this.combat.enemies || [])
          .filter(e => e.hp <= 0 && e.element && e.element !== 'neutral')
          .map(e => e.element)
      };
    }

    this.emitState();
    return result;
  }

  // ============ UTILITY ============

  /**
   * Expose words to the SRS system for this user.
   * No-op if userId is not set (e.g. during tests).
   * @param {Array<{word: string, meaning?: string}>} words
   */
  exposeWords(words) {
    if (!this.userId) return;
    const newlyMastered = exposeWords_fn(this.userId, words);
    if (this.run?.runSummary && Array.isArray(words)) {
      for (const entry of words) {
        const word = typeof entry === 'string' ? entry : entry?.word;
        if (word && !this.run.runSummary.wordsExposed.includes(word)) {
          this.run.runSummary.wordsExposed.push(word);
        }
      }
      if (Array.isArray(newlyMastered)) {
        for (const mastered of newlyMastered) {
          this.run.runSummary.wordsMastered.push(mastered);
        }
      }
    }
  }

  /**
   * End the current run (forfeit)
   */
  forfeitRun(isVictory = false) {
    let runSummary = null;
    if (this.run) {
      logger.info('[GameManager] Run forfeited:', { areasCompleted: this.run.areasCompleted, roomsExplored: this.run.roomsExplored });

      // Always set endTime if missing (defeat path sets active=false but not endTime)
      if (!this.run.stats.endTime) {
        this.run.stats.endTime = Date.now();
      }

      if (this.run.active) {
        this.run.active = false;
        if (this.meta?.levels) {
          this.meta.levels.current = null;
        }
        this.updateLifetimeStats(isVictory);
        this.checkAchievements(this.run.stats);
      }

      // Capture summary before clearing run
      runSummary = buildRunSummary(this.run, this.meta);

      this.combat = null;
      this.run = null;
    }
    this.emitState();
    return { runSummary };
  }

  /**
   * Reset everything (including player)
   * Note: Preserves meta-progression!
   */
  reset() {
    this.player = null;
    this.run = null;
    this.combat = null;
    // Note: we keep this.meta - meta-progression persists
    this.emitState();
  }

  /**
   * Full reset including meta-progression
   */
  fullReset() {
    this.player = null;
    this.run = null;
    this.combat = null;
    this.meta = null;
    this.emitState();
  }

}

// Export singleton instance
export const gameManager = new GameManager();
