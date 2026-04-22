import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';

const PROLOGUE_PATH = join(process.cwd(), 'data/prologue.json');

describe('prologue.json content', () => {
  it('does not include deprecated filler pages 07–09', () => {
    const prologue = JSON.parse(readFileSync(PROLOGUE_PATH, 'utf-8'));
    const ids = prologue.map(s => s.id);
    assert.ok(!ids.includes('prologue-07-world'), 'prologue-07-world should be removed');
    assert.ok(!ids.includes('prologue-08-creatures'), 'prologue-08-creatures should be removed');
    assert.ok(!ids.includes('prologue-09-partners'), 'prologue-09-partners should be removed');
  });

  it('includes the five new translator-demo pages in order between 06 and 10', () => {
    const prologue = JSON.parse(readFileSync(PROLOGUE_PATH, 'utf-8'));
    const ids = prologue.map(s => s.id);
    const demoIds = [
      'prologue-translator-try',
      'prologue-translator-how',
      'prologue-translator-demo',
      'prologue-translator-reaction',
      'prologue-translator-click',
    ];
    const idx06 = ids.indexOf('prologue-06-intro');
    const idx10 = ids.indexOf('prologue-10-disruption');
    assert.ok(idx06 >= 0, 'prologue-06-intro must exist');
    assert.ok(idx10 > idx06, 'prologue-10-disruption must follow 06');
    for (let i = 0; i < demoIds.length; i++) {
      const idx = ids.indexOf(demoIds[i]);
      assert.ok(idx > idx06, `${demoIds[i]} must appear after prologue-06-intro`);
      assert.ok(idx < idx10, `${demoIds[i]} must appear before prologue-10-disruption`);
      if (i > 0) {
        const prev = ids.indexOf(demoIds[i - 1]);
        assert.ok(idx === prev + 1, `${demoIds[i]} must immediately follow ${demoIds[i - 1]}`);
      }
    }
  });

  it('the jpDemo entry references tutorial-translator-demo by frameGroup', () => {
    const prologue = JSON.parse(readFileSync(PROLOGUE_PATH, 'utf-8'));
    const demo = prologue.find(s => s.id === 'prologue-translator-demo');
    assert.ok(demo, 'prologue-translator-demo should exist');
    assert.equal(demo.type, 'jpDemo');
    assert.equal(demo.speaker, 'Cid');
    assert.equal(demo.frameGroup, 'tutorial-translator-demo');
    assert.ok(!demo.tokens, 'tokens should not be inlined — server resolves them');
  });
});
