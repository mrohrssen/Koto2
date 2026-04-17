import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  instantiateCreature,
  backfillCreatureUid,
  backfillCreatureListUids,
  refreshCreatureUid,
  refreshCreatureListUids
} from '../../../src/game/creatures.js';

// First template id from data/creatures.json
const EXISTING_TEMPLATE_ID = 'hi';

describe('creature uid', () => {
  it('instantiateCreature assigns a uid', () => {
    const c = instantiateCreature(EXISTING_TEMPLATE_ID, 1);
    assert.ok(c.uid, 'expected uid to be set');
    assert.strictEqual(typeof c.uid, 'string');
    assert.ok(c.uid.length >= 8, `uid '${c.uid}' should be at least 8 chars`);
  });

  it('two instances of the same template get different uids', () => {
    const a = instantiateCreature(EXISTING_TEMPLATE_ID, 1);
    const b = instantiateCreature(EXISTING_TEMPLATE_ID, 1);
    assert.notStrictEqual(a.uid, b.uid);
  });

  it('backfillCreatureUid assigns uid only if missing', () => {
    const without = { id: 'whatever', name: 'x' };
    backfillCreatureUid(without);
    assert.ok(without.uid);
    const existing = { id: 'whatever', uid: 'preserved' };
    backfillCreatureUid(existing);
    assert.strictEqual(existing.uid, 'preserved');
  });

  it('backfillCreatureListUids walks an array (skips null entries)', () => {
    const list = [{ id: 'a' }, { id: 'b', uid: 'keep-this-valid-uid' }, null, { id: 'c' }];
    backfillCreatureListUids(list);
    assert.ok(list[0].uid);
    assert.strictEqual(list[1].uid, 'keep-this-valid-uid');
    assert.strictEqual(list[2], null);
    assert.ok(list[3].uid);
  });

  it('backfillCreatureListUids tolerates non-array input gracefully', () => {
    // Should not throw on undefined/null/non-array
    assert.doesNotThrow(() => backfillCreatureListUids(undefined));
    assert.doesNotThrow(() => backfillCreatureListUids(null));
    assert.doesNotThrow(() => backfillCreatureListUids({ not: 'array' }));
  });

  it('uid persists through JSON serialization', () => {
    const original = instantiateCreature(EXISTING_TEMPLATE_ID, 1);
    const round = JSON.parse(JSON.stringify(original));
    assert.strictEqual(round.uid, original.uid);
  });

  it('refreshCreatureUid replaces an existing uid', () => {
    const c = { id: 'foo', uid: 'old-uid-xxx-yyyyyyy' };
    refreshCreatureUid(c);
    assert.notStrictEqual(c.uid, 'old-uid-xxx-yyyyyyy');
    assert.strictEqual(typeof c.uid, 'string');
    assert.ok(c.uid.length >= 8);
  });

  it('refreshCreatureListUids regenerates every uid in array (handles null)', () => {
    const list = [
      { id: 'a', uid: 'old1-xxxxxxxxx' },
      { id: 'b', uid: 'old2-yyyyyyyyy' },
      null
    ];
    refreshCreatureListUids(list);
    assert.notStrictEqual(list[0].uid, 'old1-xxxxxxxxx');
    assert.notStrictEqual(list[1].uid, 'old2-yyyyyyyyy');
    assert.notStrictEqual(list[0].uid, list[1].uid);
    assert.strictEqual(list[2], null);
  });

  it('backfillCreatureUid replaces malformed uid (number, short string, object)', () => {
    const c1 = { id: 'foo', uid: 42 };
    const c2 = { id: 'foo', uid: 'short' };
    const c3 = { id: 'foo', uid: {} };
    backfillCreatureUid(c1);
    backfillCreatureUid(c2);
    backfillCreatureUid(c3);
    assert.strictEqual(typeof c1.uid, 'string');
    assert.ok(c1.uid.length >= 8);
    assert.strictEqual(typeof c2.uid, 'string');
    assert.ok(c2.uid.length >= 8);
    assert.strictEqual(typeof c3.uid, 'string');
    assert.ok(c3.uid.length >= 8);
  });
});
