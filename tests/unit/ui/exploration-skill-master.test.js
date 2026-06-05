import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const sceneManagerState = { currentScene: null };
let renderedChoices = null;
let renderedButtons = [];
let dialogueCalls = [];

function createElementStub() {
  return {
    className: '',
    tabIndex: 0,
    style: {},
    innerHTML: '',
    children: [],
    classList: {
      add() {},
      remove() {},
    },
    setAttribute() {},
    remove() {},
    addEventListener() {},
    appendChild(child) {
      this.children.push(child);
    },
    querySelector: () => ({ addEventListener() {} }),
    querySelectorAll: () => [],
    set textContent(value) {
      this.innerHTML = String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    },
    get textContent() {
      return this.innerHTML;
    },
  };
}

await mock.module('../../../public/js/scenes/scene-manager.js', {
  namedExports: { getSceneManager: () => sceneManagerState },
});
await mock.module('../../../public/js/scenes/exploration-scene.js', {
  namedExports: { ExplorationScene: class {} },
});
await mock.module('../../../public/js/ui/speed-review.js', { namedExports: {} });
await mock.module('../../../public/js/ui/whack-a-mole.js', {
  namedExports: { WhackAMoleGame: class {} },
});
await mock.module('../../../public/js/audio.js', { namedExports: { playSFX: () => {} } });
await mock.module('../../../public/js/native/index.js', { namedExports: { hapticLight: () => {} } });
await mock.module('../../../public/js/ui/sprite-utils.js', {
  namedExports: {
    creatureBgUrl: () => '', itemSpriteHtml: () => '', creatureStaticPath: () => '',
    SPRITE_VERSION: 'test',
  },
});
await mock.module('../../../public/js/ui/combat-dom.js', {
  namedExports: { hideEnemy: () => {}, showFormation: () => {}, hideFormation: () => {} },
});
await mock.module('../../../public/js/ui/exploration-dom.js', {
  namedExports: { showNpcInDisplay: () => {} },
});
await mock.module('../../../public/js/ui/i18n.js', {
  namedExports: { t: (...a) => a.join(' '), isJapanified: () => false },
});
await mock.module('../../../public/js/ui/chests.js', { namedExports: {} });
await mock.module('../../../public/js/ui/crests-equip.js', { namedExports: {} });
await mock.module('../../../public/js/ui/item-effect-pills.js', {
  namedExports: { buildItemEffectPills: () => '' },
});
await mock.module('../../../public/js/ui/room-transition.js', {
  namedExports: { playRoomTransition: async () => {} },
});
await mock.module('../../../public/js/ui/ui-components.js', {
  namedExports: {
    renderButtons: buttons => { renderedButtons = buttons; },
    renderChoices: options => {
      renderedChoices = options;
      const el = options.container || globalThis.document?.getElementById?.('action-area');
      if (el) {
        el.innerHTML = `
          ${options.heading ? `<div class="ui-choice-heading">${options.heading}</div>` : ''}
          ${(options.cards || []).map(card => `
            <div class="ui-choice">
              <div class="ui-choice__title">${card.title}</div>
              ${card.subtitle ? `<div class="ui-choice__subtitle">${card.subtitle}</div>` : ''}
            </div>
          `).join('')}
        `;
      }
    },
  },
});
await mock.module('../../../public/js/ui/npc-dialogue-card.js', {
  namedExports: { showNpcDialogueCard: async options => { dialogueCalls.push(options); } },
});
await mock.module('../../../public/js/ui/event-popup.js', {
  namedExports: { buff: () => {}, itemGained: () => {} },
});
await mock.module('../../../public/js/ui/dom-effects.js', {
  namedExports: { pop: () => {}, flashElement: () => {} },
});
await mock.module('../../../public/js/api.js', {
  namedExports: { savePvpTeam: async () => {}, getPvpTeams: async () => [] },
});
await mock.module('../../../public/js/ui/bootstrap-client.js', {
  namedExports: { renderJpSentence: () => '', getKnownWords: () => new Set(), entityToToken: value => value },
});
await mock.module('../../../public/js/ui/tutorial-copy.js', {
  namedExports: {
    getTutorialNarration: () => ['first Cid line'],
    getFormationNarration: () => '',
    getPostHinonekoReviewNarration: () => [],
    getFusionCoreNarration: () => [],
    getPostFusionNarration: () => [],
  },
});

const {
  init,
  renderExploring,
  renderSkillMaster,
  renderNpcBattleSkillSelection,
  showTutorialNarration,
} = await import('../../../public/js/ui/exploration.js');

describe('renderSkillMaster tutorial Cid narration', () => {
  beforeEach(() => {
    sceneManagerState.currentScene = null;
    sceneManagerState.transitioning = false;
    renderedChoices = null;
    renderedButtons = [];
    dialogueCalls = [];
  });

  it('does not restart Cid entrance narration on same-room rerender', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };

    let showNpcSpriteCalls = 0;
    let showNarrationCalls = 0;
    sceneManagerState.currentScene = {
      disposed: false,
      _exiting: false,
      layers: { npcs: {} },
      async showNpcSprite() {
        showNpcSpriteCalls += 1;
      },
      async hideNpcSprite() {},
    };

    init({
      getGameState: () => ({
        phase: 'skillMaster',
        meta: { tutorialStep: 0 },
        run: {
          stats: { startTime: 111 },
          initialSkillPick: { chosenId: null },
          creatureParty: { active: [] },
        },
      }),
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: html => { actionArea.innerHTML = html; } },
      scene: {
        showNarration: () => {
          showNarrationCalls += 1;
          return new Promise(() => {});
        },
      },
      apiSkillMasterOffers: async () => ({
        offered: [
          { id: 'arcStrike', name: 'Arc Strike', desc: 'Chain hit' },
          { id: 'guard', name: 'Guard', desc: 'Defend' },
          { id: 'haste', name: 'Haste', desc: 'Speed up' },
        ],
      }),
    });

    try {
      await renderSkillMaster();
      await renderSkillMaster();
    } finally {
      globalThis.document = originalDocument;
      sceneManagerState.currentScene = null;
    }

    assert.equal(showNpcSpriteCalls, 1);
    assert.equal(showNarrationCalls, 1);
  });

  it('waits for an in-flight scene transition before spawning Cid', async () => {
    let showNpcSpriteCalls = 0;
    let showNarrationCalls = 0;
    const scene = {
      disposed: false,
      _exiting: false,
      layers: { npcs: {} },
      async showNpcSprite() {
        showNpcSpriteCalls += 1;
      },
      async hideNpcSprite() {},
    };
    sceneManagerState.transitioning = true;

    init({
      getGameState: () => ({
        phase: 'skillMaster',
        meta: { tutorialStep: 0 },
        run: {
          stats: { startTime: 444 },
          initialSkillPick: { chosenId: null },
          creatureParty: { active: [] },
        },
      }),
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: () => {} },
      scene: {
        showNarration: () => {
          showNarrationCalls += 1;
          return Promise.resolve();
        },
      },
    });

    try {
      const narrationPromise = showTutorialNarration(['first Cid line'], { showSprite: true });
      setTimeout(() => {
        sceneManagerState.currentScene = scene;
        sceneManagerState.transitioning = false;
      }, 0);
      await narrationPromise;
    } finally {
      sceneManagerState.currentScene = null;
      sceneManagerState.transitioning = false;
    }

    assert.equal(showNpcSpriteCalls, 1);
    assert.equal(showNarrationCalls, 1);
  });

  it('does not restart tutorial narration when initial skill pick is inferred from server state', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };

    let showNarrationCalls = 0;

    init({
      getGameState: () => ({
        phase: 'skillMaster',
        meta: { tutorialStep: 0 },
        run: {
          stats: { startTime: 222 },
          creatureParty: { active: [] },
        },
      }),
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: html => { actionArea.innerHTML = html; } },
      scene: {
        showNarration: () => {
          showNarrationCalls += 1;
          return new Promise(() => {});
        },
      },
      apiSkillMasterOffers: async () => ({
        offered: [
          { id: 'arcStrike', name: 'Arc Strike', desc: 'Chain hit' },
          { id: 'guard', name: 'Guard', desc: 'Defend' },
          { id: 'haste', name: 'Haste', desc: 'Speed up' },
        ],
      }),
    });

    try {
      await renderSkillMaster();
      await renderSkillMaster();
    } finally {
      globalThis.document = originalDocument;
    }

    assert.equal(showNarrationCalls, 1);
  });

  it('labels non-tutorial skill choices with Choose a skill', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };

    init({
      getGameState: () => ({
        phase: 'skillMaster',
        meta: { tutorialStep: 1 },
        run: {
          stats: { startTime: 333 },
          creatureParty: { active: [] },
        },
        room: { id: 'skill-room-heading', type: 'skillMaster' },
      }),
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: html => { actionArea.innerHTML = html; } },
      scene: { showNarration: () => {} },
      apiSkillMasterOffers: async () => ({
        offered: [
          { id: 'arcStrike', level: 1, name: 'Arc Strike', title: 'Arc Strike - Lvl. 1', desc: 'Your attacks arc to another enemy for 30% damage.' },
          { id: 'guard', name: 'Guard', desc: 'Defend' },
          { id: 'haste', name: 'Haste', desc: 'Speed up' },
        ],
      }),
    });

    try {
      await renderSkillMaster();
    } finally {
      globalThis.document = originalDocument;
    }

    assert.equal(renderedChoices?.heading, 'Choose a skill');
    assert.match(actionArea.innerHTML, /Arc Strike - Lvl\. 1/);
    assert.match(actionArea.innerHTML, /30% damage/);
  });

  it('renders leveled and escaped party skill inventory entries', () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    let appendedOverlay = null;
    globalThis.document = {
      getElementById: id => {
        if (id === 'action-area') return actionArea;
        if (id === 'inventory-overlay') return appendedOverlay;
        if (id === 'inventory-close-btn') return { addEventListener() {} };
        return null;
      },
      createElement: () => createElementStub(),
      body: {
        appendChild(el) {
          appendedOverlay = el;
        },
      },
    };

    init({
      getGameState: () => ({
        phase: 'room',
        creatureParty: { active: [] },
        run: {
          itemBuffs: {},
          partySkills: [
            { id: 'hpMaster', level: 1 },
            {
              id: 'customSkill',
              level: 2,
              name: 'Custom <Skill>',
              desc: 'Unsafe <desc>',
            },
          ],
        },
      }),
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: html => { actionArea.innerHTML = html; } },
      scene: { showNarration: () => {} },
      startEncounter: () => {},
    });

    try {
      renderExploring();
      renderedButtons.find(button => button.label.includes('インベントリ')).onClick();
    } finally {
      globalThis.document = originalDocument;
    }

    assert.match(appendedOverlay.innerHTML, /HP Master - Lvl\. 1/);
    assert.match(appendedOverlay.innerHTML, /max HP increases by 25%/);
    assert.match(appendedOverlay.innerHTML, /Custom &lt;Skill&gt; Lvl\. 2/);
    assert.match(appendedOverlay.innerHTML, /Unsafe &lt;desc&gt;/);
  });

  it('shows the non-tutorial skill select prompt with the standard dialogue card', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };

    let showNarrationCalls = 0;
    const prompt = {
      tokens: [{ base: '能力', text: 'のうりょく' }],
      overrides: { 能力: 'ability' },
    };

    init({
      getGameState: () => ({
        phase: 'skillMaster',
        meta: { tutorialStep: 1 },
        run: {
          stats: { startTime: 555 },
          creatureParty: { active: [] },
        },
        room: { id: 'skill-room-dialogue', type: 'skillMaster' },
      }),
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: html => { actionArea.innerHTML = html; } },
      scene: { showNarration: () => { showNarrationCalls += 1; } },
      apiSkillMasterOffers: async () => ({
        skillSelectPrompt: prompt,
        offered: [
          { id: 'arcStrike', name: 'Arc Strike', desc: 'Chain hit' },
          { id: 'guard', name: 'Guard', desc: 'Defend' },
          { id: 'haste', name: 'Haste', desc: 'Speed up' },
        ],
      }),
    });

    try {
      await renderSkillMaster();
    } finally {
      globalThis.document = originalDocument;
    }

    assert.equal(showNarrationCalls, 0);
    assert.equal(dialogueCalls.length, 1);
    assert.equal(dialogueCalls[0].speaker, 'Cid');
    assert.equal(dialogueCalls[0].tokens, prompt.tokens);
    assert.equal(dialogueCalls[0].overrides, prompt.overrides);
    assert.equal(dialogueCalls[0].useKanji, false);
    assert.equal(renderedChoices?.heading, 'Choose a skill');
  });

  it('shows the NPC battle skill select prompt with the standard dialogue card', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };

    let showNarrationCalls = 0;
    const prompt = {
      tokens: [{ base: '能力', text: 'のうりょく' }],
      overrides: { 能力: 'ability' },
    };

    init({
      getGameState: () => ({
        phase: 'npcSkillSelection',
        run: {
          stats: { startTime: 666 },
          creatureParty: { active: [] },
        },
        room: {
          id: 'npc-battle-dialogue',
          type: 'npcBattle',
          npcBattle: {
            skillSelectionPending: true,
            npc: { id: 'nagi', name: 'ナギ', nameEn: 'Nagi' },
          },
        },
      }),
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: html => { actionArea.innerHTML = html; } },
      scene: { showNarration: () => { showNarrationCalls += 1; } },
    });

    try {
      await renderNpcBattleSkillSelection({
        fetchOffers: async () => ({
          skillSelectPrompt: prompt,
          offered: [
            { id: 'arcStrike', level: 1, name: 'Arc Strike', title: 'Arc Strike - Lvl. 1', desc: 'Your attacks arc to another enemy for 30% damage.' },
            { id: 'guard', name: 'Guard', desc: 'Defend' },
            { id: 'haste', name: 'Haste', desc: 'Speed up' },
          ],
        }),
        onSkillChosen: async () => {},
      });
    } finally {
      globalThis.document = originalDocument;
    }

    assert.equal(showNarrationCalls, 0);
    assert.equal(dialogueCalls.length, 1);
    assert.equal(dialogueCalls[0].speaker, 'Nagi');
    assert.equal(dialogueCalls[0].speakerId, 'nagi');
    assert.equal(dialogueCalls[0].tokens, prompt.tokens);
    assert.equal(dialogueCalls[0].overrides, prompt.overrides);
    assert.equal(dialogueCalls[0].useKanji, false);
    assert.equal(renderedChoices?.heading, 'Choose a skill');
    assert.match(actionArea.innerHTML, /Arc Strike - Lvl\. 1/);
    assert.match(actionArea.innerHTML, /30% damage/);
  });
});
