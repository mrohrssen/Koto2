# Add Two Chips: Backdoor & Cascade Failure

> **Prerequisite**: Chip Levels & Skills must be implemented first (see `chip-levels-and-skills.md`)

---

## Backdoor (バックドア) — Uncommon

**Concept**: Alpha-strike opener. Rewards fast kills and burst setups.

```json
{
  "id": "backdoor",
  "name": "バックドア",
  "nameEn": "Backdoor",
  "description": "初撃でダメージ2倍。",
  "descriptionEn": "First strike. x2 damage on first hit of combat.",
  "category": "pipeline",
  "rarity": "uncommon",
  "effects": {
    "pipeline": {
      "type": "firstHit",
      "value": 2,
      "triggerChance": 1,
      "displayText": "×2 FIRST"
    }
  },
  "levelScaling": { "type": "multiply" },
  "skill": {
    "id": "zeroDay",
    "name": "ゼロデイ",
    "nameEn": "Zero Day",
    "description": "15ダメージを直接与える",
    "descriptionEn": "Deal 15 damage directly",
    "type": "instant",
    "effect": { "directDamage": 15 },
    "chargesRequired": 5
  }
}
```

### Pipeline Type: `firstHit`
- Check `context.isFirstHit` flag (set true at combat start, false after first attack)
- If first hit: multiply damage by `value`
- Otherwise: no effect (chip shows as "inactive" in pipeline display)

---

## Cascade Failure (カスケード障害) — Epic

**Concept**: Pipeline build-around. Rewards filling all chip slots and careful ordering. Place last for maximum effect.

```json
{
  "id": "cascadeFailure",
  "name": "カスケード障害",
  "nameEn": "Cascade Failure",
  "description": "先に発動したチップごとに+0.3倍。",
  "descriptionEn": "Each chip fired before this adds +0.3x multiplier.",
  "category": "pipeline",
  "rarity": "epic",
  "effects": {
    "pipeline": {
      "type": "cascading",
      "value": 0.3,
      "triggerChance": 1,
      "displayText": "+CASCADE"
    }
  },
  "levelScaling": { "type": "multiply" },
  "skill": {
    "id": "chainReaction",
    "name": "連鎖反応",
    "nameEn": "Chain Reaction",
    "description": "次のパイプライン：全チップ確定発動",
    "descriptionEn": "Next pipeline: all chips guaranteed to fire",
    "type": "buff",
    "effect": { "allChipsGuaranteed": true },
    "chargesRequired": 5
  }
}
```

### Pipeline Type: `cascading`
- Count how many chips have `triggered: true` in `firedChips` array so far
- Multiplier = 1 + (value × triggered count)
- Examples with 0.3 value:
  - 0 chips fired before = ×1.0 (no bonus)
  - 1 chip fired before = ×1.3
  - 2 chips fired before = ×1.6
  - 3 chips fired before = ×1.9
  - 4 chips fired before = ×2.2

---

## Implementation Notes

### New code in `executeChipPipeline()` (chips.js):

```javascript
case 'firstHit':
  if (context.isFirstHit) {
    damage = Math.round(damage * scaledValue);
    triggered = true;
    displayText = effect.displayText;
  }
  break;

case 'cascading':
  const priorFired = firedChips.filter(c => c.triggered).length;
  const cascadeMultiplier = 1 + (scaledValue * priorFired);
  damage = Math.round(damage * cascadeMultiplier);
  triggered = true;
  displayText = `×${cascadeMultiplier.toFixed(1)}`;
  break;
```

### Combat state tracking (combat-service.js):

```javascript
// In startEncounter() / startBossEncounter():
this.gm.run.player._isFirstHit = true;

// After first attack resolves:
this.gm.run.player._isFirstHit = false;
```

### Files to modify:
- `data/chips.json` — Add both chip entries
- `src/game/items/chips.js` — Add `firstHit` and `cascading` cases to pipeline
- `src/game/services/combat-service.js` — Track `_isFirstHit` flag
