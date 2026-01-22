# Combat Changes: Chip Levels & Chip Skills

## Summary

Add two interconnected features to the chip system:
1. **Chip Levels (1-7)** - Per-run leveling with +5% additive scaling per level
2. **Chip Skills** - Fixed active abilities with charge meters

---

## Specifications

### Chip Levels
- Per-run only (reset each new run)
- Additive scaling: L1=base, L2=+5%, L3=+10%... L7=+30%
- Level displayed on chip icon (badge shown only if level > 1)
- Full 7-level data structure defined now (leveling UI comes later)
- Scaling formula differs by effect type (see Level Scaling Formulas below)

### Level Scaling Formulas

**flatAdd chips** (e.g., powerCell base +5):
```
scaledValue = floor(value * (1 + (level - 1) * 0.05))
L1: +5, L2: +5, L3: +5, L4: +6, L5: +6, L6: +6, L7: +6
```

**multiply chips** (e.g., amplifier base 1.5x):
Scale the bonus portion (value - 1), keep the base 1.0:
```
scaledValue = 1 + (value - 1) * (1 + (level - 1) * 0.05)
L1: 1.5x, L2: 1.525x, L3: 1.55x, ... L7: 1.65x
```

**All other effect types**: Apply the flatAdd formula to their primary `value` field.

### Chip Skills
- Each chip type has one fixed unique skill
- Popup: skill name + description + "Use Skill" button
- Popup appears near the clicked chip (not center modal)
- Uncharged: popup shows, button disabled (shows "Charging 3/5")
- Skills do NOT change with chip level
- Fixed values (no stat scaling), except `burstCycle` which uses `player.attack`
- Combat only (turn-based)
- Instant skills (damage/heal) bypass pipeline — applied directly to HP
- Buff skills modify the next attack (see Buff Types below)
- Multiple buffs of the same type multiply together

### Buff Types

| Type | When Applied | Stacking Rule |
|------|---|---|
| PRE_PIPELINE | Added to baseDamage before pipeline runs | Flat bonuses sum |
| POST_PIPELINE | Multiplies finalDamage after pipeline completes | Multipliers multiply together (×1.8 × ×1.3 = ×2.34) |
| PIPELINE_MODIFIER | Changes how pipeline executes | Each modifier applies independently |
| DEFENSIVE | Checked when player takes enemy damage | Each checked independently |

**Application order for an attack:**
1. Calculate baseDamage from attack resolution
2. Apply PRE_PIPELINE buffs (sum flat bonuses into baseDamage)
3. Run chip pipeline (with level-scaled chip effects)
4. Apply POST_PIPELINE buffs (multiply finalDamage)
5. Apply equipment bonuses (double strike, vsBoss, etc.)
6. Apply damage to enemy

**Pipeline Modifier details:**
- `Infinite Loop (runTwice)`: Execute pipeline twice with same baseDamage, **sum** both results as finalDamage. Very powerful — effectively doubles all chip effects.
- `Perfect Copy (nextChipDouble)`: The next chip in pipeline execution order fires twice. If Copycat is in slot 3, the chip in slot 4 triggers twice.

### Skill Activation Animation
- Full dramatic animation (~1 second)
- Visual glow + particle burst effect (CSS keyframes only, no JS particle libs)
- No sound effect
- Cyberpunk aesthetic (cyan/neon colors) (reuse existing css variables)

### Skill Meter
- Progress bar with 5 segment markers below each chip icon
- All equipped weapon chips gain +1 charge at end of each turn (after enemy acts)
- Charges increment regardless of hit/miss/block — a round passed
- Charges do NOT increment if player turn was skipped (stun/sleep)
- Default: 5 charges to activate
- Charges carry over between fights
- Start at 0 at run start
- Unequip resets charge to 0
- Chip destruction resets charge (chip no longer exists)
- Glow effect when fully charged (pulsing cyan box-shadow)

### Combat Flow
- Turn-based only (no realtime mode)
- Skills usable before reviewing vocab card (during vocab pause phase)
- Unlimited skills per turn (each resets that chip's meter to 0)
- Clicking chip shows popup anytime during combat
- Buffs are consumed on the next attack (one-shot)
- Unconsumed buffs cleared on combat end (victory or defeat)

---

## Skill Definitions for All 18 Chips

| Chip | Skill Name | Buff Type | Effect | Charges |
|------|------------|-----------|--------|---------|
| **powerCell** | Power Surge | PRE_PIPELINE | Next attack +20 flat damage | 5 |
| **amplifier** | Overdrive | POST_PIPELINE | Next attack ×1.8 multiplier | 5 |
| **critBooster** | Precision Strike | POST_PIPELINE | Next attack ×1.3 multiplier | 5 |
| **overloader** | System Overload | instant | Deal 40 damage directly | 5 |
| **finisher** | Execute | POST_PIPELINE | Next attack ×2.0 vs enemies <30% HP | 5 |
| **recursion** | Infinite Loop | PIPELINE_MODIFIER | Next pipeline runs twice (sum results) | 5 |
| **sacrifice** | Emergency Shutdown | instant | Heal 30 HP | 5 |
| **stackOverflow** | Memory Dump | instant | Deal 5× current stack count as damage (0 at combat start) | 5 |
| **minimalist** | Zen Mode | PRE_PIPELINE | Next attack +60 if 2+ empty weapon slots | 5 |
| **lifelink** | Life Surge | instant | Heal 25 HP | 5 |
| **bountyHunter** | Collect Bounty | instant | Deal (kills this run × 2) damage | 5 |
| **siphon** | Drain Life | instant | Heal 20 HP, deal 10 damage | 5 |
| **executiveOverride** | Authority | POST_PIPELINE | Next attack ×1.3 vs bosses only | 5 |
| **phoenix** | Rebirth | DEFENSIVE | Next hit that would kill player → survive with 1 HP | 5 |
| **unstable** | Controlled Chaos | PRE_PIPELINE | Next attack +15 flat damage | 5 |
| **copycat** | Perfect Copy | PIPELINE_MODIFIER | Next chip in pipeline fires twice | 5 |
| **lightweight** | Featherweight | PRE_PIPELINE | Next attack +30 per empty weapon slot | 5 |
| **burstCycle** | Instant Burst | instant | Deal 3× player.attack as direct damage | 5 |

### Skill Notes
- `stackOverflow`: Stack count (`_combatStacks[chipId]`) resets each combat. Skill is weak at fight start, strong after building stacks. Intentional.
- `burstCycle`: References `player.attack` — exception to "fixed values" rule.
- `phoenix` (Rebirth): Intercepts enemy damage, NOT a pipeline buff. Checked in enemy damage application logic.
- `finisher` (Execute): Condition checked at damage application — if enemy is below 30% HP when the attack lands, multiplier applies.
- `executiveOverride` (Authority): Only applies if `enemy.isBoss === true`.

---

## Data Structure Changes

### chips.json - Add `skill` to each chip
```json
{
  "powerCell": {
    "id": "powerCell",
    "name": "パワーセル",
    "nameEn": "Power Cell",
    "effects": { "pipeline": { "type": "flatAdd", "value": 5, "triggerChance": 1, "displayText": "+5" } },
    "skill": {
      "id": "powerSurge",
      "name": "パワーサージ",
      "nameEn": "Power Surge",
      "description": "次の攻撃に+20ダメージ",
      "descriptionEn": "Next attack deals +20 damage",
      "type": "buff",
      "buffType": "PRE_PIPELINE",
      "effect": { "flatBonus": 20 },
      "chargesRequired": 5
    }
  }
}
```

### chip-config.json - Add level and skill config
```json
{
  "levelConfig": {
    "maxLevel": 7,
    "scalingPerLevel": 0.05
  },
  "skillConfig": {
    "defaultCharges": 5,
    "chargePerTurn": 1
  }
}
```

### Player State (state.js) - Add to run player
```javascript
// Added to run.player (underscore prefix matches existing _combatStacks convention)
_chipCharges: {},    // { [chipId]: number } - e.g., { powerCell: 3 }
_chipLevels: {},     // { [chipId]: 1-7 } - absent means level 1
_activeBuffs: []     // Array of buff objects for next attack
```

### Buff Object Shape
```javascript
{
  id: 'powerSurge',           // Skill ID
  chipId: 'powerCell',        // Source chip
  buffType: 'PRE_PIPELINE',   // PRE_PIPELINE | POST_PIPELINE | PIPELINE_MODIFIER | DEFENSIVE
  effect: { flatBonus: 20 },  // Type-specific effect data
  condition: null              // Optional: 'enemyBelow30', 'isBoss', 'emptySlots>=2'
}
```

---

## Architecture Decisions

| Decision | Answer |
|----------|--------|
| Chip ID format | Plain IDs only: `powerCell`, `amplifier` (no rarity suffixes) |
| Rarity system | Fixed per chip definition, affects drop rate only, no stat scaling |
| Combat mode | Turn-based only (no realtime) |
| Where charges live | `run.player._chipCharges = { [chipId]: number }` |
| Charge increment trigger | After enemy turn resolves (1 full round complete) |
| Charge on miss/block | Yes — a round passed regardless |
| Charge on stun/sleep | No — player didn't get a real turn |
| Infinite Loop result | Sum of both pipeline runs |
| Multiple post-pipeline buffs | Multiply together (×1.8 × ×1.3 = ×2.34) |
| Multiple pre-pipeline buffs | Sum flat bonuses (+20 + +15 = +35) |
| Buff lifetime | Consumed on next attack, cleared on combat end |
| Level scaling for multiply chips | Scale bonus portion: `1 + (value-1) * (1 + (level-1)*0.05)` |
| Level scaling for flatAdd chips | `floor(value * (1 + (level-1) * 0.05))` |
| Phoenix (DEFENSIVE) | Checked in enemy damage application, not in pipeline |
| Existing combat chip UI | Row of 5 icons already rendered in `combat.js renderCombatChips()` |

---

## Implementation Plan (Step-by-Step)

Each step is independently testable and should be a single commit.

### Phase 1: Data Layer

**Step 1.1: Add level/skill config to `chip-config.json`**
- Add `levelConfig` and `skillConfig` objects (see Data Structure Changes above)
- No behavior change

**Step 1.2: Add `skill` to chips.json (chips 1-6)**
- Add `skill` object to: `powerCell`, `amplifier`, `critBooster`, `overloader`, `finisher`, `recursion`
- Include: id, name, nameEn, description, descriptionEn, type, buffType (if buff), effect, chargesRequired
- For instant types: `"type": "instant"`, no buffType field
- For buff types: `"type": "buff"`, include `"buffType": "PRE_PIPELINE"` etc.

**Step 1.3: Add `skill` to chips.json (chips 7-12)**
- Same for: `sacrifice`, `stackOverflow`, `minimalist`, `lifelink`, `bountyHunter`, `siphon`

**Step 1.4: Add `skill` to chips.json (chips 13-18)**
- Same for: `executiveOverride`, `phoenix`, `unstable`, `copycat`, `lightweight`, `burstCycle`

---

### Phase 2: State & Helpers

**Step 2.1: Add `_chipCharges`, `_chipLevels`, `_activeBuffs` to player state**
- File: `src/game/state.js`
- In `createNewRun()`: after the player deep-copy, initialize:
  ```javascript
  run.player._chipCharges = {};
  run.player._chipLevels = {};
  run.player._activeBuffs = [];
  ```

**Step 2.2: Chip charge helper functions**
- File: `src/game/items/chips.js`
- Add and export:
  - `getChipCharge(player, chipId)` → `player._chipCharges[chipId] || 0`
  - `incrementAllEquippedCharges(player)` → for each chip in `player.equipment.weapon.equippedChips`, increment `_chipCharges[chipId]` by 1
  - `resetChipCharge(player, chipId)` → `player._chipCharges[chipId] = 0`
  - `isChipSkillReady(player, chipId)` → charge >= `getChip(chipId).skill.chargesRequired`

**Step 2.3: Chip level helper functions**
- File: `src/game/items/chips.js`
- Add and export:
  - `getChipLevel(player, chipId)` → `player._chipLevels[chipId] || 1`
  - `setChipLevel(player, chipId, level)` → clamp 1-7, store
  - `getScaledEffectValue(chip, level)` → apply scaling formula based on `chip.effects.pipeline.type`:
    - `flatAdd`/`stacking`/`damageAndHeal`/`killCounter`/`riskyFlat`/`perEmptySlot`/`emptySlots`: `Math.floor(value * (1 + (level-1) * 0.05))`
    - `multiply`/`conditional`/`vsBoss`/`destroyedMultiplier`: `1 + (value-1) * (1 + (level-1) * 0.05)`
    - `critMod`: `value * (1 + (level-1) * 0.05)` (no floor, keep decimal)
    - All others: same as flatAdd formula

**Step 2.4: Charge reset on unequip and destruction**
- File: `src/game/items/chips.js` — in `unequipChip()`, add `resetChipCharge(player, chipId)` after removing from equipment
- File: `src/game/services/combat-service.js` — in sacrifice/destruction handlers (where chips are removed), add `resetChipCharge()` call

---

### Phase 3: Skill System Core

**Step 3.1: Create `src/game/combat/chip-skills.js`**
- Define buff type constants: `PRE_PIPELINE`, `POST_PIPELINE`, `PIPELINE_MODIFIER`, `DEFENSIVE`
- Export:
  - `addBuff(player, buff)` → push to `player._activeBuffs`
  - `consumeBuffsByType(player, type)` → filter out and return matching buffs, remove from array
  - `clearAllBuffs(player)` → `player._activeBuffs = []`
  - `hasDefensiveBuff(player)` → boolean check for any DEFENSIVE buff

**Step 3.2: Implement `executeInstantSkill(player, enemy, chip)`**
- File: `src/game/combat/chip-skills.js`
- Switch on `chip.id`:
  - `overloader` → `{ damage: 40 }`
  - `sacrifice` → `{ heal: 30 }`
  - `lifelink` → `{ heal: 25 }`
  - `siphon` → `{ heal: 20, damage: 10 }`
  - `stackOverflow` → `{ damage: 5 * (player._combatStacks?.[chip.id] || 0) }`
  - `bountyHunter` → `{ damage: (player._runKills || 0) * 2 }`
  - `burstCycle` → `{ damage: player.attack * 3 }`
- Apply damage to `enemy.hp`, apply heal to `player.hp` (capped at maxHp)
- Return result object for API response

**Step 3.3: Implement `activateBuffSkill(player, chip)`**
- File: `src/game/combat/chip-skills.js`
- Build buff object based on chip.id (see Skill Definitions table for buffType and effect)
- Call `addBuff(player, buff)`
- Return buff info for API response

**Step 3.4: Top-level `useChipSkill(player, enemy, chipId)`**
- File: `src/game/combat/chip-skills.js`
- Validate: chip in `weapon.equippedChips`, skill exists, `isChipSkillReady()`
- If `skill.type === 'instant'`: call `executeInstantSkill()`
- If `skill.type === 'buff'`: call `activateBuffSkill()`
- Call `resetChipCharge(player, chipId)`
- Return: `{ success, skillName, skillType, result }`

---

### Phase 4: Combat Integration

**Step 4.1: Charge increment after enemy turn**
- File: `src/game/services/combat-service.js`
- In `executeAttack()`: after setting `combat.turn = 'enemy'` and before return, add charge increment
- Specifically: after the enemy acts and turn returns to player, call `incrementAllEquippedCharges(player)`
- Skip increment if player was stunned/slept (turn was skipped)
- Import `incrementAllEquippedCharges` from chips.js

**Step 4.2: Apply level scaling in pipeline execution**
- File: `src/game/items/chips.js`
- In `processPipelineChip()`: when reading `effect.value`, use `getScaledEffectValue(chip, getChipLevel(context.player, chip.id))`
- Add `player` to the pipeline context object (passed from `executePlayerAttack`)
- Ensure `executeChipPipeline()` passes player through to `processPipelineChip()`

**Step 4.3: Apply PRE_PIPELINE buffs**
- File: `src/game/combat/player-actions.js`
- In `executePlayerAttack()`, before calling `executeChipPipeline()`:
  ```javascript
  const preBuffs = consumeBuffsByType(player, 'PRE_PIPELINE');
  for (const buff of preBuffs) {
    if (buff.condition === 'emptySlots>=2') {
      const empty = weapon.maxChipSlots - weapon.equippedChips.length;
      if (empty >= 2) baseDamage += buff.effect.flatBonus;
    } else if (buff.effect.flatBonusPerEmpty) {
      const empty = weapon.maxChipSlots - weapon.equippedChips.length;
      baseDamage += buff.effect.flatBonusPerEmpty * empty;
    } else if (buff.effect.flatBonus) {
      baseDamage += buff.effect.flatBonus;
    }
  }
  ```

**Step 4.4: Apply POST_PIPELINE buffs**
- File: `src/game/combat/player-actions.js`
- After pipeline returns finalDamage:
  ```javascript
  const postBuffs = consumeBuffsByType(player, 'POST_PIPELINE');
  for (const buff of postBuffs) {
    if (buff.condition === 'enemyBelow30' && enemy.hp / enemy.maxHp >= 0.3) continue;
    if (buff.condition === 'isBoss' && !enemy.isBoss) continue;
    finalDamage = Math.floor(finalDamage * buff.effect.multiplier);
  }
  ```

**Step 4.5: Apply PIPELINE_MODIFIER buffs**
- File: `src/game/combat/player-actions.js`
- Before/around the pipeline call:
  ```javascript
  const modBuffs = consumeBuffsByType(player, 'PIPELINE_MODIFIER');
  const runTwice = modBuffs.some(b => b.effect.runTwice);
  const nextChipDouble = modBuffs.some(b => b.effect.nextChipDouble);

  // Pass nextChipDouble flag into pipeline context
  const pipelineContext = { ..., nextChipDouble };
  let pipelineResult = executeChipPipeline(weaponChips, pipelineContext);

  if (runTwice) {
    const secondResult = executeChipPipeline(weaponChips, pipelineContext);
    pipelineResult.finalDamage += secondResult.finalDamage;
    // Merge firedChips, healPlayer, etc.
  }
  ```
- In `processPipelineChip()`: if `context.nextChipDouble` is true and this is the first chip after the copycat's position, process it twice (then clear the flag)

**Step 4.6: Apply DEFENSIVE buffs**
- File: `src/game/services/combat-service.js`
- In enemy damage application (where `player.hp -= damage`):
  ```javascript
  if (player.hp - damage <= 0) {
    const defBuffs = consumeBuffsByType(player, 'DEFENSIVE');
    if (defBuffs.some(b => b.effect.surviveLethal)) {
      player.hp = 1;
      // Mark in result for UI feedback
      result.survivedLethal = true;
    } else {
      player.hp -= damage;
    }
  } else {
    player.hp -= damage;
  }
  ```

**Step 4.7: Clear buffs on combat end**
- File: `src/game/services/combat-service.js`
- In `handleVictory()` and `handleDefeat()`: call `clearAllBuffs(player)`

---

### Phase 5: API Endpoints

**Step 5.1: POST `/api/game/use-chip-skill`**
- File: route file or `server.js`
- Request body: `{ chipId: string }`
- Validate: combat active, chip equipped, skill ready
- Call `useChipSkill(player, enemy, chipId)`
- Response: `{ success, skillName, skillType, effect: { damage?, heal?, buffApplied? }, chipCharges: { [chipId]: 0 } }`
- On instant damage: also return updated `enemyHp` and `playerHp`

**Step 5.2: GET `/api/game/chip-skill-info/:chipId`**
- Returns: `{ chip: { id, name, skill }, charges, chargesRequired, level, isReady }`
- Used by frontend popup

**Step 5.3: Extend `/api/game/chip-loadout` response**
- Add `chipCharges: player._chipCharges` to response
- Add `chipLevels: player._chipLevels` to response
- Frontend uses this to render charge meters

---

### Phase 6: Frontend - Charge Meters & Levels

**Step 6.1: Update `renderCombatChips()` with charge meters**
- File: `public/js/ui/combat.js`
- After each filled chip icon, add:
  ```html
  <div class="chip-charge-meter">
    <div class="chip-charge-segment filled"></div>  <!-- repeat per charge -->
    <div class="chip-charge-segment"></div>         <!-- empty segments -->
  </div>
  ```
- Get charges from chipLoadoutCache (extended in Step 5.3)

**Step 6.2: Add level badge**
- In `renderCombatChips()`, if level > 1, add:
  ```html
  <span class="chip-level-badge">L${level}</span>
  ```
- Positioned top-left of chip icon via CSS

**Step 6.3: Add charged glow class**
- When `charges >= chargesRequired`: add class `.chip-charged` to chip slot div
- CSS handles the pulsing glow animation

**Step 6.4: Re-render chips after state changes**
- After attack response: re-render chip row (charges updated)
- After skill use: re-render chip row (charge reset)
- After equip/unequip: re-render chip row

---

### Phase 7: Frontend - Skill Popup

**Step 7.1: Click handler + popup structure**
- File: `public/js/ui/combat.js`
- Add `onclick="showChipSkillPopup('${chip.id}')"` to filled chip slots
- `showChipSkillPopup(chipId)`:
  - Fetch `/api/game/chip-skill-info/:chipId`
  - Create popup div positioned near the clicked chip
  - Content: skill name, description, charge status, "Use Skill" button
  - Close on click-outside or Escape key

**Step 7.2: "Use Skill" button**
- If `isReady`: button enabled → `onclick` calls POST `/api/game/use-chip-skill`
- If not ready: button disabled, text shows "Charging 3/5"
- On success:
  - Close popup
  - For instant: update HP bars, show damage/heal number
  - For buff: show buff indicator near player area
  - Re-render chips (charge reset)

**Step 7.3: Skill activation animation**
- On successful skill use: add `.chip-skill-activating` class to chip slot
- CSS: ~1s glow expansion + brightness pulse in cyan/neon
- `animationend` event removes the class

**Step 7.4: Buff indicator**
- When buff applied: show small indicator text/icon near player HP bar
- Text: buff name (e.g., "POWER SURGE")
- On next attack that consumes buff: flash and remove indicator
- Track active buff indicators in module state

---

### Phase 8: CSS Styles

**Step 8.1: Charge meter styles**
- File: `public/game.css`
```css
.chip-charge-meter { /* thin bar below chip, flex row, gap 1px */ }
.chip-charge-segment { /* small rectangle, dark background */ }
.chip-charge-segment.filled { /* cyan background */ }
```

**Step 8.2: Level badge + charged glow**
```css
.chip-level-badge { /* absolute, top-left, small font, neon color */ }
.chip-charged { /* @keyframes pulse-glow: box-shadow 0 0 8px cyan alternating */ }
```

**Step 8.3: Popup + activation animation**
```css
.chip-skill-popup { /* absolute, dark bg, neon border, z-index above combat */ }
.skill-use-btn { /* cyberpunk button style */ }
.skill-use-btn:disabled { /* dimmed, cursor not-allowed */ }
.chip-skill-activating { /* @keyframes skill-burst: scale + glow ~1s */ }
.buff-indicator { /* small floating text near player area */ }
```

---

### Phase 9: Cleanup & Test

**Step 9.1: Remove rarity suffix logic from combat chip rendering**
- File: `public/js/ui/combat.js` line 414
- Remove: `chip.baseId || chip.id.replace(/_(common|uncommon|rare|epic|legendary)$/, '')`
- Replace with: `chip.id`

**Step 9.2: Syntax check all modified files**
```bash
node --check src/game/items/chips.js
node --check src/game/services/combat-service.js
node --check src/game/combat/player-actions.js
node --check src/game/combat/chip-skills.js
node --check public/js/ui/combat.js
```

**Step 9.3: Run e2e tests**
```bash
./scripts/e2e-test.sh
```
Target: 80+/87 passing (known flakiness acceptable)

**Step 9.4: Manual verification checklist**
1. Start a new run → all chips level 1, 0 charges
2. Complete a turn → equipped chips gain +1 charge
3. After 5 turns → chips glow when fully charged
4. Click charged chip → popup shows with enabled "Use Skill"
5. Use instant skill (overloader) → enemy takes 40 damage, charge resets
6. Use buff skill (Power Surge) → next attack deals +20 base damage
7. Use two buff skills → they stack correctly
8. Charges persist between combats (finish fight, start new one)
9. Unequip chip → its charges reset to 0
10. Phoenix Rebirth → survive lethal hit at 1 HP
11. Infinite Loop → pipeline damage roughly doubles

---

## Key Files to Modify

| File | Changes |
|------|---------|
| `data/chips.json` | Add `skill` definitions to all 18 chips |
| `data/chip-config.json` | Add `levelConfig` + `skillConfig` |
| `src/game/state.js` | Add `_chipCharges`, `_chipLevels`, `_activeBuffs` init |
| `src/game/items/chips.js` | Charge helpers, level helpers, `getScaledEffectValue()`, unequip reset |
| `src/game/combat/chip-skills.js` | **NEW** — buff management, instant/buff skill execution, `useChipSkill()` |
| `src/game/combat/player-actions.js` | Apply PRE/POST/MODIFIER buffs around pipeline |
| `src/game/services/combat-service.js` | Charge increment, DEFENSIVE buffs, clear on combat end, destruction reset |
| `server.js` (or routes) | `/api/game/use-chip-skill`, `/api/game/chip-skill-info/:chipId`, extend chip-loadout |
| `public/js/ui/combat.js` | Charge meters, level badges, glow, click popup, skill button, animation |
| `public/game.css` | Meter, badge, glow, popup, activation, buff indicator styles |
