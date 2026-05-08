import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = globalThis.localStorage || {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const { resolvePortraitSrc } = await import('../../../public/js/ui/npc-dialogue-card.js');

test('resolvePortraitSrc maps wired NPC ids to dialogue headshots', () => {
  assert.equal(resolvePortraitSrc({ speakerId: 'kodomo' }), '/assets/dialogue/headshots/kodomo.webp?v=20260508-npc-headshots');
  assert.equal(resolvePortraitSrc({ speakerId: 'sensei' }), '/assets/dialogue/headshots/sensei.webp?v=20260508-npc-headshots');
  assert.equal(resolvePortraitSrc({ speakerId: 'shrine_fox' }), '/assets/dialogue/headshots/shrine_fox.webp?v=20260508-npc-headshots');
});

test('resolvePortraitSrc maps known speaker names and defaults You to male', () => {
  assert.equal(resolvePortraitSrc({ speaker: 'Game Master' }), '/assets/dialogue/headshots/game-master.webp?v=20260508-npc-headshots');
  assert.equal(resolvePortraitSrc({ speaker: 'Shrine Fox' }), '/assets/dialogue/headshots/shrine_fox.webp?v=20260508-npc-headshots');
  assert.equal(resolvePortraitSrc({ speaker: 'Cid' }), '/assets/dialogue/headshots/cid.webp?v=20260508-npc-headshots');
  assert.equal(resolvePortraitSrc({ speaker: 'You' }), '/assets/dialogue/headshots/you-male.webp?v=20260508-npc-headshots');
});

test('resolvePortraitSrc falls back for unknown speakers', () => {
  assert.equal(resolvePortraitSrc({ speaker: 'Unknown Traveler' }), '/assets/dialogue/default-headshot.png?v=20260501-headshot');
});
