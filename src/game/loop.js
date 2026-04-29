import {
  createNewPlayer,
  createNewRun,
  createMetaProgression,
  ACHIEVEMENTS,
  BASE_STARTING_CREDITS
} from './state.js';

import { getRoomActions, getAreaSelectionOptions, ROOM_TYPES, AREAS } from './rooms.js';
import { derivePhase } from './phase-machine.js';
import { ExplorationService, CombatCycleService } from './services/index.js';
import { logger } from '../logger.js';
import {
  instantiateCreature,
  syncPartyCreatureDefense,
  syncCreatureDefense,
  syncPartyCreatureMoves,
  syncCreatureMoves
} from './creatures.js';
import { buildRunSummary } from './adventure-report.js';
import { createItemBuffs } from './services/item-service.js';
import { getCrestMultipliers, applyCrestBonuses } from './services/crest-service.js';
import { getTutorialStep, advanceTutorial as advanceTutorialStep } from './services/tutorial-service.js';
import { exposeWords as exposeWords_fn } from './bootstrap/word-knowledge.js';

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
    this.combatCycleService = new CombatCycleService(this);
  }

  // ============ META-PROGRESSION ============

  /**
   * Initialize or load meta-progression
   */
  initMeta(metaData = null) {
    this.meta = metaData || createMetaProgression();
    if (!this.meta.levels) {
      this.meta.levels = { highestUnlocked: 1, completed: [], current: null };
    }
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
      syncPartyCreatureMoves(this.run.creatureParty);
    }
    if (this.combat?.allies?.length) {
      for (const c of this.combat.allies) {
        if (c) {
          syncCreatureDefense(c);
          syncCreatureMoves(c);
        }
      }
    }
    if (this.combat?.enemies?.length) {
      for (const c of this.combat.enemies) {
        if (c) {
          syncCreatureDefense(c);
          syncCreatureMoves(c);
        }
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

  async startSpeedReviewRoom({ roomId, userId, dueWordsProvider } = {}) {
    return this.explorationService.startSpeedReviewRoom({ roomId, userId, dueWordsProvider });
  }

  recordSpeedReviewRoomCommit({ roomId, word, commitIndex } = {}) {
    return this.explorationService.recordSpeedReviewRoomCommit({ roomId, word, commitIndex });
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


  // ============ CREATURE COMBAT (delegated to CombatCycleService) ============

  startCreatureEncounter() { return this.combatCycleService.startCreatureEncounter(); }
  creatureCombatCycle(actionType = 'attack', moveChoices = []) { return this.combatCycleService.creatureCombatCycle(actionType, moveChoices); }
  rollPostCombatShop() { return this.combatCycleService.rollPostCombatShop(); }
  selectShopItem(itemIndex, targetIndex = 0) { return this.combatCycleService.selectShopItem(itemIndex, targetIndex); }
  swapCreature(activeIndex, reserveIndex) { return this.combatCycleService.swapCreature(activeIndex, reserveIndex); }
  rearrangeCreatures(indexA, indexB) { return this.combatCycleService.rearrangeCreatures(indexA, indexB); }
  swapCreatureOutOfCombat(activeIndex, reserveIndex) { return this.combatCycleService.swapCreatureOutOfCombat(activeIndex, reserveIndex); }
  befriendReplace(releaseCreatureId) { return this.combatCycleService.befriendReplace(releaseCreatureId); }
  getBefriendQuiz() { return this.combatCycleService.getBefriendQuiz(); }
  handleBefriendQuizAnswer(answerId) { return this.combatCycleService.handleBefriendQuizAnswer(answerId); }
  handleBefriendFight() { return this.combatCycleService.handleBefriendFight(); }

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
