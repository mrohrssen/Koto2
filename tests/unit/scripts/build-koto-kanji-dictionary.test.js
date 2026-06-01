import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import {
  buildKotoKanjiDictionary,
  parseKanjidic2,
  parseRankSnapshot,
} from '../../../scripts/build-koto-kanji-dictionary.mjs';

describe('build-koto-kanji-dictionary', () => {
  it('parses the compact rank snapshot format', () => {
    const rows = parseRankSnapshot('rank\tkanji\tkind\n1\t人\tKyōiku (1st grade)\n2\t言\tKyōiku (2nd grade)\n');
    assert.deepEqual(rows, [
      { rank: 1, kanji: '人', kind: 'Kyōiku (1st grade)' },
      { rank: 2, kanji: '言', kind: 'Kyōiku (2nd grade)' },
    ]);
  });

  it('rejects duplicate kanji in the rank snapshot', () => {
    assert.throws(
      () => parseRankSnapshot('rank\tkanji\tkind\n1\t人\tKyōiku (1st grade)\n2\t人\tKyōiku (1st grade)\n'),
      /Duplicate rank snapshot kanji: 人/
    );
  });

  it('parses KANJIDIC2 meanings and readings', () => {
    const xml = readFileSync('data/kanji/sources/kanjidic2-sample.xml', 'utf8');
    const parsed = parseKanjidic2(xml);
    assert.equal(parsed.get('人').meanings[0], 'person');
    assert.deepEqual(parsed.get('人').readings, ['ジン', 'ニン', 'ひと']);
  });

  it('builds compact dictionary entries without JPDB source metadata or raw on/kun fields', () => {
    const rankSnapshot = 'rank\tkanji\tkind\n1\t人\tKyōiku (1st grade)\n2\t言\tKyōiku (2nd grade)\n';
    const kanjidicXml = readFileSync('data/kanji/sources/kanjidic2-sample.xml', 'utf8');
    const overrides = {
      人: {
        primaryReading: 'ひと',
        examples: [{ word: '人', reading: 'ひと', meaning: 'person', source: 'jmdict' }],
      },
    };

    const dictionary = buildKotoKanjiDictionary({
      rankSnapshot,
      kanjidicXml,
      overrides,
      generatedAt: '2026-06-01T00:00:00.000Z',
    });

    assert.deepEqual(dictionary.sources.map(source => source.id), ['kanjidic2', 'jmdict']);
    assert.equal(dictionary.entries[0].kanji, '人');
    assert.equal(dictionary.entries[0].frequencyRank, 1);
    assert.equal(dictionary.entries[0].primaryMeaning, 'person');
    assert.equal(dictionary.entries[0].primaryReading, 'ひと');
    assert.equal(Object.prototype.hasOwnProperty.call(dictionary.entries[0], 'onYomi'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(dictionary.entries[0], 'kunYomi'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(dictionary.entries[0], 'strokeCount'), false);
  });

  it('allows explicit manual-only entries for kanji missing from KANJIDIC2', () => {
    const rankSnapshot = 'rank\tkanji\tkind\n1\t髙\tHyōgai\n';
    const kanjidicXml = readFileSync('data/kanji/sources/kanjidic2-sample.xml', 'utf8');
    const overrides = {
      髙: {
        primaryMeaning: 'tall / high',
        secondaryMeanings: [],
        primaryReading: 'たか',
        secondaryReadings: ['コウ'],
        examples: [{ word: '髙い', reading: 'たかい', meaning: 'tall / high', source: 'manual' }],
        notes: 'Variant of 高.',
      },
    };

    const dictionary = buildKotoKanjiDictionary({ rankSnapshot, kanjidicXml, overrides });

    assert.equal(dictionary.entries[0].kanji, '髙');
    assert.equal(dictionary.entries[0].primaryMeaning, 'tall / high');
    assert.equal(dictionary.entries[0].primaryReading, 'たか');
    assert.equal(dictionary.entries[0].notes, 'Variant of 高.');
  });
});
