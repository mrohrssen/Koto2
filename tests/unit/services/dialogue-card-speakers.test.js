import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createDialogueCardSpeakerIdResolver } from '../../../src/services/dialogue-card-speakers.js';

describe('dialogue card speaker IDs', () => {
  it('uses Mochikosan normal style for Cid instead of narrator fallback', () => {
    const getSpeakerId = createDialogueCardSpeakerIdResolver({
      getSettings: () => ({
        gameTtsSpeakerId: 13,
        voiceGender: 'boy'
      }),
      getNpcSpeakerId: () => null
    });

    assert.equal(getSpeakerId({ speakerKey: 'cid' }), 20);
  });
});
