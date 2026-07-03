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
  'hone', 'oni', 'akuma', 'yuurei', 'kitsune', 'hi'
];

describe('summer-festival area', () => {
  const area = areas.find(a => a.id === 'summer-festival');

  it('exists at array index 11 (after snow-village)', () => {
    assert.ok(area, 'summer-festival missing from areas.json');
    assert.equal(areas.indexOf(area), 11);
  });

  it('has the approved names and reading', () => {
    assert.equal(area.name, '夏の祭り');
    assert.equal(area.nameEn, 'Summer Festival');
    assert.equal(area.reading, 'なつのまつり');
  });

  it('uses the object-form modifier/location schema', () => {
    assert.equal(area.modifierWord.word, '夏');
    assert.equal(area.locationWord.word, '祭り');
  });

  it('has the approved spawn pool and boss', () => {
    assert.deepEqual(area.creatures, EXPECTED_SPAWNS);
    assert.equal(area.bossCreatureId, 'honeno-oni');
  });

  it('references only existing creatures', () => {
    for (const id of [...area.creatures, area.bossCreatureId]) {
      assert.ok(creatureIds.has(id), `unknown creature ${id}`);
    }
  });

  it('has run wiring fields', () => {
    assert.equal(area.roomCount, 30);
    assert.equal(area.stage, 1);
    assert.equal(area.parallaxId, 'summer-festival');
  });
});
