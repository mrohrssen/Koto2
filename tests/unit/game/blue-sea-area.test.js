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
  'kumo', 'kame', 'tako', 'ika', 'kani', 'kamo', 'kujira', 'sakana', 'mizu'
];

describe('blue-sea area', () => {
  const area = areas.find(a => a.id === 'blue-sea');

  it('exists at array index 4 (after morning-ranch)', () => {
    assert.ok(area, 'blue-sea missing from areas.json');
    assert.equal(areas.indexOf(area), 4);
  });

  it('has the approved names and teaching words', () => {
    assert.equal(area.name, '青い海');
    assert.equal(area.nameEn, 'Blue Sea');
    assert.equal(area.reading, 'あおいうみ');
    assert.equal(area.modifierWord.word, '青い');
    assert.equal(area.locationWord.word, '海');
  });

  it('has the approved spawn pool and boss', () => {
    assert.deepEqual(area.creatures, EXPECTED_SPAWNS);
    assert.equal(area.bossCreatureId, 'kumono-sakana');
  });

  it('references only existing creatures', () => {
    for (const id of [...area.creatures, area.bossCreatureId]) {
      assert.ok(creatureIds.has(id), `unknown creature ${id}`);
    }
  });

  it('has run wiring fields', () => {
    assert.equal(area.roomCount, 30);
    assert.equal(area.stage, 1);
    assert.equal(area.parallaxId, 'blue-sea');
  });
});
