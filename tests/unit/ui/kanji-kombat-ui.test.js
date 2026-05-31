import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderKanjiKombatIntro,
  renderKanjiKombatQuiz,
} from '../../../public/js/ui/kanji-kombat.js';

class FakeButton {
  constructor(dataset = {}, textContent = '') {
    this.dataset = dataset;
    this.textContent = textContent;
    this.disabled = false;
    this.listeners = new Map();
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
      ...value.matchAll(/<button class="([^"]*)"[^>]*(?:data-answer-id|data-creature-id)="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g)
    ].map(match => {
      const dataset = match[0].includes('data-answer-id')
        ? { answerId: match[2] }
        : { creatureId: match[2] };
      const button = new FakeButton(dataset, match[3].replace(/<[^>]+>/g, '').trim());
      button.className = match[1];
      return button;
    });
    this.buttons.push(...[
      ...value.matchAll(/<button class="([^"]*)"[^>]*data-choice="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g)
    ].map(match => {
      const button = new FakeButton({ choice: match[2] }, match[3].replace(/<[^>]+>/g, '').trim());
      button.className = match[1];
      return button;
    }));
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
      const match = this.innerHTML.match(/<div class="kanji-kombat-intro-card">([\s\S]*?)<\/div>\s*<div class="kanji-kombat-intro-actions">/);
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

  it('renders intro modal actions', () => {
    renderKanjiKombatIntro({ id: 'kanji:上', prompt: '上', reading: 'じょう', answer: 'Above' }, { onChoice: () => {} });
    assert.equal(actionArea.querySelector('.kanji-kombat-intro-card').textContent.includes('上'), true);
    assert.equal(actionArea.querySelectorAll('.kanji-kombat-intro-action').length, 2);
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
});
