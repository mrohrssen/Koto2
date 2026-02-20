import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getEntityType, listEntityTypes } from '../../../../src/narration-engine/entity-types/index.js';

describe('entity-type registry', () => {
  it('returns npc type by default', () => {
    const type = getEntityType('npc');
    assert.ok(type);
    assert.strictEqual(typeof type.validateShape, 'function');
    assert.strictEqual(typeof type.extractStrings, 'function');
    assert.strictEqual(typeof type.buildRepairInstruction, 'function');
    assert.strictEqual(typeof type.assemblePrompt, 'function');
    assert.strictEqual(typeof type.getPreviousLines, 'function');
    assert.strictEqual(typeof type.getMemorySnapshot, 'function');
    assert.ok(type.cachePrefix);
    assert.ok(type.memoryPrefix);
    assert.ok(Array.isArray(type.requiredCardFields));
  });

  it('returns creature type', () => {
    const type = getEntityType('creature');
    assert.ok(type);
    assert.strictEqual(type.cachePrefix, 'creature-dialogue-cache');
    assert.strictEqual(type.memoryPrefix, 'creature-memory');
  });

  it('throws for unknown type', () => {
    assert.throws(() => getEntityType('unknown'), /Unknown entity type/);
  });

  it('lists all registered types', () => {
    const types = listEntityTypes();
    assert.ok(types.includes('npc'));
    assert.ok(types.includes('creature'));
  });
});
