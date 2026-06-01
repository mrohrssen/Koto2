import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getKotoKanjiEntries,
  getKotoKanjiEntry,
  getKotoKanjiSources,
} from '../../../src/game/koto-kanji-dictionary.js';

function assertNoField(entry, field) {
  assert.equal(Object.prototype.hasOwnProperty.call(entry, field), false, `${field} should not be stored`);
}

describe('koto kanji dictionary', () => {
  it('loads exactly 4000 ranked entries', () => {
    const entries = getKotoKanjiEntries();
    assert.equal(entries.length, 4000);
    assert.deepEqual(entries.slice(0, 4).map(entry => entry.kanji), ['人', '言', '見', '一']);
    assert.deepEqual(entries.slice(0, 4).map(entry => entry.frequencyRank), [1, 2, 3, 4]);
  });

  it('keeps dictionary source metadata separate from JPDB ordering metadata', () => {
    const sourceIds = getKotoKanjiSources().map(source => source.id);
    assert.equal(sourceIds.includes('jpdb-kanji-frequency'), false);
    assert.equal(sourceIds.some(id => id.toLowerCase().includes('wanikani')), false);
    assert.deepEqual(sourceIds, ['kanjidic2', 'jmdict']);
  });

  it('validates the compact entry schema used by Kanji Kombat', () => {
    const entry = getKotoKanjiEntry('人');
    assert.equal(entry.kanji, '人');
    assert.equal(entry.frequencyRank, 1);
    assert.equal(typeof entry.kind, 'string');
    assert.equal(typeof entry.primaryMeaning, 'string');
    assert.equal(Array.isArray(entry.secondaryMeanings), true);
    assert.equal(typeof entry.primaryReading, 'string');
    assert.equal(Array.isArray(entry.secondaryReadings), true);
    assert.equal(Array.isArray(entry.examples), true);
    assertNoField(entry, 'onYomi');
    assertNoField(entry, 'kunYomi');
    assertNoField(entry, 'strokeCount');
  });

  it('has unique contiguous ranks and unique kanji literals', () => {
    const entries = getKotoKanjiEntries();
    assert.equal(new Set(entries.map(entry => entry.kanji)).size, entries.length);
    assert.deepEqual(entries.map(entry => entry.frequencyRank), Array.from({ length: 4000 }, (_, index) => index + 1));
  });

  it('looks up entries by kanji literal', () => {
    assert.equal(getKotoKanjiEntry('人').primaryMeaning, 'person');
    assert.throws(() => getKotoKanjiEntry('🌀'), /Unknown Koto kanji/);
  });
});
