import { escapeHtml } from './html-utils.js';
import { renderButtonsAsync } from './ui-components.js';
import { getSpeakerId, playDialogueLineAudio } from '../tts.js';
import {
  configureKanjiKombatSession,
  getKanjiKombatSession,
} from './kanji-kombat-session.js';
import { createActionId } from '../../../src/shared/action-protocol.js';

const DEFAULT_API = {
  submitAnswer: null,
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
  syncSession: null,
  isCombatAnimationActive: null,
  __sessionSchedule: null, // test seam
  // Visuals from combat-loop.js — used by the checkpoint handler to show
  // server-confirmed XP, streak rewards, and wave transitions.
  showXpEvents: null,
  processPendingMoveLearn: null,
  syncKanjiKombatStreakRewardVisuals: null,
  playKanjiKombatNextWaveTransition: null,
  // Get/set the high-water mark of the highest wave number the combat-loop has
  // locally animated.  The checkpoint handler uses this to suppress double-plays:
  // a confirmed nextWave result is skipped when result.nextWaveNumber <= mark.
  getLastLocallyPlayedKanjiKombatWave: null,
  setLastLocallyPlayedKanjiKombatWave: null,
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
let reviewSyncOnlineDrainTarget = null;
let reviewSyncVisibilityDrainTarget = null;
let sessionReplayChain = Promise.resolve();

function enqueueSessionReplay(work) {
  sessionReplayChain = sessionReplayChain.then(work).catch(error => {
    console.error('[KanjiKombat] session replay failed', error);
  });
  return sessionReplayChain;
}

export function initKanjiKombatUI(deps) {
  getKanjiKombatSession()?.reset();
  api = { ...DEFAULT_API, ...deps };
  latestKanjiKombatState = null;
  promptBufferRefillPromise = null;
  sessionReplayChain = Promise.resolve();
  // Reset the local-play high-water mark on re-init so genuine server transitions
  // (which carry wave numbers > 0) are not silently skipped after a re-auth.
  api.setLastLocallyPlayedKanjiKombatWave?.(0);
  const sessionOpts = {
    syncRequest: payload => api.syncSession(payload),
    onCheckpoint: handleSessionCheckpoint,
    onCorrection: handleSessionCorrection,
    onPause: () => { void showKanjiKombatSyncPause(); },
  };
  if (typeof api.__sessionSchedule === 'function') {
    sessionOpts.schedule = api.__sessionSchedule;
  }
  configureKanjiKombatSession(sessionOpts);
  getKanjiKombatSession().adoptServerState(currentKanjiKombatState());
  if (
    typeof window !== 'undefined'
    && typeof window.addEventListener === 'function'
    && reviewSyncOnlineDrainTarget !== window
  ) {
    reviewSyncOnlineDrainTarget = window;
    window.addEventListener('online', () => getKanjiKombatSession()?.syncNow());
  }
  if (
    typeof document !== 'undefined'
    && typeof document.addEventListener === 'function'
    && reviewSyncVisibilityDrainTarget !== document
  ) {
    reviewSyncVisibilityDrainTarget = document;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') getKanjiKombatSession()?.syncNow();
    });
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

function currentKanjiKombatState() {
  return typeof api.getGameState === 'function'
    ? api.getGameState() || latestKanjiKombatState
    : latestKanjiKombatState;
}

async function waitForCombatAnimationIdle() {
  while (api.isCombatAnimationActive?.()) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function handleSessionCheckpoint(response, { logEmpty } = {}) {
  if (response?.state && logEmpty) updateKanjiKombatGameState(response.state);
  const results = response?.results || [];
  const finalResult = results.findLast?.(r => r.combatEnded)
    || results.slice().reverse().find(r => r.combatEnded);
  if (finalResult) {
    api.finishCombatResult?.({ ...finalResult, state: response.state });
    return;
  }
  // Re-render the action after applying state (e.g. when combat was inactive after
  // a graceful-pause wave end — this unblocks the player).
  if (response?.state && logEmpty) refreshKanjiKombatAction();
  // Show server-confirmed visuals for each result in the batch — but wait for any
  // in-flight optimistic animation to finish first, so state-apply and replay visuals
  // don't race with a running combat sequence.  Serialized through sessionReplayChain
  // so that checkpoint N's visuals always complete before checkpoint N+1's start
  // (guards against out-of-order replays during a bursty reconnect drain).
  enqueueSessionReplay(async () => {
    await waitForCombatAnimationIdle();
    for (const result of results) {
      if (result.replayed) continue;
      if (result.xpEvents?.length) {
        const pendingMoveLearn = api.showXpEvents?.(result.xpEvents) || [];
        if (pendingMoveLearn.length && api.processPendingMoveLearn) {
          await api.processPendingMoveLearn(pendingMoveLearn);
        }
      }
      if (result.kanjiStreakReward) {
        await api.syncKanjiKombatStreakRewardVisuals?.(result);
      }
      if (result.nextWave) {
        // Skip the wave transition animation if the combat-loop already played it
        // locally as part of an optimistic wave prediction — avoid a double-play.
        // Identity-based: compare the confirmed wave number against the high-water
        // mark of locally-animated waves.  A result without nextWaveNumber falls
        // back to always playing (safe default — means an older server version).
        const localHighWater = typeof api.getLastLocallyPlayedKanjiKombatWave === 'function'
          ? api.getLastLocallyPlayedKanjiKombatWave()
          : 0;
        const confirmedWave = typeof result.nextWaveNumber === 'number' ? result.nextWaveNumber : 0;
        if (confirmedWave > 0 && confirmedWave <= localHighWater) {
          // Already played locally — suppress the replay.
        } else {
          await api.playKanjiKombatNextWaveTransition?.(result);
        }
      }
    }
  });
  requestPromptBufferRefillIfLow(response?.state || currentKanjiKombatState());
}

async function handleSessionCorrection(response) {
  // Serialized through sessionReplayChain so corrections and checkpoint replays
  // are never interleaved — each waits for the previous work to complete first.
  await enqueueSessionReplay(async () => {
    await waitForCombatAnimationIdle();
    const state = response?.authoritativeState || response?.state;
    if (state) updateKanjiKombatGameState(state);
    // Snap the local-play high-water mark to the authoritative wave number so that
    // future server-only nextWave transitions (with a higher wave number) still play.
    // A corrected prediction left the mark permanently ahead; resetting it here means
    // only transitions for waves > correctedWave will be suppressed — which is correct
    // because those would only exist if the combat-loop had played them locally again.
    const correctedWave = typeof state?.run?.kanjiKombat?.wave === 'number'
      ? state.run.kanjiKombat.wave
      : 0;
    api.setLastLocallyPlayedKanjiKombatWave?.(correctedWave);
    refreshKanjiKombatAction();
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
        if (result.state) updateKanjiKombatGameState(result.state);
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

function renderKanjiKombatPendingCompletion() {
  const root = actionArea();
  if (!root) return;
  root.innerHTML = `
    <div class="kanji-kombat-completion">
      <div class="kanji-kombat-completion-card">
        <div class="kanji-kombat-completion-title">Saving your session…</div>
      </div>
    </div>
  `;
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

  if (completionPrompt) {
    renderKanjiKombatCompletionChoice({
      onChoice: async keepGoing => {
        const session = getKanjiKombatSession();
        if (!session?.canConsumePrompt()) {
          await showKanjiKombatSyncPause();
          return false;
        }

        const draft = structuredClone(gameState);
        consumePromptHeadDraft(draft, bufferedPrompt);
        if (keepGoing) draft.run.kanjiKombat.endlessMode = true;
        updateKanjiKombatGameState(draft);

        session.recordAction({
          actionId: createActionId('kk'),
          kind: 'completionChoice',
          promptId: bufferedPrompt?.promptId || null,
          sequence: bufferedPrompt?.sequence ?? null,
          cardId: null,
          keepGoing,
        });

        if (!keepGoing) {
          renderKanjiKombatPendingCompletion();
          session.syncNow();
          return true;
        }
        if (!renderKanjiKombatAction(draft)) clearActionArea();
        return true;
      },
    });
    return true;
  }

  const introCard = introPrompt?.intro?.card ?? null;
  if (introCard) {
    renderKanjiKombatIntro(introCard, {
      onChoice: async choice => {
        const session = getKanjiKombatSession();
        if (!session?.canConsumePrompt()) {
          await showKanjiKombatSyncPause();
          return false;
        }

        const draft = structuredClone(gameState);
        consumePromptHeadDraft(draft, introPrompt);
        updateKanjiKombatGameState(draft);

        session.recordAction({
          actionId: createActionId('kk'),
          kind: 'intro',
          promptId: introPrompt?.promptId || null,
          sequence: introPrompt?.sequence ?? null,
          cardId: introCard.id,
          choice,
        });

        if (!renderKanjiKombatAction(draft)) clearActionArea();
        return true;
      },
    });
    return true;
  }

  const quiz = quizPrompt?.quiz || null;
  if (quiz) {
    renderKanjiKombatQuiz(quiz, {
      onAnswer: async answerId => {
        // Gate: same cap check as intro/completion — pause and stop if the session
        // is full so we never fire a legacy server call 50+ actions ahead.
        const session = getKanjiKombatSession();
        if (!session?.canConsumePrompt()) {
          await showKanjiKombatSyncPause();
          return false;
        }
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

  if (!hasBufferedPrompt && getKanjiKombatSession()?.pendingCount() > 0) {
    clearActionArea();
    void showKanjiKombatSyncPause();
    return true;
  }

  return false;
}
