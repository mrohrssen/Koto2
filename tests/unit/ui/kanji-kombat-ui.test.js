import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderKanjiKombatIntro,
  renderKanjiKombatQuiz,
  showKanjiKombatCreatureChooser,
} from '../../../public/js/ui/kanji-kombat.js';

class FakeButton {
  constructor(dataset = {}, textContent = '') {
    this.dataset = dataset;
    this.textContent = textContent;
  }

  addEventListener() {}
}

class FakeActionArea {
  constructor() {
    this.innerHTML = '';
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
      return [...this.innerHTML.matchAll(/class="kanji-kombat-choice"[^>]*data-(?:answer-id|creature-id)="([^"]*)"/g)]
        .map(match => new FakeButton({ answerId: match[1], creatureId: match[1] }));
    }
    if (selector === '.kanji-kombat-intro-action') {
      return [...this.innerHTML.matchAll(/class="kanji-kombat-intro-action"[^>]*data-choice="([^"]*)"/g)]
        .map(match => new FakeButton({ choice: match[1] }));
    }
    if (selector === '[data-creature-id]') {
      return [...this.innerHTML.matchAll(/data-creature-id="([^"]*)"/g)]
        .map(match => new FakeButton({ creatureId: match[1] }));
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

  it('renders intro modal actions', () => {
    renderKanjiKombatIntro({ id: 'kanji:上', prompt: '上', reading: 'じょう', answer: 'Above' }, { onChoice: () => {} });
    assert.equal(actionArea.querySelector('.kanji-kombat-intro-card').textContent.includes('上'), true);
    assert.equal(actionArea.querySelectorAll('.kanji-kombat-intro-action').length, 2);
  });

  it('renders a one-creature chooser from the collection', () => {
    showKanjiKombatCreatureChooser({ meta: { creatureCollection: ['hi', 'neko'] } }, { onConfirm: () => {} });
    assert.equal(actionArea.querySelectorAll('[data-creature-id]').length, 2);
  });
});
