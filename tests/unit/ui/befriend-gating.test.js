import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// befriend.js pulls in a wall of browser-only modules at import time. Mock them
// all (mirrors befriend.test.js) so the pure gating helpers can be imported in
// node. The one mock that matters for these tests is explore-session.js, whose
// getExploreSession() the gate scans.
await mock.module('../../../public/js/audio.js', { namedExports: { playSFX: () => {} } });
await mock.module('../../../public/js/api.js', { namedExports: { getAuthHeaders: () => ({}) } });
await mock.module('../../../public/js/platform.js', { namedExports: { PLATFORM: { apiBase: '' } } });
await mock.module('../../../public/js/logger.js', { namedExports: { logger: { error: () => {}, warn: () => {} } } });
await mock.module('../../../public/js/ui/bootstrap-client.js', {
  namedExports: {
    renderJpSentence: () => '<jp>',
    renderEnFirst: (s) => s,
    getKnownWords: () => new Set(),
    entityToToken: () => ({}),
  },
});
await mock.module('../../../public/js/ui/i18n.js', {
  namedExports: { t: (...a) => a.join(' '), tPlain: (...a) => a.join(' ') },
});
await mock.module('../../../public/js/pixi/effects.js', {
  namedExports: { burstParticles: () => {}, ELEMENT_COLORS: {} },
});
await mock.module('../../../public/js/pixi/formation.js', {
  namedExports: { getCreatureSpriteForScene: () => null, showActiveGlowForScene: () => {} },
});
await mock.module('../../../public/js/pixi/text.js', { namedExports: { popupBuff: () => {} } });
await mock.module('../../../public/js/ui/combat-dom.js', {
  namedExports: { hideEnemy: () => {}, showFormation: () => {} },
});
await mock.module('../../../public/js/ui/exploration-dom.js', {
  namedExports: { showNpcInDisplay: () => {} },
});
await mock.module('../../../public/js/ui/sprite-utils.js', {
  namedExports: {
    SPRITE_VERSION: '0',
    replaceWithTextSprite: () => {},
    creatureSpriteHtml: () => '',
    creatureStaticPath: id => `/creatures/${id}.webp`,
  },
});
await mock.module('../../../public/js/ui/romaji.js', {
  namedExports: {
    katakanaToHiragana: s => s,
    pronunciationReading: s => s,
    pronunciationReadingInfo: s => ({ reading: s, reasons: [] }),
    toPronunciationRomaji: s => s,
    toRomaji: s => s,
  },
});
await mock.module('../../../public/js/ui/ui-components.js', {
  namedExports: { renderChoicesAsync: () => Promise.resolve(0), renderChoices: () => {} },
});
await mock.module('../../../public/js/ui/npc-dialogue-card.js', {
  namedExports: { showNpcDialogueCard: async () => {} },
});
await mock.module('../../../public/js/tts.js', {
  namedExports: { playDialogueAudio: () => {}, prefetchWord: () => {}, playWordPair: () => {} },
});
await mock.module('../../../public/js/ui/move-select.js', {
  namedExports: { init: () => {}, showMoves: () => {}, clear: () => {}, setActiveLabel: () => {} },
});
await mock.module('../../../public/js/ui/target-select.js', {
  namedExports: { init: () => {}, showEnemies: () => {}, showAllies: () => {}, clear: () => {} },
});
await mock.module('../../../public/js/ui/tutorial-copy.js', {
  namedExports: { getTutorialNarration: () => [], getBefriendWrongNarration: () => '' },
});
await mock.module('../../../public/js/ui/befriend-quiz-state.js', {
  namedExports: { restoreBefriendQuizEnemyUi: () => {} },
});
await mock.module('../../../public/js/scenes/scene-manager.js', {
  namedExports: { getSceneManager: () => ({ currentScene: null }) },
});

// Controllable explore session. Tests set `sessionState.session` (or null).
const sessionState = { session: null };
const syncNowCalls = [];
function fakeSession(logEntries) {
  return {
    snapshot: () => logEntries.map(e => ({ ...e })),
    pendingCount: () => logEntries.length,
    syncNow: () => { syncNowCalls.push(true); return Promise.resolve(); },
  };
}
await mock.module('../../../public/js/ui/explore-session.js', {
  namedExports: { getExploreSession: () => sessionState.session },
});

const { sessionHasPendingCombat, canStartBefriendTalk } =
  await import('../../../public/js/ui/befriend.js');

// `navigator` may be a getter-only global (Node >=21), so swap it via
// defineProperty rather than assignment.
let originalNavigatorDescriptor;
beforeEach(() => {
  sessionState.session = null;
  syncNowCalls.length = 0;
  originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
});
afterEach(() => {
  if (originalNavigatorDescriptor) {
    Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
  } else {
    delete globalThis.navigator;
  }
});

function setOnline(value) {
  // value: true | false | undefined (undefined == navigator without onLine)
  const nav = value === undefined ? {} : { onLine: value };
  Object.defineProperty(globalThis, 'navigator', {
    value: nav,
    configurable: true,
    writable: true,
  });
}

describe('sessionHasPendingCombat', () => {
  it('returns false when there is no active session', () => {
    sessionState.session = null;
    assert.equal(sessionHasPendingCombat(), false);
  });

  it('returns false for an empty log', () => {
    sessionState.session = fakeSession([]);
    assert.equal(sessionHasPendingCombat(), false);
  });

  it('returns true when a combat.cycle entry is pending', () => {
    sessionState.session = fakeSession([{ kind: 'combat.cycle' }]);
    assert.equal(sessionHasPendingCombat(), true);
  });

  it('returns true for any *.start entry (encounter.start)', () => {
    sessionState.session = fakeSession([{ kind: 'encounter.start' }]);
    assert.equal(sessionHasPendingCombat(), true);
  });

  it('returns true for boss.start / npcBattle.start entries', () => {
    sessionState.session = fakeSession([{ kind: 'npcBattle.start' }]);
    assert.equal(sessionHasPendingCombat(), true);
    sessionState.session = fakeSession([{ kind: 'boss.start' }]);
    assert.equal(sessionHasPendingCombat(), true);
  });

  it('returns false for a pending non-combat entry (shrine.choose)', () => {
    sessionState.session = fakeSession([{ kind: 'shrine.choose' }]);
    assert.equal(sessionHasPendingCombat(), false);
  });

  it('returns true when a combat entry is mixed among non-combat entries', () => {
    sessionState.session = fakeSession([
      { kind: 'shrine.choose' },
      { kind: 'proceed' },
      { kind: 'combat.cycle' },
    ]);
    assert.equal(sessionHasPendingCombat(), true);
  });
});

describe('canStartBefriendTalk', () => {
  it('is true with an empty log while online', () => {
    setOnline(true);
    sessionState.session = fakeSession([]);
    assert.equal(canStartBefriendTalk(), true);
  });

  it('is true with no session while online (PvE parity: unaffected)', () => {
    setOnline(true);
    sessionState.session = null;
    assert.equal(canStartBefriendTalk(), true);
  });

  it('is true when navigator.onLine is undefined (treated as online)', () => {
    setOnline(undefined);
    sessionState.session = fakeSession([]);
    assert.equal(canStartBefriendTalk(), true);
  });

  it('is false when offline (navigator.onLine === false)', () => {
    setOnline(false);
    sessionState.session = fakeSession([]);
    assert.equal(canStartBefriendTalk(), false);
  });

  it('is false when a combat.cycle entry is unsynced (even while online)', () => {
    setOnline(true);
    sessionState.session = fakeSession([{ kind: 'combat.cycle' }]);
    assert.equal(canStartBefriendTalk(), false);
  });

  it('is false when an *.start entry is unsynced', () => {
    setOnline(true);
    sessionState.session = fakeSession([{ kind: 'encounter.start' }]);
    assert.equal(canStartBefriendTalk(), false);
  });

  it('is true when only non-combat entries are pending while online', () => {
    setOnline(true);
    sessionState.session = fakeSession([{ kind: 'shrine.choose' }]);
    assert.equal(canStartBefriendTalk(), true);
  });
});
