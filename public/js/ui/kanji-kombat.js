import { escapeHtml } from './html-utils.js';
import { renderButtonsAsync } from './ui-components.js';
import { getSpeakerId, playDialogueLineAudio } from '../tts.js';
import {
  configureKanjiKombatSession,
  getKanjiKombatSession,
} from './kanji-kombat-session.js';
import {
  applyLocalKanjiKombatWaveTransition,
  isKanjiKombatWaveDead,
} from './kanji-kombat-local-wave.js';
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
const DAILY_COMPLETE_PROMPT_KIND = 'dailyCompletePrompt';
const LEGACY_COMPLETE_PROMPT_KIND = 'completePrompt';
const PROMPT_BUFFER_REFILL_THRESHOLD = 10;
let promptBufferRefillPromise = null;
let latestKanjiKombatState = null;
let reviewSyncOnlineDrainTarget = null;
let reviewSyncVisibilityDrainTarget = null;
let sessionReplayChain = Promise.resolve();
// High-water mark: highest prompt sequence number ever seen in the local buffer.
// Used by mergeServerPromptBufferIntoLocalState to filter out already-consumed
// prompts that the server still has in its (behind) buffer.
let _promptBufferHighSeq = 0;
// High-water mark for pre-rolled streak-reward payload seqs (kk.pendingStreakRewards).
// Same role as _promptBufferHighSeq: lets the checkpoint merge adopt only genuine
// tail payloads the client has never held, even after local queues drain.
let _streakRewardHighSeq = 0;

function isDailyCompletePrompt(prompt) {
  return prompt?.kind === DAILY_COMPLETE_PROMPT_KIND
    || prompt?.kind === LEGACY_COMPLETE_PROMPT_KIND;
}

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
  _promptBufferHighSeq = 0;
  _streakRewardHighSeq = 0;
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
    window.addEventListener('online', () => {
      getKanjiKombatSession()?.syncNow();
    });
    // Expose a test seam so automated harnesses can wait for pending syncs to drain.
    window.__kkPendingSync = () => getKanjiKombatSession()?.pendingCount() ?? 0;
    // Test seam: current game phase (e.g. to detect a server-confirmed defeat
    // flipping the client to run_ended after a reconnect checkpoint).
    window.__kkPhase = () => (typeof api.getGameState === 'function'
      ? api.getGameState()?.phase ?? null
      : null);
    // Test seam: current prompt-buffer head. Lets harnesses derive the correct
    // quiz choice from game state — the rendered DOM carries no answer marker.
    window.__kkPromptHead = () => (typeof api.getGameState === 'function'
      ? api.getGameState()?.run?.kanjiKombat?.promptBuffer?.[0] ?? null
      : null);
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

/**
 * Returns true when the action area contains ANY rendered KK prompt markup —
 * fresh, disabled (answer in flight), or feedback-marked.
 *
 * Gates checkpoint full-snaps in handleSessionCheckpoint: with optimistic
 * rendering the local buffer advances ahead of the server, so snapping the game
 * state to the server's confirmed-but-potentially-behind version is only safe
 * when NO KK prompt markup is present.  Any rendered prompt means local
 * optimistic state is ahead — overwriting it would regress the buffer and
 * cause an already-shown or just-answered prompt to be offered again (duplicate).
 */
function hasRenderedKanjiKombatPrompt() {
  if (typeof document === 'undefined') return false;
  const area = document.getElementById('action-area');
  if (!area) return false;
  // Return true when the action area holds ANY KK prompt — fresh, disabled, or
  // feedback-marked.  A disabled button means bindSingleFlightButtons has set
  // inFlight=true: an answer click is being processed asynchronously.  Overwriting
  // the game state at that moment would regress the local buffer and cause the
  // just-answered prompt to be offered again (duplicate detection failure).
  if (area.querySelector('.kanji-kombat-choice')) return true;
  if (area.querySelector('.kanji-kombat-intro-action')) return true;
  if (area.querySelector('.kanji-kombat-completion-action')) return true;
  return false;
}

function getActiveBufferedPrompt(kk) {
  return Array.isArray(kk?.promptBuffer) ? kk.promptBuffer[0] || null : null;
}

function rememberKanjiKombatState(state) {
  if (!state) return;
  latestKanjiKombatState = state;
  // Track the highest prompt sequence ever placed in the local buffer so that
  // mergeServerPromptBufferIntoLocalState can filter out already-consumed entries
  // that the (behind) server still carries in its confirmed buffer.
  const buf = state?.run?.kanjiKombat?.promptBuffer;
  if (Array.isArray(buf) && buf.length > 0) {
    for (const p of buf) {
      if (Number.isInteger(p.sequence) && p.sequence > _promptBufferHighSeq) {
        _promptBufferHighSeq = p.sequence;
      }
    }
  }
  // Track the highest streak-reward payload seq ever held locally so the
  // checkpoint merge only adopts genuine server-side tail payloads.
  const rewards = state?.run?.kanjiKombat?.pendingStreakRewards;
  if (rewards && typeof rewards === 'object') {
    for (const queue of Object.values(rewards)) {
      if (!Array.isArray(queue)) continue;
      for (const payload of queue) {
        if (Number.isInteger(payload?.seq) && payload.seq > _streakRewardHighSeq) {
          _streakRewardHighSeq = payload.seq;
        }
      }
    }
  }
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

/**
 * Merge new tail prompts from a server checkpoint state into the current local state.
 *
 * After the server confirms a batch it refills the prompt buffer up to
 * PROMPT_BUFFER_TARGET.  These new tail entries are not in the client's local
 * buffer (which was forked from an earlier server state) and must be appended
 * so that the client survives long offline windows without exhausting its local
 * buffer.  Only prompts whose promptId is not already present in the local
 * buffer are appended — existing local entries (including the currently-shown
 * head) are left untouched, preventing any regression or re-rendering of
 * already-answered prompts.
 */
function mergeServerPromptBufferIntoLocalState(serverState) {
  const localState = currentKanjiKombatState();
  const localKk = localState?.run?.kanjiKombat;
  const serverKk = serverState?.run?.kanjiKombat;
  if (!localKk || !serverKk) return;
  // Adopt new tail entries from the server's pre-rolled next-wave queue.  While
  // the client plays optimistically, the server replays entries, spawns waves and
  // tops the queue up — server-side only.  The client consumes its local queue at
  // each boundary, so without this adoption it eventually reaches a boundary with
  // an empty queue and stalls.  Append-only merge (mirrors the prompt-buffer tail
  // merge): adopt server entries that extend the local queue with consecutive wave
  // numbers, starting after max(local current wave, local queue tail).  Entries the
  // client already holds are never replaced (it may have simulated against them),
  // and entries with wave <= the local current wave are stale and ignored.
  const serverWaveQueue = Array.isArray(serverKk.pendingNextWaves) ? serverKk.pendingNextWaves : [];
  const localWave = localKk.wave || 1;
  if (serverWaveQueue.length > 0) {
    if (!Array.isArray(localKk.pendingNextWaves)) localKk.pendingNextWaves = [];
    const localWaveQueue = localKk.pendingNextWaves;
    let expectedWave = localWaveQueue.length > 0
      ? localWaveQueue[localWaveQueue.length - 1].wave + 1
      : localWave + 1;
    for (const entry of serverWaveQueue) {
      if (typeof entry?.wave !== 'number') continue;
      if (entry.wave !== expectedWave) continue;
      localWaveQueue.push(entry);
      expectedWave += 1;
    }
  }
  // Adopt new tail streak-reward payloads (statUp at streak 6 / allyJoin at 12)
  // from the server's pre-rolled queues.  Same append-only contract as the wave
  // queue: the client consumes local queue heads at milestones while the server
  // replays entries and tops the queues up server-side.  Payloads carry a
  // monotonic seq; only seqs above any the client has ever held are appended.
  const serverRewards = serverKk.pendingStreakRewards;
  if (serverRewards && typeof serverRewards === 'object') {
    if (!localKk.pendingStreakRewards || typeof localKk.pendingStreakRewards !== 'object') {
      localKk.pendingStreakRewards = {};
    }
    const localRewardHighSeq = Math.max(
      _streakRewardHighSeq,
      ...Object.values(localKk.pendingStreakRewards)
        .flatMap(queue => (Array.isArray(queue) ? queue : []))
        .map(payload => (Number.isInteger(payload?.seq) ? payload.seq : 0)),
      0,
    );
    for (const [milestone, serverQueue] of Object.entries(serverRewards)) {
      if (!Array.isArray(serverQueue)) continue;
      if (!Array.isArray(localKk.pendingStreakRewards[milestone])) {
        localKk.pendingStreakRewards[milestone] = [];
      }
      for (const payload of serverQueue) {
        if (!Number.isInteger(payload?.seq) || payload.seq <= localRewardHighSeq) continue;
        localKk.pendingStreakRewards[milestone].push(payload);
        if (payload.seq > _streakRewardHighSeq) _streakRewardHighSeq = payload.seq;
      }
    }
  }
  if (!Array.isArray(localKk.promptBuffer) || !Array.isArray(serverKk.promptBuffer)) return;
  // Use the high-water mark (highest sequence ever in the local buffer) rather than
  // current buffer IDs.  The server's confirmed buffer may still include prompts the
  // client already consumed (the client is ahead); filtering by promptId alone would
  // re-add those consumed entries as "new".  Filtering by sequence > highWater gives
  // only genuine tail additions that have never been in the client's buffer.
  const highSeq = Math.max(
    _promptBufferHighSeq,
    ...localKk.promptBuffer.map(p => (Number.isInteger(p.sequence) ? p.sequence : 0)),
  );
  const newTailPrompts = serverKk.promptBuffer.filter(
    p => p.promptId && Number.isInteger(p.sequence) && p.sequence > highSeq,
  );
  if (newTailPrompts.length === 0) return;
  // Invariant: this mutates the live state object — the same reference the
  // combat loop reads via getGameState().
  localKk.promptBuffer = [...localKk.promptBuffer, ...newTailPrompts];
}

function handleSessionCheckpoint(response, { logEmpty } = {}) {
  if (response?.state) {
    // Always merge new tail prompts from the server's refilled buffer into the local
    // state — this is safe at every checkpoint (not just when the log is empty) because
    // mergeServerPromptBufferIntoLocalState only appends prompts whose sequence is
    // greater than any the client has ever seen.  It never regresses the local buffer.
    // This keeps the client buffer topped up during online windows so it can survive
    // long offline windows without running dry.
    mergeServerPromptBufferIntoLocalState(response.state);

    if (logEmpty && !hasRenderedKanjiKombatPrompt()) {
      // Guard: with optimistic rendering the local buffer advances ahead of the server.
      // If the action area is already showing a fresh interactive prompt the combat loop
      // is healthy — snapping to the confirmed-but-behind server state would regress the
      // buffer and re-offer an already-answered prompt (duplicate detection failure).
      updateKanjiKombatGameState(response.state);
    }
  }
  const results = response?.results || [];
  const finalResult = results.findLast?.(r => r.combatEnded)
    || results.slice().reverse().find(r => r.combatEnded);
  if (finalResult) {
    api.finishCombatResult?.({ ...finalResult, state: response.state });
    return;
  }
  // Re-render the action after applying state (e.g. when combat was inactive after
  // a graceful-pause wave end — this unblocks the player).
  if (response?.state && logEmpty && !hasRenderedKanjiKombatPrompt()) {
    refreshKanjiKombatAction();
  }
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
  const corrHead = (response?.authoritativeState || response?.state)?.run?.kanjiKombat?.promptBuffer?.[0]?.promptId ?? null;
  console.warn('[KanjiKombat] sync corrected', {
    reason: response?.reason,
    confirmedThroughSeq: response?.confirmedThroughSeq,
    rejectedSeq: response?.rejectedSeq,
    corrHead,
  });
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
  kk.completionChoicePending = isDailyCompletePrompt(next);
}

function requestPromptBufferRefillIfLow(state) {
  const kk = state?.run?.kanjiKombat;
  if (!Array.isArray(kk?.promptBuffer)) return;
  if (kk.promptBuffer.length >= PROMPT_BUFFER_REFILL_THRESHOLD) return;
  if (promptBufferRefillPromise || typeof api.refillPromptBuffer !== 'function') return;
  rememberKanjiKombatState(state);
  promptBufferRefillPromise = Promise.resolve(api.refillPromptBuffer())
    .then(result => {
      if (result?.state) {
        // Use merge semantics: safely add new tail prompts from the refill response
        // without snapping local state to the server's behind-state.  The server may
        // still be behind the client's optimistic advances, so only the genuinely new
        // tail entries (sequence > _promptBufferHighSeq) are appended.
        mergeServerPromptBufferIntoLocalState(result.state);
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
  // Ensure the session epoch is current whenever we render a KK prompt.
  // initKanjiKombatUI runs at app boot (before game state is loaded), so the
  // session may start with sessionEpoch=null.  Adopting here — each time a prompt
  // is about to be offered — guarantees the epoch is set before the first sync.
  getKanjiKombatSession()?.adoptServerState(gameState);
  const kk = gameState.run?.kanjiKombat;
  const cursor = gameState.combat?.actionCursor;
  if (kk?.onboardingPending) return true;
  if (!kk || cursor?.side !== 'ally') return false;
  const bufferedPrompt = getActiveBufferedPrompt(kk);
  const completionPrompt = isDailyCompletePrompt(bufferedPrompt);
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
        if (keepGoing && isKanjiKombatWaveDead(draft)) {
          applyLocalKanjiKombatWaveTransition(draft);
        }
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
    // Graceful-pause gate: a quiz can only be answered against a LIVE local wave.
    // After a wave-clear with no local pre-roll (offline runway exhausted) the local
    // enemies are all defeated and the seed chain belongs to the cleared wave —
    // predicting against it generates garbage entries the server rejects with
    // transcript_mismatch.  The combat-loop's graceful pause stops its own selection
    // loop, but intro/completion onChoice chains also route through here, so this is
    // the single chokepoint.  Clear the action area (so the checkpoint handler's
    // hasRenderedKanjiKombatPrompt() guard sees no live prompt, snaps to the
    // server's authoritative wave state, and refreshes the action) and nudge a sync.
    // Only a non-empty enemies array with no living member counts as a dead wave —
    // a missing/empty array means combat state isn't loaded (or a non-combat render)
    // and must not gate.
    const _enemies = gameState.combat?.enemies;
    const waveDead = Array.isArray(_enemies)
      && _enemies.length > 0
      && !_enemies.some(e => e && e.hp > 0 && e.befriended !== true);
    if (waveDead) {
      clearActionArea();
      getKanjiKombatSession()?.syncNow();
      void showKanjiKombatSyncPause();
      return true;
    }
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
