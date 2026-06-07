import { escapeHtml } from './html-utils.js';
import { renderButtonsAsync } from './ui-components.js';
import { getSpeakerId, playDialogueLineAudio } from '../tts.js';
import { createPendingRunAction } from './optimistic-run-action.js';
import {
  configureKanjiKombatSyncQueue,
  REVIEW_SYNC_QUEUE_HARD_LIMIT,
  REVIEW_SYNC_QUEUE_SOFT_LIMIT,
} from './kanji-kombat-sync-queue.js';

const DEFAULT_API = {
  submitAnswer: null,
  submitIntro: null,
  submitCompletionChoice: null,
  submitOnboarding: null,
  refillPromptBuffer: null,
  updateGameState: null,
  getGameState: null,
  fetchGameState: null,
  updateUI: null,
  refreshAction: null,
  finishCombatResult: null,
  playCorrectAnswerAudio: null,
  showCidSprite: null,
  hideCidSprite: null,
  showNarration: null,
  forceHideNarration: null,
};

let api = { ...DEFAULT_API };

const ONBOARDING_COPY = {
  welcome: 'Hey, welcome to Kanji Kombat. Here, you can practice your hiragana, katakana, and kanji all the way up to full fluency.',
  hiraganaQuestion: 'First things first. Do you already know all hiragana?',
  hiraganaKnown: "Great, we won't spend time teaching you hiragana.",
  hiraganaUnknown: "Great, we'll teach you hiragana.",
  katakanaQuestion: 'Do you already know all katakana?',
  katakanaKnown: "Great, we won't spend time teaching you katakana.",
  katakanaUnknown: "Great, we'll teach you katakana.",
  finalHiragana: "Great, we'll start by teaching you hiragana and go from there.",
  finalKatakana: "Great, we'll start by teaching you katakana and go from there.",
  finalKanji: "Okay, great, we'll start by teaching you kanji. Let's jump right into it.",
};

let onboardingInProgress = false;
const KANJI_KOMBAT_SPOTTY_CONNECTION_COPY = 'Connection is spotty. Your reviews will sync when you reconnect.';
const PROMPT_BUFFER_REFILL_THRESHOLD = 10;
let promptBufferRefillPromise = null;
let latestKanjiKombatState = null;
let reviewSyncQueue = null;
let consumedPromptIds = new Set();

function createKanjiKombatPendingAction(gameState, actionType, applyLocal) {
  const actionTypeByName = {
    'kanjiKombat.intro': { actionType: 'kanjiKombat.intro' },
    'kanjiKombat.completionChoice': { actionType: 'kanjiKombat.completionChoice' },
  };
  const resolvedAction = actionTypeByName[actionType];
  if (!resolvedAction) return null;
  return createPendingRunAction({
    state: gameState,
    ...resolvedAction,
    applyLocal,
  });
}

export function initKanjiKombatUI(deps) {
  reviewSyncQueue?.reset();
  api = { ...DEFAULT_API, ...deps };
  latestKanjiKombatState = null;
  promptBufferRefillPromise = null;
  consumedPromptIds = new Set();
  reviewSyncQueue = createReviewSyncQueue();
  if (Array.isArray(deps?.__testQueueSeed)) {
    reviewSyncQueue = createSeededReviewSyncQueue(reviewSyncQueue, deps.__testQueueSeed);
  }
}

function actionArea() {
  return document.getElementById('action-area');
}

function clearActionArea() {
  const root = actionArea();
  if (!root) return;
  if (typeof root.replaceChildren === 'function') {
    root.replaceChildren();
    return;
  }
  root.innerHTML = '';
}

function shouldRunOnboarding(gameState) {
  const run = gameState?.run;
  const kk = run?.kanjiKombat;
  const cursor = gameState?.combat?.actionCursor;
  return gameState?.phase === 'combat'
    && run?.mode === 'kanjiKombat'
    && kk?.onboardingPending === true
    && cursor?.side === 'ally';
}

async function showOnboardingNarration(text, opts = {}) {
  await api.showNarration?.(text, { speaker: 'Cid', ...opts });
}

async function askOnboardingBoolean(question) {
  await showOnboardingNarration(question, { persistent: true });
  const choice = await renderButtonsAsync([
    { label: 'Yes, I know all of them' },
    { label: 'No, please teach me' },
  ]);
  api.forceHideNarration?.();
  return choice === 0;
}

async function showKanjiKombatSyncPause() {
  await api.showNarration?.(KANJI_KOMBAT_SPOTTY_CONNECTION_COPY, { speaker: 'Cid', autoDismiss: 1800 });
}

function refreshKanjiKombatAction() {
  if (typeof api.refreshAction === 'function') {
    api.refreshAction();
    return;
  }
  api.updateUI?.();
}

function getActiveBufferedPrompt(kk) {
  return Array.isArray(kk?.promptBuffer) ? kk.promptBuffer[0] || null : null;
}

function rememberKanjiKombatState(state) {
  if (state) latestKanjiKombatState = state;
}

function updateKanjiKombatGameState(state) {
  rememberKanjiKombatState(state);
  api.updateGameState?.(state);
}

function activePromptId(state) {
  return getActiveBufferedPrompt(state?.run?.kanjiKombat)?.promptId || null;
}

function rememberConsumedPrompt(prompt) {
  if (prompt?.promptId) consumedPromptIds.add(prompt.promptId);
}

function stateWouldReplayConsumedPrompt(state) {
  const promptId = activePromptId(state);
  return !!promptId && consumedPromptIds.has(promptId);
}

function applyServerStateIfNotBehindLocalProgress(state) {
  if (!state || stateWouldReplayConsumedPrompt(state)) return false;
  updateKanjiKombatGameState(state);
  return true;
}

function currentKanjiKombatState() {
  return typeof api.getGameState === 'function'
    ? api.getGameState() || latestKanjiKombatState
    : latestKanjiKombatState;
}

function canConsumeKanjiKombatPrompt() {
  return !reviewSyncQueue || reviewSyncQueue.canConsumePrompt();
}

function createSeededReviewSyncQueue(queue, seedItems = []) {
  let seedCount = Math.min(seedItems.length, REVIEW_SYNC_QUEUE_HARD_LIMIT);
  const pendingCount = () => seedCount + queue.pendingCount();
  return {
    ...queue,
    enqueue(item) {
      if (pendingCount() >= REVIEW_SYNC_QUEUE_HARD_LIMIT) {
        return { accepted: false, pendingCount: pendingCount(), hardLimit: true };
      }
      return queue.enqueue(item);
    },
    reset() {
      seedCount = 0;
      queue.reset();
    },
    pendingCount,
    isAtSoftLimit: () => pendingCount() >= REVIEW_SYNC_QUEUE_SOFT_LIMIT,
    isAtHardLimit: () => pendingCount() >= REVIEW_SYNC_QUEUE_HARD_LIMIT,
    canConsumePrompt: () => pendingCount() < REVIEW_SYNC_QUEUE_HARD_LIMIT,
    snapshot: () => [
      ...seedItems.slice(0, seedCount).map(item => ({ ...item, status: 'seeded' })),
      ...queue.snapshot(),
    ],
  };
}

function createReviewSyncQueue() {
  return configureKanjiKombatSyncQueue({
    syncItem: async item => {
      if (item.kind === 'intro') {
        return api.submitIntro(item.cardId, item.choice, item.options);
      }
      if (item.kind === 'completionChoice') {
        return api.submitCompletionChoice(item.keepGoing, item.options);
      }
      if (item.kind === 'quiz') {
        return item.sync();
      }
      throw new Error(`Unsupported Kanji Kombat sync item: ${item.kind}`);
    },
    onAccepted: (item, result) => {
      if (typeof item.onAccepted === 'function') {
        void item.onAccepted(result);
        return;
      }
      if (result?.state) applyServerStateIfNotBehindLocalProgress(result.state);
      if (!result?.combatEnded) requestPromptBufferRefillIfLow(result?.state || currentKanjiKombatState());
      if (result?.combatEnded) api.finishCombatResult?.(result);
    },
    onCorrected: (item, result) => {
      if (typeof item.onCorrected === 'function') {
        void item.onCorrected(result);
        return;
      }
      const state = result?.authoritativeState || result?.state;
      if (state) applyServerStateIfNotBehindLocalProgress(state);
      refreshKanjiKombatAction();
    },
    onFailed: (_item, error) => {
      console.warn('[KanjiKombat] queued review sync failed:', error?.message || error);
    },
    onPause: () => {
      void showKanjiKombatSyncPause();
    },
    schedule: (fn, delay) => {
      const timer = setTimeout(fn, delay);
      timer?.unref?.();
      return timer;
    },
  });
}

function promptIdentity(prompt) {
  if (!prompt) return null;
  return [
    prompt.promptId || '',
    prompt.sequence ?? '',
    prompt.cardId || prompt.quiz?.cardId || prompt.intro?.card?.id || '',
  ].join('|');
}

function promptBufferHeadIdentity(state) {
  return promptIdentity(getActiveBufferedPrompt(state?.run?.kanjiKombat));
}

function visiblePromptIdentity(state) {
  const kk = state?.run?.kanjiKombat;
  const buffered = getActiveBufferedPrompt(kk);
  if (buffered) return promptIdentity(buffered);
  if (kk?.pendingIntro?.card || kk?.pendingIntro?.cardId) {
    const cardId = kk.pendingIntro.cardId || kk.pendingIntro.card?.id || '';
    return `intro|||${cardId}`;
  }
  if (kk?.currentQuiz) {
    const cardId = kk.currentQuiz.cardId || '';
    return `quiz|||${cardId || kk.currentQuiz.prompt || ''}`;
  }
  if (kk?.completionChoicePending) return 'completePrompt|||';
  return null;
}

function isUsableFetchedState(state) {
  return !!state && state.transient !== true && !state.error && state.phase;
}

function fetchedStateAdvancedPastOriginal(originalState, fetchedState) {
  if (!isUsableFetchedState(fetchedState)) return false;
  if (fetchedState.phase !== originalState?.phase) return true;
  return visiblePromptIdentity(fetchedState) !== visiblePromptIdentity(originalState);
}

async function recoverFromNullKanjiKombatResponse(pending) {
  if (typeof api.fetchGameState !== 'function') return false;
  let fetchedState = null;
  try {
    fetchedState = await api.fetchGameState();
  } catch (error) {
    console.warn('[KanjiKombat] server state recovery failed:', error?.message || error);
    return false;
  }
  if (!fetchedStateAdvancedPastOriginal(pending?.originalState, fetchedState)) return false;
  updateKanjiKombatGameState(fetchedState);
  refreshKanjiKombatAction();
  return true;
}

function promptRef(prompt) {
  if (!prompt) return {};
  return {
    promptId: prompt.promptId,
    sequence: prompt.sequence,
    cardId: prompt.cardId || prompt.quiz?.cardId || prompt.intro?.card?.id || null,
  };
}

function consumePromptHeadDraft(draft, prompt) {
  const kk = draft.run?.kanjiKombat;
  if (!kk || !prompt || !Array.isArray(kk.promptBuffer)) return;
  if (kk.promptBuffer[0]?.promptId === prompt.promptId) {
    kk.promptBuffer = kk.promptBuffer.slice(1);
  }
  const next = kk.promptBuffer[0] || null;
  kk.currentQuiz = next?.kind === 'quiz' ? next.quiz : null;
  kk.pendingIntro = next?.kind === 'intro'
    ? {
        cardId: next.cardId,
        card: next.intro.card,
        source: next.source || next.intro.source || null,
        promptId: next.promptId,
        sequence: next.sequence,
      }
    : null;
  kk.completionChoicePending = next?.kind === 'completePrompt';
}

function requestPromptBufferRefillIfLow(state) {
  const kk = state?.run?.kanjiKombat;
  if (!Array.isArray(kk?.promptBuffer)) return;
  if (kk.promptBuffer.length >= PROMPT_BUFFER_REFILL_THRESHOLD) return;
  if (promptBufferRefillPromise || typeof api.refillPromptBuffer !== 'function') return;
  rememberKanjiKombatState(state);
  const basisHead = promptBufferHeadIdentity(state);
  promptBufferRefillPromise = Promise.resolve(api.refillPromptBuffer())
    .then(result => {
      if (result?.state && promptBufferHeadIdentity(currentKanjiKombatState()) === basisHead) {
        applyServerStateIfNotBehindLocalProgress(result.state);
      }
      return result;
    })
    .catch(error => {
      console.warn('[KanjiKombat] prompt buffer refill failed:', error?.message || error);
      return null;
    })
    .finally(() => {
      promptBufferRefillPromise = null;
    });
}

function finalOnboardingLine(knowsHiragana, knowsKatakana) {
  if (!knowsHiragana) return ONBOARDING_COPY.finalHiragana;
  if (!knowsKatakana) return ONBOARDING_COPY.finalKatakana;
  return ONBOARDING_COPY.finalKanji;
}

async function runKanjiKombatOnboarding() {
  let clearInFinally = true;
  try {
    clearActionArea();
    await api.showCidSprite?.();
    await showOnboardingNarration(ONBOARDING_COPY.welcome);
    const knowsHiragana = await askOnboardingBoolean(ONBOARDING_COPY.hiraganaQuestion);
    await showOnboardingNarration(
      knowsHiragana ? ONBOARDING_COPY.hiraganaKnown : ONBOARDING_COPY.hiraganaUnknown
    );
    const knowsKatakana = await askOnboardingBoolean(ONBOARDING_COPY.katakanaQuestion);
    await showOnboardingNarration(
      knowsKatakana ? ONBOARDING_COPY.katakanaKnown : ONBOARDING_COPY.katakanaUnknown
    );
    await showOnboardingNarration(finalOnboardingLine(knowsHiragana, knowsKatakana));
    const result = await api.submitOnboarding(knowsHiragana, knowsKatakana);
    if (result?.state) updateKanjiKombatGameState(result.state);
    await api.hideCidSprite?.();
    api.refreshAction?.();
  } catch (error) {
    console.error('[KanjiKombat] Onboarding failed:', error);
    try {
      await api.hideCidSprite?.();
      await api.showNarration?.('Kanji Kombat onboarding hit a snag. Please try again.', {
        speaker: 'Cid',
        autoDismiss: 2000,
      });
    } finally {
      onboardingInProgress = false;
      clearInFinally = false;
    }
    api.updateUI?.();
  } finally {
    if (clearInFinally) onboardingInProgress = false;
  }
}

export function startKanjiKombatOnboardingIfNeeded(gameState) {
  if (!shouldRunOnboarding(gameState)) return false;
  if (onboardingInProgress) return true;
  onboardingInProgress = true;
  runKanjiKombatOnboarding();
  return true;
}

function bindSingleFlightButtons(buttons, getValue, handler, { beforeSubmit = null } = {}) {
  let inFlight = false;
  for (const button of buttons) {
    button.addEventListener('click', async () => {
      if (inFlight) return false;
      inFlight = true;
      beforeSubmit?.(button, buttons);
      buttons.forEach(btn => { btn.disabled = true; });
      try {
        const handled = await handler?.(getValue(button));
        if (handled === false) {
          inFlight = false;
          buttons.forEach(btn => { btn.disabled = false; });
        }
        return handled;
      } catch (err) {
        inFlight = false;
        buttons.forEach(btn => { btn.disabled = false; });
        throw err;
      }
    });
  }
}

function markKanjiKombatChoiceFeedback(selectedButton, buttons, correctAnswerId) {
  if (!correctAnswerId) return;
  const selectedIsCorrect = selectedButton.dataset.answerId === correctAnswerId;
  selectedButton.classList.add(
    selectedIsCorrect
      ? 'kanji-kombat-choice--correct-selected'
      : 'kanji-kombat-choice--wrong-selected'
  );

  if (selectedIsCorrect) return;
  const correctButton = buttons.find(button => button.dataset.answerId === correctAnswerId);
  correctButton?.classList.add('kanji-kombat-choice--correct-answer');
}

function playCorrectAnswerAudio(answer) {
  if (!answer) return;
  const playAudio = api.playCorrectAnswerAudio || ((text) => playDialogueLineAudio({
    text,
    speakerId: getSpeakerId(),
  }));
  Promise.resolve(playAudio(answer)).catch(error => {
    console.warn('[KanjiKombat] Correct answer TTS failed:', error.message);
  });
}

function kanjiKombatAudioText(card) {
  return card?.audioText || card?.reading || card?.prompt || card?.answer || '';
}

export function renderKanjiKombatQuiz(quiz, { onAnswer } = {}) {
  const root = actionArea();
  if (!root || !quiz) return;
  const correctChoice = quiz.choices.find(choice => choice.correct);
  const correctAnswerId = correctChoice?.id;
  const correctAudioText = kanjiKombatAudioText(quiz);
  root.innerHTML = `
    <div class="kanji-kombat-panel">
      <div class="kanji-kombat-prompt">${escapeHtml(quiz.prompt)}</div>
      <div class="move-grid kanji-kombat-choice-grid">
        ${quiz.choices.map(choice => `
          <button class="move-cell move-cell--neutral kanji-kombat-choice" type="button" data-answer-id="${escapeHtml(choice.id)}">
            <div class="move-hero">
              <div class="move-text">
                <div class="move-name-jp">${escapeHtml(choice.answer)}</div>
              </div>
            </div>
          </button>
        `).join('')}
      </div>
    </div>
  `;
  bindSingleFlightButtons(
    [...root.querySelectorAll('.kanji-kombat-choice')],
    button => button.dataset.answerId,
    onAnswer,
    {
      beforeSubmit: (button, buttons) => {
        markKanjiKombatChoiceFeedback(button, buttons, correctAnswerId);
        playCorrectAnswerAudio(correctAudioText);
      }
    }
  );
}

export function renderKanjiKombatIntro(card, { onChoice } = {}) {
  const root = actionArea();
  if (!root || !card) return;
  const reading = card.reading || card.prompt;
  const showReading = reading && reading !== card.prompt;
  root.innerHTML = `
    <div class="kanji-kombat-intro">
      <div class="kanji-kombat-intro-heading">New discovery!</div>
      <div class="kanji-kombat-intro-card">
        <div class="kanji-kombat-prompt">${escapeHtml(card.prompt)}</div>
        ${showReading ? `<div class="kanji-kombat-reading">${escapeHtml(reading)}</div>` : ''}
        <div class="kanji-kombat-answer">${escapeHtml(card.answer)}</div>
      </div>
      <div class="kanji-kombat-intro-actions lookup-popup-actions">
        <button class="lookup-action-btn lookup-action-forgot kanji-kombat-intro-action" type="button" data-choice="unknown">I didn't know it yet</button>
        <button class="lookup-action-btn lookup-action-knew kanji-kombat-intro-action" type="button" data-choice="known">I already know it</button>
      </div>
    </div>
  `;
  playCorrectAnswerAudio(kanjiKombatAudioText(card));
  bindSingleFlightButtons(
    [...root.querySelectorAll('.kanji-kombat-intro-action')],
    button => button.dataset.choice,
    onChoice
  );
}

export function renderKanjiKombatCompletionChoice({ onChoice } = {}) {
  const root = actionArea();
  if (!root) return;
  root.innerHTML = `
    <div class="kanji-kombat-completion">
      <div class="kanji-kombat-completion-card">
        <div class="kanji-kombat-completion-title">Your reviews are done for the day!</div>
        <div class="kanji-kombat-completion-copy">Would you like to keep going?</div>
      </div>
      <div class="kanji-kombat-completion-actions lookup-popup-actions">
        <button class="lookup-action-btn lookup-action-forgot kanji-kombat-completion-action" type="button" data-keep-going="false">No</button>
        <button class="lookup-action-btn lookup-action-knew kanji-kombat-completion-action" type="button" data-keep-going="true">Yes</button>
      </div>
    </div>
  `;
  bindSingleFlightButtons(
    [...root.querySelectorAll('.kanji-kombat-completion-action')],
    button => button.dataset.keepGoing === 'true',
    onChoice
  );
}

export function renderKanjiKombatAction(gameState) {
  rememberKanjiKombatState(gameState);
  const kk = gameState.run?.kanjiKombat;
  const cursor = gameState.combat?.actionCursor;
  if (kk?.onboardingPending) return true;
  if (!kk || cursor?.side !== 'ally') return false;
  const bufferedPrompt = getActiveBufferedPrompt(kk);
  const completionPrompt = bufferedPrompt?.kind === 'completePrompt';
  const introPrompt = bufferedPrompt?.kind === 'intro' ? bufferedPrompt : null;
  const quizPrompt = bufferedPrompt?.kind === 'quiz' ? bufferedPrompt : null;
  const hasBufferedPrompt = !!bufferedPrompt;

  if (completionPrompt || (!hasBufferedPrompt && kk.completionChoicePending)) {
    renderKanjiKombatCompletionChoice({
      onChoice: async keepGoing => {
        if (!canConsumeKanjiKombatPrompt()) {
          await showKanjiKombatSyncPause();
          return false;
        }

        const pending = createKanjiKombatPendingAction(
          gameState,
          'kanjiKombat.completionChoice',
          draft => {
            draft.run ||= {};
            draft.run.kanjiKombat ||= {};
            if (bufferedPrompt?.kind === 'completePrompt') {
              consumePromptHeadDraft(draft, bufferedPrompt);
            } else {
              draft.run.kanjiKombat.completionChoicePending = false;
            }
            if (keepGoing) draft.run.kanjiKombat.endlessMode = true;
          }
        );
        if (!pending) return false;

        rememberConsumedPrompt(bufferedPrompt);
        updateKanjiKombatGameState(pending.state);
        if (!renderKanjiKombatAction(pending.state)) clearActionArea();

        reviewSyncQueue.enqueue({
          actionId: pending.actionId,
          kind: 'completionChoice',
          promptId: bufferedPrompt?.promptId || null,
          sequence: bufferedPrompt?.sequence ?? null,
          cardId: null,
          keepGoing,
          options: {
            actionId: pending.actionId,
            ...promptRef(bufferedPrompt?.kind === 'completePrompt' ? bufferedPrompt : null),
          },
        });

        requestPromptBufferRefillIfLow(pending.state);
        return true;
      },
    });
    return true;
  }

  const introCard = introPrompt?.intro?.card || (!hasBufferedPrompt ? kk.pendingIntro?.card : null);
  if (introCard) {
    renderKanjiKombatIntro(introCard, {
      onChoice: async choice => {
        if (!canConsumeKanjiKombatPrompt()) {
          await showKanjiKombatSyncPause();
          return false;
        }

        const pending = createKanjiKombatPendingAction(gameState, 'kanjiKombat.intro', draft => {
          draft.run ||= {};
          draft.run.kanjiKombat ||= {};
          if (introPrompt) {
            consumePromptHeadDraft(draft, introPrompt);
          } else {
            draft.run.kanjiKombat.pendingIntro = null;
          }
        });
        if (!pending) return false;

        rememberConsumedPrompt(introPrompt);
        updateKanjiKombatGameState(pending.state);
        if (!renderKanjiKombatAction(pending.state)) clearActionArea();

        reviewSyncQueue.enqueue({
          actionId: pending.actionId,
          kind: 'intro',
          promptId: introPrompt?.promptId || null,
          sequence: introPrompt?.sequence ?? null,
          cardId: introCard.id,
          choice,
          options: {
            actionId: pending.actionId,
            ...promptRef(introPrompt),
          },
        });

        requestPromptBufferRefillIfLow(pending.state);
        return true;
      },
    });
    return true;
  }

  const quiz = quizPrompt?.quiz || (!hasBufferedPrompt ? kk.currentQuiz : null);
  if (quiz) {
    renderKanjiKombatQuiz(quiz, {
      onAnswer: async answerId => {
        const result = await api.submitAnswer(answerId, promptRef(quizPrompt));
        if (result?.handledByCombatLoop) return true;
        if (result?.state) updateKanjiKombatGameState(result.state);
        if (result) {
          api.updateUI();
          return true;
        }
        return false;
      },
    });
    return true;
  }

  return false;
}
