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
  'suna', 'hebi', 'tokage', 'suishou', 'ishi', 'hi', 'kaze'
];

describe('desert area', () => {
  const area = areas.find(a => a.id === 'desert');

  it('exists at array index 6 (after evening-town)', () => {
    assert.ok(area, 'desert missing from areas.json');
    assert.equal(areas.indexOf(area), 6);
  });

  it('has the approved names and reading', () => {
    assert.equal(area.name, '砂漠');
    assert.equal(area.nameEn, 'Desert');
    assert.equal(area.reading, 'さばく');
  });

  it('uses the flat single-word modifier/location schema', () => {
    assert.equal(area.locationWord, '砂漠');
    assert.equal(area.modifierWord, '');
    assert.equal(area.modifierReading, '');
    assert.equal(area.modifierMeaning, '');
    assert.equal(area.modifierRank, null);
    assert.equal(area.locationReading, 'さばく');
    assert.equal(area.locationMeaning, 'desert');
    assert.equal(area.locationRank, 8400);
  });

  it('has the approved spawn pool and boss', () => {
    assert.deepEqual(area.creatures, EXPECTED_SPAWNS);
    assert.equal(area.bossCreatureId, 'sunano-hebi');
  });

  it('references only existing creatures', () => {
    for (const id of [...area.creatures, area.bossCreatureId]) {
      assert.ok(creatureIds.has(id), `unknown creature ${id}`);
    }
  });

  it('has run wiring fields', () => {
    assert.equal(area.roomCount, 30);
    assert.equal(area.stage, 1);
    assert.equal(area.parallaxId, 'desert');
  });
});
