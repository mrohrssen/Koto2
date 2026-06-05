import { randomBytes, randomUUID } from 'crypto';
import { createCombatState, createNewRun, ensureKanjiKombatOnboardingState } from '../state.js';
import { AREAS } from '../rooms.js';
import { createPveOpeningCursor } from '../combat/action-cursor.js';
import { applyStatChange } from '../combat/effects.js';
import { createSeededRng } from '../../shared/deterministic-rng.js';
import {
  buildAcceptedResponse,
  buildCorrectedResponse,
  hashTranscript,
  KANJI_KOMBAT_PREDICTION_MODE,
  verifyActionEnvelope,
} from '../../shared/action-protocol.js';
import { resolveKanjiKombatAnswerTurn } from '../../shared/combat/pve-turn-resolver.js';
import {
  generateEnemyCreature,
  generateEnemyCreatures,
  getEnemyLevel,
  instantiateCreatureForCombat,
  addXpToCreature,
  xpToNextLevel
} from '../creatures.js';
import { getCrestMultipliers, applyCrestBonuses } from './crest-service.js';
import {
  DAILY_NEW_LIMIT,
  getActiveScriptType,
  getDueScriptCards,
  getNewScriptCards,
  getScriptCards,
  getScriptDailyState,
  gradeScriptCard,
  markScriptDailyComplete,
  recordScriptIntro,
} from '../script-srs.js';

export const NO_DUE_DISCOVERY_CHAIN_LIMIT = 3;
const STREAK_BUFF_STATS = ['atk', 'def', 'dex'];
const STREAK_HEAL_REWARDS = {
  3: 0.20,
  9: 0.50,
};
const SOLO_OPENING_WAVES = 3;

function createServerSeed() {
  return randomBytes(16).toString('hex');
}

function createCombatId() {
  return `cmb_${randomBytes(8).toString('hex')}`;
}

export function getLocalDateKey(date = new Date()) {
  return date.toLocaleDateString('en-CA');
}

export function rollIntroInterval(random = Math.random) {
  return 3 + Math.floor(random() * 3);
}

export function createInitialKanjiKombatState({ localDate = getLocalDateKey(), random = Math.random } = {}) {
  return {
    wave: 1,
    waveReached: 1,
    streak: 0,
    highestStreak: 0,
    reviewsSinceIntro: 0,
    nextIntroAfter: rollIntroInterval(random),
    noDueDiscoveryChainCount: 0,
    noDuePracticeQueue: [],
    completionChoicePending: false,
    endlessMode: false,
    onboardingPending: false,
    localDate,
    currentQuiz: null,
    pendingIntro: null,
    report: {
      wavesCleared: 0,
      minibossesDefeated: 0,
      correctAnswers: 0,
      wrongAnswers: 0,
      cardsReviewed: 0,
      newCardsIntroduced: 0,
      scriptDeck: null,
      completedDaily: false,
    },
  };
}

function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildQuizForCard(card, answerPool, random = Math.random) {
  const distractors = shuffle(
    answerPool.filter(candidate => candidate.id !== card.id && candidate.answer !== card.answer),
    random
  ).slice(0, 3);

  if (distractors.length < 3) {
    throw new Error(`Not enough distinct answers for script quiz: ${card.type}`);
  }

  const choices = shuffle([
    { id: randomUUID(), answer: card.answer, correct: true },
    ...distractors.map(candidate => ({ id: randomUUID(), answer: candidate.answer, correct: false })),
  ], random);

  return {
    cardId: card.id,
    type: card.type,
    prompt: card.prompt,
    reading: card.reading,
    keyword: card.keyword,
    choices,
  };
}

function excludeCards(cards, excludedIds = []) {
  const excluded = new Set(excludedIds);
  return cards.filter(card => !excluded.has(card.id));
}

function sortByDueDate(cards) {
  return [...cards].sort((a, b) => {
    const aDue = a.due instanceof Date ? a.due : new Date(a.due);
    const bDue = b.due instanceof Date ? b.due : new Date(b.due);
    return aDue - bDue;
  });
}

function getEarlyReviewCards(cards, excludedIds = []) {
  return sortByDueDate(excludeCards(cards, excludedIds).filter(card => (card.reps || 0) > 0));
}

function promptForDailyCompletion(userId, state) {
  markScriptDailyComplete(userId, state.localDate);
  state.currentQuiz = null;
  state.pendingIntro = null;
  state.completionChoicePending = true;
  state.report.completedDaily = true;
  return { kind: 'completePrompt' };
}

export function chooseNextScriptWork(userId, state, opts = {}) {
  const now = opts.now || new Date();
  const random = opts.random || Math.random;
  const excludedIds = opts.excludeCardIds || [];
  const activeType = opts.activeType || getActiveScriptType(userId, opts.onboarding);
  state.report.scriptDeck = activeType;
  if (!Array.isArray(state.noDuePracticeQueue)) state.noDuePracticeQueue = [];
  state.completionChoicePending = state.completionChoicePending === true;
  state.endlessMode = state.endlessMode === true;

  if (state.completionChoicePending) {
    state.currentQuiz = null;
    state.pendingIntro = null;
    state.report.completedDaily = true;
    return { kind: 'completePrompt' };
  }

  const daily = getScriptDailyState(userId, state.localDate);
  if (daily.completed === true && !state.endlessMode) {
    state.currentQuiz = null;
    state.pendingIntro = null;
    state.report.completedDaily = true;
    return { kind: 'complete' };
  }

  const dueCards = excludeCards(getDueScriptCards(userId, activeType, now), excludedIds);
  const newCards = excludeCards(getNewScriptCards(userId, activeType), excludedIds);
  const canIntroduce = !state.endlessMode
    && daily.completed !== true
    && daily.introducedCount < DAILY_NEW_LIMIT
    && newCards.length > 0;
  const allCards = getScriptCards(userId, activeType);

  if (dueCards.length > 0 && state.reviewsSinceIntro >= state.nextIntroAfter && canIntroduce) {
    state.noDueDiscoveryChainCount = 0;
    const card = newCards[0];
    state.currentQuiz = null;
    state.pendingIntro = { cardId: card.id, card, source: 'reviewCadence' };
    return { kind: 'intro', card, source: 'reviewCadence' };
  }

  if (dueCards.length > 0) {
    state.noDueDiscoveryChainCount = 0;
    const card = dueCards[0];
    const quiz = buildQuizForCard(card, allCards, random);
    state.currentQuiz = quiz;
    state.pendingIntro = null;
    return { kind: 'quiz', card, quiz };
  }

  const noDueChainCount = state.noDueDiscoveryChainCount || 0;
  const canContinueNoDueDiscoveryBatch = state.noDuePracticeQueue.length === noDueChainCount;
  if (canIntroduce && noDueChainCount < NO_DUE_DISCOVERY_CHAIN_LIMIT && canContinueNoDueDiscoveryBatch) {
    state.noDueDiscoveryChainCount = (state.noDueDiscoveryChainCount || 0) + 1;
    const card = newCards[0];
    state.currentQuiz = null;
    state.pendingIntro = { cardId: card.id, card, source: 'noDueBatch' };
    return { kind: 'intro', card, source: 'noDueBatch' };
  }

  while (state.noDuePracticeQueue.length > 0) {
    const practiceCardId = state.noDuePracticeQueue.shift();
    if (excludedIds.includes(practiceCardId)) continue;
    const card = allCards.find(candidate => candidate.id === practiceCardId);
    if (!card) continue;
    const quiz = buildQuizForCard(card, allCards, random);
    state.currentQuiz = quiz;
    state.pendingIntro = null;
    return { kind: 'quiz', card, quiz };
  }

  if (canIntroduce) {
    state.noDueDiscoveryChainCount = 0;
    const card = newCards[0];
    state.noDueDiscoveryChainCount = 1;
    state.currentQuiz = null;
    state.pendingIntro = { cardId: card.id, card, source: 'noDueBatch' };
    return { kind: 'intro', card, source: 'noDueBatch' };
  }

  if (state.endlessMode) {
    const earlyReviewCards = getEarlyReviewCards(allCards, excludedIds);
    if (earlyReviewCards.length > 0) {
      const card = earlyReviewCards[0];
      const quiz = buildQuizForCard(card, allCards, random);
      state.currentQuiz = quiz;
      state.pendingIntro = null;
      state.completionChoicePending = false;
      return { kind: 'quiz', card, quiz, source: 'earlyReview' };
    }
  }

  return promptForDailyCompletion(userId, state);
}

export function resolveIntroChoice(userId, state, cardId, choice, opts = {}) {
  const introSource = state.pendingIntro?.source || null;
  const grade = choice === 'known' ? 'easy' : 'again';
  const graded = gradeScriptCard(userId, cardId, grade);
  if (choice === 'unknown') {
    recordScriptIntro(userId, state.localDate);
    state.report.newCardsIntroduced += 1;
  }
  state.pendingIntro = null;
  state.reviewsSinceIntro = 0;
  state.nextIntroAfter = rollIntroInterval(opts.random || Math.random);
  if (introSource === 'noDueBatch') {
    if (!Array.isArray(state.noDuePracticeQueue)) state.noDuePracticeQueue = [];
    if (!state.noDuePracticeQueue.includes(cardId)) {
      state.noDuePracticeQueue.push(cardId);
    }
  }
  const next = chooseNextScriptWork(userId, state, {
    ...opts,
    excludeCardIds: [...(opts.excludeCardIds || []), cardId],
  });
  return { graded, next };
}

function cloneCreature(creature) {
  return JSON.parse(JSON.stringify(creature));
}

function cloneCombatants(combatants = []) {
  return JSON.parse(JSON.stringify(combatants || []));
}

function healAll(allies, percent) {
  for (const ally of allies || []) {
    if (!ally || ally.hp <= 0) continue;
    ally.hp = Math.min(ally.maxHp, ally.hp + Math.ceil(ally.maxHp * percent));
  }
}

function creatureDisplayName(creature) {
  return creature?.nameEn || creature?.name || creature?.id || 'Ally';
}

function applyRandomStreakBuff(allies, random = Math.random) {
  const livingAllies = (allies || []).filter(ally => ally && ally.hp > 0);
  if (livingAllies.length === 0) return null;

  const ally = livingAllies[Math.floor(random() * livingAllies.length)];
  const stat = STREAK_BUFF_STATS[Math.floor(random() * STREAK_BUFF_STATS.length)];
  const delta = applyStatChange(ally, stat, 1);
  return {
    ally,
    stat,
    delta,
    reward: {
      type: 'statUp',
      streak: 6,
      allyId: ally.id || null,
      allyName: creatureDisplayName(ally),
      stat,
      delta,
    },
  };
}

function levelUpAllPartyCreatures(creatureParty, metaMults = null, itemBuffs = null) {
  const creatures = [
    ...(creatureParty?.active || []),
    ...(creatureParty?.reserves || []),
  ].filter(Boolean);

  for (const creature of creatures) {
    creature.level = Math.max(1, creature.level || 1);
    if (!Number.isFinite(creature.xp)) creature.xp = 0;
    addXpToCreature(creature, xpToNextLevel(creature.level), metaMults, itemBuffs);
  }
}

export class KanjiKombatService {
  constructor(gm) {
    this.gm = gm;
  }

  isOnboardingPending() {
    return this.gm.run?.mode === 'kanjiKombat'
      && this.gm.run?.kanjiKombat?.onboardingPending === true;
  }

  assertOnboardingComplete() {
    if (this.isOnboardingPending()) {
      throw new Error('Complete Kanji Kombat onboarding before continuing');
    }
  }

  chooseNextWork(state, opts = {}) {
    if (!this.gm.meta) this.gm.meta = {};
    return chooseNextScriptWork(this.gm.userId, state, {
      ...opts,
      onboarding: ensureKanjiKombatOnboardingState(this.gm.meta),
    });
  }

  startRunWithCreature(creature) {
    this.gm.run = createNewRun(this.gm.player);
    const crestMults = getCrestMultipliers(this.gm.meta);
    this.gm.run.crestMults = crestMults;
    this.gm.run.itemBuffs.xpMultiplier = crestMults.xpMult;
    this.gm.run.mode = 'kanjiKombat';
    this.gm.run.areaSelectionRequired = false;
    this.gm.run.initialSkillPick.chosenId = 'kanjiKombat';
    this.gm.run.creatureParty.active = [cloneCreature(creature)];
    this.gm.run.creatureParty.reserves = [];
    this.gm.run.creatureParty.maxTotal = 3;
    for (const ally of this.gm.run.creatureParty.active) {
      applyCrestBonuses(ally, crestMults);
    }
    this.gm.run.kanjiKombat = createInitialKanjiKombatState();
    if (!this.gm.meta) this.gm.meta = {};
    const onboarding = ensureKanjiKombatOnboardingState(this.gm.meta);
    const kk = this.gm.run.kanjiKombat;
    kk.onboardingPending = onboarding.completed !== true;
    if (!kk.onboardingPending) {
      const work = this.chooseNextWork(kk);
      if (work.kind === 'complete') {
        throw new Error('Kanji Kombat is complete for the day');
      }
      kk.currentQuiz = work.quiz || null;
      kk.pendingIntro = work.kind === 'intro'
        ? { cardId: work.card.id, card: work.card, source: work.source }
        : null;
    }
    this.spawnNextWave();
    this.gm.emitState();
    return this.gm.run.kanjiKombat;
  }

  startRunWithCreatureId(creatureId) {
    const collection = this.gm.meta?.creatureCollection || [];
    if (!collection.includes(creatureId)) {
      throw new Error('Selected creature is not unlocked');
    }
    const starter = instantiateCreatureForCombat(creatureId);
    return this.startRunWithCreature(starter);
  }

  submitOnboarding({ knowsHiragana, knowsKatakana } = {}) {
    const kk = this.gm.run?.kanjiKombat;
    if (this.gm.run?.mode !== 'kanjiKombat' || !kk?.onboardingPending) {
      throw new Error('No pending Kanji Kombat onboarding');
    }
    if (typeof knowsHiragana !== 'boolean' || typeof knowsKatakana !== 'boolean') {
      throw new Error('knowsHiragana and knowsKatakana booleans required');
    }

    if (!this.gm.meta) this.gm.meta = {};
    const onboarding = ensureKanjiKombatOnboardingState(this.gm.meta);
    onboarding.completed = true;
    onboarding.knowsHiragana = knowsHiragana;
    onboarding.knowsKatakana = knowsKatakana;
    this.gm.meta.kanjiKombatOnboarding = onboarding;

    kk.onboardingPending = false;
    kk.currentQuiz = null;
    kk.pendingIntro = null;
    const work = this.chooseNextWork(kk);
    let next = work.kind;
    if (work.kind === 'complete') {
      kk.currentQuiz = null;
      kk.pendingIntro = null;
      kk.completionChoicePending = true;
      kk.report.completedDaily = true;
      next = 'completePrompt';
    }
    kk.currentQuiz = work.quiz || null;
    kk.pendingIntro = work.kind === 'intro'
      ? { cardId: work.card.id, card: work.card, source: work.source }
      : null;
    this.gm.emitState();
    return {
      onboarding,
      next,
      kanjiKombat: kk,
      allies: this.gm.combat?.allies || [],
      enemies: this.gm.combat?.enemies || [],
      creatureParty: this.gm.run.creatureParty,
    };
  }

  submitIntroChoice(cardId, choice) {
    const state = this.gm.run?.kanjiKombat;
    if (!state) throw new Error('No active Kanji Kombat run');
    this.assertOnboardingComplete();
    if (!state.pendingIntro?.cardId) throw new Error('No pending Kanji Kombat intro');
    if (state.pendingIntro.cardId !== cardId) throw new Error('Kanji Kombat intro card mismatch');
    return resolveIntroChoice(this.gm.userId, state, cardId, choice, {
      onboarding: ensureKanjiKombatOnboardingState(this.gm.meta),
    });
  }

  hydratePendingIntroCard() {
    const kk = this.gm.run?.kanjiKombat;
    const cardId = kk?.pendingIntro?.cardId;
    if (!cardId || kk.pendingIntro.card) return kk?.pendingIntro || null;

    const card = getScriptCards(this.gm.userId).find(candidate => candidate.id === cardId);
    if (card) {
      kk.pendingIntro = { cardId: card.id, card };
    }
    return kk.pendingIntro;
  }

  submitAnswer(answerId, opts = {}) {
    const kk = this.gm.run?.kanjiKombat;
    this.assertOnboardingComplete();
    const quiz = kk?.currentQuiz;
    if (!quiz) throw new Error('No active Kanji Kombat quiz');
    const choice = quiz.choices.find(option => option.id === answerId);
    if (!choice) throw new Error('Invalid Kanji Kombat answer');

    gradeScriptCard(this.gm.userId, quiz.cardId, choice.correct ? 'good' : 'again');
    const streakReward = choice.correct ? this.recordCorrectAnswer() : null;
    if (!choice.correct) this.recordWrongAnswer();

    kk.currentQuiz = null;
    const result = this.gm.combatCycleService.resolveKanjiKombatCursorAction({
      correct: choice.correct,
      targetIndex: 0,
      rng: opts.rng,
    });
    result.kanjiAnswerCorrect = choice.correct;
    if (streakReward) result.kanjiStreakReward = streakReward;
    return result;
  }

  verifyAndCommitOptimisticAnswer(envelope = {}) {
    this.assertOnboardingComplete();
    const optimistic = this.gm.combat?.optimistic;
    if (!optimistic) {
      return buildCorrectedResponse({
        reason: 'missing_optimistic_state',
        authoritativeTranscript: null,
        authoritativeState: null,
        stateVersion: null,
        nextSeed: null,
      });
    }
    if (!optimistic.acceptedActionIds) optimistic.acceptedActionIds = {};
    if (envelope.actionId && optimistic.acceptedActionIds[envelope.actionId]) {
      return optimistic.acceptedActionIds[envelope.actionId];
    }

    const verified = verifyActionEnvelope(envelope, {
      combatId: optimistic.combatId,
      stateVersion: optimistic.stateVersion,
      seed: optimistic.nextTurnSeed,
    });
    if (!verified.ok) {
      return buildCorrectedResponse({
        reason: verified.reason,
        authoritativeTranscript: null,
        authoritativeState: null,
        stateVersion: optimistic.stateVersion,
        nextSeed: optimistic.nextTurnSeed,
      });
    }

    const predictionMode = envelope.payload?.predictionMode || envelope.predictionMode || null;
    if (predictionMode !== KANJI_KOMBAT_PREDICTION_MODE) {
      return buildCorrectedResponse({
        reason: 'unsupported_prediction_mode',
        authoritativeTranscript: null,
        authoritativeState: null,
        stateVersion: optimistic.stateVersion,
        nextSeed: optimistic.nextTurnSeed,
      });
    }

    const answerId = envelope.payload?.answerId || envelope.answerId;
    const kk = this.gm.run?.kanjiKombat;
    const quiz = kk?.currentQuiz;
    const choice = quiz?.choices?.find(option => option.id === answerId);
    if (!choice) {
      return buildCorrectedResponse({
        reason: quiz ? 'invalid_kanji_answer' : 'missing_kanji_quiz',
        authoritativeTranscript: null,
        authoritativeState: null,
        stateVersion: optimistic.stateVersion,
        nextSeed: optimistic.nextTurnSeed,
      });
    }

    let resolvedCore;
    try {
      resolvedCore = resolveKanjiKombatAnswerTurn(
        { combat: this.gm.combat, run: this.gm.run, answerCorrect: choice.correct === true },
        { seed: envelope.seed },
      );
    } catch {
      return buildCorrectedResponse({
        reason: 'prediction_resolve_failed',
        authoritativeTranscript: null,
        authoritativeState: null,
        stateVersion: optimistic.stateVersion,
        nextSeed: optimistic.nextTurnSeed,
      });
    }

    const sharedCoreHash = hashTranscript(resolvedCore.transcript);
    const committed = this.submitAnswer(answerId, { rng: createSeededRng(envelope.seed) });
    const responseOptimistic = this.gm.combat?.optimistic || optimistic;
    if (responseOptimistic === optimistic) {
      optimistic.stateVersion += 1;
      optimistic.nextTurnSeed = createServerSeed();
    }
    if (!responseOptimistic.acceptedActionIds) responseOptimistic.acceptedActionIds = {};

    const protocolPayload = sharedCoreHash === envelope.predictedHash
      ? buildAcceptedResponse({
          stateVersion: responseOptimistic.stateVersion,
          nextSeed: responseOptimistic.nextTurnSeed,
        })
      : buildCorrectedResponse({
          reason: 'transcript_mismatch',
          authoritativeTranscript: committed,
          authoritativeState: null,
          stateVersion: responseOptimistic.stateVersion,
          nextSeed: responseOptimistic.nextTurnSeed,
        });

    const response = {
      ...committed,
      ...protocolPayload,
    };
    responseOptimistic.acceptedActionIds[envelope.actionId] = response;
    return response;
  }

  resolveCompletionChoice(keepGoing) {
    const kk = this.gm.run?.kanjiKombat;
    this.assertOnboardingComplete();
    if (!kk?.completionChoicePending) {
      throw new Error('No Kanji Kombat completion choice is pending');
    }

    kk.completionChoicePending = false;
    kk.report.completedDaily = true;

    if (!keepGoing) {
      return this.finalizeDailyComplete();
    }

    kk.endlessMode = true;

    let nextWave = false;
    let nextWaveEnemies = null;
    if ((this.gm.combat?.enemies || []).length === 0
      || (this.gm.combat?.enemies || []).every(enemy => enemy.hp <= 0 || enemy.befriended)) {
      this.spawnNextWave();
      nextWave = true;
      nextWaveEnemies = cloneCombatants(this.gm.combat.enemies);
    }

    const work = this.queueNextPrompt();
    if (work?.kind === 'complete' || work?.kind === 'completePrompt') {
      kk.completionChoicePending = false;
      return this.finalizeDailyComplete();
    }

    this.gm.emitState();
    return {
      actionType: 'kanjiKombat',
      combatEnded: false,
      completionChoicePending: false,
      endlessMode: true,
      nextWave,
      nextWaveEnemies,
      kanjiKombat: this.gm.run.kanjiKombat,
      allies: this.gm.combat.allies,
      enemies: this.gm.combat.enemies,
      creatureParty: this.gm.run.creatureParty,
    };
  }

  queueNextPrompt(opts = {}) {
    const state = this.gm.run?.kanjiKombat;
    if (!state || state.onboardingPending || state.currentQuiz || state.pendingIntro) return null;
    const work = this.chooseNextWork(state, opts);
    state.currentQuiz = work.quiz || null;
    state.pendingIntro = work.kind === 'intro'
      ? { cardId: work.card.id, card: work.card, source: work.source }
      : null;
    return work;
  }

  finalizeDailyComplete({
    actionSegments = [],
    flatPlayerAttacks = [],
    flatEnemyAttacks = [],
    xpEvents = [],
    koSwaps = [],
    koRemovals = [],
    enemies = null
  } = {}) {
    this.gm.combat.active = false;
    this.gm.run.active = false;
    this.gm.run.stats.endTime = Date.now();
    this.gm.run.kanjiKombat.report.completedDaily = true;
    this.gm.run.kanjiKombat.report.defeated = false;
    this.gm.run.kanjiKombat.finalReport = this.buildReport();
    this.gm.emitState();
    return {
      actionType: 'kanjiKombat',
      actionSegments,
      playerAttacks: flatPlayerAttacks,
      enemyAttacks: flatEnemyAttacks,
      xpEvents,
      koSwaps,
      koRemovals,
      combatEnded: true,
      victory: true,
      kanjiKombatReport: this.gm.run.kanjiKombat.finalReport,
      creatureParty: this.gm.run.creatureParty,
      enemies: enemies || this.gm.combat.enemies,
    };
  }

  getAvailability() {
    const collection = this.gm.meta?.creatureCollection || [];
    if (collection.length === 0) {
      return { available: false, reason: 'no_creatures' };
    }

    const onboarding = ensureKanjiKombatOnboardingState(this.gm.meta);
    if (onboarding.completed !== true) {
      return { available: true, next: 'onboarding', scriptDeck: null };
    }

    const state = createInitialKanjiKombatState();
    const work = this.chooseNextWork(state);
    if (work.kind === 'complete' || work.kind === 'completePrompt') {
      return {
        available: false,
        reason: 'complete_for_day',
        message: 'Come back later!',
        scriptDeck: state.report.scriptDeck
      };
    }
    return {
      available: true,
      next: work.kind,
      scriptDeck: state.report.scriptDeck
    };
  }

  getUnlockedAreas() {
    const highest = this.gm.meta?.levels?.highestUnlocked || 1;
    return AREAS.filter((_, index) => index < highest);
  }

  buildEnemyPool() {
    const pool = this.getUnlockedAreas().flatMap(area => area.creatures || []);
    return [...new Set(pool)];
  }

  buildBossPool() {
    return this.getUnlockedAreas().map(area => area.bossCreatureId).filter(Boolean);
  }

  spawnNextWave() {
    const kk = this.gm.run.kanjiKombat;
    const wave = kk.wave || 1;
    kk.waveReached = Math.max(kk.waveReached || 1, wave);
    const isMiniboss = wave % 10 === 0;
    const highestLevel = Math.max(1, ...this.gm.run.creatureParty.active.map(c => c.level || 1));
    const areas = this.getUnlockedAreas();
    const stage = Math.max(1, ...areas.map(area => area.stage || 1));
    let enemies;

    if (isMiniboss && this.buildBossPool().length > 0) {
      const bossIds = this.buildBossPool();
      const bossId = bossIds[Math.floor(Math.random() * bossIds.length)];
      const bossLevel = Math.round(getEnemyLevel({ totalEncounters: wave, enemyCount: 1 }) * 1.25);
      const boss = generateEnemyCreature(Math.max(highestLevel, bossLevel), [bossId], stage);
      boss.hp = boss.maxHp = Math.max(boss.maxHp * 2, boss.hp * 2);
      enemies = [boss];
      kk.currentWaveIsMiniboss = true;
    } else {
      const maxEnemies = wave <= SOLO_OPENING_WAVES ? 1 : 3;
      enemies = generateEnemyCreatures(highestLevel, {
        maxEnemies,
        creaturePool: this.buildEnemyPool(),
        stage,
        encounterIndex: wave - 1,
        totalEncounters: wave,
      });
      kk.currentWaveIsMiniboss = false;
    }

    this.gm.combat = createCombatState(enemies[0]);
    this.gm.combat.mode = 'kanjiKombat';
    this.gm.combat.isCreatureCombat = true;
    this.gm.combat.isBoss = kk.currentWaveIsMiniboss;
    this.gm.combat.allies = this.gm.run.creatureParty.active;
    this.gm.combat.enemies = enemies;
    this.gm.combat.actionCursor = createPveOpeningCursor({ allies: this.gm.combat.allies, enemies });
    this.gm.combat.actionCount = 0;
    this.gm.combat.cycleCount = 0;
    this.gm.combat.optimistic = {
      combatId: createCombatId(),
      stateVersion: 0,
      nextTurnSeed: createServerSeed(),
      acceptedActionIds: {},
    };
    return enemies;
  }

  recordCorrectAnswer() {
    const kk = this.gm.run.kanjiKombat;
    kk.streak = (kk.streak || 0) + 1;
    kk.highestStreak = Math.max(kk.highestStreak || 0, kk.streak);
    kk.report.correctAnswers += 1;
    kk.report.cardsReviewed += 1;
    kk.reviewsSinceIntro += 1;

    let streakReward = null;

    if (STREAK_HEAL_REWARDS[kk.streak]) {
      const healPercent = STREAK_HEAL_REWARDS[kk.streak];
      healAll(this.gm.run.creatureParty.active, healPercent);
      streakReward = { type: 'teamHeal', streak: kk.streak, healPercent };
    }
    if (kk.streak === 6) {
      streakReward = applyRandomStreakBuff(this.gm.run.creatureParty.active)?.reward || null;
    }
    if (kk.streak === 12) {
      const ally = this.addRandomUnlockedAllyOrFullHeal();
      streakReward = ally
        ? {
            type: 'allyJoined',
            streak: 12,
            allyId: ally.id || null,
            allyName: creatureDisplayName(ally),
          }
        : { type: 'fullHeal', streak: 12 };
    }
    if (kk.streak === 15) {
      levelUpAllPartyCreatures(
        this.gm.run.creatureParty,
        this.gm.run.crestMults,
        this.gm.run.itemBuffs
      );
      streakReward = { type: 'partyLevelUp', streak: 15 };
      kk.streak = 0;
      kk.reviewsSinceIntro = 0;
      kk.nextIntroAfter = rollIntroInterval();
    }

    return streakReward;
  }

  recordWrongAnswer() {
    const kk = this.gm.run.kanjiKombat;
    kk.streak = 0;
    kk.report.wrongAnswers += 1;
    kk.report.cardsReviewed += 1;
  }

  addRandomUnlockedAllyOrFullHeal() {
    const active = this.gm.run.creatureParty.active;
    if (active.length >= 3) {
      healAll(active, 1);
      return null;
    }
    const activeIds = new Set(active.map(c => c.id));
    const candidates = (this.gm.meta?.creatureCollection || []).filter(id => !activeIds.has(id));
    if (candidates.length === 0) {
      healAll(active, 1);
      return null;
    }
    const id = candidates[Math.floor(Math.random() * candidates.length)];
    const ally = generateEnemyCreature(Math.max(1, active[0]?.level || 1), [id]);
    active.push(ally);
    this.gm.combat.allies = active;
    return ally;
  }

  recordWaveClear({ miniboss = false } = {}) {
    const kk = this.gm.run.kanjiKombat;
    kk.report.wavesCleared += 1;
    if (miniboss) kk.report.minibossesDefeated += 1;
    kk.wave = (kk.wave || 1) + 1;
  }

  buildReport() {
    const kk = this.gm.run.kanjiKombat;
    const report = kk.report;
    const total = report.correctAnswers + report.wrongAnswers;
    return {
      ...report,
      wave: Math.max(1, Math.floor(Number(kk.waveReached || kk.wave || report.wavesCleared + 1))),
      highestStreak: kk.highestStreak || 0,
      accuracy: total > 0 ? Math.round((report.correctAnswers / total) * 100) : 0,
      temporaryLevels: this.gm.run.creatureParty.active.map(c => ({
        id: c.id,
        nameEn: c.nameEn,
        level: c.level || 1
      })),
    };
  }

  completeWaveAndMaybeStartNext({
    actionSegments = [],
    flatPlayerAttacks = [],
    flatEnemyAttacks = [],
    xpEvents = [],
    koSwaps = [],
    koRemovals = []
  } = {}) {
    const clearedEnemies = cloneCombatants(this.gm.combat?.enemies || []);
    const wasMiniboss = this.gm.run.kanjiKombat.currentWaveIsMiniboss === true;
    this.recordWaveClear({ miniboss: wasMiniboss });
    const work = this.chooseNextWork(this.gm.run.kanjiKombat);
    if (work.kind === 'complete') {
      return this.finalizeDailyComplete({
        actionSegments,
        flatPlayerAttacks,
        flatEnemyAttacks,
        xpEvents,
        koSwaps,
        koRemovals,
        enemies: clearedEnemies
      });
    }
    if (work.kind === 'completePrompt') {
      this.gm.emitState();
      return {
        actionType: 'kanjiKombat',
        actionSegments,
        playerAttacks: flatPlayerAttacks,
        enemyAttacks: flatEnemyAttacks,
        xpEvents,
        koSwaps,
        koRemovals,
        combatEnded: false,
        completionChoicePending: true,
        kanjiKombat: this.gm.run.kanjiKombat,
        allies: this.gm.combat.allies,
        enemies: clearedEnemies,
        creatureParty: this.gm.run.creatureParty,
      };
    }

    this.spawnNextWave();
    const nextWaveEnemies = cloneCombatants(this.gm.combat.enemies);
    this.gm.run.kanjiKombat.currentQuiz = work.quiz || null;
    this.gm.run.kanjiKombat.pendingIntro = work.kind === 'intro'
      ? { cardId: work.card.id, card: work.card, source: work.source }
      : null;
    this.gm.emitState();
    return {
      actionType: 'kanjiKombat',
      actionSegments,
      playerAttacks: flatPlayerAttacks,
      enemyAttacks: flatEnemyAttacks,
      xpEvents,
      koSwaps,
      koRemovals,
      combatEnded: false,
      nextWave: true,
      kanjiKombat: this.gm.run.kanjiKombat,
      allies: this.gm.combat.allies,
      enemies: clearedEnemies,
      nextWaveEnemies,
      creatureParty: this.gm.run.creatureParty,
    };
  }

  finalizeDefeat({
    actionSegments = [],
    flatPlayerAttacks = [],
    flatEnemyAttacks = [],
    xpEvents = [],
    koSwaps = [],
    koRemovals = []
  } = {}) {
    this.gm.combat.active = false;
    this.gm.run.active = false;
    this.gm.run.stats.endTime = Date.now();
    this.gm.run.kanjiKombat.report.defeated = true;
    this.gm.run.kanjiKombat.finalReport = this.buildReport();
    this.gm.emitState();
    return {
      actionType: 'kanjiKombat',
      actionSegments,
      playerAttacks: flatPlayerAttacks,
      enemyAttacks: flatEnemyAttacks,
      xpEvents,
      koSwaps,
      koRemovals,
      combatEnded: true,
      victory: false,
      kanjiKombatReport: this.gm.run.kanjiKombat.finalReport,
      creatureParty: this.gm.run.creatureParty,
    };
  }
}
