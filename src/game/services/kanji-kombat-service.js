import { randomBytes, randomUUID } from 'crypto';
import { createCombatState, createNewRun, ensureKanjiKombatOnboardingState } from '../state.js';
import { AREAS } from '../rooms.js';
import { createPveOpeningCursor } from '../combat/action-cursor.js';
import { createSeededRng } from '../../shared/deterministic-rng.js';
import {
  advanceKanjiKombatStreakOnCorrect,
  applyKanjiKombatStreakReward,
  ensurePendingStreakRewardQueues,
  resetKanjiKombatStreakOnWrong,
  RANDOM_STREAK_REWARD_MILESTONES,
  STREAK_BUFF_STATS,
} from '../../shared/combat/kanji-kombat-streak.js';
import {
  actionReplayFingerprint,
  buildAcceptedResponse,
  buildCorrectedResponse,
  hashTranscript,
  isActionId,
  KANJI_KOMBAT_PREDICTION_MODE,
  verifyActionEnvelope,
} from '../../shared/action-protocol.js';
import {
  getActionLedgerEntry,
  rememberActionLedgerResult,
} from './action-ledger-service.js';
import { resolveKanjiKombatAnswerTurn } from '../../shared/combat/pve-turn-resolver.js';
import {
  generateEnemyCreature,
  generateEnemyCreatures,
  getEnemyLevel,
  instantiateCreatureForCombat
} from '../creatures.js';
import { getCrestMultipliers, applyCrestBonuses } from './crest-service.js';
import {
  DAILY_NEW_LIMIT,
  getDueScriptCardsForTypes,
  getEligibleScriptTypes,
  getNewScriptCards,
  getNextNewScriptCards,
  getScriptCards,
  getScriptDailyState,
  gradeScriptCard,
  markScriptDailyComplete,
  recordScriptIntro,
} from '../script-srs.js';

export const NO_DUE_DISCOVERY_CHAIN_LIMIT = 3;
export const PROMPT_BUFFER_TARGET = 60;
export const PROMPT_BUFFER_REFILL_THRESHOLD = 10;
const PROMPT_ID_PREFIX = 'kkp';
export const DAILY_COMPLETE_PROMPT_KIND = 'dailyCompletePrompt';
export const LEGACY_COMPLETE_PROMPT_KIND = 'completePrompt';

export function isDailyCompletePromptKind(kind) {
  return kind === DAILY_COMPLETE_PROMPT_KIND || kind === LEGACY_COMPLETE_PROMPT_KIND;
}

export function isDailyCompletePrompt(prompt) {
  return isDailyCompletePromptKind(prompt?.kind);
}

const SOLO_OPENING_WAVES = 3;

function createServerSeed() {
  return randomBytes(16).toString('hex');
}

export function rotateKanjiKombatSessionEpoch(kk) {
  if (!kk) return null;
  kk.sessionEpoch = `kse_${randomBytes(8).toString('hex')}`;
  return kk.sessionEpoch;
}

function createCombatId() {
  return `cmb_${randomBytes(8).toString('hex')}`;
}

export const TURN_SEED_CHAIN_TARGET = 30;
// Queue of pre-rolled upcoming waves: short per-wave seed chains (a 3-enemy wave
// clears in ~3-6 answers; spawnNextWave extends the adopted chain to the full
// target), depth capped so the queue never grows unbounded.
export const PREROLL_TURN_SEED_COUNT = 12;
export const PENDING_WAVE_QUEUE_MAX = 30;
// Pre-rolled streak-reward payload queues (statUp at 6, allyJoin at 12) are
// topped up to cover every milestone the buffered quiz prompts could reach,
// capped so ally-join payloads (full creature objects) stay small in state.
export const PENDING_STREAK_REWARD_QUEUE_MAX = 8;

export function ensureKanjiKombatTurnSeeds(combat, { target = TURN_SEED_CHAIN_TARGET } = {}) {
  const optimistic = combat?.optimistic;
  if (!optimistic) return [];
  if (!Array.isArray(optimistic.turnSeeds)
    || optimistic.turnSeeds[0] !== optimistic.nextTurnSeed) {
    optimistic.turnSeeds = optimistic.nextTurnSeed ? [optimistic.nextTurnSeed] : [];
  }
  while (optimistic.turnSeeds.length < target) {
    optimistic.turnSeeds.push(createServerSeed());
  }
  if (!optimistic.nextTurnSeed) optimistic.nextTurnSeed = optimistic.turnSeeds[0] || null;
  return optimistic.turnSeeds;
}

export function advanceKanjiKombatTurnSeeds(optimistic, { target = TURN_SEED_CHAIN_TARGET } = {}) {
  if (!optimistic) return;
  optimistic.stateVersion += 1;
  if (Array.isArray(optimistic.turnSeeds) && optimistic.turnSeeds[0] === optimistic.nextTurnSeed) {
    optimistic.turnSeeds.shift();
  } else {
    optimistic.turnSeeds = [];
  }
  while (optimistic.turnSeeds.length < target) {
    optimistic.turnSeeds.push(createServerSeed());
  }
  optimistic.nextTurnSeed = optimistic.turnSeeds[0];
}

function ensureAcceptedActionCache(optimistic) {
  if (!optimistic.acceptedActionIds || typeof optimistic.acceptedActionIds !== 'object') {
    optimistic.acceptedActionIds = Object.create(null);
  }
  return optimistic.acceptedActionIds;
}

function findAcceptedActionReplay(optimistic, envelope) {
  if (!isActionId(envelope?.actionId)) return null;
  const cache = ensureAcceptedActionCache(optimistic);
  if (!Object.hasOwn(cache, envelope.actionId)) return null;

  const cached = cache[envelope.actionId];
  if (cached?.requestFingerprint && cached.requestFingerprint === actionReplayFingerprint(envelope)) {
    return cached.response;
  }

  return buildCorrectedResponse({
    reason: 'duplicate_action_id_mismatch',
    authoritativeTranscript: null,
    authoritativeState: null,
    stateVersion: optimistic.stateVersion,
    nextSeed: optimistic.nextTurnSeed,
  });
}

function rememberAcceptedActionReplay(optimistic, envelope, response) {
  if (!isActionId(envelope?.actionId)) return;
  const cache = ensureAcceptedActionCache(optimistic);
  cache[envelope.actionId] = {
    requestFingerprint: actionReplayFingerprint(envelope),
    response,
  };
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
    promptBuffer: [],
    promptBufferSeq: 0,
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

function getAnswerPoolForCard(userId, card) {
  return getScriptCards(userId, card.type);
}

function fallbackScriptDeck(eligibleTypes, dueCards, newCards) {
  return dueCards[0]?.type || newCards[0]?.type || eligibleTypes[0] || 'kanji';
}

function completionScriptDeck(userId, state, onboarding, eligibleTypes) {
  return state.report?.scriptDeck
    || getNextNewScriptCards(userId, onboarding)[0]?.type
    || eligibleTypes[eligibleTypes.length - 1]
    || 'kanji';
}

function getNextNewScriptCardsForTypes(userId, eligibleTypes, excludedIds = []) {
  const excluded = new Set(excludedIds);
  for (const type of eligibleTypes) {
    const cards = getNewScriptCards(userId, type)
      .filter(card => !excluded.has(card.id));
    if (cards.length > 0) return cards;
  }
  return [];
}

function promptForDailyCompletion(userId, state, opts = {}) {
  if (opts.preview !== true) {
    markScriptDailyComplete(userId, state.localDate);
  }
  state.report.completedDaily = true;
  return { kind: DAILY_COMPLETE_PROMPT_KIND };
}

export function chooseNextScriptWork(userId, state, opts = {}) {
  const now = opts.now || new Date();
  const random = opts.random || Math.random;
  const excludedIds = opts.excludeCardIds || [];
  const excludedPracticeIds = opts.excludePracticeCardIds || excludedIds;
  const eligibleTypes = getEligibleScriptTypes(opts.onboarding);
  if (!Array.isArray(state.noDuePracticeQueue)) state.noDuePracticeQueue = [];
  state.endlessMode = state.endlessMode === true;

  const daily = opts.previewDailyState || getScriptDailyState(userId, state.localDate);
  if (daily.completed === true && !state.endlessMode) {
    state.report.completedDaily = true;
    state.report.scriptDeck = completionScriptDeck(userId, state, opts.onboarding, eligibleTypes);
    return { kind: 'complete' };
  }

  const dueCards = excludeCards(getDueScriptCardsForTypes(userId, eligibleTypes, now), excludedIds);
  const newCards = getNextNewScriptCardsForTypes(userId, eligibleTypes, excludedIds);
  state.report.scriptDeck = fallbackScriptDeck(eligibleTypes, dueCards, newCards);
  const canIntroduce = !state.endlessMode
    && daily.completed !== true
    && daily.introducedCount < DAILY_NEW_LIMIT
    && newCards.length > 0;
  const allEligibleCards = getScriptCards(userId)
    .filter(card => eligibleTypes.includes(card.type));

  if (dueCards.length > 0) {
    state.noDueDiscoveryChainCount = 0;
    const card = dueCards[0];
    state.report.scriptDeck = card.type;
    const quiz = buildQuizForCard(card, getAnswerPoolForCard(userId, card), random);
    return { kind: 'quiz', card, quiz };
  }

  const noDueChainCount = state.noDueDiscoveryChainCount || 0;
  const canContinueNoDueDiscoveryBatch = state.noDuePracticeQueue.length === noDueChainCount;
  if (canIntroduce && noDueChainCount < NO_DUE_DISCOVERY_CHAIN_LIMIT && canContinueNoDueDiscoveryBatch) {
    state.noDueDiscoveryChainCount = (state.noDueDiscoveryChainCount || 0) + 1;
    const card = newCards[0];
    return { kind: 'intro', card, source: 'noDueBatch' };
  }

  while (state.noDuePracticeQueue.length > 0) {
    const practiceCardId = state.noDuePracticeQueue.shift();
    if (excludedPracticeIds.includes(practiceCardId)) continue;
    const card = allEligibleCards.find(candidate => candidate.id === practiceCardId);
    if (!card) continue;
    state.report.scriptDeck = card.type;
    const quiz = buildQuizForCard(card, getAnswerPoolForCard(userId, card), random);
    return { kind: 'quiz', card, quiz };
  }

  if (canIntroduce) {
    state.noDueDiscoveryChainCount = 0;
    const card = newCards[0];
    state.noDueDiscoveryChainCount = 1;
    return { kind: 'intro', card, source: 'noDueBatch' };
  }

  if (state.endlessMode) {
    const earlyReviewCards = getEarlyReviewCards(allEligibleCards, excludedIds);
    if (earlyReviewCards.length > 0) {
      const card = earlyReviewCards[0];
      state.report.scriptDeck = card.type;
      const quiz = buildQuizForCard(card, getAnswerPoolForCard(userId, card), random);
      return { kind: 'quiz', card, quiz, source: 'earlyReview' };
    }
  }

  return promptForDailyCompletion(userId, state, opts);
}

function createPromptId(sequence) {
  return `${PROMPT_ID_PREFIX}_${sequence}_${randomBytes(6).toString('hex')}`;
}

function clonePlanningState(state) {
  return JSON.parse(JSON.stringify({
    ...state,
    promptBuffer: [],
  }));
}

function getMaxPromptSequence(buffer) {
  return buffer.reduce((max, prompt) => {
    return Number.isInteger(prompt?.sequence) ? Math.max(max, prompt.sequence) : max;
  }, 0);
}

function ensurePromptBufferState(state) {
  if (!Array.isArray(state.promptBuffer)) state.promptBuffer = [];
  const maxSequence = getMaxPromptSequence(state.promptBuffer);
  if (!Number.isInteger(state.promptBufferSeq) || state.promptBufferSeq < maxSequence) {
    state.promptBufferSeq = maxSequence;
  }
  return state.promptBuffer;
}

function nextPromptSequence(state) {
  state.promptBufferSeq = (state.promptBufferSeq || 0) + 1;
  return state.promptBufferSeq;
}

function promptFromWork(state, work) {
  const sequence = nextPromptSequence(state);
  const base = {
    promptId: createPromptId(sequence),
    sequence,
    kind: work.kind,
    cardId: work.card?.id || work.quiz?.cardId || null,
    source: work.source || null,
  };
  if (work.kind === 'quiz') {
    return { ...base, quiz: work.quiz };
  }
  if (work.kind === 'intro') {
    return {
      ...base,
      intro: {
        cardId: work.card.id,
        card: work.card,
        source: work.source || null,
      },
    };
  }
  if (isDailyCompletePromptKind(work.kind)) {
    return { ...base, kind: DAILY_COMPLETE_PROMPT_KIND, cardId: null, source: 'dailyComplete' };
  }
  return null;
}

function scriptDeckFromPrompt(prompt) {
  return prompt?.quiz?.type || prompt?.intro?.card?.type || null;
}

function syncKanjiKombatPromptBufferState(userId, state) {
  const head = getKanjiKombatActivePrompt(state);
  const activeDeck = scriptDeckFromPrompt(head);
  if (activeDeck) state.report.scriptDeck = activeDeck;
  if (isDailyCompletePrompt(head)) {
    if (userId) markScriptDailyComplete(userId, state.localDate);
    state.report.completedDaily = true;
  }
  return head;
}

function hasPromptReference(ref) {
  return !!ref
    && typeof ref === 'object'
    && (
      Object.hasOwn(ref, 'promptId')
        || Object.hasOwn(ref, 'sequence')
        || Object.hasOwn(ref, 'cardId')
    );
}

function getEnvelopePromptRef(payload = {}) {
  if (hasPromptReference(payload?.promptRef)) return payload.promptRef;
  if (!payload || typeof payload !== 'object') return null;
  const hasFlatPromptRef = Object.hasOwn(payload, 'promptId')
    || Object.hasOwn(payload, 'promptSequence')
    || Object.hasOwn(payload, 'cardId');
  if (!hasFlatPromptRef) return null;
  const ref = {};
  if (Object.hasOwn(payload, 'promptId')) ref.promptId = payload.promptId;
  if (Object.hasOwn(payload, 'promptSequence')) ref.sequence = payload.promptSequence;
  if (Object.hasOwn(payload, 'cardId')) ref.cardId = payload.cardId;
  return ref;
}

function advancePlanningStateAfterPrompt(planningState, prompt, random = Math.random) {
  if (prompt.kind === 'quiz') {
    planningState.reviewsSinceIntro = (planningState.reviewsSinceIntro || 0) + 1;
    const practiceIndex = Array.isArray(planningState.noDuePracticeQueue)
      ? planningState.noDuePracticeQueue.indexOf(prompt.cardId)
      : -1;
    if (practiceIndex !== -1) {
      planningState.noDuePracticeQueue.splice(practiceIndex, 1);
    }
    return;
  }
  if (prompt.kind === 'intro') {
    planningState.reviewsSinceIntro = 0;
    planningState.nextIntroAfter = rollIntroInterval(random);
    if (prompt.source === 'noDueBatch') {
      if (!Array.isArray(planningState.noDuePracticeQueue)) planningState.noDuePracticeQueue = [];
      if (!planningState.noDuePracticeQueue.includes(prompt.cardId)) {
        planningState.noDuePracticeQueue.push(prompt.cardId);
      }
      planningState.noDueDiscoveryChainCount = Math.max(
        planningState.noDueDiscoveryChainCount || 0,
        planningState.noDuePracticeQueue.length
      );
    }
    return;
  }
  if (isDailyCompletePrompt(prompt)) {
    planningState.endlessMode = true;
    planningState.report.completedDaily = true;
    return;
  }
}

function advancePreviewDailyStateAfterPrompt(previewDailyState, prompt) {
  if (!previewDailyState) return;
  if (prompt.kind === 'intro') {
    previewDailyState.speculativeIntroducedCount = (previewDailyState.speculativeIntroducedCount || 0) + 1;
    previewDailyState.introducedCount = Math.min(
      DAILY_NEW_LIMIT,
      (previewDailyState.introducedCount || 0) + 1
    );
    return;
  }
  if (isDailyCompletePrompt(prompt)) {
    previewDailyState.completed = true;
  }
}

function createPreviewDailyState(userId, state, opts = {}) {
  const daily = opts.previewDailyState || getScriptDailyState(userId, state.localDate);
  const introducedCount = daily.introducedCount || 0;
  return {
    date: daily.date || state.localDate,
    introducedCount,
    committedIntroducedCount: daily.committedIntroducedCount ?? introducedCount,
    speculativeIntroducedCount: daily.speculativeIntroducedCount || 0,
    completed: daily.completed === true,
  };
}

function isSpeculativeDailyCompletion(work, previewDailyState) {
  return isDailyCompletePromptKind(work?.kind)
    && previewDailyState
    && (previewDailyState.committedIntroducedCount || 0) < DAILY_NEW_LIMIT
    && (previewDailyState.speculativeIntroducedCount || 0) > 0
    && (previewDailyState.introducedCount || 0) >= DAILY_NEW_LIMIT;
}

function isBufferedCompletionAuthoritative(userId, state, opts = {}) {
  if (state?.endlessMode) return false;
  const daily = getScriptDailyState(userId, state.localDate);
  if (daily.completed === true || (daily.introducedCount || 0) >= DAILY_NEW_LIMIT) {
    return true;
  }

  const eligibleTypes = getEligibleScriptTypes(opts.onboarding);
  const now = opts.now || new Date();
  const hasDueCards = getDueScriptCardsForTypes(userId, eligibleTypes, now).length > 0;
  const hasNewCards = getNextNewScriptCards(userId, opts.onboarding).length > 0;
  const hasPracticeCards = Array.isArray(state.noDuePracticeQueue) && state.noDuePracticeQueue.length > 0;
  return !hasDueCards && !hasNewCards && !hasPracticeCards;
}

export function getKanjiKombatActivePrompt(state) {
  return Array.isArray(state?.promptBuffer) ? state.promptBuffer[0] || null : null;
}

export function validateKanjiKombatPromptHead(state, ref = {}) {
  const head = getKanjiKombatActivePrompt(state);
  if (!head) throw new Error('No active Kanji Kombat prompt');
  if (Object.hasOwn(ref, 'promptId') && head.promptId !== ref.promptId) {
    throw new Error('Kanji Kombat prompt mismatch');
  }
  if (Object.hasOwn(ref, 'sequence') && head.sequence !== ref.sequence) {
    throw new Error('Kanji Kombat prompt mismatch');
  }
  if (Object.hasOwn(ref, 'kind') && head.kind !== ref.kind) {
    throw new Error('Kanji Kombat prompt mismatch');
  }
  if (Object.hasOwn(ref, 'cardId') && head.cardId !== ref.cardId) {
    throw new Error('Kanji Kombat prompt mismatch');
  }
  return head;
}

export function consumeKanjiKombatPromptHead(state, ref = {}, opts = {}) {
  const head = validateKanjiKombatPromptHead(state, ref);
  if (isDailyCompletePrompt(head)) {
    if (opts.userId) markScriptDailyComplete(opts.userId, state.localDate);
    state.report.completedDaily = true;
  }
  state.promptBuffer.shift();
  syncKanjiKombatPromptBufferState(opts.userId, state);
  return head;
}

export function fillKanjiKombatPromptBuffer(userId, state, opts = {}) {
  const buffer = ensurePromptBufferState(state);
  const target = Number.isInteger(opts.target) && opts.target > 0
    ? opts.target
    : PROMPT_BUFFER_TARGET;
  const terminalIndex = buffer.findIndex(isDailyCompletePrompt);
  if (terminalIndex !== -1 && !isBufferedCompletionAuthoritative(userId, state, opts)) {
    buffer.splice(terminalIndex);
  }
  if (buffer.length >= target) {
    return buffer;
  }

  const random = opts.random || Math.random;
  const planningState = clonePlanningState(state);
  planningState.promptBuffer = [];
  const previewDailyState = createPreviewDailyState(userId, state, opts);
  const baseExcludeCardIds = opts.excludeCardIds || [];
  const excludedIds = new Set([
    ...baseExcludeCardIds,
    ...buffer.map(prompt => prompt.cardId).filter(Boolean),
  ]);
  const excludedPracticeIds = opts.excludePracticeCardIds || baseExcludeCardIds;
  let dailyBoundaryQueued = buffer.some(isDailyCompletePrompt);

  for (const prompt of buffer) {
    advancePlanningStateAfterPrompt(planningState, prompt, random);
    advancePreviewDailyStateAfterPrompt(previewDailyState, prompt);
  }

  while (buffer.length < target) {
    const work = chooseNextScriptWork(userId, planningState, {
      ...opts,
      random,
      preview: true,
      previewDailyState,
      excludeCardIds: [...excludedIds],
      excludePracticeCardIds: excludedPracticeIds,
    });
    if (work.kind === 'complete') break;
    if (isSpeculativeDailyCompletion(work, previewDailyState)) break;
    if (isDailyCompletePromptKind(work.kind)) {
      if (dailyBoundaryQueued) break;
      dailyBoundaryQueued = true;
    }
    const prompt = promptFromWork(state, work);
    if (!prompt) break;
    buffer.push(prompt);
    if (prompt.cardId) excludedIds.add(prompt.cardId);
    advancePlanningStateAfterPrompt(planningState, prompt, random);
    advancePreviewDailyStateAfterPrompt(previewDailyState, prompt);
  }

  const activeDeck = scriptDeckFromPrompt(getKanjiKombatActivePrompt(state));
  if (activeDeck) state.report.scriptDeck = activeDeck;
  return buffer;
}

export function resolveIntroChoice(userId, state, cardId, choice, opts = {}) {
  const introSource = opts.introSource || opts.source || null;
  const grade = choice === 'known' ? 'easy' : 'again';
  const graded = gradeScriptCard(userId, cardId, grade);
  if (choice === 'unknown') {
    recordScriptIntro(userId, state.localDate);
    state.report.newCardsIntroduced += 1;
  }
  state.reviewsSinceIntro = 0;
  state.nextIntroAfter = rollIntroInterval(opts.random || Math.random);
  if (introSource === 'noDueBatch') {
    if (!Array.isArray(state.noDuePracticeQueue)) state.noDuePracticeQueue = [];
    if (!state.noDuePracticeQueue.includes(cardId)) {
      state.noDuePracticeQueue.push(cardId);
    }
    state.noDueDiscoveryChainCount = Math.max(
      state.noDueDiscoveryChainCount || 0,
      state.noDuePracticeQueue.length
    );
  }
  if (opts.queueNext === false) {
    return { graded, next: null };
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

  refillPromptBuffer(opts = {}) {
    const state = this.gm.run?.kanjiKombat;
    if (!state || state.onboardingPending) return [];
    const prompts = fillKanjiKombatPromptBuffer(this.gm.userId, state, {
      ...opts,
      onboarding: ensureKanjiKombatOnboardingState(this.gm.meta),
    });
    if (this.gm.combat?.mode === 'kanjiKombat') {
      ensureKanjiKombatTurnSeeds(this.gm.combat);
      this.ensurePendingNextWaves();
    }
    this.ensurePendingStreakRewards();
    return prompts;
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
    rotateKanjiKombatSessionEpoch(this.gm.run.kanjiKombat);
    if (!this.gm.meta) this.gm.meta = {};
    const onboarding = ensureKanjiKombatOnboardingState(this.gm.meta);
    const kk = this.gm.run.kanjiKombat;
    kk.onboardingPending = onboarding.completed !== true;
    if (!kk.onboardingPending) {
      this.refillPromptBuffer();
      const head = getKanjiKombatActivePrompt(kk);
      if (!head) {
        throw new Error('Kanji Kombat is complete for the day');
      }
      if (isDailyCompletePrompt(head)) {
        throw new Error('Kanji Kombat is complete for the day');
      }
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
    this.refillPromptBuffer();
    const head = getKanjiKombatActivePrompt(kk);
    if (isDailyCompletePrompt(head)) {
      syncKanjiKombatPromptBufferState(this.gm.userId, kk);
    }
    let next = head?.kind || DAILY_COMPLETE_PROMPT_KIND;
    if (!head) {
      const completionPrompt = promptFromWork(kk, { kind: DAILY_COMPLETE_PROMPT_KIND });
      if (completionPrompt) ensurePromptBufferState(kk).push(completionPrompt);
      syncKanjiKombatPromptBufferState(this.gm.userId, kk);
      kk.report.completedDaily = true;
      next = DAILY_COMPLETE_PROMPT_KIND;
    }
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

  submitIntroChoice(cardId, choice, promptRef = {}, { preserveBuffer = false } = {}) {
    const state = this.gm.run?.kanjiKombat;
    if (!state) throw new Error('No active Kanji Kombat run');
    this.assertOnboardingComplete();
    const activePrompt = getKanjiKombatActivePrompt(state);
    const hasSuppliedPromptRef = hasPromptReference(promptRef);
    const prompt = hasSuppliedPromptRef
      ? validateKanjiKombatPromptHead(state, {
          ...promptRef,
          kind: 'intro',
        })
      : activePrompt?.kind === 'intro' && activePrompt.cardId === cardId
        ? validateKanjiKombatPromptHead(state, { cardId, kind: 'intro' })
        : null;
    const pending = prompt
      ? { cardId: prompt.cardId, card: prompt.intro.card, source: prompt.source || prompt.intro.source || null }
      : null;
    if (!pending?.cardId) throw new Error('No pending Kanji Kombat intro');
    if (pending.cardId !== cardId) throw new Error('Kanji Kombat intro card mismatch');
    const result = resolveIntroChoice(this.gm.userId, state, cardId, choice, {
      onboarding: ensureKanjiKombatOnboardingState(this.gm.meta),
      introSource: pending.source,
      queueNext: prompt ? false : true,
    });
    if (prompt) {
      consumeKanjiKombatPromptHead(state, prompt, { userId: this.gm.userId });
      // When processing a pre-planned session entry (preserveBuffer=true), the
      // remaining buffer was generated by the client and already includes the
      // right subsequent quizzes for the introduced card — do not wipe it.
      if (!preserveBuffer) state.promptBuffer = [];
    }
    if (!preserveBuffer) this.refillPromptBuffer({ excludeCardIds: [cardId] });
    return result;
  }

  submitAnswer(answerId, opts = {}) {
    const kk = this.gm.run?.kanjiKombat;
    this.assertOnboardingComplete();
    const activePrompt = getKanjiKombatActivePrompt(kk);
    const hasSuppliedPromptRef = hasPromptReference(opts.promptRef);
    const prompt = hasSuppliedPromptRef
      ? validateKanjiKombatPromptHead(kk, {
          ...opts.promptRef,
          kind: 'quiz',
        })
      : activePrompt?.kind === 'quiz'
        ? validateKanjiKombatPromptHead(kk, {
          kind: 'quiz',
          cardId: activePrompt.cardId,
        })
        : null;
    const quiz = prompt?.quiz || null;
    if (!quiz) throw new Error('No active Kanji Kombat quiz');
    const choice = quiz.choices.find(option => option.id === answerId);
    if (!choice) throw new Error('Invalid Kanji Kombat answer');

    gradeScriptCard(this.gm.userId, quiz.cardId, choice.correct ? 'good' : 'again');
    if (choice.correct) this.recordCorrectAnswer({ applyReward: false });
    if (!choice.correct) this.recordWrongAnswer();

    if (prompt) consumeKanjiKombatPromptHead(kk, prompt, { userId: this.gm.userId });
    this.refillPromptBuffer({ excludeCardIds: [quiz.cardId] });
    const result = this.gm.combatCycleService.resolveKanjiKombatCursorAction({
      correct: choice.correct,
      targetIndex: 0,
      rng: opts.rng,
      xpRng: opts.xpRng,
      deferXpAwards: opts.deferXpAwards === true,
    });
    const streakReward = choice.correct ? this.applyCurrentStreakReward() : null;
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
    const acceptedReplay = findAcceptedActionReplay(optimistic, envelope);
    if (acceptedReplay) return acceptedReplay;

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
    const promptRef = getEnvelopePromptRef(envelope.payload);
    const prompt = hasPromptReference(promptRef)
      ? validateKanjiKombatPromptHead(kk, {
          ...promptRef,
          kind: 'quiz',
        })
      : null;
    const quiz = prompt?.quiz || null;
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
    if (sharedCoreHash !== envelope.predictedHash) {
      console.error(`[KanjiKombat] transcript mismatch (live) seed=${envelope.seed} serverHash=${sharedCoreHash} clientHash=${envelope.predictedHash}`);
    }
    const committed = this.submitAnswer(answerId, {
      promptRef: prompt ? {
        promptId: prompt.promptId,
        sequence: prompt.sequence,
        cardId: prompt.cardId,
      } : null,
      rng: createSeededRng(envelope.seed),
      xpRng: createSeededRng(`${envelope.seed}:xp`),
      deferXpAwards: true,
    });
    const responseOptimistic = this.gm.combat?.optimistic || optimistic;
    if (responseOptimistic === optimistic) {
      advanceKanjiKombatTurnSeeds(optimistic);
    } else {
      ensureKanjiKombatTurnSeeds(this.gm.combat);
    }
    ensureAcceptedActionCache(responseOptimistic);

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
    rememberAcceptedActionReplay(responseOptimistic, envelope, response);
    return response;
  }

  resolveCompletionChoice(keepGoing, promptRef = {}) {
    const kk = this.gm.run?.kanjiKombat;
    this.assertOnboardingComplete();
    const activePrompt = getKanjiKombatActivePrompt(kk);
    const expectedCompletionKind = isDailyCompletePrompt(activePrompt)
      ? activePrompt.kind
      : DAILY_COMPLETE_PROMPT_KIND;
    const prompt = hasPromptReference(promptRef)
      ? validateKanjiKombatPromptHead(kk, {
          ...promptRef,
          kind: expectedCompletionKind,
        })
      : isDailyCompletePrompt(activePrompt)
        ? validateKanjiKombatPromptHead(kk, { kind: activePrompt.kind })
        : null;
    if (!isDailyCompletePrompt(prompt)) {
      throw new Error('No Kanji Kombat completion choice is pending');
    }

    kk.report.completedDaily = true;
    consumeKanjiKombatPromptHead(kk, prompt, { userId: this.gm.userId });

    if (!keepGoing) {
      return this.finalizeDailyComplete();
    }

    kk.endlessMode = true;

    let nextWave = false;
    let nextWaveEnemies = null;
    let nextWaveNumber = null;
    if ((this.gm.combat?.enemies || []).length === 0
      || (this.gm.combat?.enemies || []).every(enemy => enemy.hp <= 0 || enemy.befriended)) {
      this.spawnNextWave();
      nextWave = true;
      nextWaveEnemies = cloneCombatants(this.gm.combat.enemies);
      nextWaveNumber = this.gm.run.kanjiKombat.wave;
    }

    const work = this.queueNextPrompt();
    if (work?.kind === 'complete' || isDailyCompletePromptKind(work?.kind)) {
      return this.finalizeDailyComplete();
    }

    this.gm.emitState();
    return {
      actionType: 'kanjiKombat',
      combatEnded: false,
      completionChoicePending: false,
      endlessMode: true,
      nextWave,
      nextWaveNumber,
      nextWaveEnemies,
      kanjiKombat: this.gm.run.kanjiKombat,
      allies: this.gm.combat.allies,
      enemies: this.gm.combat.enemies,
      creatureParty: this.gm.run.creatureParty,
    };
  }

  queueNextPrompt(opts = {}) {
    const state = this.gm.run?.kanjiKombat;
    if (!state || state.onboardingPending) return null;
    this.refillPromptBuffer(opts);
    const head = getKanjiKombatActivePrompt(state);
    if (!head) return null;
    if (head.kind === 'quiz') return { kind: 'quiz', quiz: head.quiz, card: { id: head.cardId }, buffered: true };
    if (head.kind === 'intro') return { kind: 'intro', card: head.intro.card, source: head.source, buffered: true };
    if (isDailyCompletePrompt(head)) return { kind: DAILY_COMPLETE_PROMPT_KIND };
    return null;
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
    if (work.kind === 'complete' || isDailyCompletePromptKind(work.kind)) {
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

  rollWaveEnemies(wave) {
    const isMiniboss = wave % 10 === 0;
    const highestLevel = Math.max(1, ...this.gm.run.creatureParty.active.map(c => c.level || 1));
    const areas = this.getUnlockedAreas();
    const stage = Math.max(1, ...areas.map(area => area.stage || 1));

    if (isMiniboss && this.buildBossPool().length > 0) {
      const bossIds = this.buildBossPool();
      const bossId = bossIds[Math.floor(Math.random() * bossIds.length)];
      const bossLevel = Math.round(getEnemyLevel({ totalEncounters: wave, enemyCount: 1 }) * 1.25);
      const boss = generateEnemyCreature(Math.max(highestLevel, bossLevel), [bossId], stage);
      boss.hp = boss.maxHp = Math.max(boss.maxHp * 2, boss.hp * 2);
      return { enemies: [boss], isMiniboss: true };
    }
    const maxEnemies = wave <= SOLO_OPENING_WAVES ? 1 : 3;
    const enemies = generateEnemyCreatures(highestLevel, {
      maxEnemies,
      creaturePool: this.buildEnemyPool(),
      stage,
      encounterIndex: wave - 1,
      totalEncounters: wave,
    });
    return { enemies, isMiniboss: false };
  }

  /**
   * Top up the queue of pre-rolled upcoming waves (kk.pendingNextWaves, head =
   * next wave).  Each quiz answer can clear at most one wave, so a queue as deep
   * as the quiz prompts in the prompt buffer (capped) guarantees the client never
   * hits an empty runway until the prompt buffer itself runs dry.
   *
   * Append-only: once rolled, a queued wave is never re-rolled or discarded here —
   * the client may have already received it and will simulate against it verbatim,
   * and the server must consume the exact same objects on session-log replay.
   * This also generalizes the old single-pre-roll shield: between recordWaveClear's
   * increment and spawnNextWave's consumption the queue head is for the CURRENT
   * wave, and it is left untouched (new entries continue from the tail).
   */
  ensurePendingNextWaves() {
    const kk = this.gm.run?.kanjiKombat;
    if (!kk) return null;
    if (!Array.isArray(kk.pendingNextWaves)) kk.pendingNextWaves = [];
    const queue = kk.pendingNextWaves;
    const quizPromptCount = (kk.promptBuffer || []).filter(p => p?.kind === 'quiz').length;
    const target = Math.min(quizPromptCount, PENDING_WAVE_QUEUE_MAX);
    let nextWave = queue.length > 0
      ? queue[queue.length - 1].wave + 1
      : (kk.wave || 1) + 1;
    while (queue.length < target) {
      const rolled = this.rollWaveEnemies(nextWave);
      const turnSeeds = [];
      while (turnSeeds.length < PREROLL_TURN_SEED_COUNT) turnSeeds.push(createServerSeed());
      queue.push({
        wave: nextWave,
        isMiniboss: rolled.isMiniboss,
        enemies: rolled.enemies,
        combat: {
          combatId: createCombatId(),
          stateVersion: 0,
          nextTurnSeed: turnSeeds[0],
          turnSeeds,
        },
      });
      nextWave += 1;
    }
    return queue;
  }

  /**
   * Top up the pre-rolled streak-reward payload queues (kk.pendingStreakRewards,
   * keyed by the milestone streak value they fire at).  Streak milestones 6
   * (random stat buff) and 12 (random ally join) are the only ones that involve
   * randomness; pre-rolling them once and consuming them verbatim in both the
   * live submit path and the session-log replay path (and in the client's local
   * simulation) keeps streak rewards deterministic.
   *
   * Append-only, like ensurePendingNextWaves: once rolled, a queued payload is
   * never re-rolled or discarded — the client may already hold it and will
   * simulate against it verbatim.  Each payload carries a monotonic `seq` so
   * the client can adopt new tail payloads from checkpoints append-only.
   */
  ensurePendingStreakRewards() {
    const kk = this.gm.run?.kanjiKombat;
    if (!kk || this.gm.run?.mode !== 'kanjiKombat') return null;
    const pending = ensurePendingStreakRewardQueues(kk);
    const quizPromptCount = (kk.promptBuffer || []).filter(p => p?.kind === 'quiz').length;
    // Each milestone fires at most once per 15-streak cycle; ceil(q/3)+1 is a
    // generous over-cover (q/15 firings possible) kept simple on purpose.
    const target = Math.min(
      PENDING_STREAK_REWARD_QUEUE_MAX,
      Math.ceil(quizPromptCount / 3) + 1,
    );
    for (const milestone of RANDOM_STREAK_REWARD_MILESTONES) {
      const queue = pending[milestone];
      while (queue.length < target) {
        kk.pendingStreakRewardSeq += 1;
        queue.push(milestone === 6
          ? {
              seq: kk.pendingStreakRewardSeq,
              type: 'statUp',
              allyRoll: Math.random(),
              stat: STREAK_BUFF_STATS[Math.floor(Math.random() * STREAK_BUFF_STATS.length)],
            }
          : { seq: kk.pendingStreakRewardSeq, ...this.rollAllyJoinReward(queue) });
      }
    }
    return pending;
  }

  /**
   * Rolls one streak-12 ally-join payload: a full runtime creature object from
   * the player's collection, excluding ids already in the active party or in
   * earlier pending payloads (mirrors sequential live behavior).  When no
   * candidate remains the payload degrades to a deterministic full heal
   * (creature: null) at apply time.
   */
  rollAllyJoinReward(existingQueue = []) {
    const active = this.gm.run?.creatureParty?.active || [];
    const excluded = new Set(active.map(c => c?.id).filter(Boolean));
    for (const queued of existingQueue) {
      if (queued?.creature?.id) excluded.add(queued.creature.id);
    }
    const candidates = (this.gm.meta?.creatureCollection || []).filter(id => !excluded.has(id));
    if (candidates.length === 0) return { type: 'allyJoin', creature: null };
    const id = candidates[Math.floor(Math.random() * candidates.length)];
    const creature = generateEnemyCreature(Math.max(1, active[0]?.level || 1), [id]);
    return { type: 'allyJoin', creature };
  }

  spawnNextWave() {
    const kk = this.gm.run.kanjiKombat;
    const wave = kk.wave || 1;
    kk.waveReached = Math.max(kk.waveReached || 1, wave);

    if (!Array.isArray(kk.pendingNextWaves)) kk.pendingNextWaves = [];
    let preroll = null;
    if (kk.pendingNextWaves.length > 0) {
      if (kk.pendingNextWaves[0].wave === wave) {
        preroll = kk.pendingNextWaves.shift();
      } else {
        // Stale/mismatched head — the queue diverged from the actual wave
        // progression; nothing in it can be consumed deterministically anymore.
        kk.pendingNextWaves = [];
      }
    }
    const rolled = preroll
      ? { enemies: preroll.enemies, isMiniboss: preroll.isMiniboss }
      : this.rollWaveEnemies(wave);
    const enemies = rolled.enemies;
    kk.currentWaveIsMiniboss = rolled.isMiniboss;

    this.gm.combat = createCombatState(enemies[0]);
    this.gm.combat.mode = 'kanjiKombat';
    this.gm.combat.isCreatureCombat = true;
    this.gm.combat.isBoss = kk.currentWaveIsMiniboss;
    this.gm.combat.allies = this.gm.run.creatureParty.active;
    this.gm.combat.enemies = enemies;
    this.gm.combat.actionCursor = createPveOpeningCursor({ allies: this.gm.combat.allies, enemies });
    this.gm.combat.actionCount = 0;
    this.gm.combat.cycleCount = 0;
    this.gm.combat.optimistic = preroll
      ? { ...preroll.combat, acceptedActionIds: {} }
      : {
          combatId: createCombatId(),
          stateVersion: 0,
          nextTurnSeed: createServerSeed(),
          acceptedActionIds: {},
        };
    ensureKanjiKombatTurnSeeds(this.gm.combat);
    return enemies;
  }

  applyCurrentStreakReward() {
    const kk = this.gm.run.kanjiKombat;
    // Shared deterministic reward logic (also run by the client's local
    // simulation and the session-log replay path) — random milestones consume
    // pre-rolled payloads from kk.pendingStreakRewards verbatim.  Uses the
    // module's default addXpToCreatureShared (NOT the server's addXpToCreature)
    // — see kanji-kombat-xp.js::addXpToCreatureShared for the hash-parity rationale.
    const streakReward = applyKanjiKombatStreakReward({
      kk,
      creatureParty: this.gm.run.creatureParty,
      metaMults: this.gm.run.crestMults,
      itemBuffs: this.gm.run.itemBuffs,
    });
    if (streakReward?.streak === 12 && this.gm.combat) {
      // An ally join grows creatureParty.active in place; keep combat.allies
      // aliased to it (mirrors the old addRandomUnlockedAllyOrFullHeal).
      this.gm.combat.allies = this.gm.run.creatureParty.active;
    }
    if (streakReward?.type === 'partyLevelUp') {
      // Server-only prompt-planning state: not part of combat determinism.
      kk.reviewsSinceIntro = 0;
      kk.nextIntroAfter = rollIntroInterval();
    }
    return streakReward;
  }

  recordCorrectAnswer({ applyReward = true } = {}) {
    const kk = this.gm.run.kanjiKombat;
    advanceKanjiKombatStreakOnCorrect(kk);
    kk.report.correctAnswers += 1;
    kk.report.cardsReviewed += 1;
    kk.reviewsSinceIntro += 1;
    return applyReward ? this.applyCurrentStreakReward() : null;
  }

  recordWrongAnswer() {
    const kk = this.gm.run.kanjiKombat;
    resetKanjiKombatStreakOnWrong(kk);
    kk.report.wrongAnswers += 1;
    kk.report.cardsReviewed += 1;
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
    const work = this.queueNextPrompt({ target: PROMPT_BUFFER_TARGET });
    if (!work) {
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
    if (isDailyCompletePromptKind(work.kind)) {
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
      nextWaveNumber: this.gm.run.kanjiKombat.wave,
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

  /**
   * Applies a single session entry (intro, quiz, or completionChoice) to live
   * state.  Returns the committed result payload.  Throws on validation failure.
   */
  applySessionEntry(entry) {
    const kk = this.gm.run?.kanjiKombat;
    if (!kk) throw new Error('no_active_kanji_kombat_run');

    const promptRef = {
      promptId: entry.promptId,
      sequence: entry.sequence,
      cardId: entry.cardId,
    };

    if (entry.kind === 'intro') {
      if (!entry.cardId || !['known', 'unknown'].includes(entry.choice)) {
        throw new Error('invalid_intro_entry');
      }
      // preserveBuffer=true: the client's pre-planned buffer already contains the
      // correct subsequent quizzes for this card — do not wipe and regenerate it.
      return this.submitIntroChoice(entry.cardId, entry.choice, promptRef, { preserveBuffer: true });
    }

    if (entry.kind === 'completionChoice') {
      if (typeof entry.keepGoing !== 'boolean') throw new Error('invalid_completion_entry');
      return this.resolveCompletionChoice(entry.keepGoing, promptRef);
    }

    if (entry.kind === 'quiz') {
      const optimistic = this.gm.combat?.optimistic;
      if (!optimistic) throw new Error('missing_optimistic_state');

      // Validate the prompt head before committing
      const prompt = validateKanjiKombatPromptHead(kk, { ...promptRef, kind: 'quiz' });
      const choice = prompt.quiz.choices.find(option => option.id === entry.answerId);
      if (!choice) throw new Error('invalid_kanji_answer');

      const seed = optimistic.nextTurnSeed;
      const resolvedCore = resolveKanjiKombatAnswerTurn(
        { combat: this.gm.combat, run: this.gm.run, answerCorrect: choice.correct === true },
        { seed },
      );
      const serverHash = hashTranscript(resolvedCore.transcript);
      const hashMatches = serverHash === entry.predictedHash;
      if (!hashMatches) {
        console.error(`[KanjiKombat] transcript mismatch (replay) seq=${entry.seq} seed=${seed} serverHash=${serverHash} clientHash=${entry.predictedHash}`);
      }

      // Dedupes via gm.meta action ledger only — not optimistic.acceptedActionIds (used by
      // verifyAndCommitOptimisticAnswer); each actionId must flow through exactly one path.
      const committed = this.submitAnswer(entry.answerId, {
        promptRef: {
          promptId: prompt.promptId,
          sequence: prompt.sequence,
          cardId: prompt.cardId,
        },
        rng: createSeededRng(seed),
        xpRng: createSeededRng(`${seed}:xp`),
        deferXpAwards: true,
      });

      const responseOptimistic = this.gm.combat?.optimistic || optimistic;
      if (responseOptimistic === optimistic) {
        advanceKanjiKombatTurnSeeds(optimistic);
      } else {
        ensureKanjiKombatTurnSeeds(this.gm.combat);
      }

      if (!hashMatches) {
        // Commit already applied — attach it so the caller can confirm the seq
        const error = new Error('transcript_mismatch');
        error.committed = committed;
        throw error;
      }
      return committed;
    }

    throw new Error(`unsupported_session_entry:${entry.kind}`);
  }

  /**
   * Replays an ordered batch of client session entries.
   *
   * NOT self-rolling-back: a throw mid-batch can leave partial mutations applied.
   * Callers MUST wrap this in snapshotGameManager/restoreGameManager (the POST /sync
   * route does this).
   *
   * Returns:
   *   { status: 'ok'|'corrected', confirmedThroughSeq, results, reason?, rejectedSeq?, sessionEpoch }
   */
  applySessionSync({ sessionEpoch, entries = [] } = {}) {
    const kk = this.gm.run?.kanjiKombat;
    this.assertOnboardingComplete();
    if (!kk) throw new Error('no_active_kanji_kombat_run');

    // Old saves may have kk.sessionEpoch === undefined — treat missing/falsy as mismatch
    if (!sessionEpoch || sessionEpoch !== kk.sessionEpoch) {
      return {
        status: 'corrected',
        reason: 'session_epoch_mismatch',
        confirmedThroughSeq: null,
        rejectedSeq: entries[0]?.seq ?? null,
        results: [],
        sessionEpoch: kk.sessionEpoch,
      };
    }

    const ledgerOwner = this.gm.meta;
    const results = [];
    let confirmedThroughSeq = null;

    for (const entry of entries) {
      // Deduplicate via action ledger
      const existing = isActionId(entry.actionId)
        ? getActionLedgerEntry(ledgerOwner, entry.actionId)
        : null;
      if (existing?.response) {
        results.push({ seq: entry.seq, actionId: entry.actionId, replayed: true });
        confirmedThroughSeq = entry.seq;
        continue;
      }

      let committed;
      try {
        committed = this.applySessionEntry(entry);
      } catch (error) {
        // transcript_mismatch: the grade was committed — confirm the seq but stop
        // the batch so the client snaps to authoritative state.
        if (error?.committed) {
          confirmedThroughSeq = entry.seq;
          if (isActionId(entry.actionId)) {
            rememberActionLedgerResult(ledgerOwner, {
              actionId: entry.actionId,
              actionType: 'kanjiKombat.sessionEntry',
              response: { seq: entry.seq, corrected: true },
            });
          }
        }
        return {
          status: 'corrected',
          reason: error?.message || 'session_entry_failed',
          confirmedThroughSeq,
          rejectedSeq: entry.seq,
          results,
          sessionEpoch: kk.sessionEpoch,
        };
      }

      const result = { seq: entry.seq, actionId: entry.actionId, ...committed };
      results.push(result);
      confirmedThroughSeq = entry.seq;
      if (isActionId(entry.actionId)) {
        rememberActionLedgerResult(ledgerOwner, {
          actionId: entry.actionId,
          actionType: 'kanjiKombat.sessionEntry',
          response: { seq: entry.seq, accepted: true },
        });
      }
    }

    this.refillPromptBuffer();
    return {
      status: 'ok',
      confirmedThroughSeq,
      results,
      sessionEpoch: kk.sessionEpoch,
    };
  }
}
