# Leveling Overhaul: PokeRogue-Style XP Curve

> **Goal:** Make leveling feel like a casino — constant dopamine hits, compounding multipliers, front-loaded level-up cascades. Adapted from PokeRogue's battle-tested systems.

---

## Changes Summary

| Mechanic | Current | New |
|----------|---------|-----|
| XP per level | Flat 100 | Cubic: `L³ - (L-1)³` |
| XP per kill | Flat 50 | Scales with enemy level: `10 × enemyLevel` |
| XP multiplier items | None | EXP Charm: +25% per stack (multiplicative) |
| XP redistribution | None | EXP Balance: shifts XP to lower-leveled robots |
| XP display | Level number only | XP bar + level-up animation + stat popup |

---

## 1. XP Curve: Cubic (L³)

Same formula as PokeRogue's Medium Fast growth rate.

```javascript
// Cumulative XP to reach level L
function cumulativeXpForLevel(level) {
  return Math.pow(level, 3);
}

// XP needed for the next level
function xpToNextLevel(currentLevel) {
  return cumulativeXpForLevel(currentLevel + 1) - cumulativeXpForLevel(currentLevel);
}
```

| Level | XP for that level | Cumulative |
|-------|-------------------|------------|
| 1→2 | 7 | 8 |
| 2→3 | 19 | 27 |
| 3→4 | 37 | 64 |
| 4→5 | 61 | 125 |
| 5→6 | 91 | 216 |
| 9→10 | 271 | 1,000 |
| 14→15 | 631 | 3,375 |
| 19→20 | 1,141 | 8,000 |
| 29→30 | 2,611 | 27,000 |

**Replaces:** `XP_PER_LEVEL = 100` constant in `robots.js`.

**Why cubic, not quadratic:** PokeRogue proved cubic works over 200 waves. Quadratic is too gentle — it doesn't create the contrast between "instant early levels" and "earned late levels." Cubic works because we're also adopting their scaling XP rewards (section 2).

---

## 2. Enemy XP Rewards: Scale With Level

```javascript
const BASE_KILL_XP = 10;

function getKillXp(enemyLevel) {
  return BASE_KILL_XP * enemyLevel;
}
```

| Enemy Level | XP per kill | Per active robot (3 active, 0 reserve) |
|-------------|-------------|----------------------------------------|
| L1 | 10 | 3.3 |
| L5 | 50 | 16.7 |
| L10 | 100 | 33.3 |
| L20 | 200 | 66.7 |
| L30 | 300 | 100 |

**Replaces:** Hardcoded `50` in `robot-combat-service.js` line 100.

**XP distribution unchanged:** Active robots get 2 shares, reserves get 1 share. This already mirrors PokeRogue's participant vs bench split.

**Why this works with cubic:** As robots level up, enemies scale to match (existing `highestAllyLevel ± 1` logic). Higher enemy levels → more XP per kill → offsets rising cubic requirements. Self-balancing feedback loop.

---

## 3. EXP Charm (New Droppable Item)

**PokeRogue equivalent:** EXP Charm (+25% party-wide XP per stack). In PokeRogue these are auto-awarded at boss waves and offered in shops.

**Our version:**

```json
{
  "id": "exp-charm",
  "word": "経験の魔石",
  "reading": "けいけんのませき",
  "meaning": "EXP Charm",
  "rarity": "uncommon",
  "type": "xpCharm",
  "effect": { "field": "xpMultiplier", "value": 0.25 },
  "description": "A glowing crystal that amplifies battle experience.",
  "descriptionJa": "戦闘経験を増幅する光る結晶。"
}
```

**Mechanics:**
- Appears as a **droppable item after any battle** (in the post-combat item selection)
- Each stack: **+25% XP multiplicatively** — `xpMultiplier *= 1.25`
- Stacks compound: 1 = 1.25×, 2 = 1.56×, 3 = 1.95×, 5 = 3.05×, 10 = 9.31×
- **No cap on stacks** (PokeRogue caps at 99, effectively uncapped)
- Applied in `awardKillXp()` before share distribution

**New field in itemBuffs:**

```javascript
itemBuffs: {
  attackMult: 1.0,
  hpMult: 1.0,
  autoPowerMult: 1.0,
  ultimatePowerMult: 1.0,
  elementEdge: 0,
  flatDamageReduction: 0,
  xpMultiplier: 1.0          // NEW
}
```

**Drop frequency:** Treat as a regular uncommon item in the post-combat shop item pool. Players will accumulate them naturally through a run.

**Future:** Can restrict to boss/area-completion rewards only for tuning. For now, droppable after any battle.

---

## 4. EXP Balance (New Droppable Item)

**PokeRogue equivalent:** EXP Balance — redistributes XP from overleveled to underleveled party members using linear interpolation.

**Our version:**

```json
{
  "id": "exp-balance",
  "word": "均衡の魔石",
  "reading": "きんこうのませき",
  "meaning": "EXP Balance",
  "rarity": "epic",
  "type": "xpBalance",
  "effect": { "field": "xpBalanceStacks", "value": 1 },
  "description": "Channels experience toward weaker allies.",
  "descriptionJa": "弱い仲間に経験を注ぐ石。"
}
```

**Mechanics:**
- After XP is distributed per robot, **lerp** each robot's XP gain toward the mean:
  ```
  adjustedXp = lerp(originalXp, meanXp, 0.2 * stacks)
  ```
- Max 4 stacks (80% redistribution at max)
- Rarity: **epic** (rare find, same as PokeRogue's scarcity)

**When it matters:** Newly befriended robots are lower level than your veterans. Without balance, they get the same XP but need less to level (cubic curve helps here naturally). With balance, they get MORE XP and catch up faster.

---

## 5. What Stays the Same

| Mechanic | Why keep |
|----------|---------|
| Active/Reserve shares (2×/1×) | Already creates participant vs bench dynamic |
| Enemy level matching (highestAlly ± 1) | Creates the self-balancing XP loop |
| Stat scaling (10% per level) | Enemies scale equally — relative power unchanged |
| Meta-progression (vitality, attack, etc.) | Independent system, no interaction with XP curve |
| Credits per kill (15) | Separate economy |

**Adjusted to match new curve:**

| Mechanic | Current | New |
|----------|---------|-----|
| Shrine XP | 100 (flat) | `xpToNextLevel(robotLevel)` — always grants 1 full level |
| Quiz levelup reward | 100 (flat) | Same: `xpToNextLevel(robotLevel)` |
| Befriend XP | 100 (flat) | Same: `xpToNextLevel(robotLevel)` |
| Word Discovery XP | 10 (20% of 50) | 20% of `getKillXp(enemyLevel)` — scales naturally |

---

## 6. Differences From PokeRogue

| Aspect | PokeRogue | Us | Why |
|--------|-----------|-----|-----|
| Growth rates | 6 rates blended toward Medium Fast | Single L³ curve | No species-specific growth |
| Base EXP per species | Varies 50-250 per Pokemon | Flat `BASE_KILL_XP = 10` | Enemies don't have unique EXP yields |
| Starting level | L5 | L1 | Fresh start each run |
| EXP Share (bench) | Item: 0→20%/stack | Built-in: reserves always get 1 share | Reserve system already handles this |
| EXP Charm source | Boss wave auto-reward + shop | **Droppable after any battle** | Simpler for now; boss-only later |
| EXP Balance source | Mystery encounters only (very rare) | Epic rarity in item pool | More accessible for shorter runs |
| Lucky Egg | +40% per-Pokemon held item | **Skipped** | Not needed for v1 |
| Level cap per wave | Can't exceed wave bracket | None | No grinding in our linear progression |
| Trainer battle bonus | 1.5× XP | None | No trainer-type encounters |

---

## 7. Simulation: 100 Encounters

**Setup:** 3 active robots, 0 reserves. 1.5 kills/encounter avg. EXP Charm picked up roughly every 10 encounters (natural drop rate from shops). Enemy level = highest robot level ± 1.

### Encounter-by-encounter (Area 1)

| Enc | Enemy Lvl | Kill XP | Per robot | Charms | Effective | Cum XP | Level | Party lvl-ups |
|-----|-----------|---------|-----------|--------|-----------|--------|-------|---------------|
| 1 | 1 | 10 | 5.0 | 0 | 5.0 | 5 | L1 | 0 |
| 2 | 1 | 10 | 5.0 | 0 | 5.0 | 10 | L2 | **3** |
| 3 | 2 | 20 | 10.0 | 0 | 10.0 | 20 | L2 | 0 |
| 4 | 2 | 20 | 10.0 | 0 | 10.0 | 30 | L3 | **3** |
| 5 | 3 | 30 | 15.0 | 0 | 15.0 | 45 | L3 | 0 |
| 6 | 3 | 30 | 15.0 | 0 | 15.0 | 60 | L3 | 0 |
| 7 | 4 | 40 | 20.0 | 0 | 20.0 | 80 | L4 | **3** |
| 8 | 4 | 40 | 20.0 | 1 | 25.0 | 105 | L4 | 0 |
| 9 | 4 | 40 | 20.0 | 1 | 25.0 | 130 | L5 | **3** |
| 10 | 5 | 50 | 25.0 | 1 | 31.3 | 161 | L5 | 0 |

**Area 1: L1→L5, 12 party level-ups in 10 encounters.** Level-ups on encounters 2, 4, 7, 9.

### Area-by-area summary

| Area | Enc | Charms (cum) | XP multiplier | Avg enemy lvl | Cum XP | Level | Party lvl-ups |
|------|-----|-------------|---------------|--------------|--------|-------|---------------|
| 1 | 1-10 | ~1 | 1.25× | 3 | 161 | L5 | 12 |
| 2 | 11-20 | ~2 | 1.56× | 7 | 610 | L8 | 9 |
| 3 | 21-30 | ~3 | 1.95× | 10 | 1,590 | L11 | 9 |
| 4 | 31-40 | ~4 | 2.44× | 13 | 3,340 | L14 | 9 |
| 5 | 41-50 | ~5 | 3.05× | 17 | 6,240 | L18 | 12 |
| 6 | 51-60 | ~6 | 3.81× | 21 | 10,840 | L22 | 12 |
| 7 | 61-70 | ~7 | 4.77× | 25 | 17,940 | L26 | 12 |
| 8 | 71-80 | ~8 | 5.96× | 29 | 28,740 | L30 | 12 |
| 9 | 81-90 | ~9 | 7.45× | 34 | 44,940 | L35 | 15 |
| 10 | 91-100 | ~10 | 9.31× | 40 | 68,940 | L41 | 18 |
| **Total** | | | | | | **L41** | **120** |

### Head-to-head comparison

| System | End Level | Total Party Level-ups | First 10 enc |
|--------|-----------|----------------------|-------------|
| PokeRogue (1 fighter, 6 party) | ~L37 | ~192 | ~30 |
| **Our new system (3 active)** | **L41** | **120** | **12** |
| Our current (flat) | L26 | 75 | 6 |

PokeRogue's 192 events come from 6 party members leveling. Per-Pokemon they get ~32 levels — we get 40 per robot. The casino feel is comparable because we have 3 robots leveling frequently vs their 1-2 leveling with 4-5 on the bench.

---

## 8. Critical Implementation Details

These details prevent bugs. Read carefully.

### 8a. XP Storage: Keep Per-Level (Not Cumulative)

The current code stores `robot.xp` as XP toward the current level (resets to 0 on level-up). **Keep this model.** Don't switch to cumulative — it would break save compatibility and make the level-up loop harder.

```javascript
// KEEP this pattern from current addXpToRobot (robots.js:87-101)
// robot.xp = XP toward next level (resets on level-up)
// robot.level = current level

function xpToNextLevel(level) {
  // XP needed to go from `level` to `level + 1`
  return Math.pow(level + 1, 3) - Math.pow(level, 3);
  // L1→L2: 7, L2→L3: 19, L3→L4: 37, L4→L5: 61, etc.
}
```

### 8b. Updated addXpToRobot (Full Replacement)

```javascript
export function addXpToRobot(robot, xp) {
  robot.xp += xp;
  const levelUps = [];
  while (robot.xp >= xpToNextLevel(robot.level)) {
    robot.xp -= xpToNextLevel(robot.level);
    robot.level++;
    const rarityMult = RARITY_MULTIPLIERS[robot.rarity] || 1.0;
    const baseHp = Math.floor((robot.baseHpTemplate || 100) * rarityMult);
    const baseAtk = Math.floor((robot.baseAttackTemplate || 10) * rarityMult);
    const stats = getStatsForLevel(baseHp, baseAtk, robot.level);
    const hpDiff = stats.maxHp - robot.maxHp;
    robot.maxHp = stats.maxHp;
    robot.attack = stats.attack;
    robot.hp += hpDiff;
    levelUps.push({ level: robot.level, maxHp: stats.maxHp, attack: stats.attack, hpGain: hpDiff });
  }
  return levelUps; // Return for UI animation
}
```

**Key change:** `while (robot.xp >= xpToNextLevel(robot.level))` instead of `while (robot.xp >= XP_PER_LEVEL)`. At low levels, one kill can trigger 2-3 level-ups in one call. The while loop already exists in the current code — just change the threshold.

**Return value:** Returns array of level-up events for the UI to animate (new — current code returns nothing).

### 8c. Updated awardKillXp (Apply xpMultiplier + Enemy Level Scaling)

```javascript
const BASE_KILL_XP = 10;

function awardKillXp(robotParty, enemyLevel, xpMultiplier = 1.0) {
  const baseXp = Math.floor(BASE_KILL_XP * enemyLevel * xpMultiplier);

  // Existing share logic unchanged
  const active = robotParty.filter(r => r.hp > 0 && r.isActive);
  const reserves = robotParty.filter(r => r.hp > 0 && !r.isActive);
  const totalShares = active.length * 2 + reserves.length * 1;
  if (totalShares === 0) return [];

  const perShare = baseXp / totalShares;
  const xpEvents = [];

  for (const robot of active) {
    const xp = Math.floor(perShare * 2);
    const levelUps = addXpToRobot(robot, xp);
    xpEvents.push({ robot, xp, levelUps });
  }
  for (const robot of reserves) {
    const xp = Math.floor(perShare * 1);
    const levelUps = addXpToRobot(robot, xp);
    xpEvents.push({ robot, xp, levelUps });
  }

  return xpEvents;
}
```

**Call site change** (robot-combat-service.js, currently line 100):
```javascript
// OLD: awardKillXp(robotParty, 50)
// NEW: awardKillXp(robotParty, enemy.level, this.run.itemBuffs.xpMultiplier)
```

### 8d. EXP Balance: Use Mean Level (Not Mean XP)

PokeRogue's algorithm exactly:

```javascript
function applyXpBalance(xpEvents, xpBalanceStacks) {
  if (!xpBalanceStacks || xpBalanceStacks <= 0) return;

  // 1. Calculate mean level of all robots that received XP
  const totalLevel = xpEvents.reduce((sum, e) => sum + e.robot.level, 0);
  const meanLevel = Math.floor(totalLevel / xpEvents.length);

  // 2. Recipients = robots at or below mean level
  const totalXp = xpEvents.reduce((sum, e) => sum + e.xp, 0);
  const recipientCount = xpEvents.filter(e => e.robot.level <= meanLevel).length;
  if (recipientCount === 0) return;

  const splitXp = totalXp / recipientCount;
  const t = Math.min(0.2 * xpBalanceStacks, 0.8); // 20% per stack, max 80%

  // 3. Lerp each robot's XP toward target
  for (const event of xpEvents) {
    const isRecipient = event.robot.level <= meanLevel;
    const target = isRecipient ? splitXp : 0;
    event.xp = Math.floor(event.xp + (target - event.xp) * t);
  }
}
```

**Called after** share distribution, **before** `addXpToRobot` is called. This means `awardKillXp` needs restructuring: compute shares first, apply balance, then add XP to robots.

### 8e. EXP Charm Multiplier Scope

**Applies to combat kills only.** Not shrine, quiz, discovery, or befriend XP.

Rationale: PokeRogue's EXP Charms only apply to battle XP. Shrine/quiz are fixed level-up rewards — they should always grant exactly 1 level regardless of multipliers.

| XP Source | Charm applies? | Formula |
|-----------|---------------|---------|
| Combat kill | **Yes** | `BASE_KILL_XP * enemyLevel * xpMultiplier` |
| Shrine | No | `xpToNextLevel(robot.level)` (always 1 level) |
| Quiz levelup | No | `xpToNextLevel(robot.level)` (always 1 level) |
| Befriend | No | `xpToNextLevel(robot.level)` (always 1 level) |
| Word Discovery | **Yes** | `20% of getKillXp(enemyLevel) * xpMultiplier` |

### 8f. EXP Charm applyItem Implementation

```javascript
// In item-service.js applyItem():
case 'xpCharm':
  itemBuffs.xpMultiplier = (itemBuffs.xpMultiplier || 1.0) * (1 + item.effect.value);
  // 1st charm: 1.0 * 1.25 = 1.25
  // 2nd charm: 1.25 * 1.25 = 1.5625
  break;

case 'xpBalance':
  itemBuffs.xpBalanceStacks = (itemBuffs.xpBalanceStacks || 0) + 1;
  break;
```

### 8g. Save Compatibility

Existing robots have `robot.xp` as XP-toward-current-level with the old flat 100 system. Since we keep the per-level model, old saves just work — `robot.xp` is some value 0-99, and the new `xpToNextLevel(robot.level)` will be larger than 100 for any level above ~4. Old robots won't spontaneously level up or down.

New `itemBuffs` fields (`xpMultiplier`, `xpBalanceStacks`) default to `1.0` and `0` respectively if missing. No migration needed — just use `|| 1.0` and `|| 0` fallbacks.

---

## 9. Files to Modify

| File | Change |
|------|--------|
| `src/game/robots.js` | Replace `XP_PER_LEVEL = 100` with cubic formula functions |
| `src/game/services/robot-combat-service.js` | Replace flat `50` with `BASE_KILL_XP * enemyLevel`; apply `xpMultiplier` |
| `src/game/state.js` | Add `xpMultiplier: 1.0` and `xpBalanceStacks: 0` to `itemBuffs` |
| `src/game/services/exploration-service.js` | Update shrine/quiz/discovery XP to use new formulas |
| `src/game/loop.js` | Update befriend XP; pass enemy level to kill XP function |
| `data/items.json` | Add EXP Charm and EXP Balance item definitions |
| `src/game/services/item-service.js` | Handle new `xpCharm` and `xpBalance` item types in `applyItem()` |
| `public/js/ui/robot-row.js` | Add XP bar display |
| `public/game.css` | XP bar styling + level-up animation CSS |
| `public/js/ui/combat-loop.js` | Level-up popup/animation after XP is awarded |

---

## 10. UI: Level-Up Juice (Presentation)

The mechanical changes above make leveling fast. This section makes it FEEL fast.

### XP Bar
- Thin progress bar below each robot's HP bar in combat
- Shows current XP / XP-to-next-level
- Animates fill on XP gain (smooth CSS transition, ~0.5s)
- When full, triggers level-up animation then resets

### Level-Up Animation
- Robot icon glows (CSS keyframe pulse, cyan/neon, ~1s)
- Level badge increments with a pop animation (scale 1→1.3→1, 0.3s)
- Stat change popup: "+16 HP, +2 ATK" floating text (fade up, 1.5s)
- Multiple robots leveling triggers staggered animations (0.2s delay between each)

### No Sound Effects
- Consistent with existing chip skill animations (CSS only, no audio)
