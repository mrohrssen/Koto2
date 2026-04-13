# Sync HP Bar Drain with Damage Numbers — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make HP bars start draining at the exact moment damage numbers pop, instead of after the full attack animation completes.

**Architecture:** Thread an `onImpact` callback through the attack effect chain (`impactEffect` → `fireCreatureAttackEffect`/`enemyCreatureAttackEffect` → `showAttackDisplay`). Callers pass their HP update as the callback. The callback fires synchronously right after `pixiDamageNumber()`, so the HP bar CSS transition starts on the same animation frame.

**Tech Stack:** Vanilla JS, PixiJS (damage numbers), CSS transitions (HP bars)

**Spec:** `docs/superpowers/specs/2026-04-13-sync-hp-bar-with-damage-numbers-design.md`

---

## Chunk 1: Thread `onImpact` through the effect chain

### Task 1: Add `onImpact` callback to `impactEffect`

**Files:**
- Modify: `public/js/ui/combat-loop.js:78-109`

- [ ] **Step 1: Add `onImpact` parameter and call it after damage number**

Change the function signature and add the callback call right after `pixiDamageNumber()`:

```js
// Line 78 — add onImpact to the end of the parameter list
async function impactEffect(damage, targetSide, targetIndex, enemyMaxHp, element = 'neutral', effectivenessType = 'normal', onImpact) {
```

```js
// Line 103-104 — call onImpact right after pixiDamageNumber
  pixiDamageNumber(damage, pos, { tier, type: effectivenessType });
  if (onImpact) onImpact();
```

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: add onImpact callback to impactEffect"
```

### Task 2: Thread `onImpact` through attack effect functions

**Files:**
- Modify: `public/js/ui/combat-loop.js:115-140`

Both `fireCreatureAttackEffect` and `enemyCreatureAttackEffect` call `impactEffect` from inside `fireElementBlast`'s callback. Thread `onImpact` through to reach `impactEffect`.

- [ ] **Step 1: Update `fireCreatureAttackEffect` (line 115)**

```js
async function fireCreatureAttackEffect(attackerIndex, targetIndex, element, damage, enemyMaxHp, effectivenessType = 'normal', onImpact) {
  const attackerSprite = getCreatureSprite('player', attackerIndex);
  const fromPos = spritePos('player', attackerIndex);
  const toPos = spritePos('enemy', targetIndex);
  const lungeP = attackerSprite ? pixiLunge(attackerSprite, { distance: 20, duration: 200 }) : Promise.resolve();
  const blastP = fireElementBlast(fromPos, toPos, element, () => {
    impactEffect(damage, 'enemy', targetIndex, enemyMaxHp, element, effectivenessType, onImpact);
  });
  await Promise.all([lungeP, blastP]);
}
```

- [ ] **Step 2: Update `enemyCreatureAttackEffect` (line 130)**

```js
async function enemyCreatureAttackEffect(attackerIndex, targetIndex, element, damage, playerMaxHp = 0, effectivenessType = 'normal', onImpact) {
  const attackerSprite = getCreatureSprite('enemy', attackerIndex);
  const fromPos = spritePos('enemy', attackerIndex);
  const toPos = spritePos('player', targetIndex);
  const lungeP = attackerSprite ? pixiLunge(attackerSprite, { distance: -20, duration: 200 }) : Promise.resolve();
  const blastP = fireElementBlast(fromPos, toPos, element, () => {
    impactEffect(damage, 'player', targetIndex, playerMaxHp, element, effectivenessType, onImpact);
    showVignette(200);
  });
  await Promise.all([lungeP, blastP]);
}
```

- [ ] **Step 3: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: thread onImpact through attack effect functions"
```

### Task 3: Add `onImpact` to `showAttackDisplay`

**Files:**
- Modify: `public/js/ui/combat-loop.js:430-451`

- [ ] **Step 1: Accept `onImpact` in opts and pass through**

```js
export async function showAttackDisplay(atk, { isEnemy, sourceEl, targetEl, targetMaxHp = 100, allies: overrideAllies, enemies: overrideEnemies, onImpact }) {
```

Pass `onImpact` into both attack effect calls:

```js
  if (atk.damage > 0 && (sourceEl || getCreatureSprite(sourceSide, attackerIndex))) {
    playAttackSound(element);
    if (isEnemy) {
      await enemyCreatureAttackEffect(attackerIndex, targetIndex, element, atk.damage, targetMaxHp, effectivenessType, onImpact);
    } else {
      await fireCreatureAttackEffect(attackerIndex, targetIndex, element, atk.damage, targetMaxHp, effectivenessType, onImpact);
    }
  }
```

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: thread onImpact through showAttackDisplay"
```

## Chunk 2: Wire callers to use `onImpact` for HP updates

### Task 4: PvE boss flow — sync HP bar with damage number

**Files:**
- Modify: `public/js/ui/combat-loop.js:1492-1498`

The player attack on a single boss enemy. Currently `impactEffect` at line 1492, then HP update at line 1497.

- [ ] **Step 1: Move enemy HP update into onImpact callback**

Replace lines 1492-1498:

```js
          // Visual effects for enemy damage (PixiJS impact with tier-based effects)
          await impactEffect(pa.damage, 'enemy', 0, enemyMaxHp, undefined, undefined, () => {
            characterUI.updateEnemyHPBar(result.enemyHp);
          });
        }
      }

      // Sync HP bars for dodge/miss (no impactEffect fires, but server state may have changed)
      if (!result.playerAttack?.damage) {
        characterUI.updateEnemyHPBar(result.enemyHp);
      }
      // Update player HP bar (player doesn't take damage during their own attack animation)
      characterUI.updatePlayerHPBar(result.playerHp);
```

Note: `updatePlayerHPBar` stays outside — the player isn't being hit here, this is just syncing server state. The `if (!damage)` guard ensures enemy HP still syncs on dodge/miss when `onImpact` doesn't fire.

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: sync enemy HP bar with damage number in PvE boss flow"
```

### Task 5: PvE enemy attack flow — sync ally HP bars with damage number

**Files:**
- Modify: `public/js/ui/combat-loop.js:2030-2042`

`showOneEnemyAttackAnimated`: enemy creature attacks player creatures. Currently `enemyCreatureAttackEffect` at line 2032, then HP map update + `updateCreatureHpBars` at 2037-2042.

- [ ] **Step 1: Move HP map decrement and bar update into onImpact**

The HP map must be decremented before calling `updateCreatureHpBars`, so both go into the callback. Replace lines 2030-2042:

```js
  const enemyEffectivenessType = atk.elementMultiplier > 1 ? 'superEffective' : atk.elementMultiplier < 1 ? 'resisted' : 'normal';
  const hpUpdate = () => {
    const damagedAlly = typeof atk.targetIndex === 'number' ? result.allies?.[atk.targetIndex] : null;
    const hpMapKey = damagedAlly?.id ?? atk.targetId;
    if (hpMapKey && allyHpMap[hpMapKey]) {
      allyHpMap[hpMapKey].hp = Math.max(0, allyHpMap[hpMapKey].hp - atk.damage);
    }
    updateCreatureHpBars(result.creatureParty?.active, allyHpMap);
  };
  if (atk.attackerElement) {
    playAttackSound(atk.attackerElement);
    await enemyCreatureAttackEffect(attackerIdx, targetIdx, atk.attackerElement, atk.damage, targetMaxHp, enemyEffectivenessType, hpUpdate);
  } else {
    animatePlayerHurt();
    hpUpdate();
  }
```

Note the `else` branch: when there's no attackerElement (no blast animation), we still call `hpUpdate()` immediately since there's no impact callback to fire.

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: sync ally HP bars with damage number in enemy attack flow"
```

### Task 6: PvE creature-vs-creature player attack flow — sync enemy HP bars

**Files:**
- Modify: `public/js/ui/combat-loop.js:2261-2283`

`playOnePlayerAttackInMoveTurn`: player creatures attack enemy creatures. Currently `fireCreatureAttackEffect` at line 2267, then HP update at 2273-2283.

- [ ] **Step 1: Move HP update into onImpact callback**

Replace lines 2261-2283:

```js
  if (atk.damage > 0 && (creatureSlotEl || getCreatureSprite('player', Math.max(0, atkAttackerIdx)))) {
    playAttackSound(atkElement);
    const tIdx = atk.targetIndex;
    const targetMaxHp = (typeof tIdx === 'number' && enemyHpMap[tIdx]?.maxHp)
      ? enemyHpMap[tIdx].maxHp
      : (result.enemies?.[0]?.maxHp ?? 100);
    await fireCreatureAttackEffect(Math.max(0, atkAttackerIdx), atkTargetIdx, atkElement, atk.damage, targetMaxHp, atkEffectivenessType, () => {
      if (typeof tIdx === 'number' && enemyHpMap[tIdx]) {
        enemyHpMap[tIdx].hp = Math.max(0, enemyHpMap[tIdx].hp - atk.damage);
        const entry = enemyHpMap[tIdx];
        if (result.enemies.length > 1) {
          characterUI.updateEnemyHPAtIndex(entry.index, entry.hp, entry.maxHp);
        } else {
          characterUI.updateEnemyHPBar({ current: entry.hp, max: entry.maxHp });
        }
      }
    });
    if (enemyEl) combatEvents.emit('creatureHit', { slotEl: enemyEl, side: 'enemy' });
  } else if (atk.damage > 0) {
    animateEnemyHurt();
    const tIdx = atk.targetIndex;
    if (typeof tIdx === 'number' && enemyHpMap[tIdx]) {
      enemyHpMap[tIdx].hp = Math.max(0, enemyHpMap[tIdx].hp - atk.damage);
      const entry = enemyHpMap[tIdx];
      if (result.enemies.length > 1) {
        characterUI.updateEnemyHPAtIndex(entry.index, entry.hp, entry.maxHp);
      } else {
        characterUI.updateEnemyHPBar({ current: entry.hp, max: entry.maxHp });
      }
    }
  }
```

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: sync enemy HP bars with damage number in creature attack flow"
```

### Task 7: PvP flow — sync HP bars via showAttackDisplay's onImpact

**Files:**
- Modify: `public/js/ui/pvp-battle.js:304-310`

`showAttackSummary`: PvP uses `showAttackDisplay` (shared), then updates HP after. Move HP update into `onImpact`.

- [ ] **Step 1: Move HP update into onImpact callback**

Replace lines 304-310:

```js
    // Shared display: card, sound, effects, damage number, STAB, effectiveness, tap
    let hpUpdated = false;
    await showAttackDisplay(atk, {
      isEnemy, sourceEl, targetEl, targetMaxHp,
      allies: pvpState.allies, enemies: pvpState.enemies,
      onImpact: () => {
        if (atk.damage > 0 && hpTracker.map[atk.targetIndex]) {
          hpTracker.map[atk.targetIndex].hp = Math.max(0, hpTracker.map[atk.targetIndex].hp - atk.damage);
          updateSlotHp(hpTracker.formation, atk.targetIndex, hpTracker.map[atk.targetIndex].hp, hpTracker.map[atk.targetIndex].maxHp);
          hpUpdated = true;
        }
      }
    });

    // Fallback: if onImpact didn't fire (no sprite/element), update HP now
    if (!hpUpdated && atk.damage > 0 && hpTracker.map[atk.targetIndex]) {
      hpTracker.map[atk.targetIndex].hp = Math.max(0, hpTracker.map[atk.targetIndex].hp - atk.damage);
      updateSlotHp(hpTracker.formation, atk.targetIndex, hpTracker.map[atk.targetIndex].hp, hpTracker.map[atk.targetIndex].maxHp);
    }
```

The `hpUpdated` flag ensures HP is always updated — either synchronously during impact (ideal) or as a fallback after `showAttackDisplay` returns (if no sprite/element existed to trigger the blast).

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/ui/pvp-battle.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/pvp-battle.js
git commit -m "feat: sync PvP HP bars with damage number via onImpact"
```

### Task 8: Remove red vignette on player creature hit

**Files:**
- Modify: `public/js/ui/combat-loop.js:137`

The `enemyCreatureAttackEffect` function calls `showVignette(200)` inside the blast callback — this draws red rectangles on screen edges when the player's creatures get hit. Remove it.

- [ ] **Step 1: Remove the `showVignette` call**

In `enemyCreatureAttackEffect` (line 130), remove the `showVignette(200)` call from the blast callback. The function currently reads:

```js
  const blastP = fireElementBlast(fromPos, toPos, element, () => {
    impactEffect(damage, 'player', targetIndex, playerMaxHp, element, effectivenessType, onImpact);
    showVignette(200);
  });
```

Change to:

```js
  const blastP = fireElementBlast(fromPos, toPos, element, () => {
    impactEffect(damage, 'player', targetIndex, playerMaxHp, element, effectivenessType, onImpact);
  });
```

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Check if `showVignette` import can be removed**

Search for other callers of `showVignette` in combat-loop.js. If line 137 is the only call site, remove it from the import at line 36.

Run: `grep -n 'showVignette' public/js/ui/combat-loop.js`

If only the import line remains, remove `showVignette` from the import.

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "fix: remove red vignette flash on player creature hit"
```

## Chunk 3: Verify

### Task 9: Run tests and syntax checks

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass. No combat logic changed — only visual timing.

- [ ] **Step 2: Syntax check both files**

Run: `node --check public/js/ui/combat-loop.js && node --check public/js/ui/pvp-battle.js && echo "OK"`
Expected: `OK`
