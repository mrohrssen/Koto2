import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadDialoguePools,
  getBarkPool,
  getCidScripts,
  getNpcLines,
  getShopFrames,
  getGreetingFrames,
  getBefriendFrames,
  getDialogueWordSet,
} from '../../src/game/dialogue-loader.js';

describe('dialogue-loader (frames.json)', () => {
  beforeEach(() => {
    loadDialoguePools(process.cwd() + '/data');
  });

  it('getBarkPool returns barks grouped by trigger', () => {
    const pool = getBarkPool();
    assert.ok(pool.onHit, 'should have onHit trigger');
    assert.ok(pool.onVictory, 'should have onVictory trigger');
    assert.ok(Array.isArray(pool.onHit));
    assert.ok(pool.onHit.length >= 10);
    const bark = pool.onHit[0];
    assert.ok(Array.isArray(bark.tokens), 'bark should have tokens array');
    assert.ok(Array.isArray(bark.words), 'bark should have words array');
    assert.ok(bark.raw, 'bark should have raw text');
  });

  it('getCidScripts returns scripts grouped by script ID', () => {
    const scripts = getCidScripts();
    assert.ok(Array.isArray(scripts));
    assert.ok(scripts.length >= 15);
    const script = scripts[0];
    assert.ok(script.id, 'script should have id');
    assert.ok(Array.isArray(script.lines), 'script should have lines array');
    const line = script.lines[0];
    assert.ok(Array.isArray(line.tokens), 'line should have tokens');
    assert.ok(Array.isArray(line.words), 'line should have words');
  });

  it('getNpcLines returns lines grouped by NPC and slot', () => {
    const npcLines = getNpcLines();
    assert.ok(npcLines.kodomo, 'should have kodomo NPC');
    assert.ok(npcLines.kodomo.shopGreeting, 'kodomo should have shopGreeting');
    assert.ok(Array.isArray(npcLines.kodomo.shopGreeting));
    const line = npcLines.kodomo.shopGreeting[0];
    assert.ok(Array.isArray(line.tokens), 'line should have tokens');
    assert.ok(Array.isArray(line.words), 'line should have words');
  });

  it('getShopFrames returns shop category frames', () => {
    const frames = getShopFrames();
    assert.ok(Array.isArray(frames));
    assert.ok(frames.length >= 3);
    assert.ok(frames.every(f => f.category === 'shop'));
  });

  it('getGreetingFrames returns greeting category frames', () => {
    const frames = getGreetingFrames();
    assert.ok(Array.isArray(frames));
    assert.ok(frames.length >= 5);
    assert.ok(frames.every(f => f.category === 'greeting'));
  });

  it('getBefriendFrames returns frames grouped by prompt type', () => {
    const frames = getBefriendFrames();
    assert.ok(frames.wait, 'should have wait prompts');
    assert.ok(frames.name, 'should have name prompts');
    assert.ok(frames.success, 'should have success prompts');
    assert.ok(frames.wrong, 'should have wrong prompts');
    assert.equal(frames.wait.length, 5);
    assert.equal(frames.name.length, 5);
    assert.equal(frames.success.length, 5);
    assert.equal(frames.wrong.length, 5);
  });

  it('getDialogueWordSet returns all content words across all frames', () => {
    const words = getDialogueWordSet();
    assert.ok(words instanceof Set);
    assert.ok(words.size > 0);
  });
});
