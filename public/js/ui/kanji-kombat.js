import { escapeHtml } from './html-utils.js';
import { getSpeakerId, playDialogueLineAudio } from '../tts.js';

let api = {
  submitAnswer: null,
  submitIntro: null,
  submitCompletionChoice: null,
  updateGameState: null,
  updateUI: null,
  refreshAction: null,
  finishCombatResult: null,
  playCorrectAnswerAudio: null,
};

export function initKanjiKombatUI(deps) {
  api = { ...api, ...deps };
}

function actionArea() {
  return document.getElementById('action-area');
}

function bindSingleFlightButtons(buttons, getValue, handler, { beforeSubmit = null } = {}) {
  let inFlight = false;
  for (const button of buttons) {
    button.addEventListener('click', async () => {
      if (inFlight) return;
      inFlight = true;
      beforeSubmit?.(button, buttons);
      buttons.forEach(btn => { btn.disabled = true; });
      try {
        await handler?.(getValue(button));
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
  return card?.audioText || card?.reading || card?.prompt || '';
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
  const kk = gameState.run?.kanjiKombat;
  const cursor = gameState.combat?.actionCursor;
  if (!kk || cursor?.side !== 'ally') return false;

  if (kk.completionChoicePending) {
    renderKanjiKombatCompletionChoice({
      onChoice: async keepGoing => {
        const result = await api.submitCompletionChoice(keepGoing);
        if (result?.state) api.updateGameState(result.state);
        if (result?.combatEnded) {
          api.finishCombatResult?.(result);
          return;
        }
        if (result?.state && typeof api.refreshAction === 'function') {
          api.refreshAction();
          return;
        }
        api.updateUI();
      },
    });
    return true;
  }

  if (kk.pendingIntro?.card) {
    renderKanjiKombatIntro(kk.pendingIntro.card, {
      onChoice: async choice => {
        const result = await api.submitIntro(kk.pendingIntro.card.id, choice);
        if (result?.state) api.updateGameState(result.state);
        if (result?.state && typeof api.refreshAction === 'function') {
          api.refreshAction();
          return;
        }
        api.updateUI();
      },
    });
    return true;
  }

  if (kk.currentQuiz) {
    renderKanjiKombatQuiz(kk.currentQuiz, {
      onAnswer: async answerId => {
        const result = await api.submitAnswer(answerId);
        if (result?.handledByCombatLoop) return;
        if (result?.state) api.updateGameState(result.state);
        if (result) api.updateUI();
      },
    });
    return true;
  }

  return false;
}
