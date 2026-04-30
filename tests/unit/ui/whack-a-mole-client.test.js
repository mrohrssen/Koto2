import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

await mock.module('animejs', {
  namedExports: { animate: () => {} },
});
await mock.module('../../../public/js/ui/romaji.js', {
  namedExports: { toRomaji: s => s },
});
await mock.module('../../../public/js/ui/bootstrap-client.js', {
  namedExports: { renderJpSentence: () => '', getKnownWords: () => new Set() },
});
await mock.module('../../../public/js/ui/narration-box.js', {
  namedExports: { show: async () => {} },
});
await mock.module('../../../public/js/ui/i18n.js', {
  namedExports: { tPlain: (...args) => args.join(' ') },
});
await mock.module('../../../public/js/pixi/text.js', {
  namedExports: { showXpPopup: () => {}, showLevelUpPopup: () => {} },
});
await mock.module('../../../public/js/pixi/formation.js', {
  namedExports: { animateLevelUpForScene: () => {} },
});
await mock.module('../../../public/js/ui/combat-vfx.js', {
  namedExports: { spritePos: () => null },
});
await mock.module('../../../public/js/scenes/scene-manager.js', {
  namedExports: { getSceneManager: () => ({ currentScene: null }) },
});
await mock.module('../../../public/js/ui/room-transition.js', {
  namedExports: { playRoomTransition: async () => {} },
});

const { WhackAMoleGame } = await import('../../../public/js/ui/whack-a-mole.js');

describe('WhackAMoleGame cancellation', () => {
  it('does not submit completion after the game has been cancelled', async () => {
    let completeCalls = 0;
    let proceedCalls = 0;
    let rendered = 'still visible';
    const game = new WhackAMoleGame([
      { id: 'a', reading: 'あ', sprite: '/a.webp' },
      { id: 'b', reading: 'い', sprite: '/b.webp' },
      { id: 'c', reading: 'う', sprite: '/c.webp' },
      { id: 'd', reading: 'え', sprite: '/d.webp' },
      { id: 'e', reading: 'お', sprite: '/e.webp' },
      { id: 'f', reading: 'か', sprite: '/f.webp' },
      { id: 'g', reading: 'き', sprite: '/g.webp' },
      { id: 'h', reading: 'く', sprite: '/h.webp' },
      { id: 'i', reading: 'け', sprite: '/i.webp' },
    ], {
      actions: { setContent: html => { rendered = html; } },
      apiCompleteWhackAMole: async () => {
        completeCalls += 1;
        return {};
      },
      apiProceed: async () => {
        proceedCalls += 1;
        return {};
      },
      updateGameState: () => {},
      updateUI: () => {},
      playSFX: () => {},
    });

    game.cancel();
    await game._endGame();

    assert.equal(completeCalls, 0);
    assert.equal(proceedCalls, 0);
    assert.equal(rendered, '');
  });

  it('does not submit completion after the owning room is no longer active', async () => {
    let completeCalls = 0;
    const game = new WhackAMoleGame([
      { id: 'a', reading: 'あ', sprite: '/a.webp' },
      { id: 'b', reading: 'い', sprite: '/b.webp' },
      { id: 'c', reading: 'う', sprite: '/c.webp' },
      { id: 'd', reading: 'え', sprite: '/d.webp' },
      { id: 'e', reading: 'お', sprite: '/e.webp' },
      { id: 'f', reading: 'か', sprite: '/f.webp' },
      { id: 'g', reading: 'き', sprite: '/g.webp' },
      { id: 'h', reading: 'く', sprite: '/h.webp' },
      { id: 'i', reading: 'け', sprite: '/i.webp' },
    ], {
      actions: { setContent: () => {} },
      apiCompleteWhackAMole: async () => {
        completeCalls += 1;
        return {};
      },
      apiProceed: async () => ({}),
      updateGameState: () => {},
      updateUI: () => {},
      playSFX: () => {},
      isActive: () => false,
    });

    await game._endGame();

    assert.equal(completeCalls, 0);
  });

  it('does not proceed if cancellation happens while completion is in flight', async () => {
    let resolveComplete;
    let proceedCalls = 0;
    let updateCalls = 0;
    const game = new WhackAMoleGame([
      { id: 'a', reading: 'あ', sprite: '/a.webp' },
      { id: 'b', reading: 'い', sprite: '/b.webp' },
      { id: 'c', reading: 'う', sprite: '/c.webp' },
      { id: 'd', reading: 'え', sprite: '/d.webp' },
      { id: 'e', reading: 'お', sprite: '/e.webp' },
      { id: 'f', reading: 'か', sprite: '/f.webp' },
      { id: 'g', reading: 'き', sprite: '/g.webp' },
      { id: 'h', reading: 'く', sprite: '/h.webp' },
      { id: 'i', reading: 'け', sprite: '/i.webp' },
    ], {
      actions: { setContent: () => {} },
      apiCompleteWhackAMole: () => new Promise(resolve => { resolveComplete = resolve; }),
      apiProceed: async () => {
        proceedCalls += 1;
        return {};
      },
      updateGameState: () => {},
      updateUI: () => { updateCalls += 1; },
      playSFX: () => {},
    });

    const ending = game._endGame();
    game.cancel();
    resolveComplete({ finishDialogue: null, xpGrants: [], levelUps: [] });
    await ending;

    assert.equal(proceedCalls, 0);
    assert.equal(updateCalls, 0);
  });

  it('still proceeds after completion state leaves whack-a-mole phase', async () => {
    let rendered = 'game visible';
    let active = true;
    let proceedCalls = 0;

    const game = new WhackAMoleGame([
      { id: 'a', reading: 'あ', sprite: '/a.webp' },
      { id: 'b', reading: 'い', sprite: '/b.webp' },
      { id: 'c', reading: 'う', sprite: '/c.webp' },
      { id: 'd', reading: 'え', sprite: '/d.webp' },
      { id: 'e', reading: 'お', sprite: '/e.webp' },
      { id: 'f', reading: 'か', sprite: '/f.webp' },
      { id: 'g', reading: 'き', sprite: '/g.webp' },
      { id: 'h', reading: 'く', sprite: '/h.webp' },
      { id: 'i', reading: 'け', sprite: '/i.webp' },
    ], {
      actions: { setContent: html => { rendered = html; } },
      apiCompleteWhackAMole: async () => ({
        state: { phase: 'room' },
        finishDialogue: null,
        xpGrants: [],
        levelUps: [],
      }),
      apiProceed: async () => {
        proceedCalls += 1;
        return { state: { phase: 'room', run: { currentRoom: 1 } } };
      },
      updateGameState: () => { active = false; },
      updateUI: () => {},
      playSFX: () => {},
      isActive: () => active,
    });

    await game._endGame();

    assert.equal(rendered, '');
    assert.equal(proceedCalls, 1);
  });
});
