import { describe, it } from 'node:test';
import assert from 'node:assert';
import { rollFriendlyNpcOffers } from '../../../src/game/services/exploration-service.js';

const MOCK_ITEMS = [
  { id: 'ocha', category: 'food', area: 'hajimari-no-hiroba', word: 'お茶', reading: 'おちゃ', meaning: 'tea', rarity: 'common', type: 'mpRestore', effect: {}, description: 'test' },
  { id: 'pan', category: 'food', area: 'school', word: 'パン', reading: 'パン', meaning: 'bread', rarity: 'common', type: 'heal', effect: {}, description: 'test' },
  { id: 'katana', category: 'equipment', area: 'hajimari-no-hiroba', word: '刀', reading: 'かたな', meaning: 'katana', rarity: 'uncommon', type: 'boost', effect: {}, description: 'test' },
  { id: 'enpitsu', category: 'equipment', area: 'school', word: '鉛筆', reading: 'えんぴつ', meaning: 'pencil', rarity: 'common', type: 'boost', effect: {}, description: 'test' },
];

describe('rollFriendlyNpcOffers - area filtering', () => {
  it('always treats friendly NPC shops as equipment-only', () => {
    const offers = rollFriendlyNpcOffers('food', ['hajimari-no-hiroba'], MOCK_ITEMS);

    assert.ok(offers.length > 0, 'Should still return equipment offers when old saves request food');
    assert.ok(offers.every(item => item.category === 'equipment'));
  });

  it('area 1 only: returns only area 1 equipment items', () => {
    const areaIds = ['hajimari-no-hiroba'];
    for (let i = 0; i < 20; i++) {
      const offers = rollFriendlyNpcOffers('equipment', areaIds, MOCK_ITEMS);
      for (const item of offers) {
        assert.strictEqual(item.area, 'hajimari-no-hiroba', `Got area 2 item "${item.id}" in area 1 shop`);
      }
    }
  });

  it('area 1+2: returns items from both areas', () => {
    const areaIds = ['hajimari-no-hiroba', 'school'];
    const seenAreas = new Set();
    for (let i = 0; i < 50; i++) {
      const offers = rollFriendlyNpcOffers('equipment', areaIds, MOCK_ITEMS);
      for (const item of offers) seenAreas.add(item.area);
    }
    assert.ok(seenAreas.has('hajimari-no-hiroba'), 'Should include area 1 items');
    assert.ok(seenAreas.has('school'), 'Should include area 2 items');
  });

  it('equipment category respects area filtering', () => {
    const areaIds = ['hajimari-no-hiroba'];
    for (let i = 0; i < 20; i++) {
      const offers = rollFriendlyNpcOffers('equipment', areaIds, MOCK_ITEMS);
      for (const item of offers) {
        assert.strictEqual(item.area, 'hajimari-no-hiroba', `Got area 2 equipment "${item.id}" in area 1 shop`);
      }
    }
  });

  it('items without area field are always included', () => {
    const itemsWithNoArea = [
      ...MOCK_ITEMS,
      { id: 'mystery', category: 'equipment', word: 'x', reading: 'x', meaning: 'x', rarity: 'common', type: 'boost', effect: {}, description: 'test' },
    ];
    const areaIds = ['hajimari-no-hiroba'];
    let sawMystery = false;
    for (let i = 0; i < 50; i++) {
      const offers = rollFriendlyNpcOffers('equipment', areaIds, itemsWithNoArea);
      if (offers.some(o => o.id === 'mystery')) sawMystery = true;
    }
    assert.ok(sawMystery, 'Item without area field should appear in any area');
  });

  it('areaIds null disables area filtering (backward compat)', () => {
    const offers = rollFriendlyNpcOffers('equipment', null, MOCK_ITEMS);
    assert.ok(offers.length > 0, 'Should return items when areaIds is null');
  });

  it('returns empty array when no items match area + category', () => {
    const areaIds = ['nonexistent-area'];
    const offers = rollFriendlyNpcOffers('food', areaIds, MOCK_ITEMS);
    assert.strictEqual(offers.length, 0, 'No items should match a nonexistent area');
  });
});
