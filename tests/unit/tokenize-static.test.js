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

  it('surface-only particles preserve reading and raw token span for grammar', () => {
    const frame = frames.find(f => f.raw.includes('私の名前'));
    assert.ok(frame, 'expected a frame containing 私の名前');
    const particle = frame.tokens.find(t => t.surface === 'の' && !t.base);
    assert.ok(particle, 'should find surface-only の particle');
    assert.equal(particle.reading, 'の');
    assert.equal(typeof particle.rawTokenStart, 'number');
    assert.equal(typeof particle.rawTokenEnd, 'number');
  });

  it('merged dictionary tokens preserve the raw token span they came from', () => {
    const frame = frames.find(f => f.id === 'shopPurchase_excuse');
    assert.ok(frame, 'shopPurchase_excuse frame should exist');
    const sumimasen = frame.tokens.find(t => t.base === 'すみません');
    assert.ok(sumimasen, 'should find merged すみません');
    assert.equal(typeof sumimasen.rawTokenStart, 'number');
    assert.equal(typeof sumimasen.rawTokenEnd, 'number');
    assert.ok(sumimasen.rawTokenEnd >= sumimasen.rawTokenStart);
  });

  it('bakes grammar hints into static frames without changing words', () => {
    const frame = frames.find(f => f.raw === '心は強いです！');
    assert.ok(frame, 'expected 心は強いです！ frame');
    const originalWords = frame.words.slice();
    const particle = frame.tokens.find(t => t.surface === 'は' && !t.base);
    assert.ok(particle, 'should find surface-only は particle');
    assert.ok(Array.isArray(particle.grammarHints), 'particle should carry grammarHints when matched');
    assert.ok(particle.grammarHints.some(h => h.grammarId === 'n5-wa-topic'));
    assert.deepEqual(frame.words, originalWords, 'grammar hints must not affect words');
  });

  it('annotates particles that follow a slot (cross-slot grammar matching)', () => {
    const frame = frames.find(f => f.id === 'npcDefeat_10');
    assert.ok(frame, 'expected npcDefeat_10 frame');
    const slotIdx = frame.tokens.findIndex(t => t.slot === 'randomPlayerCreature');
    assert.ok(slotIdx >= 0, 'slot should be present');
    const particle = frame.tokens[slotIdx + 1];
    assert.equal(particle.surface, 'は', 'token after slot should be は');
    assert.ok(Array.isArray(particle.grammarHints), 'は after slot should carry grammarHints');
    assert.ok(
      particle.grammarHints.some(h => h.grammarId === 'n5-wa-topic'),
      'は after slot should be annotated as n5-wa-topic'
    );
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
    assert.ok(barks.length > 0, 'expected at least one bark frame');
    for (const frame of barks) {
      const slots = frame.tokens.filter(t => t.slot);
      assert.equal(slots.length, 0, `bark frame ${frame.id} should have no slots`);
    }
  });

  it('CID frames have group field matching script ID', () => {
    const cids = frames.filter(f => f.category === 'cid');
    assert.ok(cids.length > 0, 'expected at least one CID frame');
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

  it('befriend_wait has prompt frames', () => {
    const waits = frames.filter(f => f.category === 'befriend_wait');
    assert.ok(waits.length > 0, 'expected at least one befriend_wait frame');
    for (const frame of waits) {
      assert.ok(frame.id.startsWith('befriend_wait_'), `unexpected befriend_wait id ${frame.id}`);
    }
  });

  it('befriend_name has prompt frames', () => {
    const names = frames.filter(f => f.category === 'befriend_name');
    assert.ok(names.length > 0, 'expected at least one befriend_name frame');
    for (const frame of names) {
      assert.ok(frame.id.startsWith('befriend_name_'), `unexpected befriend_name id ${frame.id}`);
    }
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

  it('befriend_name 私 reads as わたし for beginner-facing romaji', () => {
    const basePrompt = frames.find(f => f.id === 'befriend_name_what');
    assert.ok(basePrompt, 'befriend_name_what frame should exist');

    const watashi = basePrompt.tokens.find(t => t.base === '私');
    assert.ok(watashi, 'befriend_name_what should keep 私 as the dictionary base');
    assert.equal(watashi.surface, '私');
    assert.equal(watashi.reading, 'わたし');
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
