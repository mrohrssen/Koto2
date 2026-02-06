# Robot Dealer Room Design

A new exploration room type where a dealer buys the player's chips (robots) and offers one uncommon+ chip for sale.

## Room Generation

Add `dealer` to `ROOM_TYPES` in `rooms.js`. Updated probability weights:

| Room Type | Old | New |
|-----------|-----|-----|
| Encounter | 45% | 40% |
| Shrine | 20% | 15% |
| Quiz | 20% | 20% |
| Word Discovery | 15% | 15% |
| **Dealer** | — | **10%** |

### Room Object

```js
{
  id: "floor1_room4",
  type: "dealer",
  roomNumber: 4,
  dealer: {
    visited: false,
    offeredChip: { /* uncommon+ chip */ },
    chipPrice: 120,       // 100% of base value
    soldChips: []          // chips sold this visit
  }
}
```

The offered chip is generated at room creation time. Filter `chips.json` to exclude common rarity, then pick one at random using existing rarity weighting.

## Sell Pricing

Players sell chips at 50% of base value, scaled by level using the same +20% per level the game applies to stats:

```
sellPrice = floor(basePrice × (1 + 0.20 × (level - 1)) × 0.50)
```

| Level | Scale Factor | Sell Price (base 100) |
|-------|-------------|-----------------------|
| 1 | ×1.0 | 50 |
| 2 | ×1.2 | 60 |
| 3 | ×1.4 | 70 |
| 5 | ×1.8 | 90 |
| 7 | ×2.2 | 110 |

Leveled chips sell for more, creating a tension: a strong chip is also a valuable chip.

The dealer's offered chip costs 100% of its base value (level 1, no scaling).

## Selling Equipped Chips

Players can sell both equipped and unequipped chips. Selling an equipped chip:

1. Unequips the chip (removes HP bonus, clears pipeline slot)
2. Calculates level-scaled sell price
3. Adds credits, removes chip from inventory

Selling an equipped chip triggers a confirmation dialog:
> "This chip is equipped in your pipeline. Selling it will remove its HP bonus and leave an empty slot. Sell for X credits?"

Selling your last chip is allowed — an empty pipeline deals 0 power damage. This is a valid risky play.

## Backend

### Endpoints

**`POST /api/game/dealer/sell`** — Sell a chip
- Accepts `{ chipId }`
- If equipped: unequip first (remove HP bonus, clear slot)
- Calculate level-scaled sell price, add credits, remove chip
- Track in `dealer.soldChips[]`
- Return full updated `state` object

**`POST /api/game/dealer/buy`** — Buy the dealer's offered chip
- Accepts `{ chipId }`
- Verify player has enough credits
- Deduct credits, add chip to `player.chips[]`
- Auto-equip if fewer than 5 equipped
- Set `dealer.visited = true` (one purchase per visit)
- Return full updated `state` object

**Room interaction:** Add a `dealer` case to `POST /api/game/interact-room` in `exploration-service.js`. Returns the dealer state: offered chip, its price, and the player's inventory with per-chip sell prices.

All endpoints live in the existing economy routes — no new service file.

## Frontend

### UI Layout

1. **Top** — Dealer's offered chip as a card (reuse chip-select card component). Price displayed on the Buy button. Button dimmed if player can't afford it; dimmed with "Inventory full" if at capacity.
2. **Bottom** — Scrollable list of the player's chips. Each row: chip name, level, sell price, Sell button. Equipped chips show a badge.
3. **Credits** — Current balance displayed prominently, updates live after each transaction.
4. **Leave button** — Exits the room, continues exploration.

### State Sync (Critical)

Every sell and buy operation must follow the established three-step pattern:

```js
// 1. API call
const result = await apiDealerSell(chipId);  // or apiDealerBuy
if (result?.state) {
  updateGameState(result.state);              // 2. Sync local state
}

// 3. Refresh chip loadout cache
if (apiGetChipLoadout && setChipLoadoutCache) {
  const loadout = await apiGetChipLoadout();
  setChipLoadoutCache(loadout);
}

// 4. Refresh all UI
updateUI();
```

This ensures credits, HP bar, chip row, and inventory all stay in sync with the backend. No partial updates.

### Implementation Location

Add `renderDealerRoom()` to `economy.js` alongside existing shop renderers, reusing the chip card component from `chip-select.js`.

## Edge Cases

- **Inventory full when buying:** Buy button dimmed with "Inventory full." Player must sell first.
- **Dealer room revisit:** Once left, `dealer.visited = true`. One interaction per room, matching shrine/quiz behavior.
- **Empty inventory:** If the player has no chips, show only the dealer's offered chip. Sell section shows "No chips to sell."
- **Credits persist:** Run-scoped in `player.credits`. No new currency.

## Files to Change

| File | Change |
|------|--------|
| `src/game/rooms.js` | Add `dealer` room type, update weights, generate offered chip |
| `src/game/services/exploration-service.js` | Handle `dealer` in `interact-room` |
| `src/routes/game/economy.js` | Add `/dealer/sell` and `/dealer/buy` endpoints |
| `src/game/items/chips.js` | Add `getDealerSellPrice(chipId, level)` helper |
| `public/js/ui/economy.js` | Add `renderDealerRoom()` UI |
| `public/js/ui/exploration.js` | Route dealer room type to economy renderer |
| `public/js/game.js` | Wire up dealer API calls, add to phase handling if needed |
