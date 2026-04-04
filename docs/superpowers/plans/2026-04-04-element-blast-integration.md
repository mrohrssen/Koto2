# Element Blast Integration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace generic burst particles with element-specific traveling blast animations for all attacks, chain bounces, and counters.

**Architecture:** New `element-blasts.js` module exports a single `fireElementBlast()` dispatcher. Wired into combat-loop.js at 4 sites: normal player attacks, normal enemy attacks, chain hit procs (2 parallel sites), and counter attacks. Backend adds `sourceIndex` to chain hit proc records for bounce-to-bounce tracking.

**Tech Stack:** PixiJS 8, ES6 modules, Node.js backend

**Spec:** `docs/superpowers/specs/2026-04-04-element-blast-integration-design.md`

---

## Chunk 1: Element Blast Module + Backend Change

### Task 1: Create `element-blasts.js` with neutral Energy Bolt and dispatcher

**Files:**
- Create: `public/js/pixi/element-blasts.js`

This is the core module. Start with just the neutral blast and the dispatcher skeleton, since neutral is used by counters and is the simplest to verify.

- [ ] **Step 1: Create the module with ELEMENT_BLASTS map and dispatcher**

**IMPORTANT — PixiJS conventions in this codebase:**
- Use ES module imports: `import { Container, Graphics } from 'pixi.js';` (NOT global `PIXI.Graphics`)
- Use the layer system: `getStage()` from `'./battle-stage.js'` returns `{ app, layers }`. Add blast containers to `layers.effects` (NOT `app.stage`)
- The `app` parameter is NOT needed in the public API — get it internally via `getStage()`

```javascript
// public/js/pixi/element-blasts.js
// Element-specific traveling blast animations for combat.
// Each blast travels from attacker to target, then calls onImpact on arrival.

import { Container, Graphics } from 'pixi.js';
import { getStage } from './battle-stage.js';

function mc(color, radius, alpha = 1) {
  const g = new Graphics();
  g.circle(0, 0, radius).fill({ color, alpha });
  return g;
}

// --- Neutral: Energy Bolt ---
// Simple white energy ball, straight line, clean burst.
function fireNeutralBlast(from, to, onImpact) {
  const { app, layers } = getStage();
  return new Promise((resolve) => {
    const c = new Container();
    layers.effects.addChild(c);
    const dx = to.x - from.x, dy = to.y - from.y;
    let elapsed = 0;
    const travelTime = 0.25;
    const trails = [];

    const tick = (dt) => {
      const d = dt.deltaMS / 1000;
      elapsed += d;
      const t = Math.min(elapsed / travelTime, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const cx = from.x + dx * eased, cy = from.y + dy * eased;

      // Core glow
      const core = new Graphics();
      core.circle(0, 0, 8).fill({ color: 0xFFFFFF, alpha: 0.3 });
      core.circle(0, 0, 5).fill({ color: 0xFFFFFF, alpha: 0.7 });
      core.circle(0, 0, 3).fill({ color: 0xFFFFFF, alpha: 1.0 });
      core.x = cx; core.y = cy;
      core._life = 0.08; c.addChild(core); trails.push(core);

      // Small trail
      if (Math.random() < 0.6) {
        const tr = mc(0xFFFFFF, 1 + Math.random() * 2, 0.5);
        tr.x = cx + (Math.random() - 0.5) * 6;
        tr.y = cy + (Math.random() - 0.5) * 6;
        tr._vx = (Math.random() - 0.5) * 20;
        tr._vy = (Math.random() - 0.5) * 20;
        tr._life = 0.15; tr._maxLife = 0.15;
        c.addChild(tr); trails.push(tr);
      }

      for (let i = trails.length - 1; i >= 0; i--) {
        const p = trails[i]; p._life -= d;
        if (p._vx !== undefined) { p.x += p._vx * d; p.y += p._vy * d; }
        p.alpha = Math.max(0, p._life / (p._maxLife || 0.08));
        if (p._life <= 0) { c.removeChild(p); p.destroy(); trails.splice(i, 1); }
      }

      if (t >= 1) {
        app.ticker.remove(tick);
        onImpact();
        // Small clean burst
        const ep = [];
        for (let i = 0; i < 8; i++) {
          const sp = mc(0xFFFFFF, 1 + Math.random() * 2, 0.8);
          sp.x = to.x; sp.y = to.y;
          const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 80;
          sp._vx = Math.cos(a) * s; sp._vy = Math.sin(a) * s;
          sp._life = 0.2; sp._maxLife = 0.2;
          c.addChild(sp); ep.push(sp);
        }
        const ex = (dt2) => {
          const d2 = dt2.deltaMS / 1000;
          let alive = false;
          for (let i = trails.length - 1; i >= 0; i--) {
            const p = trails[i]; p._life -= d2;
            p.alpha = Math.max(0, p._life / (p._maxLife || 0.08));
            if (p._life <= 0) { c.removeChild(p); p.destroy(); trails.splice(i, 1); } else alive = true;
          }
          for (const p of ep) {
            p._life -= d2;
            if (p._life > 0) { alive = true; p.x += p._vx * d2; p.y += p._vy * d2; p.alpha = p._life / p._maxLife; }
            else p.visible = false;
          }
          if (!alive) { app.ticker.remove(ex); layers.effects.removeChild(c); c.destroy({ children: true }); resolve(); }
        };
        app.ticker.add(ex);
      }
    };
    app.ticker.add(tick);
  });
}

const ELEMENT_BLASTS = {
  fire: fireFireBlast,
  water: fireWaterBlast,
  wood: fireWoodBlast,
  earth: fireEarthBlast,
  metal: fireMetalBlast,
  neutral: fireNeutralBlast,
};

/**
 * Fire an element-specific blast from `from` to `to`.
 * Uses the PixiJS layer system internally via getStage().
 * @param {{x:number, y:number}} from - Start position
 * @param {{x:number, y:number}} to - Target position
 * @param {string} element - 'fire'|'water'|'wood'|'earth'|'metal'|'neutral'
 * @param {Function} onImpact - Called when blast arrives at target
 * @returns {Promise<void>} Resolves when full animation (including post-impact) completes
 */
export function fireElementBlast(from, to, element, onImpact) {
  const blastFn = ELEMENT_BLASTS[element] || ELEMENT_BLASTS.neutral;
  return blastFn(from, to, onImpact);
}
```

Note: The `ELEMENT_BLASTS` map references functions not yet defined (`fireFireBlast`, etc.) — they'll be added in Task 2. For now, add placeholder stubs that fall back to neutral:

```javascript
// Placeholders — replaced in Task 2
function fireFireBlast(from, to, onImpact) { return fireNeutralBlast(from, to, onImpact); }
function fireWaterBlast(from, to, onImpact) { return fireNeutralBlast(from, to, onImpact); }
function fireWoodBlast(from, to, onImpact) { return fireNeutralBlast(from, to, onImpact); }
function fireEarthBlast(from, to, onImpact) { return fireNeutralBlast(from, to, onImpact); }
function fireMetalBlast(from, to, onImpact) { return fireNeutralBlast(from, to, onImpact); }
```

**IMPORTANT for Task 2:** When porting each element blast function from prototypes, apply the same adaptations:
- `new PIXI.Graphics()` → `new Graphics()`
- `new PIXI.Container()` → `new Container()`
- Remove `app` parameter; get `{ app, layers }` via `getStage()` at function start
- `app.stage.addChild(c)` → `layers.effects.addChild(c)`
- `app.stage.removeChild(c)` → `layers.effects.removeChild(c)`
- Wrap in `return new Promise((resolve) => { ... })`, call `resolve()` in cleanup ticker

- [ ] **Step 2: Verify syntax**

Run: `node --check public/js/pixi/element-blasts.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/js/pixi/element-blasts.js
git commit -m "feat: element-blasts module with neutral Energy Bolt and dispatcher"
```

### Task 2: Port all 5 remaining element blast functions

**Files:**
- Modify: `public/js/pixi/element-blasts.js`

Port the prototype code from the design spec (`docs/superpowers/specs/2026-04-03-element-particle-blasts-design.md`) into the module. Each function must be Promise-wrapped (resolve when cleanup ticker destroys the container). Replace the placeholder stubs from Task 1.

**Each element function follows this pattern:**
1. Get `{ app, layers }` via `getStage()`, create `new Container()`, add to `layers.effects`
2. Add ticker for travel animation using `new Graphics()` (NOT `PIXI.Graphics`)
3. On arrival: call `onImpact()`, spawn impact effects
4. Cleanup ticker fades everything, calls `layers.effects.removeChild(c)`, then calls `resolve()`

- [ ] **Step 1: Port `fireFireBlast` (Classic Meteor)**

Replace the `fireFireBlast` placeholder. Port from the spec's `fireClassicMeteor` function. Key adaptations:
- Wrap in `return new Promise((resolve) => { ... })` 
- In the `explodeTick`, when `!alive`: call `resolve()` after `container.destroy()`
- Use local `mc()` helper (already in the module)

The full prototype code is in `docs/superpowers/specs/2026-04-03-element-particle-blasts-design.md` under "Fire: Classic Meteor Arc ✅". Adapt variable names: `container` → `c`, `makeCircle` → `mc`, add Promise wrapper.

- [ ] **Step 2: Port `fireWaterBlast` (Riptide Vortex)**

Replace the `fireWaterBlast` placeholder. The prototype code is in `tmp/water-blasts.html`, variant 5 (if the file exists — `tmp/` is gitignored). Key parameters: spiral travel with ring of orbiting water dots, vortex burst on impact. Water colors: `0x42A5F5` (base blue), `0x1E88E5`, `0x90CAF9` (light), `0xFFFFFF` (foam). Wrap in Promise like the others. If `tmp/water-blasts.html` is not available, implement from this description: water ring of 5-6 orbiting dots spirals forward along the travel path, orbit radius shrinks as it approaches target, on impact the dots burst outward with splash particles.

- [ ] **Step 3: Port `fireWoodBlast` (Razor Leaf)**

Replace the `fireWoodBlast` placeholder. Port from the spec's "Wood: Razor Leaf (#1) ✅" section. Key: `makeLeaf()` helper for pointed ellipse shape, spinning leaf during flight, splits into 4 fragments on impact.

- [ ] **Step 4: Port `fireEarthBlast` (Earthen Spike Rush)**

Replace the `fireEarthBlast` placeholder. The prototype code is in `tmp/earth-blasts.html`, variant 2 (if the file exists — `tmp/` is gitignored). Key: sequential spikes erupt from ground toward target, final spike launches debris upward. Earth colors: `0xBCAAA4` (base brown), `0x8D6E63`, `0x795548`, `0xD7CCC8`, `0xFFFFFF`. If `tmp/earth-blasts.html` is not available, implement from this description: 4-5 triangular spikes (Graphics triangles) pop up sequentially from bottom of screen along the X path from attacker to target, each slightly larger, the last spike at target position triggers upward debris burst of brown/gray particles with gravity.

- [ ] **Step 5: Port `fireMetalBlast` (Whip Draw)**

Replace the `fireMetalBlast` placeholder. Port from the spec's "Metal: Whip Draw (#3) ✅" section. Key: whipping katana-draw arc with custom ease-in-out (slow start, fast middle), horizontal L-to-R slash on impact, 3 rightward sparks.

- [ ] **Step 6: Verify syntax**

Run: `node --check public/js/pixi/element-blasts.js && echo "OK"`
Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add public/js/pixi/element-blasts.js
git commit -m "feat: port all 6 element blast animations (fire, water, wood, earth, metal, neutral)"
```

### Task 3: Add `sourceIndex` to chain hit proc records (backend)

**Files:**
- Modify: `src/game/combat/party-skill-engine.js:208-213` (Arc Strike)
- Modify: `src/game/combat/party-skill-engine.js:256-260` (Forked Arc)
- Modify: `tests/unit/combat/party-skill-engine.test.js`

- [ ] **Step 1: Write failing test for Arc Strike sourceIndex**

Add a test to `tests/unit/combat/party-skill-engine.test.js` that verifies Arc Strike chain hit procs include `sourceIndex` matching the original attack's target index.

```javascript
test('Arc Strike chainHit proc includes sourceIndex of original target', () => {
  const combat = makeCombat();
  const record = makeDmgRecord({ targetIndex: 0, damage: 100 });
  const allies = [makeAlly({ element: 'fire' })];
  const enemies = [makeEnemy(), makeEnemy()];

  withStubbedRandom(0.01, () => {
    applyAfterPlayerAttacks({
      attacks: [record],
      allies,
      enemies,
      runPartySkills: [{ id: 'arcStrike', level: 1 }],
      combat
    });
  });

  const chainProc = record.partySkillProcs.find(p => p.type === 'chainHit');
  if (chainProc) {
    assert.strictEqual(chainProc.sourceIndex, 0, 'sourceIndex should match original targetIndex');
  }
});
```

Note: `applyAfterPlayerAttacks` takes a single destructured object `{ attacks, allies, enemies, runPartySkills, combat }`, not positional arguments. The existing tests in the file follow this pattern.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --grep "sourceIndex"`
Expected: FAIL — `sourceIndex` is undefined

- [ ] **Step 3: Add sourceIndex to Arc Strike chain hit record**

In `src/game/combat/party-skill-engine.js`, modify the Arc Strike chain hit proc (around line 208):

```javascript
        const chainProc = {
          skillId: 'arcStrike', skillName: 'Arc Strike',
          type: 'chainHit', sourceIndex: record.targetIndex, targetIndex: chainIdx, damage: actualChainDmg,
          element: attacker?.element || 'neutral', isSE
        };
```

The key addition is `sourceIndex: record.targetIndex` — the chain bounces FROM the creature that was originally attacked.

- [ ] **Step 4: Add sourceIndex to Forked Arc bounce records**

In `src/game/combat/party-skill-engine.js`, find the Forked Arc bounce loop (around line 240-260). Track the last bounce target and use it as sourceIndex:

Before the bounce loop, initialize: the first Forked Arc bounce sources from the Arc Strike's chain target. Find the Arc Strike proc to get its targetIndex, or fall back to `record.targetIndex`.

```javascript
        // Find the Arc Strike chain target to use as first bounce source
        let lastBounceSource = record.targetIndex;
        const arcStrikeProc = record.partySkillProcs.find(p => p.skillId === 'arcStrike' && p.type === 'chainHit');
        if (arcStrikeProc) lastBounceSource = arcStrikeProc.targetIndex;
```

Then in each bounce iteration, set `sourceIndex: lastBounceSource` and update `lastBounceSource = bounceIdx` after pushing the proc:

```javascript
            record.partySkillProcs.push({
              skillId: 'forkedArc', skillName: 'Forked Arc',
              type: 'chainHit', sourceIndex: lastBounceSource, targetIndex: bounceIdx, damage: actualBounceDmg,
              element: attacker?.element || 'neutral', isSE: bounceSE, bounceNum: bounceCount
            });
            lastBounceSource = bounceIdx;
```

- [ ] **Step 5: Run tests**

Run: `npm run test:unit -- --grep "sourceIndex"`
Expected: PASS

Run: `npm test`
Expected: All existing tests still pass

- [ ] **Step 6: Commit**

```bash
git add src/game/combat/party-skill-engine.js tests/unit/combat/party-skill-engine.test.js
git commit -m "feat: add sourceIndex to chain hit proc records for bounce tracking"
```

---

## Chunk 2: Wire Blasts Into Combat Loop

### Task 4: Wire blasts into normal attacks (replace burstParticles in impactEffect)

**Files:**
- Modify: `public/js/ui/combat-loop.js:1-54` (imports)
- Modify: `public/js/ui/combat-loop.js:70-102` (impactEffect)
- Modify: `public/js/ui/combat-loop.js:108-123` (fireCreatureAttackEffect, enemyCreatureAttackEffect)

- [ ] **Step 1: Add import for fireElementBlast**

At the top of `combat-loop.js`, after the existing `effects.js` import line (line ~11), add:

```javascript
import { fireElementBlast } from '../pixi/element-blasts.js';
```

- [ ] **Step 2: Remove burstParticles from impactEffect**

In `impactEffect` (line 70), the function currently calls `burstParticles` at line 80. Remove that one line:

```javascript
  burstParticles(pos, { count: effects.particles, color: elemColor, speed: 80, life: 400, element });
```

The blast arrival now replaces this. Everything else in `impactEffect` stays: hitStop, screenShake, screenFlash, pixiDamageNumber, pixiRecoil.

- [ ] **Step 3: Wire blast into fireCreatureAttackEffect**

Replace the current `fireCreatureAttackEffect` (lines 108-112):

```javascript
async function fireCreatureAttackEffect(attackerIndex, targetIndex, element, damage, enemyMaxHp, effectivenessType = 'normal') {
  const attackerSprite = getCreatureSprite('player', attackerIndex);
  if (attackerSprite) await pixiLunge(attackerSprite, { distance: 20, duration: 200 });
  await impactEffect(damage, 'enemy', targetIndex, enemyMaxHp, element, effectivenessType);
}
```

With:

```javascript
async function fireCreatureAttackEffect(attackerIndex, targetIndex, element, damage, enemyMaxHp, effectivenessType = 'normal') {
  const attackerSprite = getCreatureSprite('player', attackerIndex);
  const fromPos = spritePos('player', attackerIndex);
  const toPos = spritePos('enemy', targetIndex);

  // Lunge + blast fire simultaneously; blast's onImpact triggers feedback
  const lungeP = attackerSprite ? pixiLunge(attackerSprite, { distance: 20, duration: 200 }) : Promise.resolve();
  const blastP = fireElementBlast(fromPos, toPos, element, () => {
    impactEffect(damage, 'enemy', targetIndex, enemyMaxHp, element, effectivenessType);
  });
  await Promise.all([lungeP, blastP]);
}
```

- [ ] **Step 4: Wire blast into enemyCreatureAttackEffect**

Replace the current `enemyCreatureAttackEffect` (lines 118-123):

```javascript
async function enemyCreatureAttackEffect(attackerIndex, targetIndex, element, damage, playerMaxHp = 0, effectivenessType = 'normal') {
  const attackerSprite = getCreatureSprite('enemy', attackerIndex);
  if (attackerSprite) await pixiLunge(attackerSprite, { distance: -20, duration: 200 });
  await impactEffect(damage, 'player', targetIndex, playerMaxHp, element, effectivenessType);
  showVignette(200);
}
```

With:

```javascript
async function enemyCreatureAttackEffect(attackerIndex, targetIndex, element, damage, playerMaxHp = 0, effectivenessType = 'normal') {
  const attackerSprite = getCreatureSprite('enemy', attackerIndex);
  const fromPos = spritePos('enemy', attackerIndex);
  const toPos = spritePos('player', targetIndex);

  const lungeP = attackerSprite ? pixiLunge(attackerSprite, { distance: -20, duration: 200 }) : Promise.resolve();
  const blastP = fireElementBlast(fromPos, toPos, element, () => {
    impactEffect(damage, 'player', targetIndex, playerMaxHp, element, effectivenessType);
    showVignette(200);
  });
  await Promise.all([lungeP, blastP]);
}
```

- [ ] **Step 5: Verify syntax**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/combat-loop.js public/js/pixi/element-blasts.js
git commit -m "feat: wire element blasts into normal attacks, replace burstParticles in impactEffect"
```

### Task 5: Wire blasts into chain hit procs (both display sites)

**Files:**
- Modify: `public/js/ui/combat-loop.js:514-516` (showAttackDisplay chain hit)
- Modify: `public/js/ui/combat-loop.js:1746-1749` (showPartySkillProcs chain hit)

- [ ] **Step 1: Replace chain hit handling in showAttackDisplay (~line 514)**

Current code:
```javascript
      } else if (proc.type === 'chainHit') {
        burstParticles(spritePos('enemy', proc.targetIndex), { count: 4, color: proc.isSE ? 0xFF6B6B : 0xFFD93D });
        pixiDamageNumber(proc.damage, spritePos('enemy', proc.targetIndex), { tier: 1 });
```

Replace with:
```javascript
      } else if (proc.type === 'chainHit') {
        const chainFrom = spritePos('enemy', proc.sourceIndex ?? atk.targetIndex);
        const chainTo = spritePos('enemy', proc.targetIndex);
        const chainElement = proc.element || element;
        await fireElementBlast(chainFrom, chainTo, chainElement, () => {
          pixiDamageNumber(proc.damage, chainTo, { tier: 1 });
          screenShake('light');
        });
```

Note: Uses `proc.sourceIndex` (added in Task 3). Falls back to `atk.targetIndex` for safety. The `await` ensures chain bounces play sequentially.

**Important:** Check if the containing loop already uses `await` or if the procs are processed synchronously. The `for (const proc of atk.partySkillProcs)` loop at line ~488 may need to be made async-compatible. If it's already using `await` elsewhere (check for `await effectDelay` or similar), it's fine. If not, the loop itself needs `await`.

- [ ] **Step 2: Replace chain hit handling in showPartySkillProcs (~line 1746)**

Current code:
```javascript
    } else if (proc.type === 'chainHit') {
      const pos = spritePos('enemy', proc.targetIndex);
      burstParticles(pos, { count: 4, color: proc.isSE ? 0xFF6B6B : 0xFFD93D });
      pixiDamageNumber(proc.damage, pos, { tier: 1 });
```

Replace with the same pattern. **Important:** In `showPartySkillProcs`, the attack record is accessed as `atk` (check the loop variable name — it may be `record` or `attack`). Use whichever variable holds the attack's `targetIndex` for the fallback:

```javascript
    } else if (proc.type === 'chainHit') {
      const chainFrom = spritePos('enemy', proc.sourceIndex ?? atk.targetIndex);
      const chainTo = spritePos('enemy', proc.targetIndex);
      const chainElement = proc.element || 'neutral';
      await fireElementBlast(chainFrom, chainTo, chainElement, () => {
        pixiDamageNumber(proc.damage, chainTo, { tier: 1 });
        screenShake('light');
      });
```

Verify the variable name by reading the `showPartySkillProcs` function's loop structure before editing.

- [ ] **Step 3: Verify syntax**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: wire element blasts into chain hit procs (both display sites)"
```

### Task 6: Wire blast into counter attacks

**Files:**
- Modify: `public/js/ui/combat-loop.js:1823-1875` (showCounterAttacks)

- [ ] **Step 1: Replace burstParticles in counter attack with neutral blast**

In `showCounterAttacks` (line 1823), find the damage block AFTER the lunge (~line 1835). **Keep the "COUNTER!" popup (line ~1827) and the `pixiLunge` (lines ~1830-1832) exactly as they are.** Only replace the `burstParticles` + `pixiDamageNumber` block inside the `if (counter.damage > 0)` section:

Current code (lines ~1834-1838, ONLY this block):
```javascript
    if (counter.damage > 0) {
      const targetPos = spritePos('enemy', counter.targetIndex);
      burstParticles(targetPos, { count: 6, color: 0xFF7043 });
      pixiDamageNumber(counter.damage, targetPos, { tier: 1 });
    }
```

Replace with:
```javascript
    if (counter.damage > 0) {
      const counterFrom = spritePos('player', counter.defenderIndex);
      const counterTo = spritePos('enemy', counter.targetIndex);
      await fireElementBlast(counterFrom, counterTo, 'neutral', () => {
        pixiDamageNumber(counter.damage, counterTo, { tier: 1 });
        screenShake('light');
      });
    }
```

Always `'neutral'` element — Energy Bolt for all counters. The lunge and "COUNTER!" popup above this block remain unchanged.

- [ ] **Step 2: Verify syntax**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: wire neutral Energy Bolt into counter attacks"
```

### Task 7: Run full test suite and verify

**Files:** None (verification only)

- [ ] **Step 1: Run unit tests**

Run: `npm run test:unit`
Expected: All pass

- [ ] **Step 2: Run integration tests**

Run: `npm run test:integration`
Expected: All pass

- [ ] **Step 3: Syntax check all modified files**

```bash
node --check public/js/pixi/element-blasts.js && \
node --check public/js/ui/combat-loop.js && \
echo "All OK"
```
Expected: `All OK`

- [ ] **Step 4: Start dev server and verify it loads**

Run: `npm run dev &`
Wait 3 seconds, then: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`
Expected: `200`

Kill the server after verification.

- [ ] **Step 5: Final commit if any fixups needed**

If any test failures or syntax issues were found and fixed, commit them:
```bash
git add -A
git commit -m "fix: address test failures from element blast integration"
```
