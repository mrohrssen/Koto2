import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const ITEMS = JSON.parse(readFileSync(new URL('../../../data/items.json', import.meta.url), 'utf8'));

describe('Item descriptions', () => {
  it('school area items describe their concrete gameplay effects', () => {
    const expectedDescriptions = new Map([
      ['pan', 'Heals all living creatures for 12% of max HP.'],
      ['ame', 'Grants party XP equal to one enemy kill.'],
      ['okashi', 'Restores 22% MP to all creatures.'],
      ['onigiri', 'Heals one creature for 37% of max HP.'],
      ['sandoicchi', '+4% attack, +4% max HP to one creature.'],
      ['enpitsu', '+3 base attack (scales with level).'],
      ['pen', '4% super effective damage bonus.'],
      ['nooto', '+12 base MP (scales with level).'],
      ['kyoukasho', "Boosts one creature's XP gain by 15%."],
      ['jisho', '+15 base MP, +3 base attack (scales with level).'],
      ['ryukku', '+12 base HP, +12 base MP (scales with level).'],
      ['tokei', '-3 incoming damage per hit.'],
    ]);

    const schoolItems = ITEMS.filter(item => item.area === 'school');
    assert.deepStrictEqual(
      schoolItems.map(item => item.id).sort(),
      [...expectedDescriptions.keys()].sort()
    );

    for (const item of schoolItems) {
      assert.strictEqual(item.description, expectedDescriptions.get(item.id), item.id);
    }
  });
});
