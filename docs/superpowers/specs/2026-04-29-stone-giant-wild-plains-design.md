# Stone Giant Wild Plains Boss Design

## Goal

Re-add the former Stone Giant as the boss of Wild Plains. He should feel like a stronger, tank-focused counterpart to Hineko without introducing new combat moves or requiring a finished sprite asset. He should also be ready for a later quantity-based fusion recipe once the creature-count fusion work lands.

## Current Context

Wild Plains currently points to `hineko` as its boss, while Starting Meadow also uses `hineko`. The archived Stone Giant entry exists as `ishino-kyojin`, but its old move set references moves that are not present in the active `data/moves.json`. The active sprite utilities already fall back to a text sprite when a creature image is missing, so no placeholder image file is needed.

Fusion currently has one hardcoded recipe for Hineko and checks unique discovered creature IDs. A separate creature quantity fusion design already exists and will allow recipes such as three copies of the same creature. This work should pause before adding the Stone Giant fusion recipe until that quantity-aware fusion work is complete and approved.

## Creature Template

Add `ishino-kyojin` to `data/creatures.json` as a normal creature template, but do not add it to Wild Plains' regular encounter pool yet. This keeps it structured like Hineko while making it boss-only for now.

Stone Giant stats:

- `id`: `ishino-kyojin`
- `name`: `石の巨人`
- `nameEn`: `Stone Giant`
- `element`: `earth`
- `rarity`: `uncommon`
- `baseHp`: `110`
- `baseAttack`: `14`
- `baseMp`: `50`
- `baseDefense`: `9`
- `baseWord`: `巨人`
- `baseReading`: `きょじん`
- `baseMeaning`: `giant / great man`
- `baseRank`: `4900`
- `archetype`: `Tank/Healer`
- `isStarter`: `false`
- `stage`: `1`

The stats intentionally make Stone Giant a good bit stronger than the common tanks `ishi` and `tetsu`: much higher HP, slightly higher defense, comparable attack, and modest MP. Boss generation already doubles boss HP, so this should read as sturdy without needing special boss-only stat logic.

## Move Set

Use only active existing moves. Do not restore or add the archived Stone Giant moves.

Learnset:

- Level 1: `mamoru`
- Level 5: `tataku`
- Level 10: `nigiru`
- Level 16: `suwaru`
- Level 22: `horu`

This makes the first three likely boss moves defensive and simple: Guard, Strike, and Grasp. Later moves preserve earth/tank flavor if the creature becomes collectible.

## Area Assignment

Update Wild Plains so its boss is `ishino-kyojin` instead of `hineko`.

Starting Meadow should keep `hineko` as its boss. Wild Plains should not include `ishino-kyojin` in the `creatures` encounter pool until a separate decision is made to let it appear normally.

## Image Handling

Do not add a placeholder image file. The current frontend sprite path will try `ishino-kyojin-idle.webp` or `ishino-kyojin.webp`; when those are missing, the existing fallback renders a text sprite using the creature word. This is the desired temporary behavior until real art is added later.

## Fusion Recipe Pause

Pause after the Stone Giant boss/content work. Do not add the fusion recipe until creature-count fusion has landed and the user gives the greenlight.

Once quantity fusion is available, add:

- Recipe id: `stone-giant`
- Result: `ishino-kyojin`
- Ingredients: `ishi x3`
- Cost: `1 Fusion Core`

The later implementation must verify that the recipe consumes three owned `ishi` copies and grants one owned Stone Giant copy. It must not rely on unique discovery membership, because unique collection state cannot represent `ishi x3`.

## Testing

For the Stone Giant boss/content phase:

- Add or update focused tests, if existing coverage makes this practical, to confirm Wild Plains resolves to `ishino-kyojin`.
- Run JSON validation or a focused data load check to ensure `data/creatures.json` and `data/areas.json` parse and all referenced move IDs exist.
- Run the relevant unit tests for room generation, combat setup, or creature instantiation if touched.

For the later fusion phase:

- Add fusion service coverage for duplicate ingredient requirements.
- Verify `ishi x3` is shown correctly in the Fusion Lab after the quantity fusion UI is available.
- Verify starting the recipe consumes three owned `ishi`, spends one Fusion Core, and adds one owned `ishino-kyojin`.

## Implementation Boundaries

This change should stay data-focused for the first phase. It should not add new moves, new combat mechanics, new sprite assets, or special boss stat logic. The fusion recipe belongs in a second phase after quantity-aware fusion is ready.
