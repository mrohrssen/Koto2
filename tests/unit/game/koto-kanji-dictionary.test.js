import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getKotoKanjiEntries,
  getKotoKanjiEntry,
  getKotoKanjiMetadata,
  validateKotoKanjiDictionary,
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

  it('exposes curated dictionary metadata without reference source provenance', () => {
    const metadata = getKotoKanjiMetadata();
    assert.equal(metadata.schemaVersion, 2);
    assert.equal(metadata.maintainer, 'Koto');
    assert.equal(metadata.status, 'hand-curated');
    assert.equal(typeof metadata.curationVersion, 'string');
    assert.equal(Object.prototype.hasOwnProperty.call(metadata, 'sources'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(metadata, 'referenceSources'), false);
    const serialized = JSON.stringify(metadata).toLowerCase();
    assert.equal(serialized.includes('jpdb'), false);
    assert.equal(serialized.includes('wanikani'), false);
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
    assert.equal(typeof entry.radicals, 'object');
    assert.equal(Number.isInteger(entry.radicals.classical), true);
    assert.equal(entry.radicals.classical, 9);
    assertNoField(entry, 'onYomi');
    assertNoField(entry, 'kunYomi');
    assertNoField(entry, 'strokeCount');
  });

  it('rejects invalid radical metadata', () => {
    const entry = getKotoKanjiEntry('人');
    const dictionary = {
      schemaVersion: 2,
      curationVersion: 'test',
      maintainer: 'Koto',
      status: 'hand-curated',
      entries: [
        {
          ...entry,
          radicals: { classical: 0 },
        },
      ],
    };

    assert.throws(
      () => validateKotoKanjiDictionary(dictionary),
      /entries\[0\]\.radicals\.classical must be an integer from 1 to 214/
    );
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
