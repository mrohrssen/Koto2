// scripts/migrate-creature-schema.mjs
// Migrates creatures.json from autoSkill/ultimate to baseMp/learnset schema
import { readFileSync, writeFileSync } from 'fs';

const MP_BY_ARCHETYPE = {
  'Fighter': 60,
  'Tank/Healer': 80,
  'Trickster': 90,
  'Mage': 120
};

const creatures = JSON.parse(readFileSync('data/creatures.json', 'utf-8'));
const learnsets = JSON.parse(readFileSync('data/creature-learnsets.json', 'utf-8'));

const errors = [];

for (const c of creatures) {
  // Assign baseMp by archetype
  c.baseMp = MP_BY_ARCHETYPE[c.archetype] || 80;

  // Assign learnset from creature-learnsets.json
  const ls = learnsets[c.id];
  if (!ls || ls.length === 0) {
    errors.push(`${c.id}: missing or empty learnset`);
  }
  c.learnset = ls || [];

  // Remove old fields
  delete c.autoSkill;
  delete c.ultimate;
}

if (errors.length > 0) {
  console.error('ERRORS:');
  errors.forEach(e => console.error('  -', e));
  process.exit(1);
}

writeFileSync('data/creatures.json', JSON.stringify(creatures, null, 2) + '\n');
console.log(`Migrated ${creatures.length} creatures`);

// Verification summary
const archetypeCounts = {};
for (const c of creatures) {
  archetypeCounts[c.archetype] = (archetypeCounts[c.archetype] || 0) + 1;
}
console.log('Archetype distribution:', archetypeCounts);
console.log('All creatures have baseMp:', creatures.every(c => c.baseMp > 0));
console.log('All creatures have non-empty learnset:', creatures.every(c => c.learnset.length > 0));
console.log('No autoSkill remaining:', creatures.every(c => !('autoSkill' in c)));
console.log('No ultimate remaining:', creatures.every(c => !('ultimate' in c)));
