# Enemy AI Targeting Redesign

## Problem
Enemy AI always attacks the player's first creature due to a tiebreaker bug in `selectTarget` — when all creatures have equal HP%, stable sort always picks index 0, creating a focus-fire death spiral.

## New Algorithm

**Overrides (checked first):**
1. **Confused** → random move, random alive creature (ally or enemy, excluding self)
2. **Taunted** → strongest damage move against the taunter

**Normal (no overrides):**
- **2/3 Smart mode:** Strongest damage move (highest `power`) against a super-effective target (random pick if multiple). If no super-effective targets exist, random player creature. If no damage moves exist, fall through to random mode.
- **1/3 Random mode:** Random move from moveset. Buff/heal/shield → targets self or enemy allies per move's `target` field. Damage/debuff/drain → targets random player creature.

## Files Changed
- `src/game/services/creature-combat-service.js` — Replace `pickEnemyCombatMove` + targeting in `buildEnemyStrikeRecord` with new `pickEnemyMoveChoice`, `pickEnemyTarget`, `buildEnemyActionRecord`
- `src/game/creatures.js` — `selectTarget` kept but no longer used by enemy AI
- `public/js/ui/combat-loop.js` — Respect `targetSide` field from record for self-buff/heal visuals
- `tests/unit/creature/creatures.test.js` — Update targeting AI tests
