import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const areas = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/areas.json'), 'utf8'));
const creatures = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/creatures.json'), 'utf8'));
const creatureIds = new Set(creatures.map(c => c.id));

const EXPECTED_SPAWNS = [
  'hikari', 'uma', 'tsuchi', 'ushi', 'buta', 'hitsuji',
  'nezumi', 'kaeru', 'inu', 'tori', 'hana'
];

describe('morning-ranch area', () => {
  const area = areas.find(a => a.id === 'morning-ranch');

  it('exists at array index 3 (after school)', () => {
    assert.ok(area, 'morning-ranch missing from areas.json');
    assert.equal(areas.indexOf(area), 3);
  });

  it('has the approved names and teaching words', () => {
    assert.equal(area.name, '朝の牧場');
    assert.equal(area.nameEn, 'Morning Ranch');
    assert.equal(area.reading, 'あさのぼくじょう');
    assert.equal(area.modifierWord.word, '朝');
    assert.equal(area.locationWord.word, '牧場');
  });

  it('has the approved spawn pool and boss', () => {
    assert.deepEqual(area.creatures, EXPECTED_SPAWNS);
    assert.equal(area.bossCreatureId, 'hikarino-uma');
  });

  it('references only existing creatures', () => {
    for (const id of [...area.creatures, area.bossCreatureId]) {
      assert.ok(creatureIds.has(id), `unknown creature ${id}`);
    }
  });

  it('has run wiring fields', () => {
    assert.equal(area.roomCount, 30);
    assert.equal(area.stage, 1);
    assert.equal(area.parallaxId, 'morning-ranch');
  });
});
