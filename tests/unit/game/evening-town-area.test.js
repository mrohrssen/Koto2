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
  'kage', 'suraimu', 'goburin', 'neko', 'inu', 'nezumi'
];

describe('evening-town area', () => {
  const area = areas.find(a => a.id === 'evening-town');

  it('exists at array index 5 (after blue-sea)', () => {
    assert.ok(area, 'evening-town missing from areas.json');
    assert.equal(areas.indexOf(area), 5);
  });

  it('has the approved names and teaching words', () => {
    assert.equal(area.name, '夕方の町');
    assert.equal(area.nameEn, 'Evening Town');
    assert.equal(area.reading, 'ゆうがたのまち');
    assert.equal(area.modifierWord.word, '夕方');
    assert.equal(area.locationWord.word, '町');
  });

  it('has the approved spawn pool and boss', () => {
    assert.deepEqual(area.creatures, EXPECTED_SPAWNS);
    assert.equal(area.bossCreatureId, 'kageno-inu');
  });

  it('references only existing creatures', () => {
    for (const id of [...area.creatures, area.bossCreatureId]) {
      assert.ok(creatureIds.has(id), `unknown creature ${id}`);
    }
  });

  it('has run wiring fields', () => {
    assert.equal(area.roomCount, 30);
    assert.equal(area.stage, 1);
    assert.equal(area.parallaxId, 'evening-town');
  });
});
