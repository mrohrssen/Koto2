import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';

const FRAMES_PATH = join(import.meta.dirname, '../../data/dialogue/frames.json');

describe('tokenize-static output (frames.json)', () => {
  let frames;

  it('loads frames.json', () => {
    frames = JSON.parse(readFileSync(FRAMES_PATH, 'utf-8'));
    assert.ok(Array.isArray(frames));
    assert.ok(frames.length > 0);
  });

  it('every frame has required fields', () => {
    for (const frame of frames) {
      assert.ok(frame.id, `frame missing id`);
      assert.ok(frame.category, `frame ${frame.id} missing category`);
      assert.ok(frame.raw, `frame ${frame.id} missing raw`);
      assert.ok(Array.isArray(frame.tokens), `frame ${frame.id} missing tokens`);
      assert.ok(Array.isArray(frame.words), `frame ${frame.id} missing words`);
    }
  });

  it('slot tokens appear at correct positions', () => {
    const polite = frames.find(f => f.id === 'shopPurchase_please');
    assert.deepEqual(polite.tokens[0], { slot: 'item' }, 'shopPurchase_please: slot should be first');

    const excuse = frames.find(f => f.id === 'shopPurchase_excuse');
    assert.ok(excuse.tokens[0].base === 'すみません', 'shopPurchase_excuse: すみません should be first');
    const slotIdx = excuse.tokens.findIndex(t => t.slot === 'item');
    assert.ok(slotIdx > 0, 'shopPurchase_excuse: slot should come after すみません');
  });

  it('particles are surface-only (no base field)', () => {
    for (const frame of frames) {
      for (const token of frame.tokens) {
        if (token.slot) continue;
        if (['を', 'が', 'に', 'は', 'で'].includes(token.surface)) {
          assert.equal(token.base, undefined,
            `particle ${token.surface} in frame ${frame.id} should not have base`);
        }
      }
    }
  });

  it('content words have base, reading, and pos but NOT meaning', () => {
    const polite = frames.find(f => f.id === 'shopPurchase_please');
    const kudasai = polite.tokens.find(t => t.base === 'くださる');
    assert.ok(kudasai, 'should have くださる content token');
    assert.ok(kudasai.reading, 'くださる should have reading');
    assert.ok(kudasai.pos, 'くださる should have pos');
    assert.equal(kudasai.meaning, undefined, 'meaning should NOT be baked into tokens (live dict is source of truth)');
  });

  it('content words have a pos field with English POS', () => {
    const validPos = new Set([
      'Noun', 'Verb', 'Adjective', 'Adverb', 'Pre-noun', 'Conjunction',
      'Interjection', 'Na-adjective', 'Pronoun', 'Particle', 'Auxiliary',
      'Suffix', 'Prefix',
    ]);
    for (const frame of frames) {
      for (const token of frame.tokens) {
        if (token.slot) continue;
        if (!token.base) continue; // non-content
        assert.ok(token.pos, `token ${token.surface} in frame ${frame.id} missing pos`);
        assert.ok(validPos.has(token.pos),
          `token ${token.surface} in frame ${frame.id} has invalid pos "${token.pos}"`);
      }
    }
  });

  it('words array matches content tokens', () => {
    for (const frame of frames) {
      const contentBases = frame.tokens.filter(t => t.base).map(t => t.base);
      assert.deepEqual(frame.words, contentBases,
        `frame ${frame.id} words should match content token bases`);
    }
  });

  it('merges adjacent tokens into dictionary entries (すみません, ありがとうございます)', () => {
    const excuse = frames.find(f => f.id === 'shopPurchase_excuse');
    const sumimasen = excuse.tokens.find(t => t.base === 'すみません');
    assert.ok(sumimasen, 'should merge すみ+ませ+ん into すみません');

    const thanks = frames.find(f => f.id === 'shopPurchase_thanks');
    const arigatou = thanks.tokens.find(t => t.base === 'ありがとうございます');
    assert.ok(arigatou, 'should merge ありがとう+ございます into ありがとうございます');
  });

  it('shopGreeting frames have no slot tokens', () => {
    const greetings = frames.filter(f => f.category === 'shopGreeting');
    assert.ok(greetings.length >= 5, `expected at least 5 shopGreeting frames, got ${greetings.length}`);
    for (const frame of greetings) {
      const slots = frame.tokens.filter(t => t.slot);
      assert.equal(slots.length, 0, `shopGreeting frame ${frame.id} should have no slots`);
    }
  });

  it('shopGreeting_hello has exactly 1 content word', () => {
    const frame = frames.find(f => f.id === 'shopGreeting_hello');
    assert.ok(frame, 'shopGreeting_hello frame should exist');
    assert.deepEqual(frame.words, ['こんにちは']);
  });

  it('いらっしゃいませ is merged into a single token', () => {
    const frame = frames.find(f => f.id === 'shopGreeting_welcome');
    assert.ok(frame, 'shopGreeting_welcome frame should exist');
    const irasshaimase = frame.tokens.find(t => t.base === 'いらっしゃいませ');
    assert.ok(irasshaimase, 'いらっしゃいませ should be a single merged content token');
    assert.ok(irasshaimase.reading, 'should have reading');
    assert.equal(irasshaimase.meaning, undefined, 'meaning should NOT be baked');
  });

  it('bark frames have correct category prefix and no slots', () => {
    const barks = frames.filter(f => f.category.startsWith('bark_'));
    assert.ok(barks.length >= 60, `expected at least 60 bark frames, got ${barks.length}`);
    for (const frame of barks) {
      const slots = frame.tokens.filter(t => t.slot);
      assert.equal(slots.length, 0, `bark frame ${frame.id} should have no slots`);
    }
  });

  it('CID frames have group field matching script ID', () => {
    const cids = frames.filter(f => f.category === 'cid');
    assert.ok(cids.length >= 45, `expected at least 45 CID frames, got ${cids.length}`);
    for (const frame of cids) {
      assert.ok(frame.group, `CID frame ${frame.id} should have group`);
      assert.ok(frame.id.startsWith('cid_'), `CID frame ${frame.id} should start with cid_`);
    }
  });

  it('NPC frames have group field matching npc_slot pattern', () => {
    const npcs = frames.filter(f => f.category === 'npc');
    assert.ok(npcs.length >= 20, `expected at least 20 NPC frames, got ${npcs.length}`);
    for (const frame of npcs) {
      assert.ok(frame.group, `NPC frame ${frame.id} should have group`);
      assert.ok(frame.group.includes('_'), `NPC frame group ${frame.group} should have npcId_slot format`);
    }
  });

  it('befriend_wait has 7 i+1 ladder frames', () => {
    const waits = frames.filter(f => f.category === 'befriend_wait');
    assert.equal(waits.length, 7, `expected 7 befriend_wait frames, got ${waits.length}`);
  });

  it('befriend_name has 7 i+1 ladder frames', () => {
    const names = frames.filter(f => f.category === 'befriend_name');
    assert.equal(names.length, 7, `expected 7 befriend_name frames, got ${names.length}`);
  });

  it('befriend_name base prompt is scaffolded and never bare 名前は？', () => {
    const names = frames.filter(f => f.category === 'befriend_name');
    assert.equal(
      names.some(f => f.raw === '名前は？'),
      false,
      'befriend_name frames should not include the confusing bare 名前は？ prompt'
    );

    const basePrompt = frames.find(f => f.id === 'befriend_name_what');
    assert.ok(basePrompt, 'befriend_name_what frame should exist');
    assert.equal(basePrompt.raw, '私の名前は？');
    assert.deepEqual(basePrompt.overrides, { '私': 'my' });
  });

  it('preserves group field on CID and NPC frames', () => {
    const cidFrame = frames.find(f => f.category === 'cid');
    if (cidFrame) {
      assert.ok(cidFrame.group, `CID frame ${cidFrame.id} should have group field`);
    }
    const npcFrame = frames.find(f => f.category === 'npc');
    if (npcFrame) {
      assert.ok(npcFrame.group, `NPC frame ${npcFrame.id} should have group field`);
    }
  });

  it('overrides field passes through from frame-sources when present', () => {
    // No frame in frame-sources has overrides today; verify the field is
    // NOT emitted when absent (clean output).
    for (const frame of frames) {
      if ('overrides' in frame) {
        assert.equal(typeof frame.overrides, 'object');
        assert.ok(frame.overrides !== null);
        assert.ok(Object.keys(frame.overrides).length > 0,
          `frame ${frame.id} has empty overrides — should be omitted`);
      }
    }
  });
});
