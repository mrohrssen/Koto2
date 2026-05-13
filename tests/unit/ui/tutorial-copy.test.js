import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getFusionLabNarration,
  getTutorialNarration,
} from '../../../public/js/ui/tutorial-copy.js';

describe('tutorial copy', () => {
  it('uses tap language for speed review word lookup guidance', () => {
    const pages = getTutorialNarration(4, { dueCount: 1 });

    assert.ok(pages.some(page => page.includes('tap them')));
    assert.ok(pages.every(page => !/\bclick\b/i.test(page)));
  });

  it('uses tap language for the fusion action prompt', () => {
    const pages = getFusionLabNarration();

    assert.ok(pages.includes('Now tap Fuse'));
    assert.ok(pages.every(page => !/\bclick\b/i.test(page)));
  });
});
