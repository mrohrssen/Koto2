import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.className = '';
    this.innerHTML = '';
    this.children = [];
    this.removed = false;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  remove() {
    this.removed = true;
  }
}

let bondSummary = null;
let dialogueCards = [];
let choiceCalls = [];

globalThis.document = {
  body: {
    appendChild: el => {
      bondSummary = el;
      return el;
    },
  },
  createElement: tagName => new FakeElement(tagName),
  querySelector: selector => (selector === '.bond-summary' ? bondSummary : null),
};

await mock.module('../../../public/js/ui/npc-dialogue-card.js', {
  namedExports: {
    showNpcDialogueCard: async options => { dialogueCards.push(options); },
  },
});

await mock.module('../../../public/js/ui/ui-components.js', {
  namedExports: {
    renderChoicesAsync: options => {
      choiceCalls.push(options);
      return Promise.resolve(0);
    },
  },
});

await mock.module('../../../public/js/tts.js', {
  namedExports: {
    playDialogueAudio: () => {},
  },
});

const { init, runNpcDialogue } = await import('../../../public/js/ui/npc-dialogue-ui.js');

describe('npc dialogue ui', () => {
  beforeEach(() => {
    bondSummary = null;
    dialogueCards = [];
    choiceCalls = [];
  });

  it('renders post-combat NPC dialogue and responses in action-area cards', async () => {
    const narration = {
      showNarration: () => {
        throw new Error('narration overlay should not render NPC dialogue');
      },
      forceHideNarration: () => {
        throw new Error('narration overlay should not need forced cleanup');
      },
    };

    init({
      narration,
      showNpcSprite: () => {},
      hideNpcSprite: () => {},
      delay: async () => {},
      updateGameState: () => {},
      apiStartNpcDialogue: async () => ({
        npc: { id: 'mira', nameEn: 'Mira', name: 'ミラ' },
        freed: '<freed>',
        freedTts: 'freed-tts',
        userId: 'user-1',
        rounds: [
          {
            npcLine: '<npc-line>',
            npcLineTts: 'npc-line-tts',
            options: [{ text: '<option-a>', tts: 'option-a-tts' }],
          },
        ],
      }),
      apiRespondNpcDialogue: async () => ({
        dialogueComplete: true,
        totalDelta: 1,
        state: { updated: true },
      }),
    });

    await runNpcDialogue();

    assert.deepEqual(dialogueCards[0], {
      speaker: 'Mira',
      speakerId: 'mira',
      html: '<freed>',
      audio: { userId: 'user-1', key: 'freed-tts' },
    });
    assert.equal(choiceCalls[0].heading, 'Choose a response');
    assert.equal(choiceCalls[0].cards[0].title, '<option-a>');
  });

  it('passes defeat-line audio metadata into the dialogue card', async () => {
    init({
      showNpcSprite: () => {},
      delay: async () => {},
      apiStartNpcDialogue: async () => ({
        mode: 'defeat_line',
        useKanji: false,
        npc: { id: 'mira', nameEn: 'Mira', name: 'ミラ' },
        line: {
          tokens: [{ surface: 'すごい', reading: 'すごい' }],
          audio: { userId: 'user-1', key: 'defeat.wav' },
        },
      }),
    });

    await runNpcDialogue();

    assert.deepEqual(dialogueCards[0].audio, { userId: 'user-1', key: 'defeat.wav' });
  });
});
