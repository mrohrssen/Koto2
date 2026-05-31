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

export function renderKanjiKombatQuiz(quiz, { onAnswer } = {}) {
  const root = actionArea();
  if (!root || !quiz) return;
  root.innerHTML = `
    <div class="kanji-kombat-panel">
      <div class="kanji-kombat-label">Kanji Kombat</div>
      <div class="kanji-kombat-prompt">${escapeHtml(quiz.prompt)}</div>
      <div class="kanji-kombat-choices">
        ${quiz.choices.map(choice => `
          <button class="kanji-kombat-choice" data-answer-id="${escapeHtml(choice.id)}">
            ${escapeHtml(choice.answer)}
          </button>
        `).join('')}
      </div>
    </div>
  `;
  for (const button of root.querySelectorAll('.kanji-kombat-choice')) {
    button.addEventListener('click', () => onAnswer?.(button.dataset.answerId));
  }
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
  for (const button of root.querySelectorAll('.kanji-kombat-intro-action')) {
    button.addEventListener('click', () => onChoice?.(button.dataset.choice));
  }
}

export function showKanjiKombatCreatureChooser(gameState, { onConfirm } = {}) {
  const root = actionArea();
  const collection = gameState.meta?.creatureCollection || [];
  if (!root) return;
  root.innerHTML = `
    <div class="kanji-kombat-panel">
      <div class="kanji-kombat-label">Choose One Creature</div>
      <div class="kanji-kombat-choices">
        ${collection.map(id => `
          <button class="kanji-kombat-choice" data-creature-id="${escapeHtml(id)}">
            ${escapeHtml(id)}
          </button>
        `).join('')}
      </div>
    </div>
  `;
  for (const button of root.querySelectorAll('.kanji-kombat-choice')) {
    button.addEventListener('click', () => onConfirm?.(button.dataset.creatureId));
  }
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
        api.updateUI();
      },
    });
    return true;
  }

  return false;
}
