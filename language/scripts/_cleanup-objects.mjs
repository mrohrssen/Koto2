import fs from 'fs';
import path from 'path';

const dir = '/Users/michia/Documents/jrpg/language/categories';

// My manually-determined moves: rank -> target category
const moves = {
  // → actions (verbs, clearly not objects)
  actions: [647, 716, 903, 1435, 3315, 6176, 6432, 6437, 6324, 7713,
            9143, 9158, 9452, 9468, 11168, 12146, 13595, 14133, 14693,
            15997, 17807, 15580, 15865, 10278],
  // → social (people, social concepts, complaints, promises)
  social: [559, 848, 2655, 3691, 6140, 6395, 15854, 15240],
  // → abstract (concepts, grammar, expressions)
  abstract: [1431, 2155, 2190, 3371, 3460, 4479, 5205, 5282, 5330,
             6271, 6273, 6339, 10136, 10177, 10229, 10246, 10248,
             10988, 11622, 14145, 14716, 15572, 17692, 17798,
             19733, 20468, 10062, 14245],
  // → locations (places, rooms, structures)
  locations: [1097, 1450, 2836, 3709, 7743, 8121, 8532, 9482, 9584,
              10065, 10646, 10656, 10737, 11487, 11576, 18626, 18749],
  // → emotions (feelings, reactions)
  emotions: [3939, 5337, 5854, 15485],
  // → descriptors (adjectives, material descriptions)
  descriptors: [8209, 8670, 10912, 13675, 13099, 11559, 10082, 8820,
                15762],
  // → body-parts
  'body-parts': [2027, 6582, 7715],
  // → nature (natural elements, plants)
  nature: [1884, 5199, 6026, 10714, 14858],
  // → clothing
  clothing: [3400, 7988, 8304, 11713, 3319],
  // → foods
  foods: [3716, 5210, 17312, 18718],
  // → animals
  animals: [6112],
  // → numbers-time
  'numbers-time': [5123, 10915, 18754],
};

// Build rank->category lookup
const rankToCategory = {};
for (const [cat, ranks] of Object.entries(moves)) {
  for (const r of ranks) rankToCategory[r] = cat;
}

const objects = JSON.parse(fs.readFileSync(path.join(dir, 'objects.json'), 'utf8'));
console.log('Total entries before:', objects.length);

const keep = [];
const moveEntries = {}; // category -> entries[]
let dupCount = 0;
let moveCount = 0;

// Track seen words to catch exact duplicates
const seen = new Set();

for (const entry of objects) {
  const key = entry.word + '|' + entry.reading + '|' + entry.meaning;

  // Remove empty entries (like よって with no reading/meaning)
  if (!entry.reading && !entry.meaning) {
    dupCount++;
    console.log('  Removed empty:', entry.word, 'rank', entry.rank);
    continue;
  }

  // Remove exact duplicates (keep first occurrence)
  if (seen.has(key)) {
    dupCount++;
    console.log('  Removed duplicate:', entry.word, 'rank', entry.rank);
    continue;
  }
  seen.add(key);

  const cat = rankToCategory[entry.rank];
  if (cat) {
    if (!moveEntries[cat]) moveEntries[cat] = [];
    moveEntries[cat].push(entry);
    moveCount++;
  } else {
    keep.push(entry);
  }
}

console.log('\nEntries to keep in objects:', keep.length);
console.log('Entries moved:', moveCount);
console.log('Duplicates/junk removed:', dupCount);
console.log('\nMoves by category:');
for (const [cat, entries] of Object.entries(moveEntries)) {
  console.log(`  ${cat}: ${entries.length} — ${entries.map(e => e.word).join(', ')}`);
}

// Write cleaned objects.json
fs.writeFileSync(path.join(dir, 'objects.json'), JSON.stringify(keep, null, 2) + '\n');
console.log('\nWrote cleaned objects.json');

// Append to target category files
for (const [cat, entries] of Object.entries(moveEntries)) {
  const filePath = path.join(dir, cat + '.json');
  const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const beforeCount = existing.length;

  // Check for duplicates before appending
  const existingKeys = new Set(existing.map(e => e.word + '|' + e.reading));
  const toAdd = entries.filter(e => {
    const k = e.word + '|' + e.reading;
    if (existingKeys.has(k)) {
      console.log(`  Skipping ${e.word} — already in ${cat}.json`);
      return false;
    }
    return true;
  });

  const merged = [...existing, ...toAdd];
  merged.sort((a, b) => a.rank - b.rank);
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2) + '\n');
  console.log(`Updated ${cat}.json: ${beforeCount} → ${merged.length} (+${toAdd.length})`);
}

console.log('\nDone!');
