import { escapeHtml } from './html-utils.js';

let api = {
  submitAnswer: null,
  submitIntro: null,
  updateGameState: null,
  updateUI: null,
};

export function initKanjiKombatUI(deps) {
  api = { ...api, ...deps };
}

function actionArea() {
  return document.getElementById('action-area');
}

function bindSingleFlightButtons(buttons, getValue, handler) {
  let inFlight = false;
  for (const button of buttons) {
    button.addEventListener('click', async () => {
      if (inFlight) return;
      inFlight = true;
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

export function renderKanjiKombatQuiz(quiz, { onAnswer } = {}) {
  const root = actionArea();
  if (!root || !quiz) return;
  root.innerHTML = `
    <div class="kanji-kombat-panel">
      <div class="kanji-kombat-label">Kanji Kombat</div>
      <div class="kanji-kombat-prompt">${escapeHtml(quiz.prompt)}</div>
      <div class="move-grid kanji-kombat-choice-grid">
        ${quiz.choices.map(choice => `
          <button class="move-cell move-cell--neutral kanji-kombat-choice" type="button" data-answer-id="${escapeHtml(choice.id)}">
            <div class="move-hero">
              <div class="move-badge">答</div>
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
    onAnswer
  );
}

export function renderKanjiKombatIntro(card, { onChoice } = {}) {
  const root = actionArea();
  if (!root || !card) return;
  root.innerHTML = `
    <div class="kanji-kombat-intro">
      <div class="kanji-kombat-intro-card">
        <div class="kanji-kombat-prompt">${escapeHtml(card.prompt)}</div>
        <div class="kanji-kombat-reading">${escapeHtml(card.reading || card.prompt)}</div>
        <div class="kanji-kombat-answer">${escapeHtml(card.answer)}</div>
      </div>
      <div class="kanji-kombat-intro-actions">
        <button class="kanji-kombat-intro-action" data-choice="known">I knew it</button>
        <button class="kanji-kombat-intro-action" data-choice="unknown">I didn't know it</button>
      </div>
    </div>
  `;
  bindSingleFlightButtons(
    [...root.querySelectorAll('.kanji-kombat-intro-action')],
    button => button.dataset.choice,
    onChoice
  );
}

export function renderKanjiKombatAction(gameState) {
  const kk = gameState.run?.kanjiKombat;
  const cursor = gameState.combat?.actionCursor;
  if (!kk || cursor?.side !== 'ally') return false;

  if (kk.pendingIntro?.card) {
    renderKanjiKombatIntro(kk.pendingIntro.card, {
      onChoice: async choice => {
        const result = await api.submitIntro(kk.pendingIntro.card.id, choice);
        if (result?.state) api.updateGameState(result.state);
        api.updateUI();
      },
    });
    return true;
  }

  if (kk.currentQuiz) {
    renderKanjiKombatQuiz(kk.currentQuiz, {
      onAnswer: async answerId => {
        const result = await api.submitAnswer(answerId);
        if (result?.state) api.updateGameState(result.state);
        if (result) api.updateUI();
      },
    });
    return true;
  }

  return false;
}
