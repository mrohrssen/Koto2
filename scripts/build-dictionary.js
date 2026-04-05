// scripts/build-dictionary.js
/**
 * Converts jmdict-simplified JSON into the game's runtime word dictionary.
 * Usage: node scripts/build-dictionary.js <path-to-jmdict-eng.json>
 * Output: data/dictionary.json (~30-50k entries)
 * Filtering: includes entries where at least one kanji or kana form is marked common.
 * Each entry maps baseForm → { reading, definitions[] }.
 */
import { readFileSync, writeFileSync } from 'fs';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node scripts/build-dictionary.js <jmdict-eng.json>');
  process.exit(1);
}

console.log(`Reading ${inputPath}...`);
const raw = JSON.parse(readFileSync(inputPath, 'utf-8'));
const words = raw.words || raw;
console.log(`Total JMdict entries: ${Array.isArray(words) ? words.length : 'unknown format'}`);

const dictionary = {};
let included = 0;

for (const entry of words) {
  const hasCommonKanji = entry.kanji?.some(k => k.common);
  const hasCommonKana = entry.kana?.some(k => k.common);
  if (!hasCommonKanji && !hasCommonKana) continue;

  const kanjiForm = entry.kanji?.[0]?.text;
  const kanaForm = entry.kana?.[0]?.text;
  if (!kanaForm) continue;

  const definitions = [];
  for (const sense of (entry.sense || [])) {
    const glosses = sense.gloss?.filter(g => g.lang === 'eng')?.map(g => g.text) || [];
    if (glosses.length > 0) {
      definitions.push({
        en: glosses.join(' / '),
        ...(definitions.length === 0 ? { primary: true } : {}),
      });
    }
  }
  if (definitions.length === 0) continue;

  const dictEntry = { reading: kanaForm, definitions };

  if (kanjiForm && !dictionary[kanjiForm]) {
    dictionary[kanjiForm] = dictEntry;
    included++;
  }
  if (!dictionary[kanaForm]) {
    dictionary[kanaForm] = { reading: kanaForm, definitions };
    if (!kanjiForm) included++;
  }
}

const outputPath = 'data/dictionary.json';
writeFileSync(outputPath, JSON.stringify(dictionary, null, 0));
const sizeMB = (Buffer.byteLength(JSON.stringify(dictionary)) / 1024 / 1024).toFixed(1);
console.log(`Written ${outputPath}: ${included} entries (${Object.keys(dictionary).length} keys), ${sizeMB}MB`);
