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
  'yuki', 'kitsune', 'saru', 'hitsuji', 'koori', 'tsuru'
];

describe('snow-village area', () => {
  const area = areas.find(a => a.id === 'snow-village');

  it('exists at array index 10 (after frozen-lake)', () => {
    assert.ok(area, 'snow-village missing from areas.json');
    assert.equal(areas.indexOf(area), 10);
  });

  it('has the approved names and reading', () => {
    assert.equal(area.name, '雪の村');
    assert.equal(area.nameEn, 'Snow Village');
    assert.equal(area.reading, 'ゆきのむら');
  });

  it('uses the object-form modifier/location schema', () => {
    assert.equal(area.modifierWord.word, '雪');
    assert.equal(area.locationWord.word, '村');
  });

  it('has the approved spawn pool and boss', () => {
    assert.deepEqual(area.creatures, EXPECTED_SPAWNS);
    assert.equal(area.bossCreatureId, 'yukino-kitsune');
  });

  it('references only existing creatures', () => {
    for (const id of [...area.creatures, area.bossCreatureId]) {
      assert.ok(creatureIds.has(id), `unknown creature ${id}`);
    }
  });

  it('has run wiring fields', () => {
    assert.equal(area.roomCount, 30);
    assert.equal(area.stage, 1);
    assert.equal(area.parallaxId, 'snow-village');
  });
});
