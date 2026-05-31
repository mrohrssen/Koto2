import { createCombatState } from '../state.js';
import { logger } from '../../logger.js';
import {
  generateEnemyCreature,
  generateEnemyCreatures,
  getEnemyLevel,
  CREATURES_BY_ID
} from '../creatures.js';
import {
  processInterleavedPvERound,
  processDefendTurn,
  processEnemyTurn,
  processBefriend,
  awardBattleXp,
  awardKillXp,
  tickAllEffects,
  resolveNoopActorAction,
  resolveSingleActorAction,
  resolveSyntheticActorAction,
  pickEnemyMoveChoice,
  pickEnemyTarget,
  executeNpcSkill,
  CREDITS_PER_KILL,
  applyPartySkillsAfterPlayerAttacks,
  applyAfterEnemyAttacks,
  applyRoundStartSkills,
  shouldTriggerBefriendQuiz,
  generateBefriendQuiz,
  processBefriendQuizAnswer,
  resolveBefriendFight
} from './creature-combat-service.js';
import { resetStatStages } from '../combat/effects.js';
import {
  checkAllDefeated,
  processKOSwaps,
  collectElementDrops,
  getElementDropList,
  finalizeCombatVictory,
  resolveDefeat
} from '../combat/resolution.js';
import {
  createPveOpeningCursor,
  cursorMatchesChoice,
  getActor,
  getNextActionCursor
} from '../combat/action-cursor.js';
import { rollShopItems, applyItem } from './item-service.js';
import { addCreatureCopy } from './creature-collection-service.js';
import {
  selectNpcForEncounter,
  updateBond,
  recordEncounter,
  loadNpcs,
  rollNpcSkill,
  getNpcSkillsForNpc
} from './npc-service.js';
import { applyCrestBonuses } from './crest-service.js';
import {
  shouldProtectBefriend,
  advanceTutorial as advanceTutorialStep,
  isStartingMeadowHinonekoBoss,
  shouldForceStartingMeadowCatEncounter,
  shouldShowStartingMeadowHinonekoIntro,
  collectStartingMeadowHinonekoVictoryReward
} from './tutorial-service.js';
import { getKnownWordsFromFsrs, getWordDict } from '../bootstrap/word-knowledge.js';
import { selectBark } from '../dialogue-filter.js';
import { getBarkPool, getBefriendFrames } from '../dialogue-loader.js';
import { selectBestFrame } from '../token-format.js';
import { applyDebugSuperAttack } from '../loop.js';

export function serializeBefriendPrompt(prompt) {
  if (!prompt) return null;
  const payload = {
    text: prompt.raw,
    tokens: prompt.tokens,
    words: prompt.words,
  };
  if (prompt.overrides && Object.keys(prompt.overrides).length > 0) {
    payload.overrides = prompt.overrides;
  }
  return payload;
}

export class CombatCycleService {
  constructor(gm) {
    this.gm = gm;
  }

  /**
   * Start a creature encounter
   * Generates an enemy creature and sets up combat state
   */
  startCreatureEncounter() {
    if (!this.gm.run || !this.gm.run.active) {
      throw new Error('No active run');
    }
    if (this.gm.combat?.active) {
      throw new Error('Combat already active');
    }

    // Check if current room is a boss room or npcBattle room
    const currentRoom = this.gm.run.rooms?.[this.gm.run.currentRoom];
    const isBoss = currentRoom?.type === 'boss' && !!currentRoom?.boss?.creatureId;
    const isNpcBattle = currentRoom?.type === 'npcBattle';

    const highestLevel = Math.max(...this.gm.run.creatureParty.active.map(r => r.level), 1);
    const isFirstBattle = (this.gm.run.currentAreaEncounters || 0) === 0;
    const creaturePool = this.gm.run.currentArea?.creatures || null;
    const stage = this.gm.run.currentArea?.stage || null;
    const encounterIndex = this.gm.run.currentAreaEncounters || 0;
    const totalEncounters = this.gm.run.totalEncounters || 0;
    const isStartingMeadow = this.gm.run.currentArea?.id === 'hajimari-no-hiroba';
    const adjustStartingMeadowLevel = level => isStartingMeadow ? Math.max(1, level - 2) : level;

    let enemyCreatures;
    if (isBoss) {
      // Boss: solo creature, level × 1.25, double HP unless a tutorial override applies.
      const isStartingMeadowHinoneko = isStartingMeadowHinonekoBoss(this.gm.run);
      const bossLevel = isStartingMeadowHinoneko
        ? adjustStartingMeadowLevel(7)
        : adjustStartingMeadowLevel(Math.round(getEnemyLevel({ totalEncounters, enemyCount: 1 }) * 1.25));
      const bossCreature = generateEnemyCreature(bossLevel, [currentRoom.boss.creatureId], stage);
      if (!isStartingMeadowHinoneko) {
        bossCreature.hp = bossCreature.maxHp *= 2;
      }
      enemyCreatures = [bossCreature];
    } else if (isNpcBattle) {
      // NPC Battle: always 3 enemies at level × 1.1
      const baseLevel = getEnemyLevel({ totalEncounters, enemyCount: 3 });
      const npcBattleLevel = adjustStartingMeadowLevel(Math.round(baseLevel * 1.1));
      enemyCreatures = [
        generateEnemyCreature(npcBattleLevel, creaturePool, stage),
        generateEnemyCreature(npcBattleLevel, creaturePool, stage),
        generateEnemyCreature(npcBattleLevel, creaturePool, stage)
      ];
    } else {
      // New player protection: if player only has 1 creature, force 1 enemy
      const totalCreatures = this.gm.run.creatureParty.active.length + (this.gm.run.creatureParty.reserves?.length || 0);
      const isStarterOnly = totalCreatures <= 1;
      if (shouldForceStartingMeadowCatEncounter(this.gm.meta, this.gm.run)) {
        enemyCreatures = generateEnemyCreatures(highestLevel, {
          maxEnemies: 1,
          creaturePool: ['neko'],
          stage,
          encounterIndex,
          totalEncounters,
          levelOffset: isStartingMeadow ? -2 : 0
        });
      } else {
        enemyCreatures = generateEnemyCreatures(highestLevel, {
          maxEnemies: isStarterOnly ? 1 : (isFirstBattle ? 2 : undefined),
          creaturePool,
          stage,
          encounterIndex,
          totalEncounters,
          levelOffset: isStartingMeadow ? -2 : 0
        });
      }
    }

    this.gm.combat = createCombatState(enemyCreatures[0]);
    this.gm.combat.allies = this.gm.run.creatureParty.active;
    this.gm.combat.enemies = enemyCreatures;
    this.gm.combat.actionCursor = createPveOpeningCursor({
      allies: this.gm.combat.allies,
      enemies: this.gm.combat.enemies
    });
    this.gm.combat.actionCount = 0;
    this.gm.combat.cycleCount = 0;
    this.gm.combat.openingResolved = false;
    this.gm.combat.isCreatureCombat = true;
    this.gm.combat.isBoss = isBoss;
    this.gm.combat.swapPhase = true; // Free swap available before first action

    // Reset stat stages for all combatants at battle start
    for (const c of [...this.gm.combat.allies, ...this.gm.combat.enemies]) {
      if (c) resetStatStages(c);
    }

    // Debug: +100 ATK mode
    if (this.gm._debugSuperAttack) {
      applyDebugSuperAttack(this.gm.combat.allies);
    }

    // NPC Battle rooms: always assign an NPC from the area's roster
    if (isNpcBattle) {
      const areaId = this.gm.run.currentArea?.id || null;
      const allNpcs = loadNpcs();
      const areaEntries = Object.values(allNpcs).filter(npc => !areaId || npc.area === areaId || !npc.area);
      const fallbackEntries = areaEntries.length > 0 ? areaEntries : Object.values(allNpcs);
      if (fallbackEntries.length > 0) {
        const npc = fallbackEntries[Math.floor(Math.random() * fallbackEntries.length)];
        this.gm.combat.npcId = npc.id;
        this.gm.combat.npcData = {
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
        this.gm.narrate(bossTemplate.bossDialogue.appear);
      }
    }

    const tutorialBossIntro = shouldShowStartingMeadowHinonekoIntro(this.gm.meta, this.gm.run)
      ? {
          speaker: 'Cid',
          lines: [
            'Careful! This creature is stronger than normal.',
            "You can't befriend this creature, but defeat it and our scientists can collect data.",
            'With enough data, our fusion scientists can add it to your team.'
          ]
        }
      : null;

    this.gm.emitState();

    return {
      enemy: enemyCreatures[0],
      enemies: enemyCreatures,
      allies: this.gm.run.creatureParty.active,
      playerGoesFirst: true,
      npc: this.gm.combat.npcData,
      isBoss,
      isNpcBattle,
      tutorialBossIntro
    };
  }

  /**
   * Move pending captures into party and collection after victory.
   * @returns {Array} New collection additions
   */
  _flushPendingCaptures() {
    const pending = this.gm.run.creatureParty.pendingCaptures || [];
    const newAdditions = [];
    for (const creature of pending) {
      const total = this.gm.run.creatureParty.active.length + this.gm.run.creatureParty.reserves.length;
      if (total >= this.gm.run.creatureParty.maxTotal) break;
      if (this.gm.run.creatureParty.active.length < 3) {
        this.gm.run.creatureParty.active.push(creature);
      } else {
        this.gm.run.creatureParty.reserves.push(creature);
      }
      applyCrestBonuses(creature, this.gm.run.crestMults);
      if (this.gm.meta && !creature.temporary) {
        // Increment befriend counter (always, even if already owned)
        if (!this.gm.meta.befriendCount) this.gm.meta.befriendCount = {};
        this.gm.meta.befriendCount[creature.id] = (this.gm.meta.befriendCount[creature.id] || 0) + 1;

        if (this.gm.run?.runSummary) {
          this.gm.run.runSummary.creaturesBefriended++;
        }

        const result = addCreatureCopy(this.gm.meta, creature.id);
        if (result.addedDiscovery) {
          newAdditions.push({ id: creature.id, name: creature.name, nameEn: creature.nameEn, element: creature.element, rarity: creature.rarity });
        }
      }
    }
    this.gm.run.creatureParty.pendingCaptures = [];
    return newAdditions;
  }

  _collectTutorialRewards() {
    const rewards = [];
    const fusionReward = collectStartingMeadowHinonekoVictoryReward(this.gm.meta, this.gm.run, this.gm.combat);
    if (fusionReward) rewards.push(fusionReward);
    return rewards;
  }

  _collectPoisonKoXpEvents(effectEvents, metaMults) {
    const xpEvents = [];
    const defeatedEnemyIndices = new Set();
    for (const event of effectEvents || []) {
      if (event.type !== 'poison') continue;
      if (event.targetSide !== 'enemy') continue;
      if (!event.targetDefeated) continue;
      if (typeof event.targetIndex !== 'number') continue;
      if (defeatedEnemyIndices.has(event.targetIndex)) continue;

      const enemy = this.gm.combat.enemies[event.targetIndex];
      if (!enemy) continue;

      defeatedEnemyIndices.add(event.targetIndex);
      const xpEvent = awardKillXp(
        this.gm.run.creatureParty,
        enemy.level,
        this.gm.run.itemBuffs?.xpMultiplier,
        this.gm.run.itemBuffs?.xpBalanceStacks,
        metaMults,
        this.gm.run.itemBuffs
      );
      xpEvents.push({ enemyId: enemy.id, enemyIndex: event.targetIndex, enemyName: enemy.nameEn, ...xpEvent });
    }
    return xpEvents;
  }

  _finishPoisonTerminalIfNeeded(actionType, effectEvents, roundStartEvents, poisonXpEvents = []) {
    if (checkAllDefeated(this.gm.combat.enemies)) {
      if (poisonXpEvents.length > 0) {
        this.gm.run.player.credits = (this.gm.run.player.credits || 0) + poisonXpEvents.length * CREDITS_PER_KILL;
      }
      collectElementDrops(this.gm.meta, this.gm.combat.enemies, this.gm.run?.runSummary);
      finalizeCombatVictory(this.gm.combat, this.gm.run, { meta: this.gm.meta, narrate: (t) => this.gm.narrate(t) });
      const tutorialRewards = this._collectTutorialRewards();
      this.gm.emitState();
      return {
        actionType,
        barks: [],
        playerAttacks: [],
        enemyAttacks: [],
        npcSkillAttacks: [],
        npcSkillUsed: null,
        counterAttacks: [],
        xpEvents: poisonXpEvents,
        mpRegens: [],
        effectEvents,
        roundStartEvents,
        combatEnded: true,
        victory: true,
        allies: this.gm.combat.allies,
        creatureParty: this.gm.run.creatureParty,
        enemies: this.gm.combat.enemies,
        newCollectionAdditions: [],
        tutorialRewards,
        elementDropsCollected: getElementDropList(this.gm.combat.enemies)
      };
    }

    if (checkAllDefeated(this.gm.combat.allies)) {
      resolveDefeat(this.gm.combat, this.gm.run, this.gm.meta, { onDefeat: () => this.gm._onRunDefeat() });
      this.gm.emitState();
      return {
        actionType,
        playerAttacks: [],
        enemyAttacks: [],
        xpEvents: poisonXpEvents,
        effectEvents,
        roundStartEvents,
        counterAttacks: [],
        koSwaps: [],
        koRemovals: [],
        combatEnded: true,
        victory: false,
        turnCount: this.gm.combat.turnCount,
        creatureParty: this.gm.run.creatureParty
      };
    }

    return null;
  }

  /**
   * Execute one creature combat cycle
   * @param {string} actionType - 'attack' | 'defend' | 'befriend'
   */
  creatureCombatCycle(actionType = 'attack', moveChoices = []) {
    if (!this.gm.combat?.active) {
      throw new Error('No active combat');
    }

    // Once an action is committed, free swap window closes
    this.gm.combat.swapPhase = false;

    if (actionType === 'attack' && this.gm.combat.actionCursor) {
      return this._handleCreatureActionCursorTurn(moveChoices);
    }

    // Tick active effects at start of round (poison damage, etc.)
    const effectEvents = tickAllEffects(this.gm.combat.allies, this.gm.combat.enemies);

    switch (actionType) {
      case 'attack':  return this._handleCreatureAttackTurn(effectEvents, moveChoices);
      case 'defend':  return this._handleCreatureDefendTurn(effectEvents);
      case 'befriend': return this._handleCreatureBefriendTurn(effectEvents);
      default: throw new Error(`Unknown action: ${actionType}`);
    }
  }

  _resolveCurrentPveCursor(moveChoice = null, playbackStart = 0) {
    const cursor = this.gm.combat.actionCursor;
    if (!cursor) throw new Error('No active action cursor');

    const actor = getActor({
      allies: this.gm.combat.allies,
      enemies: this.gm.combat.enemies
    }, cursor);
    if (!actor) throw new Error('Action cursor actor not found');

    let choices = [];
    if (cursor.side === 'ally') {
      if (!cursorMatchesChoice(cursor, moveChoice)) {
        throw new Error('Submitted move does not match current action cursor');
      }
      choices = [moveChoice];
    } else {
      const choice = pickEnemyMoveChoice(actor, this.gm.combat.allies, this.gm.combat.enemies);
      if (choice) {
        const { move, mode } = choice;
        const targeting = pickEnemyTarget(actor, move, mode, this.gm.combat.allies, this.gm.combat.enemies);
        if (targeting) {
          const targetIndex = targeting.targetSide === 'player'
            ? this.gm.combat.allies.indexOf(targeting.target)
            : this.gm.combat.enemies.indexOf(targeting.target);
          choices = [{ creatureIndex: cursor.index, moveId: move.id, targetIndex }];
        }
      }
    }

    const result = resolveSingleActorAction({
      actorSide: cursor.side,
      actorIndex: cursor.index,
      allies: this.gm.combat.allies,
      enemies: this.gm.combat.enemies,
      choices,
      itemBuffs: this.gm.run?.itemBuffs || null,
      creatureParty: this.gm.run?.creatureParty || null,
      metaMults: this.gm.run?.crestMults || { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 },
      runPartySkills: this.gm.run?.partySkills || null,
      combat: this.gm.combat,
      playbackStart
    });

    this.gm.combat.actionCount = (this.gm.combat.actionCount || 0) + 1;
    this.gm.combat.turnCount = this.gm.combat.actionCount;
    this.gm.combat.openingResolved = this.gm.combat.openingResolved || cursor.opening === true;
    this.gm.combat.actionCursor = getNextActionCursor({
      allies: this.gm.combat.allies,
      enemies: this.gm.combat.enemies,
      previousCursor: cursor
    });

    return result;
  }

  _remapPveCursorAfterKORemovals(koRemovals = []) {
    const cursor = this.gm.combat?.actionCursor;
    if (!cursor || cursor.side !== 'ally' || koRemovals.length === 0) return;

    let nextIndex = cursor.index;
    let cursorRemoved = false;
    const removals = [...koRemovals].sort((a, b) => a.index - b.index);
    for (const removal of removals) {
      if (removal.index === nextIndex) {
        cursorRemoved = true;
        break;
      }
      if (removal.index < nextIndex) {
        nextIndex--;
      }
    }

    const ally = cursorRemoved ? null : this.gm.combat.allies?.[nextIndex];
    if (ally && ally.hp > 0 && !ally.befriended) {
      this.gm.combat.actionCursor = { ...cursor, index: nextIndex, opening: false };
      return;
    }

    const fallback = createPveOpeningCursor({
      allies: this.gm.combat.allies,
      enemies: this.gm.combat.enemies
    });
    this.gm.combat.actionCursor = fallback ? { ...fallback, opening: false } : null;
  }

  _handleCreatureActionCursorTurn(moveChoices = []) {
    const submittedChoice = moveChoices[0] || null;
    const actionSegments = [];
    let playbackStart = 0;

    const firstResult = this._resolveCurrentPveCursor(submittedChoice, playbackStart);
    actionSegments.push(...firstResult.actionSegments);
    playbackStart = firstResult.playbackNext || actionSegments.length;

    while (
      this.gm.combat.active &&
      this.gm.combat.actionCursor?.side === 'enemy' &&
      !checkAllDefeated(this.gm.combat.enemies) &&
      !checkAllDefeated(this.gm.combat.allies)
    ) {
      const enemyResult = this._resolveCurrentPveCursor(null, playbackStart);
      actionSegments.push(...enemyResult.actionSegments);
      playbackStart = enemyResult.playbackNext || playbackStart + enemyResult.actionSegments.length;
    }

    const flatPlayerAttacks = actionSegments.flatMap(segment =>
      segment.actor.side === 'ally' ? segment.attacks : segment.counterAttacks || []
    );
    const flatEnemyAttacks = actionSegments.flatMap(segment =>
      segment.actor.side === 'enemy' ? segment.attacks : []
    );
    const effectEvents = actionSegments.flatMap(segment => segment.effectEvents || []);
    const mpRegens = actionSegments.flatMap(segment => segment.mpRegens || []);
    const xpEvents = actionSegments.flatMap(segment => segment.xpEvents || []);
    const counterAttacks = actionSegments.flatMap(segment => segment.counterAttacks || []);

    const { koSwaps: rawKoSwaps, koRemovals: rawKoRemovals } = processKOSwaps(
      this.gm.combat.allies,
      this.gm.run.creatureParty
    );
    const koSwaps = rawKoSwaps.map(s => ({ slot: s.index, replacement: s.replacement.nameEn }));
    const koRemovals = rawKoRemovals.map(r => ({ slot: r.index, name: r.name }));
    this.gm.combat.allies = this.gm.run.creatureParty.active;
    this._remapPveCursorAfterKORemovals(rawKoRemovals);

    const allEnemiesDown = checkAllDefeated(this.gm.combat.enemies);
    const allAlliesDown = checkAllDefeated(this.gm.combat.allies);

    if (allEnemiesDown) {
      const totalOwnedCreatures = this.gm.run.creatureParty.active.length + (this.gm.run.creatureParty.reserves?.length || 0);
      const guaranteeBefriend = totalOwnedCreatures <= 1 || shouldProtectBefriend(this.gm.meta);
      const forceBefriend = this.gm._debugForceBefriend === true;
      const befriendEligible = !this.gm.combat.isBoss && !this.gm.combat.npcId;
      const befriendTriggerRoll = befriendEligible
        ? shouldTriggerBefriendQuiz(this.gm.combat.enemies, { guaranteed: guaranteeBefriend, force: forceBefriend })
        : false;
      if (befriendEligible && befriendTriggerRoll) {
        const killingAttacks = flatPlayerAttacks.filter(a => a.targetDefeated);
        const lastKillAtk = killingAttacks[killingAttacks.length - 1];
        const lastKilled = lastKillAtk
          ? this.gm.combat.enemies[lastKillAtk.targetIndex]
          : [...this.gm.combat.enemies].reverse().find(e => e.hp <= 0 && !e.befriended);
        if (lastKilled) {
          lastKilled.hp = 1;
          const targetIndex = this.gm.combat.enemies.indexOf(lastKilled);
          const revokedXpEvents = xpEvents.filter(ev =>
            (typeof ev.enemyIndex === 'number' ? ev.enemyIndex !== targetIndex : ev.enemyId !== lastKilled.id)
          );
          const quiz = generateBefriendQuiz(lastKilled, this.gm.combat.enemies);
          this.gm.combat.befriendQuiz = {
            targetIndex,
            creatureId: lastKilled.id,
            triggered: true,
            options: quiz.options,
            creatureName: quiz.creatureName
          };

          const befriendFrames = getBefriendFrames();
          const befriendKnownSet = new Set(getKnownWordsFromFsrs(this.gm.userId));
          const waitPrompt = selectBestFrame(befriendFrames.wait, befriendKnownSet, { dict: getWordDict() });
          const namePrompt = selectBestFrame(befriendFrames.name, befriendKnownSet, { dict: getWordDict() });
          const successPrompt = selectBestFrame(befriendFrames.success, befriendKnownSet, { dict: getWordDict() });
          const wrongPrompt = selectBestFrame(befriendFrames.wrong, befriendKnownSet, { dict: getWordDict() });

          this.gm.emitState();
          return {
            actionType: 'attack',
            actionSegments,
            playerAttacks: flatPlayerAttacks,
            enemyAttacks: flatEnemyAttacks,
            counterAttacks,
            xpEvents: revokedXpEvents,
            mpRegens,
            effectEvents,
            koSwaps,
            koRemovals,
            befriendQuizTriggered: true,
            befriendQuiz: {
              targetIndex,
              creatureId: lastKilled.id,
              creatureName: lastKilled.name,
              creatureNameEn: lastKilled.nameEn,
              options: quiz.options.map(o => ({ id: o.id, name: o.name })),
              waitPrompt: serializeBefriendPrompt(waitPrompt),
              namePrompt: serializeBefriendPrompt(namePrompt),
              successPrompt: serializeBefriendPrompt(successPrompt),
              wrongPrompt: serializeBefriendPrompt(wrongPrompt),
            },
            combatEnded: false,
            allies: this.gm.combat.allies,
            enemies: this.gm.combat.enemies,
            creatureParty: this.gm.run.creatureParty
          };
        }
      }

      const newCollectionAdditions = this._flushPendingCaptures();
      collectElementDrops(this.gm.meta, this.gm.combat.enemies, this.gm.run?.runSummary);
      finalizeCombatVictory(this.gm.combat, this.gm.run, { meta: this.gm.meta, narrate: (t) => this.gm.narrate(t) });
      const tutorialRewards = this._collectTutorialRewards();
      this.gm.emitState();
      return {
        actionType: 'attack',
        actionSegments,
        playerAttacks: flatPlayerAttacks,
        enemyAttacks: flatEnemyAttacks,
        counterAttacks,
        xpEvents,
        mpRegens,
        effectEvents,
        koSwaps,
        koRemovals,
        combatEnded: true,
        victory: true,
        allies: this.gm.combat.allies,
        enemies: this.gm.combat.enemies,
        creatureParty: this.gm.run.creatureParty,
        newCollectionAdditions,
        tutorialRewards,
        elementDropsCollected: getElementDropList(this.gm.combat.enemies)
      };
    }

    if (allAlliesDown) {
      resolveDefeat(this.gm.combat, this.gm.run, this.gm.meta, { onDefeat: () => this.gm._onRunDefeat() });
      this.gm.emitState();
      return {
        actionType: 'attack',
        actionSegments,
        playerAttacks: flatPlayerAttacks,
        enemyAttacks: flatEnemyAttacks,
        counterAttacks,
        xpEvents,
        mpRegens,
        effectEvents,
        koSwaps,
        koRemovals,
        combatEnded: true,
        victory: false,
        turnCount: this.gm.combat.turnCount,
        creatureParty: this.gm.run.creatureParty
      };
    }

    this.gm.combat.swapPhase = true;
    this.gm.emitState();
    return {
      actionType: 'attack',
      actionSegments,
      playerAttacks: flatPlayerAttacks,
      enemyAttacks: flatEnemyAttacks,
      counterAttacks,
      xpEvents,
      mpRegens,
      effectEvents,
      koSwaps,
      koRemovals,
      combatEnded: false,
      turnCount: this.gm.combat.turnCount,
      allies: this.gm.combat.allies,
      enemies: this.gm.combat.enemies,
      creatureParty: this.gm.run.creatureParty
    };
  }

  resolveKanjiKombatCursorAction({ correct, targetIndex = 0 } = {}) {
    const cursor = this.gm.combat?.actionCursor;
    if (!this.gm.run || this.gm.run.mode !== 'kanjiKombat') {
      throw new Error('Not in Kanji Kombat');
    }
    if (!cursor || cursor.side !== 'ally') {
      throw new Error('Kanji Kombat answer requires ally action cursor');
    }

    const actor = this.gm.combat.allies[cursor.index];
    const result = correct
      ? resolveSyntheticActorAction({
          actorSide: 'ally',
          actorIndex: cursor.index,
          allies: this.gm.combat.allies,
          enemies: this.gm.combat.enemies,
          targetIndex,
          syntheticMove: {
            id: 'kanji-kombat-strike',
            name: 'Kanji Kombat Strike',
            nameEn: 'Kanji Kombat Strike',
            power: 15,
            element: actor.element,
            target: 'single_enemy',
            mpCost: 0,
          },
          itemBuffs: this.gm.run.itemBuffs,
          creatureParty: this.gm.run.creatureParty,
          metaMults: this.gm.run.crestMults || { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 },
        })
      : resolveNoopActorAction({
          actorSide: 'ally',
          actorIndex: cursor.index,
          allies: this.gm.combat.allies,
          enemies: this.gm.combat.enemies,
        });

    this.gm.combat.actionCount = (this.gm.combat.actionCount || 0) + 1;
    this.gm.combat.turnCount = this.gm.combat.actionCount;
    this.gm.combat.actionCursor = getNextActionCursor({
      allies: this.gm.combat.allies,
      enemies: this.gm.combat.enemies,
      previousCursor: cursor
    });

    let playbackStart = result.playbackNext || 0;
    while (
      this.gm.combat.active &&
      this.gm.combat.actionCursor?.side === 'enemy' &&
      !checkAllDefeated(this.gm.combat.enemies) &&
      !checkAllDefeated(this.gm.combat.allies)
    ) {
      const enemyResult = this._resolveCurrentPveCursor(null, playbackStart);
      result.actionSegments.push(...enemyResult.actionSegments);
      playbackStart = enemyResult.playbackNext || playbackStart + enemyResult.actionSegments.length;
    }

    return this._finalizeKanjiKombatActionResult(result);
  }

  _finalizeKanjiKombatActionResult(result) {
    const actionSegments = result.actionSegments || [];
    const flatPlayerAttacks = actionSegments.flatMap(segment =>
      segment.actor.side === 'ally' ? segment.attacks : []
    );
    const flatEnemyAttacks = actionSegments.flatMap(segment =>
      segment.actor.side === 'enemy' ? segment.attacks : []
    );
    const xpEvents = actionSegments.flatMap(segment => segment.xpEvents || []);
    const allEnemiesDown = checkAllDefeated(this.gm.combat.enemies);
    const allAlliesDown = checkAllDefeated(this.gm.combat.allies);

    if (allAlliesDown) {
      return this.gm.kanjiKombatService.finalizeDefeat({
        actionSegments,
        flatPlayerAttacks,
        flatEnemyAttacks,
        xpEvents
      });
    }

    if (allEnemiesDown) {
      return this.gm.kanjiKombatService.completeWaveAndMaybeStartNext({
        actionSegments,
        flatPlayerAttacks,
        flatEnemyAttacks,
        xpEvents
      });
    }

    const nextWork = this.gm.kanjiKombatService.queueNextPrompt();
    if (nextWork?.kind === 'complete') {
      return this.gm.kanjiKombatService.finalizeDailyComplete({
        actionSegments,
        flatPlayerAttacks,
        flatEnemyAttacks,
        xpEvents
      });
    }
    this.gm.emitState();
    return {
      actionType: 'kanjiKombat',
      actionSegments,
      playerAttacks: flatPlayerAttacks,
      enemyAttacks: flatEnemyAttacks,
      xpEvents,
      combatEnded: false,
      allies: this.gm.combat.allies,
      enemies: this.gm.combat.enemies,
      creatureParty: this.gm.run.creatureParty,
      kanjiKombat: this.gm.run.kanjiKombat
    };
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
    this.gm.combat.befriendAttemptedSlots = {};

    // Party skills: round-start (Erosion, Momentum, Overflow Vitality)
    const roundStartEvents = applyRoundStartSkills({
      allies: this.gm.combat.allies,
      enemies: this.gm.combat.enemies,
      runPartySkills: this.gm.run.partySkills,
      combat: this.gm.combat
    });

    const metaMults = this.gm.run.crestMults || { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 };
    const poisonXpEvents = this._collectPoisonKoXpEvents(effectEvents, metaMults);
    const poisonTerminal = this._finishPoisonTerminalIfNeeded('attack', effectEvents, roundStartEvents, poisonXpEvents);
    if (poisonTerminal) return poisonTerminal;

    const playerResult = processInterleavedPvERound(
      this.gm.combat.allies,
      this.gm.combat.enemies,
      moveChoices,
      this.gm.run.itemBuffs,
      this.gm.run.creatureParty,
      metaMults,
      { runPartySkills: this.gm.run.partySkills, combat: this.gm.combat }
    );
    playerResult.xpEvents = [...poisonXpEvents, ...(playerResult.xpEvents || [])];

    // Interleaved combat applies party skills inside each player initiative slot
    // so chain kills can prevent later enemy turns. Keep this fallback for any
    // non-interleaved caller shape.
    if (!playerResult.partySkillsAppliedInline) {
      applyPartySkillsAfterPlayerAttacks({
        attacks: playerResult.attacks,
        allies: this.gm.combat.allies,
        enemies: this.gm.combat.enemies,
        runPartySkills: this.gm.run.partySkills,
        combat: this.gm.combat
      });
    }

    // Re-check allEnemiesDefeated after party skills (Arc Strike chain can finish off remaining enemies)
    if (!playerResult.allEnemiesDefeated) {
      playerResult.allEnemiesDefeated = this.gm.combat.enemies.every(e => !e || e.hp <= 0);
    }

    // Award credits for kills
    if (playerResult.xpEvents?.length > 0) {
      const killCredits = playerResult.xpEvents.length * CREDITS_PER_KILL;
      this.gm.run.player.credits = (this.gm.run.player.credits || 0) + killCredits;
    }

    // Pick combat barks server-side
    let barks = [];
    const barkPool = getBarkPool();
    if (barkPool && Object.keys(barkPool).length > 0 && this.gm.userId) {
      const knownWords = new Set(getKnownWordsFromFsrs(this.gm.userId));
      if (!this.gm.combat.usedBarks) this.gm.combat.usedBarks = new Set();

      // Determine triggers from this round
      const triggers = ['onAttack']; // Player always attacks in attack turn
      const allyTookDamage = (playerResult.enemyAttacks || []).some(a => a.damage > 0);
      if (allyTookDamage) triggers.push('onHit');
      const allyKOd = (playerResult.enemyAttacks || []).some(a => a.targetDefeated);
      if (allyKOd) triggers.push('onKO');
      if (playerResult.allEnemiesDefeated) triggers.push('onVictory');
      const allyLowHp = this.gm.combat.allies.some(a => a && a.hp > 0 && a.hp / a.maxHp < 0.25);
      if (allyLowHp) triggers.push('onLowHP');

      for (const trigger of triggers) {
        if (Math.random() >= 0.25) continue; // 25% chance per trigger
        const bark = selectBark(barkPool, trigger, knownWords, { usedThisCombat: this.gm.combat.usedBarks, dict: getWordDict() });
        if (bark) {
          barks.push({ trigger, text: bark.raw, tokens: bark.tokens || [], words: bark.words || [] });
          this.gm.combat.usedBarks.add(bark.raw);
        }
      }
    }

    // Check if all enemies defeated after player attack
    if (playerResult.allEnemiesDefeated) {
      // Befriend quiz trigger: 25% chance when killing blow would end combat
      // Not for boss fights or NPC battles
      // New player protection: guarantee befriend when player only has 1 creature
      const totalOwnedCreatures = this.gm.run.creatureParty.active.length + (this.gm.run.creatureParty.reserves?.length || 0);
      const guaranteeBefriend = totalOwnedCreatures <= 1 || shouldProtectBefriend(this.gm.meta);
      const forceBefriend = this.gm._debugForceBefriend === true;
      const befriendEligible = !this.gm.combat.isBoss && !this.gm.combat.npcId;
      const befriendTriggerRoll = befriendEligible
        ? shouldTriggerBefriendQuiz(this.gm.combat.enemies, { guaranteed: guaranteeBefriend, force: forceBefriend })
        : false;
      if (befriendEligible && befriendTriggerRoll) {
        // Find the creature killed by the player's last killing blow
        const killingAttacks = (playerResult.attacks || []).filter(a => a.targetDefeated);
        const lastKillAtk = killingAttacks[killingAttacks.length - 1];
        const lastKilled = lastKillAtk
          ? this.gm.combat.enemies[lastKillAtk.targetIndex]
          : [...this.gm.combat.enemies].reverse().find(e => e.hp <= 0 && !e.befriended);
        if (lastKilled) {
          lastKilled.hp = 1;
          const targetIndex = this.gm.combat.enemies.indexOf(lastKilled);

          // Un-award the XP for this creature (it didn't actually die)
          // The xpEvents for this creature will be re-awarded if the player fights
          const revokedXpEvents = playerResult.xpEvents.filter(ev =>
            (typeof ev.enemyIndex === 'number' ? ev.enemyIndex !== targetIndex : ev.enemyId !== lastKilled.id)
          );

          // Generate the quiz
          const quiz = generateBefriendQuiz(lastKilled, this.gm.combat.enemies);
          this.gm.combat.befriendQuiz = {
            targetIndex,
            creatureId: lastKilled.id,
            triggered: true,
            options: quiz.options,
            creatureName: quiz.creatureName
          };

          // Select best befriend prompts via i+1
          const befriendFrames = getBefriendFrames();
          const befriendKnownSet = new Set(getKnownWordsFromFsrs(this.gm.userId));
          const waitPrompt = selectBestFrame(befriendFrames.wait, befriendKnownSet, { dict: getWordDict() });
          const namePrompt = selectBestFrame(befriendFrames.name, befriendKnownSet, { dict: getWordDict() });
          const successPrompt = selectBestFrame(befriendFrames.success, befriendKnownSet, { dict: getWordDict() });
          const wrongPrompt = selectBestFrame(befriendFrames.wrong, befriendKnownSet, { dict: getWordDict() });

          this.gm.emitState();
          return {
            actionType: 'attack',
            barks,
            playerAttacks: playerResult.attacks || [],
            enemyAttacks: playerResult.enemyAttacks || [],
            npcSkillAttacks: [],
            npcSkillUsed: null,
            counterAttacks: playerResult.inlineCounters || [],
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
              waitPrompt: serializeBefriendPrompt(waitPrompt),
              namePrompt: serializeBefriendPrompt(namePrompt),
              successPrompt: serializeBefriendPrompt(successPrompt),
              wrongPrompt: serializeBefriendPrompt(wrongPrompt),
            },
            combatEnded: false,
            allies: this.gm.combat.allies,
            enemies: this.gm.combat.enemies,
            creatureParty: this.gm.run.creatureParty
          };
        }
      }

      // XP already awarded per-kill during the interleaved round
      const newCollectionAdditions = this._flushPendingCaptures();

      collectElementDrops(this.gm.meta, this.gm.combat.enemies, this.gm.run?.runSummary);
      finalizeCombatVictory(this.gm.combat, this.gm.run, { meta: this.gm.meta, narrate: (t) => this.gm.narrate(t) });
      const tutorialRewards = this._collectTutorialRewards();

      this.gm.emitState();
      return {
        actionType: 'attack',
        barks,
        playerAttacks: playerResult.attacks || [],
        enemyAttacks: playerResult.enemyAttacks || [],
        npcSkillAttacks: [],
        npcSkillUsed: null,
        counterAttacks: playerResult.inlineCounters || [],
        xpEvents: playerResult.xpEvents || [],
        mpRegens: playerResult.mpRegens || [],
        effectEvents,
        roundStartEvents,
        combatEnded: true,
        victory: true,
        allies: this.gm.combat.allies,
        creatureParty: this.gm.run.creatureParty,
        enemies: this.gm.combat.enemies,
        newCollectionAdditions,
        tutorialRewards,
        elementDropsCollected: getElementDropList(this.gm.combat.enemies)
      };
    }

    // === NPC SKILL PHASE ===
    let npcSkillAttacks = [];
    let npcSkillUsed = null;
    if (this.gm.combat.npcId && this.gm.combat.npcData) {
      const fullNpc = loadNpcs()[this.gm.combat.npcId];
      if (fullNpc) {
        const skill = rollNpcSkill(fullNpc);
        if (skill) {
          const npcCombat = {
            id: fullNpc.id,
            name: fullNpc.name,
            nameEn: fullNpc.nameEn,
            attack: fullNpc.attack || 10,
            element: fullNpc.element || 'neutral',
            reading: fullNpc.reading || '',
            meaning: fullNpc.meaning || fullNpc.nameEn || ''
          };
          const skillResult = executeNpcSkill(npcCombat, skill, this.gm.combat.allies, this.gm.combat.enemies);
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
      const allAlliesKOAfterNpc = checkAllDefeated(this.gm.combat.allies);
      if (allAlliesKOAfterNpc) {
        resolveDefeat(this.gm.combat, this.gm.run, this.gm.meta, { onDefeat: () => this.gm._onRunDefeat() });
        this.gm.emitState();
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
          turnCount: this.gm.combat.turnCount,
          creatureParty: this.gm.run.creatureParty
        };
      }
    }

    // Enemy strikes already resolved in processInterleavedPvERound (level-based initiative with allies)
    const enemyResult = {
      attacks: playerResult.enemyAttacks || [],
      allAlliesDefeated: this.gm.combat.allies.every(a => !a || a.hp <= 0)
    };

    // Party skills: counter attacks (now computed inline in processInterleavedPvERound)
    const counterAttacks = playerResult.inlineCounters || [];

    // Handle KO'd allies — swap reserves in or permanently remove
    const { koSwaps: rawKoSwaps, koRemovals: rawKoRemovals } = processKOSwaps(this.gm.combat.allies, this.gm.run.creatureParty);
    const koSwaps = rawKoSwaps.map(s => ({ slot: s.index, replacement: s.replacement.nameEn }));
    const koRemovals = rawKoRemovals.map(r => ({ slot: r.index, name: r.name }));
    this.gm.combat.allies = this.gm.run.creatureParty.active;

    // Check if all enemies died during enemy phase (e.g. confusion self-hit)
    const allEnemiesDown = checkAllDefeated(this.gm.combat.enemies);
    if (allEnemiesDown) {
      const newCollectionAdditions = this._flushPendingCaptures();
      collectElementDrops(this.gm.meta, this.gm.combat.enemies, this.gm.run?.runSummary);
      finalizeCombatVictory(this.gm.combat, this.gm.run, { meta: this.gm.meta, narrate: (t) => this.gm.narrate(t) });
      const tutorialRewards = this._collectTutorialRewards();

      this.gm.emitState();
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
        allies: this.gm.combat.allies,
        creatureParty: this.gm.run.creatureParty,
        enemies: this.gm.combat.enemies,
        newCollectionAdditions,
        tutorialRewards,
        elementDropsCollected: getElementDropList(this.gm.combat.enemies)
      };
    }

    // Check defeat — only if ALL allies (including swapped-in reserves) are KO'd
    if (checkAllDefeated(this.gm.combat.allies)) {
      resolveDefeat(this.gm.combat, this.gm.run, this.gm.meta, { onDefeat: () => this.gm._onRunDefeat() });
      this.gm.emitState();
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
        turnCount: this.gm.combat.turnCount,
        creatureParty: this.gm.run.creatureParty
      };
    }

    this.gm.combat.turnCount++;
    this.gm.combat.swapPhase = true;
    this.gm.emitState();

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
      turnCount: this.gm.combat.turnCount,
      allies: this.gm.combat.allies,
      enemies: this.gm.combat.enemies,
      creatureParty: this.gm.run.creatureParty
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
    this.gm.combat.befriendAttemptedSlots = {};

    // Party skills: round-start (Erosion, Momentum, Overflow Vitality)
    const roundStartEvents = applyRoundStartSkills({
      allies: this.gm.combat.allies,
      enemies: this.gm.combat.enemies,
      runPartySkills: this.gm.run.partySkills,
      combat: this.gm.combat
    });
    const metaMults = this.gm.run.crestMults || { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 };
    const poisonXpEvents = this._collectPoisonKoXpEvents(effectEvents, metaMults);
    const poisonTerminal = this._finishPoisonTerminalIfNeeded('defend', effectEvents, roundStartEvents, poisonXpEvents);
    if (poisonTerminal) return poisonTerminal;

    processDefendTurn(this.gm.combat.allies);

    // Enemy phase (defendActive = true reduces damage)
    const enemyResult = processEnemyTurn(this.gm.combat.enemies, this.gm.combat.allies, true, this.gm.run.itemBuffs);

    // Party skills: counter attacks
    const counterAttacks = applyAfterEnemyAttacks({
      enemyAttacks: enemyResult.attacks,
      allies: this.gm.combat.allies,
      enemies: this.gm.combat.enemies,
      runPartySkills: this.gm.run.partySkills,
      combat: this.gm.combat
    }) || [];

    // Handle KO'd allies — swap reserves in or permanently remove
    const { koSwaps: rawKoSwaps, koRemovals: rawKoRemovals } = processKOSwaps(this.gm.combat.allies, this.gm.run.creatureParty);
    const koSwaps = rawKoSwaps.map(s => ({ slot: s.index, replacement: s.replacement.nameEn }));
    const koRemovals = rawKoRemovals.map(r => ({ slot: r.index, name: r.name }));
    this.gm.combat.allies = this.gm.run.creatureParty.active;

    // Check defeat — only if ALL allies (including swapped-in reserves) are KO'd
    if (checkAllDefeated(this.gm.combat.allies)) {
      resolveDefeat(this.gm.combat, this.gm.run, this.gm.meta, { onDefeat: () => this.gm._onRunDefeat() });
      this.gm.emitState();
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
        turnCount: this.gm.combat.turnCount,
        creatureParty: this.gm.run.creatureParty
      };
    }

    this.gm.combat.turnCount++;
    this.gm.combat.swapPhase = true;
    this.gm.emitState();

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
      turnCount: this.gm.combat.turnCount,
      allies: this.gm.combat.allies,
      enemies: this.gm.combat.enemies,
      creatureParty: this.gm.run.creatureParty
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
    if (this.gm.combat.isBoss) {
      const bossId = this.gm.combat.enemies?.[0]?.id;
      if (!this.gm.run.bossesDefeated?.includes(bossId)) {
        this.gm.combat.befriendAttemptedSlots = {};
        return {
          actionType: 'befriend',
          befriend: { success: false, reason: 'boss_first_defeat' },
          effectEvents,
          roundStartEvents: [],
          combatEnded: false,
          allies: this.gm.combat.allies,
          enemies: this.gm.combat.enemies,
          creatureParty: this.gm.run.creatureParty
        };
      }
    }

    // Party skills: round-start (Erosion, Momentum, Overflow Vitality)
    const roundStartEvents = applyRoundStartSkills({
      allies: this.gm.combat.allies,
      enemies: this.gm.combat.enemies,
      runPartySkills: this.gm.run.partySkills,
      combat: this.gm.combat
    });
    const metaMults = this.gm.run.crestMults || { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 };
    const poisonXpEvents = this._collectPoisonKoXpEvents(effectEvents, metaMults);
    const poisonTerminal = this._finishPoisonTerminalIfNeeded('befriend', effectEvents, roundStartEvents, poisonXpEvents);
    if (poisonTerminal) return poisonTerminal;

    const targetIdx =
      typeof this.gm.combat.befriendConversation?.targetEnemyIndex === 'number'
        ? this.gm.combat.befriendConversation.targetEnemyIndex
        : this.gm.combat.lastBefriendTargetIndex;
    if (typeof targetIdx === 'number') this.gm.combat.lastBefriendTargetIndex = targetIdx;
    const befriendResult = processBefriend(this.gm.combat.enemies, this.gm.run.creatureParty, targetIdx);

    // Captured last enemy — immediate victory
    if (befriendResult.success && befriendResult.allEnemiesDefeated) {
      awardBattleXp(this.gm.run.creatureParty, this.gm.run.crestMults || { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 }, this.gm.run.itemBuffs);
      const newCollectionAdditions = this._flushPendingCaptures();

      collectElementDrops(this.gm.meta, this.gm.combat.enemies, this.gm.run?.runSummary);
      finalizeCombatVictory(this.gm.combat, this.gm.run, { meta: this.gm.meta, narrate: (t) => this.gm.narrate(t) });
      const tutorialRewards = this._collectTutorialRewards();

      this.gm.emitState();
      return {
        actionType: 'befriend',
        befriend: befriendResult,
        effectEvents,
        roundStartEvents,
        combatEnded: true,
        victory: true,
        creatureParty: this.gm.run.creatureParty,
        enemies: this.gm.combat.enemies,
        newCollectionAdditions,
        tutorialRewards,
        elementDropsCollected: getElementDropList(this.gm.combat.enemies)
      };
    }

    // Enemy phase
    const enemyResult = processEnemyTurn(this.gm.combat.enemies, this.gm.combat.allies, false, this.gm.run.itemBuffs);

    // Party skills: counter attacks
    const counterAttacks = applyAfterEnemyAttacks({
      enemyAttacks: enemyResult.attacks,
      allies: this.gm.combat.allies,
      enemies: this.gm.combat.enemies,
      runPartySkills: this.gm.run.partySkills,
      combat: this.gm.combat
    }) || [];

    // Handle KO'd allies — swap reserves in or permanently remove
    const { koSwaps: rawKoSwaps, koRemovals: rawKoRemovals } = processKOSwaps(this.gm.combat.allies, this.gm.run.creatureParty);
    const koSwaps = rawKoSwaps.map(s => ({ slot: s.index, replacement: s.replacement.nameEn }));
    const koRemovals = rawKoRemovals.map(r => ({ slot: r.index, name: r.name }));
    this.gm.combat.allies = this.gm.run.creatureParty.active;

    // Check defeat — only if ALL allies (including swapped-in reserves) are KO'd
    if (checkAllDefeated(this.gm.combat.allies)) {
      resolveDefeat(this.gm.combat, this.gm.run, this.gm.meta, { onDefeat: () => this.gm._onRunDefeat() });
      this.gm.emitState();
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
        turnCount: this.gm.combat.turnCount,
        creatureParty: this.gm.run.creatureParty
      };
    }

    this.gm.combat.turnCount++;
    this.gm.combat.swapPhase = true;
    this.gm.combat.befriendAttemptedSlots = {};
    this.gm.emitState();

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
      turnCount: this.gm.combat.turnCount,
      allies: this.gm.combat.allies,
      enemies: this.gm.combat.enemies,
      creatureParty: this.gm.run.creatureParty
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
    if (this.gm.run?.postCombatShop?.active) {
      return { items: this.gm.run.postCombatShop.items };
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
    if (!this.gm.run) throw new Error('No run');
    const items = this.gm.run._pendingShopItems;
    if (!items || !items[itemIndex]) throw new Error('Invalid shop item');

    const selectedItem = items[itemIndex];
    const totalEncounters = this.gm.run.currentAreaEncounters || 0;
    const enemyLevel = getEnemyLevel({ totalEncounters });
    const applyResult = applyItem(selectedItem, this.gm.run.creatureParty, null, targetIndex, { enemyLevel });
    this.gm.run._pendingShopItems = null;
    this.gm.run.postCombatShop = null;

    if (this.gm.run?.runSummary) {
      this.gm.run.runSummary.itemsCollected++;
    }
    if (this.gm.meta && selectedItem?.id) {
      if (!this.gm.meta.itemsDiscovered) this.gm.meta.itemsDiscovered = [];
      if (!this.gm.meta.itemsDiscovered.includes(selectedItem.id)) {
        this.gm.meta.itemsDiscovered.push(selectedItem.id);
      }
    }

    this.gm.emitState();
    return {
      selected: selectedItem,
      creatureParty: this.gm.run.creatureParty
    };
  }

  /**
   * Swap an active creature with a reserve
   * @param {number} activeIndex - Index in creatureParty.active (0-2)
   * @param {number} reserveIndex - Index in creatureParty.reserves (0-2)
   * @returns {Object} Result with updated party and whether enemy attacks
   */
  swapCreature(activeIndex, reserveIndex) {
    if (!this.gm.combat?.active) throw new Error('No active combat');
    if (!this.gm.run?.creatureParty) throw new Error('No creature party');

    const party = this.gm.run.creatureParty;
    if (!party.active[activeIndex]) throw new Error('Invalid active creature index');
    if (!party.reserves[reserveIndex]) throw new Error('Invalid reserve creature index');

    // Perform the swap
    const temp = party.active[activeIndex];
    party.active[activeIndex] = party.reserves[reserveIndex];
    party.reserves[reserveIndex] = temp;

    // Refresh combat allies reference
    this.gm.combat.allies = party.active;

    const isFreeSwap = this.gm.combat.swapPhase;

    if (!isFreeSwap) {
      // Paid swap: enemy attacks, no player action
      const enemyResult = processEnemyTurn(
        this.gm.combat.enemies,
        this.gm.combat.allies,
        false,
        this.gm.run.itemBuffs
      );

      // Handle KO'd allies after enemy attack
      processKOSwaps(this.gm.combat.allies, this.gm.run.creatureParty);
      this.gm.combat.allies = this.gm.run.creatureParty.active;

      // Check defeat
      const allAlliesKO = checkAllDefeated(this.gm.combat.allies);
      if (allAlliesKO) {
        resolveDefeat(this.gm.combat, this.gm.run, this.gm.meta, { onDefeat: () => this.gm._onRunDefeat() });
      }

      this.gm.combat.turnCount++;
      this.gm.emitState();

      return {
        swapped: true,
        freeSwap: false,
        enemyAttacks: enemyResult.attacks,
        combatEnded: allAlliesKO,
        victory: false,
        creatureParty: party,
        allies: this.gm.combat.allies,
        enemies: this.gm.combat.enemies
      };
    }

    this.gm.emitState();
    return {
      swapped: true,
      freeSwap: true,
      creatureParty: party,
      allies: this.gm.combat.allies,
      enemies: this.gm.combat.enemies
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
    if (!this.gm.run?.creatureParty) throw new Error('No creature party');
    const party = this.gm.run.creatureParty;
    if (!party.active[indexA]) throw new Error('Invalid creature index A');
    if (!party.active[indexB]) throw new Error('Invalid creature index B');

    // Swap positions
    const temp = party.active[indexA];
    party.active[indexA] = party.active[indexB];
    party.active[indexB] = temp;

    // Refresh combat allies reference if in combat
    if (this.gm.combat?.active) {
      this.gm.combat.allies = party.active;
    }

    this.gm.emitState();
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
    if (!this.gm.run?.creatureParty) throw new Error('No creature party');
    const party = this.gm.run.creatureParty;
    if (!party.active[activeIndex]) throw new Error('Invalid active creature index');
    if (!party.reserves[reserveIndex]) throw new Error('Invalid reserve creature index');

    // Perform the swap
    const temp = party.active[activeIndex];
    party.active[activeIndex] = party.reserves[reserveIndex];
    party.reserves[reserveIndex] = temp;

    this.gm.emitState();
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
    if (!this.gm.combat?.active) throw new Error('No active combat');
    if (!this.gm.run?.creatureParty) throw new Error('No creature party');

    const party = this.gm.run.creatureParty;
    const enemies = this.gm.combat.enemies;

    // Use the stored target from the befriend conversation
    const targetIdx = this.gm.combat.lastBefriendTargetIndex;
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

    // Create a clean copy for when it joins the party after combat.
    // Fresh uid: the party-bound copy is a new conceptual instance, not an alias
    // of the defeated enemy shell still sitting in combat.enemies[].
    const capturedCopy = { ...captured, uid: crypto.randomUUID(), hp: captured.maxHp, befriended: false };
    // Release the old creature and queue the captured one for post-combat
    if (releaseFrom === 'active') {
      party.active.splice(releaseIndex, 1);
    } else {
      party.reserves.splice(releaseIndex, 1);
    }
    if (!party.pendingCaptures) party.pendingCaptures = [];
    party.pendingCaptures.push(capturedCopy);

    // Refresh combat allies reference
    this.gm.combat.allies = party.active;

    const allEnemiesDefeated = enemies.filter(e => e.hp > 0 && !e.befriended).length === 0;

    let newCollectionAdditions = [];
    let tutorialRewards = [];
    if (allEnemiesDefeated) {
      awardBattleXp(party, this.gm.run.crestMults || { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 }, this.gm.run.itemBuffs);
      newCollectionAdditions = this._flushPendingCaptures();
      collectElementDrops(this.gm.meta, enemies, this.gm.run?.runSummary);
      finalizeCombatVictory(this.gm.combat, this.gm.run, { meta: this.gm.meta, narrate: (t) => this.gm.narrate(t) });
      tutorialRewards = this._collectTutorialRewards();
    }

    this.gm.emitState();
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
      tutorialRewards,
      elementDropsCollected: allEnemiesDefeated ? getElementDropList(enemies) : []
    };
  }

  // ============ BEFRIEND NAME QUIZ ============

  /**
   * Get the current befriend quiz state (for the /befriend-quiz route)
   * @returns {object|null}
   */
  getBefriendQuiz() {
    if (!this.gm.combat?.befriendQuiz) return null;
    const quiz = this.gm.combat.befriendQuiz;
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
    if (!this.gm.combat?.befriendQuiz) {
      return { error: 'No active befriend quiz' };
    }

    const tutorialProtect = shouldProtectBefriend(this.gm.meta);
    const result = processBefriendQuizAnswer(answerId, this.gm.combat, this.gm.run.creatureParty, { tutorialProtect });

    // Tutorial step 1 → 2: advance after successful befriend
    if (result.correct && shouldProtectBefriend(this.gm.meta)) {
      advanceTutorialStep(this.gm.meta);
    }

    if (result.correct && result.allEnemiesDefeated) {
      // Victory via befriend
      awardBattleXp(this.gm.run.creatureParty, this.gm.run.crestMults || { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 }, this.gm.run.itemBuffs);
      const newCollectionAdditions = this._flushPendingCaptures();

      collectElementDrops(this.gm.meta, this.gm.combat.enemies, this.gm.run?.runSummary);
      finalizeCombatVictory(this.gm.combat, this.gm.run, { meta: this.gm.meta, narrate: (t) => this.gm.narrate(t) });
      const tutorialRewards = this._collectTutorialRewards();

      this.gm.emitState();
      return {
        ...result,
        combatEnded: true,
        victory: true,
        creatureParty: this.gm.run.creatureParty,
        enemies: this.gm.combat.enemies,
        newCollectionAdditions,
        tutorialRewards,
        elementDropsCollected: getElementDropList(this.gm.combat.enemies)
      };
    }

    if (!result.correct) {
      // Wrong answer: handle KO swaps from counter-attack (intentional fix: now tracks koRemovals and compacts nulls)
      const { koSwaps: rawKoSwaps, koRemovals: rawKoRemovals } = processKOSwaps(this.gm.combat.allies, this.gm.run.creatureParty);
      const koSwaps = rawKoSwaps.map(s => ({ slot: s.index, replacement: s.replacement.nameEn }));
      const koRemovals = rawKoRemovals.map(r => ({ slot: r.index, name: r.name }));
      this.gm.combat.allies = this.gm.run.creatureParty.active;

      if (checkAllDefeated(this.gm.combat.allies)) {
        resolveDefeat(this.gm.combat, this.gm.run, this.gm.meta, { onDefeat: () => this.gm._onRunDefeat() });
      }

      this.gm.emitState();
      return {
        ...result,
        koSwaps,
        koRemovals,
        combatEnded: !this.gm.combat.active,
        victory: false,
        allies: this.gm.combat.allies,
        enemies: this.gm.combat.enemies,
        creatureParty: this.gm.run.creatureParty
      };
    }

    // Correct but not all defeated (shouldn't happen in normal flow, but handle gracefully)
    this.gm.emitState();
    return result;
  }

  /**
   * Resolve the "Fight" choice — kill the creature and finalize combat
   * @returns {object} Result
   */
  handleBefriendFight() {
    if (!this.gm.combat?.befriendQuiz) {
      return { error: 'No active befriend quiz' };
    }

    const result = resolveBefriendFight(this.gm.combat);

    if (result.allEnemiesDefeated) {
      const newCollectionAdditions = this._flushPendingCaptures();
      collectElementDrops(this.gm.meta, this.gm.combat.enemies, this.gm.run?.runSummary);
      finalizeCombatVictory(this.gm.combat, this.gm.run, { meta: this.gm.meta, narrate: (t) => this.gm.narrate(t) });
      const tutorialRewards = this._collectTutorialRewards();

      this.gm.emitState();
      return {
        killed: true,
        combatEnded: true,
        victory: true,
        creatureParty: this.gm.run.creatureParty,
        enemies: this.gm.combat.enemies,
        newCollectionAdditions,
        tutorialRewards,
        elementDropsCollected: getElementDropList(this.gm.combat.enemies)
      };
    }

    this.gm.emitState();
    return result;
  }

  /**
   * Handle befriend-talk rejection: enemy attacks, KO handling, defeat check.
   * Absorbs inline logic from combat.js befriend-talk route.
   * @returns {object} Rejection result with enemyAttacks, koSwaps, koRemovals, combatEnded
   */
  handleBefriendTalkRejection() {
    const combat = this.gm.combat;
    const run = this.gm.run;
    const enemyResult = processEnemyTurn(combat.enemies, combat.allies, false, run?.itemBuffs);
    const { koSwaps: rawSwaps, koRemovals: rawRemovals } = processKOSwaps(combat.allies, run.creatureParty);
    const koSwaps = rawSwaps.map(s => ({ slot: s.index, replacement: s.replacement.nameEn }));
    const koRemovals = rawRemovals.map(r => ({ slot: r.index, name: r.name }));
    combat.allies = run.creatureParty.active;

    let combatEnded = false;
    if (checkAllDefeated(combat.allies)) {
      resolveDefeat(combat, run, this.gm.meta, { onDefeat: () => this.gm._onRunDefeat() });
      combatEnded = true;
    }

    return {
      enemyAttacks: enemyResult.attacks || [],
      koSwaps,
      koRemovals,
      combatEnded,
      allies: combat.allies,
      enemies: combat.enemies
    };
  }
}
