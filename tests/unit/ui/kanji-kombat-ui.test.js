import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  initKanjiKombatUI,
  renderKanjiKombatAction,
  renderKanjiKombatCompletionChoice,
  renderKanjiKombatIntro,
  renderKanjiKombatQuiz,
} from '../../../public/js/ui/kanji-kombat.js';

class FakeClassList {
  constructor(button) {
    this.button = button;
  }

  add(...tokens) {
    const classNames = new Set(this.button.className.split(/\s+/).filter(Boolean));
    tokens.forEach(token => classNames.add(token));
    this.button.className = [...classNames].join(' ');
  }

  remove(...tokens) {
    const removals = new Set(tokens);
    this.button.className = this.button.className
      .split(/\s+/)
      .filter(token => token && !removals.has(token))
      .join(' ');
  }

  contains(token) {
    return this.button.className.split(/\s+/).includes(token);
  }
}

class FakeButton {
  constructor(dataset = {}, textContent = '') {
    this.dataset = dataset;
    this.textContent = textContent;
    this.disabled = false;
    this.listeners = new Map();
    this.className = '';
    this.classList = new FakeClassList(this);
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  click() {
    return this.listeners.get('click')?.({ currentTarget: this });
  }
}

class FakeActionArea {
  constructor() {
    this._innerHTML = '';
    this.buttons = [];
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this.buttons = [
      ...value.matchAll(/<button class="([^"]*)"([^>]*)>([\s\S]*?)<\/button>/g)
    ].map(match => {
      const dataset = {};
      for (const [, attribute, attributeValue] of match[2].matchAll(/\s(data-[a-z-]+)="([^"]*)"/g)) {
        const key = attribute
          .slice('data-'.length)
          .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        dataset[key] = attributeValue;
      }
      const button = new FakeButton(dataset, match[3].replace(/<[^>]+>/g, '').trim());
      button.className = match[1];
      return button;
    });
  }

  get innerHTML() {
    return this._innerHTML;
  }

  querySelector(selector) {
    if (selector === '.kanji-kombat-prompt') {
      const match = this.innerHTML.match(/<div class="kanji-kombat-prompt">([^<]*)<\/div>/);
      return match ? { textContent: match[1] } : null;
    }
    if (selector === '.kanji-kombat-intro-card') {
      const match = this.innerHTML.match(/<div class="kanji-kombat-intro-card">([\s\S]*?)<\/div>\s*<div class="[^"]*kanji-kombat-intro-actions[^"]*">/);
      return match ? { textContent: match[1].replace(/<[^>]+>/g, '') } : null;
    }
    return null;
  }

  querySelectorAll(selector) {
    if (selector === '.kanji-kombat-choice') {
      return this.buttons.filter(button => button.className.split(/\s+/).includes('kanji-kombat-choice'));
    }
    if (selector === '.kanji-kombat-intro-action') {
      return this.buttons.filter(button => button.className.split(/\s+/).includes('kanji-kombat-intro-action'));
    }
    if (selector === '.kanji-kombat-completion-action') {
      return this.buttons.filter(button => button.className.split(/\s+/).includes('kanji-kombat-completion-action'));
    }
    return [];
  }
}

describe('kanji-kombat ui', () => {
  let actionArea;

  beforeEach(() => {
    actionArea = new FakeActionArea();
    global.document = {
      getElementById: id => id === 'action-area' ? actionArea : null,
      createElement: () => {
        const element = { _text: '' };
        Object.defineProperty(element, 'textContent', {
          set(value) { element._text = String(value ?? ''); },
          get() { return element._text; },
        });
        Object.defineProperty(element, 'innerHTML', {
          get() {
            return element._text
              .replaceAll('&', '&amp;')
              .replaceAll('<', '&lt;')
              .replaceAll('>', '&gt;')
              .replaceAll('"', '&quot;');
          },
        });
        return element;
      },
    };
  });

  it('renders prompt and four quiz choices', () => {
    const quiz = {
      prompt: 'あ',
      type: 'hiragana',
      choices: [
        { id: 'a', answer: 'a' },
        { id: 'i', answer: 'i' },
        { id: 'u', answer: 'u' },
        { id: 'e', answer: 'e' },
      ],
    };
    renderKanjiKombatQuiz(quiz, { onAnswer: () => {} });
    assert.equal(actionArea.querySelector('.kanji-kombat-prompt').textContent, 'あ');
    assert.equal(actionArea.querySelectorAll('.kanji-kombat-choice').length, 4);
  });

  it('renders quiz answers in the combat move grid layout', () => {
    renderKanjiKombatQuiz({
      prompt: '火',
      choices: [
        { id: 'fire', answer: 'fire' },
        { id: 'water', answer: 'water' },
        { id: 'tree', answer: 'tree' },
        { id: 'metal', answer: 'metal' },
      ],
    }, { onAnswer: () => {} });

    assert.match(actionArea.innerHTML, /class="move-grid/);
    assert.doesNotMatch(actionArea.innerHTML, /Kanji Kombat/);
    assert.doesNotMatch(actionArea.innerHTML, /move-badge|答/);
    assert.equal(actionArea.querySelectorAll('.kanji-kombat-choice').every(button =>
      button.className.split(/\s+/).includes('move-cell')
    ), true);
  });

  it('delegates quiz answer clicks without forcing a UI rerender', async () => {
    const calls = [];
    const { initKanjiKombatUI, renderKanjiKombatAction } = await import('../../../public/js/ui/kanji-kombat.js');
    initKanjiKombatUI({
      submitAnswer: async answerId => {
        calls.push(answerId);
      },
      updateGameState: () => calls.push('unexpected-state'),
      updateUI: () => calls.push('unexpected-render'),
    });

    renderKanjiKombatAction({
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          currentQuiz: {
            prompt: '火',
            choices: [
              { id: 'fire', answer: 'fire' },
              { id: 'water', answer: 'water' },
              { id: 'tree', answer: 'tree' },
              { id: 'metal', answer: 'metal' },
            ],
          },
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });
    actionArea.querySelectorAll('.kanji-kombat-choice')[0].click();
    await Promise.resolve();

    assert.deepEqual(calls, ['fire']);
  });

  it('plays narrator TTS for the correct answer when any quiz choice is selected', async () => {
    const calls = [];
    initKanjiKombatUI({
      submitAnswer: async answerId => {
        calls.push(['submitAnswer', answerId]);
      },
      playCorrectAnswerAudio: answer => calls.push(['tts', answer]),
      updateGameState: () => calls.push(['unexpected-state']),
      updateUI: () => calls.push(['unexpected-render']),
    });

    renderKanjiKombatAction({
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          currentQuiz: {
            prompt: '火',
            choices: [
              { id: 'fire', answer: 'Fire', correct: true },
              { id: 'water', answer: 'Water', correct: false },
            ],
          },
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });

    await actionArea.querySelectorAll('.kanji-kombat-choice')[1].click();

    assert.deepEqual(calls, [
      ['tts', 'Fire'],
      ['submitAnswer', 'water'],
    ]);
  });

  it('marks the selected quiz choice green when it is correct', async () => {
    renderKanjiKombatQuiz({
      prompt: '火',
      choices: [
        { id: 'fire', answer: 'Fire', correct: true },
        { id: 'water', answer: 'Water', correct: false },
      ],
    }, { onAnswer: async () => {} });

    const [correctButton, wrongButton] = actionArea.querySelectorAll('.kanji-kombat-choice');
    await correctButton.click();

    assert.equal(correctButton.classList.contains('kanji-kombat-choice--correct-selected'), true);
    assert.equal(correctButton.classList.contains('kanji-kombat-choice--wrong-selected'), false);
    assert.equal(wrongButton.classList.contains('kanji-kombat-choice--correct-answer'), false);
  });

  it('marks a wrong quiz choice red and the correct answer green', async () => {
    renderKanjiKombatQuiz({
      prompt: '火',
      choices: [
        { id: 'fire', answer: 'Fire', correct: true },
        { id: 'water', answer: 'Water', correct: false },
      ],
    }, { onAnswer: async () => {} });

    const [correctButton, wrongButton] = actionArea.querySelectorAll('.kanji-kombat-choice');
    await wrongButton.click();

    assert.equal(wrongButton.classList.contains('kanji-kombat-choice--wrong-selected'), true);
    assert.equal(wrongButton.classList.contains('kanji-kombat-choice--correct-selected'), false);
    assert.equal(correctButton.classList.contains('kanji-kombat-choice--correct-answer'), true);
  });

  it('renders intro modal actions', () => {
    renderKanjiKombatIntro({ id: 'kanji:上', prompt: '上', reading: 'じょう', answer: 'Above' }, { onChoice: () => {} });
    assert.equal(actionArea.querySelector('.kanji-kombat-intro-card').textContent.includes('上'), true);
    assert.match(actionArea.innerHTML, /New discovery!/);
    assert.match(actionArea.innerHTML, /I didn't know it yet/);
    assert.match(actionArea.innerHTML, /I already know it/);
    assert.match(actionArea.innerHTML, /lookup-action-forgot/);
    assert.match(actionArea.innerHTML, /lookup-action-knew/);
    assert.equal(actionArea.querySelectorAll('.kanji-kombat-intro-action').length, 2);
  });

  it('plays the same answer TTS when a discovery intro appears', () => {
    const calls = [];
    initKanjiKombatUI({
      playCorrectAnswerAudio: answer => calls.push(['tts', answer]),
    });

    renderKanjiKombatIntro({ id: 'kanji:上', prompt: '上', reading: 'じょう', answer: 'Above' }, { onChoice: () => {} });

    assert.deepEqual(calls, [
      ['tts', 'Above'],
    ]);
  });

  it('renders completion choice actions', () => {
    renderKanjiKombatCompletionChoice({ onChoice: () => {} });
    assert.match(actionArea.innerHTML, /Your reviews are done for the day!/);
    assert.match(actionArea.innerHTML, /Would you like to keep going\?/);
    assert.equal(actionArea.querySelectorAll('.kanji-kombat-completion-action').length, 2);
    assert.equal(actionArea.querySelectorAll('.kanji-kombat-completion-action')[0].textContent, 'No');
    assert.equal(actionArea.querySelectorAll('.kanji-kombat-completion-action')[1].textContent, 'Yes');
  });

  it('continues after the completion prompt without ending combat', async () => {
    const calls = [];
    initKanjiKombatUI({
      submitCompletionChoice: async keepGoing => {
        calls.push(['submitCompletionChoice', keepGoing]);
        return { state: { phase: 'combat' } };
      },
      updateGameState: state => calls.push(['updateGameState', state.phase]),
      refreshAction: () => calls.push(['refreshAction']),
      updateUI: () => calls.push(['updateUI']),
      finishCombatResult: () => calls.push(['unexpected-finish']),
    });

    renderKanjiKombatAction({
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: { completionChoicePending: true },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });
    await actionArea.querySelectorAll('.kanji-kombat-completion-action')[1].click();

    assert.deepEqual(calls, [
      ['submitCompletionChoice', true],
      ['updateGameState', 'combat'],
      ['refreshAction'],
    ]);
  });

  it('finishes combat after the completion prompt is declined', async () => {
    const calls = [];
    initKanjiKombatUI({
      submitCompletionChoice: async keepGoing => {
        calls.push(['submitCompletionChoice', keepGoing]);
        return { state: { phase: 'combat' }, combatEnded: true, victory: true };
      },
      updateGameState: state => calls.push(['updateGameState', state.phase]),
      finishCombatResult: result => calls.push(['finishCombatResult', result.victory]),
      refreshAction: () => calls.push(['unexpected-refresh']),
      updateUI: () => calls.push(['unexpected-update']),
    });

    renderKanjiKombatAction({
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: { completionChoicePending: true },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });
    await actionArea.querySelectorAll('.kanji-kombat-completion-action')[0].click();

    assert.deepEqual(calls, [
      ['submitCompletionChoice', false],
      ['updateGameState', 'combat'],
      ['finishCombatResult', true],
    ]);
  });

  it('refreshes the combat action after intro choice state updates', async () => {
    const calls = [];
    initKanjiKombatUI({
      submitIntro: async (cardId, choice) => {
        calls.push(['submitIntro', cardId, choice]);
        return { state: { phase: 'combat' } };
      },
      updateGameState: state => calls.push(['updateGameState', state.phase]),
      updateUI: () => calls.push(['updateUI']),
      refreshAction: () => calls.push(['refreshAction']),
    });

    renderKanjiKombatAction({
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          pendingIntro: {
            card: { id: 'hiragana:か', prompt: 'か', reading: 'か', answer: 'ka' },
          },
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });
    await actionArea.querySelectorAll('.kanji-kombat-intro-action')[0].click();

    assert.deepEqual(calls, [
      ['submitIntro', 'hiragana:か', 'unknown'],
      ['updateGameState', 'combat'],
      ['refreshAction'],
    ]);
  });

  it('omits duplicate intro readings when the reading matches the prompt', () => {
    renderKanjiKombatIntro({ id: 'hiragana:お', prompt: 'お', reading: 'お', answer: 'o' }, { onChoice: () => {} });
    assert.doesNotMatch(actionArea.innerHTML, /kanji-kombat-reading/);
    assert.match(actionArea.innerHTML, /kanji-kombat-answer/);
  });

  it('ignores duplicate quiz answer taps while the first answer is in flight', async () => {
    const quiz = {
      prompt: 'あ',
      choices: [
        { id: 'a', answer: 'a' },
        { id: 'i', answer: 'i' },
      ],
    };
    let calls = 0;
    let resolveAnswer;
    const pending = new Promise(resolve => { resolveAnswer = resolve; });

    renderKanjiKombatQuiz(quiz, {
      onAnswer: async () => {
        calls++;
        await pending;
      },
    });

    const [first] = actionArea.querySelectorAll('.kanji-kombat-choice');
    const firstClick = first.click();
    first.click();

    assert.equal(calls, 1);
    assert.equal(first.disabled, true);

    resolveAnswer();
    await firstClick;
  });

  it('delegates quiz answers to the injected combat playback handler', async () => {
    const quiz = {
      prompt: '火',
      choices: [
        { id: 'fire', answer: 'Fire' },
        { id: 'water', answer: 'Water' },
      ],
    };
    const calls = [];

    renderKanjiKombatQuiz(quiz, {
      onAnswer: async answerId => {
        calls.push(answerId);
        return { handledByCombatLoop: true };
      },
    });

    const [first] = actionArea.querySelectorAll('.kanji-kombat-choice');
    await first.click();

    assert.deepEqual(calls, ['fire']);
  });

  it('uses submitAnswer as the owner of quiz result playback', async () => {
    const state = {
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          currentQuiz: {
            prompt: '火',
            choices: [{ id: 'fire', answer: 'Fire' }],
          },
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    };
    let updateUICalls = 0;
    const submitted = [];

    initKanjiKombatUI({
      submitAnswer: async answerId => {
        submitted.push(answerId);
        return { handledByCombatLoop: true };
      },
      submitIntro: async () => ({}),
      updateGameState: () => {},
      updateUI: () => { updateUICalls += 1; },
    });

    assert.equal(renderKanjiKombatAction(state), true);
    const [first] = actionArea.querySelectorAll('.kanji-kombat-choice');
    await first.click();

    assert.deepEqual(submitted, ['fire']);
    assert.equal(updateUICalls, 0);
  });
});
