import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SPRITE_VERSION,
  BACKGROUND_VERSION,
  AUDIO_VERSION,
} from '../../../src/shared/asset-versions.js';
import {
  actionIconSlug,
  actionIconUrl,
  backgroundLayerUrl,
  bgmUrl,
  creatureIdleUrl,
  creatureStaticUrl,
  itemSpriteUrl,
  npcSpriteUrl,
  sfxUrl,
} from '../../../public/js/assets/asset-urls.js';

describe('asset URL helpers', () => {
  it('builds canonical creature, npc, and item sprite URLs', () => {
    assert.equal(creatureStaticUrl('inu'), `/assets/sprites/creatures/inu.webp?v=${SPRITE_VERSION}`);
    assert.equal(creatureIdleUrl('inu'), `/assets/sprites/creatures/inu-idle.webp?v=${SPRITE_VERSION}`);
    assert.equal(npcSpriteUrl('cid'), `/assets/sprites/npcs/cid.webp?v=${SPRITE_VERSION}`);
    assert.equal(itemSpriteUrl('rice-ball'), `/assets/sprites/items/rice-ball.webp?v=${SPRITE_VERSION}`);
  });

  it('keeps action icon slugging consistent across callers', () => {
    assert.equal(actionIconSlug('Fire Slash; 火の斬り'), 'fire-slash');
    assert.equal(actionIconUrl('Fire Slash; 火の斬り'), `/assets/sprites/actions/fire-slash.webp?v=${SPRITE_VERSION}`);
  });

  it('uses background and audio versions for those domains', () => {
    assert.equal(backgroundLayerUrl('starter_meadow', 'sky'), `/assets/backgrounds/starter_meadow/sky.webp?v=${BACKGROUND_VERSION}`);
    assert.equal(sfxUrl('attack'), `/assets/audio/sfx/attack.mp3?v=${AUDIO_VERSION}`);
    assert.equal(bgmUrl('battle'), `/assets/audio/bgm/battle.mp3?v=${AUDIO_VERSION}`);
  });

  it('does not expose the retired hard-coded action icon version', () => {
    assert.equal(actionIconUrl('Slash').includes('20260322'), false);
  });
});
