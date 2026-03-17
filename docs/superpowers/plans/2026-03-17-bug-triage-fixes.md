# Bug Triage Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 production bugs (B1, A3, A4, A5, D1, B2, E1, C1) across 5 subagent work packages with zero merge conflicts.

**Architecture:** Two-phase parallel execution. Phase 1 runs S1/S3/S4 in parallel (no file overlap). Phase 2 runs S2/S5 after Phase 1 merges (they share `combat-loop.js` with S1). Each subagent works in its own git worktree.

**Tech Stack:** Node.js ES modules, vanilla JS frontend, CSS, JSON data files. Tests: `node:test` + c8 coverage.

**Spec:** `docs/superpowers/specs/2026-03-17-bug-triage-fixes-design.md`

---

## Chunk 1: Phase 1 — S1, S3, S4 (parallel, no file overlap)

### Task 1: S1 — Fix NPC Skill Attack Card Invisible (Bug B1)

**Files:**
- Modify: `public/js/ui/combat-loop.js:252` (CSS class name fix)
- Modify: `public/js/ui/combat-loop.js:2497` (pass npc data to showNpcSprite)
- Modify: `public/js/ui/combat-loop.js:2521` (pass npc data to showNpcSprite)
- Modify: `public/game.js:1316` (forward npc param in callback)

- [ ] **Step 1: Fix CSS class mismatch in `insertNpcAttackCard()`**

In `public/js/ui/combat-loop.js`, line 252, change the class name from `sac-row-visible` (which doesn't exist in CSS) to `sac-visible` (which matches `.sac-row.sac-visible` at game.css:1234):

```js
// BEFORE (line 252):
    setTimeout(() => row.classList.add('sac-row-visible'), i * ATTACK_CARD_TIMING.ROW_STAGGER);

// AFTER:
    setTimeout(() => row.classList.add('sac-visible'), i * ATTACK_CARD_TIMING.ROW_STAGGER);
```

- [ ] **Step 2: Forward NPC object through `showNpcSprite` callback**

In `public/game.js`, line 1316, the callback drops the 3rd parameter. `showNpcTrainer(npcName, npcId, npc)` at `scene.js:366` uses `npc` to render the NPC's role. Fix:

```js
// BEFORE (game.js line 1316):
    showNpcSprite: (name, id) => scene.showNpcTrainer(name, id),

// AFTER:
    showNpcSprite: (name, id, npc) => scene.showNpcTrainer(name, id, npc),
```

- [ ] **Step 3: Pass NPC data at call sites in combat-loop.js**

Two call sites need the 3rd argument:

```js
// BEFORE (combat-loop.js line 2497, in showNpcGreeting):
  if (showNpcSprite) showNpcSprite(npcName, npcData.id);

// AFTER:
  if (showNpcSprite) showNpcSprite(npcName, npcData.id, npcData);


// BEFORE (combat-loop.js line 2521, in runNpcDialogue):
  if (showNpcSprite) showNpcSprite(npcName, npc.id);

// AFTER:
  if (showNpcSprite) showNpcSprite(npcName, npc.id, npc);
```

- [ ] **Step 4: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && node --check public/game.js && echo "OK"`
Expected: `OK`

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All pass, no regressions.

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/combat-loop.js public/game.js
git commit -m "fix(B1): NPC skill attack card invisible — CSS class mismatch + missing npc param"
```

---

### Task 2: S3 part 1 — Replace Dead Charge Mechanic with mpRestore (Bug D1)

D1 goes first because A4's stat pill mapping depends on the new `mpRestore` type.

**Files:**
- Modify: `src/game/services/item-service.js:63-70,98-101,125-130`
- Modify: `data/items.json` (4 items)
- Modify: `public/js/ui/post-combat-shop.js:34`
- Modify: `tests/unit/item/service.test.js`

- [ ] **Step 1: Write failing test for mpRestore**

Add to `tests/unit/item/service.test.js`. Replace the existing `describe('Item Buffs - Charge', ...)` block (lines 159-170) with:

```js
describe('Item Buffs - MP Restore', () => {
  it('mpRestore restores MP to all alive creatures', () => {
    const r1 = mockCreature();
    r1.mp = 20; r1.maxMp = 80;
    const r2 = mockCreature();
    r2.mp = 0; r2.maxMp = 80;
    const dead = mockCreature(0);
    dead.mp = 0; dead.maxMp = 80;
    const party = { active: [r1, r2, dead], reserves: [] };
    const buffs = createItemBuffs();
    const item = { type: 'mpRestore', effect: { mpRestorePercent: 0.25 } };
    applyItem(item, party, buffs);
    assert.strictEqual(r1.mp, 40);   // 20 + 25% of 80 = 40
    assert.strictEqual(r2.mp, 20);   // 0 + 25% of 80 = 20
    assert.strictEqual(dead.mp, 0);  // dead creatures not affected
  });

  it('mpRestore does not exceed maxMp', () => {
    const r1 = mockCreature();
    r1.mp = 70; r1.maxMp = 80;
    const party = { active: [r1], reserves: [] };
    const buffs = createItemBuffs();
    const item = { type: 'mpRestore', effect: { mpRestorePercent: 0.5 } };
    applyItem(item, party, buffs);
    assert.strictEqual(r1.mp, 80);  // capped at maxMp
  });
});
```

Also remove the `ultimate` field from `mockCreature()` (lines 20-21) since charges no longer exist:

```js
// BEFORE (lines 14-23):
function mockCreature(hp = 100, maxHp = 100) {
  return {
    hp, maxHp, element: 'fire',
    mp: 80, maxMp: 80,
    moves: [{ id: 'test', name: 'test', nameEn: 'Test', category: 'damage', target: 'single_enemy', power: 20, mpCost: 10, element: 'fire' }],
    // Legacy charge fields still used by chargeBoost code path
    ultimate: { charges: 0, chargesRequired: 5 }
  };
}

// AFTER:
function mockCreature(hp = 100, maxHp = 100) {
  return {
    hp, maxHp, element: 'fire',
    mp: 80, maxMp: 80,
    moves: [{ id: 'test', name: 'test', nameEn: 'Test', category: 'damage', target: 'single_enemy', power: 20, mpCost: 10, element: 'fire' }],
  };
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit 2>&1 | tail -20`
Expected: FAIL — `mpRestore` type not handled yet, old charge test removed.

- [ ] **Step 3: Implement mpRestore in item-service.js**

In `src/game/services/item-service.js`:

1. **Delete** the `applyChargeBoost` function (lines 63-70):
```js
// DELETE these lines:
function applyChargeBoost(allCreatures, amount) {
  for (const creature of allCreatures) {
    creature.ultimate.charges = Math.min(
      creature.ultimate.charges + amount,
      creature.ultimate.chargesRequired
    );
  }
}
```

2. **Delete** the chargeBoost combo in the `heal` branch (lines 98-101):
```js
// DELETE these lines inside if (item.type === 'heal'):
    // Combo: some heal items also grant charges (e.g. strawberry milk)
    if (item.effect.chargeBoost) {
      applyChargeBoost(allCreatures, item.effect.chargeBoost);
    }
```

3. **Replace** the `charge` type handler (lines 125-130):
```js
// BEFORE:
  if (item.type === 'charge') {
    if (item.effect.chargeBoost) {
      applyChargeBoost(allCreatures, item.effect.chargeBoost);
    }
    return { applied: true };
  }

// AFTER:
  if (item.type === 'mpRestore') {
    const alive = allCreatures.filter(r => r.hp > 0);
    for (const creature of alive) {
      const restore = Math.floor((creature.maxMp || 0) * (item.effect.mpRestorePercent || 0));
      creature.mp = Math.min(creature.maxMp || 0, (creature.mp || 0) + restore);
    }
    return { applied: true };
  }
```

- [ ] **Step 4: Update the 4 items in data/items.json**

For `pork-soup` (line 146-152), `water-bottle` (line 413-419), `chocolate` (line 730-736):
```json
"type": "mpRestore",
"effect": {
  "mpRestorePercent": 0.25
},
"description": "Restore 25% MP to all creatures",
"descriptionTagged": "{Restore|回復|かいふく} 25% MP to all {creatures|生き物|いきもの}",
"descriptionJa": "全クリーチャーのMPを25%回復",
```

For `strawberry-milk` (line 292-299) — remove chargeBoost, keep heal:
```json
"type": "heal",
"effect": {
  "healAllPercent": 0.15
},
"description": "Heal all creatures for 15% HP",
"descriptionTagged": "{Heal|回復|かいふく} all {creatures|生き物|いきもの} for 15% HP",
"descriptionJa": "全クリーチャーのHPを15%回復",
```

- [ ] **Step 5: Update TYPE_ICONS in post-combat-shop.js**

In `public/js/ui/post-combat-shop.js`, line 34:
```js
// BEFORE:
  charge: '⚡',

// AFTER:
  mpRestore: '🔵',
```

- [ ] **Step 6: Syntax check**

Run: `node --check src/game/services/item-service.js && node --check public/js/ui/post-combat-shop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 7: Run tests**

Run: `npm test`
Expected: All pass, including the new mpRestore tests.

- [ ] **Step 8: Commit**

```bash
git add src/game/services/item-service.js data/items.json public/js/ui/post-combat-shop.js tests/unit/item/service.test.js
git commit -m "fix(D1): replace dead charge mechanic with mpRestore for 4 items"
```

---

### Task 3: S3 part 2 — Area Header Bootstrap (Bug A3)

**Files:**
- Modify: `data/areas.json` (add word data to 5 areas)
- Modify: `public/game.js:241,253` (use renderJpFirst for area name)

- [ ] **Step 1: Add word data to areas.json**

For each area, add `particle`, `locationWord`, and `meaning` string to existing `modifierWord`. For `okunomori`, add the entire `modifierWord` block.

**okunomori** — add after `"rank": 1400,` (before `"meanings"`):
```json
    "particle": "の",
    "modifierWord": {
      "word": "奥",
      "reading": "おく",
      "meaning": "inner part; depths",
      "rank": 2600,
      "meanings": ["inner part; inside; interior; depths (e.g. of a forest)"]
    },
    "locationWord": {
      "word": "森",
      "reading": "もり",
      "meaning": "forest",
      "rank": 1400
    },
```

**shizukana-kouen** — add `"meaning"` and `"particle"` + `"locationWord"`:
Add `"meaning": "quiet; silent"` to the existing `modifierWord` object.
Add after `modifierWord`:
```json
    "particle": "な",
    "locationWord": {
      "word": "公園",
      "reading": "こうえん",
      "meaning": "park",
      "rank": 2500
    },
```

**himitsuno-toshokan** — same pattern:
Add `"meaning": "secret"` to existing `modifierWord`.
```json
    "particle": "の",
    "locationWord": {
      "word": "図書館",
      "reading": "としょかん",
      "meaning": "library",
      "rank": 3800
    },
```

**kakureta-hama** — particle built into word form:
Update existing `modifierWord`: change `"word"` from `"隠れる"` to `"隠れた"`, `"reading"` from `"かくれる"` to `"かくれた"` (area name uses past/ta-form, not dictionary form). Add `"meaning": "hidden"`.
```json
    "particle": "",
    "locationWord": {
      "word": "浜",
      "reading": "はま",
      "meaning": "beach",
      "rank": 6500
    },
```

**mahouno-gakkou** — :
Add `"meaning": "magic"` to existing `modifierWord`.
```json
    "particle": "の",
    "locationWord": {
      "word": "学校",
      "reading": "がっこう",
      "meaning": "school",
      "rank": 600
    },
```

- [ ] **Step 2: Update area header rendering in game.js**

In `public/game.js`, replace area header rendering at lines 238-258. The current code:

```js
    const areaName = run.currentArea?.name;
    const sep = dom.areaHeaderPill.querySelector('.area-header-sep');
    if (areaName && subAreaNameJa) {
      dom.areaHeaderName.textContent = areaName;
```

Change both `textContent = areaName` lines (241 and 253) to render bootstrap mini-cards when word data is available:

```js
    const areaName = run.currentArea?.name;
    const area = run.currentArea;
    const sep = dom.areaHeaderPill.querySelector('.area-header-sep');
    if (areaName && subAreaNameJa) {
      if (area?.modifierWord?.meaning && area?.locationWord?.meaning) {
        dom.areaHeaderName.innerHTML =
          renderJpFirst(area.modifierWord.word, area.modifierWord.reading, area.modifierWord.meaning)
          + (area.particle || '')
          + renderJpFirst(area.locationWord.word, area.locationWord.reading, area.locationWord.meaning);
      } else {
        dom.areaHeaderName.textContent = areaName;
      }
```

Do the same for the `else if (areaName)` branch at line 252-253:
```js
    } else if (areaName) {
      if (area?.modifierWord?.meaning && area?.locationWord?.meaning) {
        dom.areaHeaderName.innerHTML =
          renderJpFirst(area.modifierWord.word, area.modifierWord.reading, area.modifierWord.meaning)
          + (area.particle || '')
          + renderJpFirst(area.locationWord.word, area.locationWord.reading, area.locationWord.meaning);
      } else {
        dom.areaHeaderName.textContent = areaName;
      }
```

- [ ] **Step 3: Add CSS for wrapping**

In `public/game.css`, find `.area-header-pill` and add `white-space: normal` so mini-cards can wrap. Search for `.area-header-pill` and add within the rule:

```css
  white-space: normal;
```

- [ ] **Step 4: Syntax check**

Run: `node --check public/game.js && echo "OK"`
Expected: `OK`

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add data/areas.json public/game.js public/game.css
git commit -m "fix(A3): bootstrap area header with renderJpFirst mini-cards"
```

---

### Task 4: S3 part 3 — Shop Item Help Button & Stat Pills (Bug A4)

**Files:**
- Modify: `public/js/ui/post-combat-shop.js` (add ? button, stat pills, popup)
- Modify: `public/game.css` (add shop-help styles)

**Reference patterns:**
- Move help button: `public/js/ui/move-select.js:75` (`.move-help-btn`)
- Move help popup: `public/js/ui/combat-loop.js:427-488` (`.move-help-popup`)
- Move help CSS: `public/game.css:4601-4661` (`.move-help-*` styles)

- [ ] **Step 1: Add stat pill builder function to post-combat-shop.js**

Add this function before the `show()` export in `public/js/ui/post-combat-shop.js`:

```js
function buildStatPills(item) {
  const effect = item.effect || {};
  const pills = [];
  if (effect.healPercent) pills.push(`💚 +${Math.round(effect.healPercent * 100)}% HP`);
  if (effect.healAllPercent) pills.push(`💚 +${Math.round(effect.healAllPercent * 100)}% all`);
  if (effect.healMostDamaged) pills.push('💚 Full heal (weakest)');
  if (effect.mpRestorePercent) pills.push(`🔵 +${Math.round(effect.mpRestorePercent * 100)}% MP`);
  if (effect.revivePercent) pills.push(`💫 Revive ${Math.round(effect.revivePercent * 100)}%`);
  if (effect.field === 'attackMult') pills.push(`⬆️ ATK +${Math.round(effect.value * 100)}%`);
  if (effect.field === 'defenseMult') pills.push(`🛡️ DEF +${Math.round(effect.value * 100)}%`);
  if (effect.field === 'flatDamageReduction') pills.push(`🛡️ -${effect.value} dmg`);
  if (effect.field === 'elementEdge') pills.push(`✨ Elem +${Math.round(effect.value * 100)}%`);
  if (effect.tempBoost) pills.push(`⬆️ +${effect.tempBoost.value} ATK (${effect.tempBoost.turns}t)`);
  if (item.type === 'xpCharm') pills.push(`✨ XP ×${(1 + (effect.value || 0)).toFixed(2)}`);
  if (item.type === 'xpBalance') pills.push(`⚖️ XP balance +${effect.value || 0}`);
  return pills.map(p => `<span class="shop-stat-pill">${p}</span>`).join('');
}
```

- [ ] **Step 2: Update card HTML to include ? button and stat pills**

In the `show()` function, replace the card template (inside `items.map`). Change the card structure to add a help button and replace the description line with stat pills:

```js
          return `
          <div class="shop-item-card" data-index="${i}" style="border-color: ${rarityColor}40">
            <div class="shop-item-rarity-badge" style="background: ${rarityColor}">${(item.rarity || 'common').toUpperCase()}</div>
            <button class="shop-help-btn" data-item-index="${i}">?</button>
            <img class="shop-item-sprite" src="/assets/sprites/items/${item.id}.webp?v=20260220" alt="${item.meaning}" />
            <div class="shop-item-info">
              <div class="shop-item-word">${itemNameHtml}</div>
              <div class="shop-item-effect">${buildStatPills(item)}</div>
            </div>
          </div>
        `;
```

- [ ] **Step 3: Add help popup logic**

After the card click handlers in `show()`, add the help button handler:

```js
  // Help button (?) — show item detail popup
  actionArea.querySelectorAll('.shop-help-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // Don't trigger card selection
      const idx = parseInt(btn.dataset.itemIndex);
      const item = items[idx];
      if (!item) return;

      // Remove any existing popup
      document.querySelector('.item-help-backdrop')?.remove();

      const nameHtml = renderJpFirst(item.word, item.reading, item.meaning);
      const descHtml = item.descriptionTagged
        ? renderEnFirst(item.descriptionTagged)
        : (item.description || '');

      const backdrop = document.createElement('div');
      backdrop.className = 'item-help-backdrop';
      backdrop.innerHTML = `
        <div class="item-help-popup">
          <div class="item-help-name">${nameHtml}</div>
          <div class="item-help-pills">${buildStatPills(item)}</div>
          <div class="item-help-desc">${descHtml}</div>
        </div>
      `;
      backdrop.addEventListener('click', () => backdrop.remove());
      document.body.appendChild(backdrop);
    });
  });
```

- [ ] **Step 4: Add CSS for shop help button and popup**

Add to `public/game.css`, after the existing shop item styles:

```css
/* ── Shop help button ── */
.shop-help-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1.5px solid var(--accent-primary, #64b5f6);
  background: rgba(100, 181, 246, 0.15);
  color: var(--accent-primary, #64b5f6);
  font-size: 0.7rem;
  font-weight: bold;
  cursor: pointer;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.shop-item-card { position: relative; }

.shop-stat-pill {
  display: inline-block;
  font-size: 0.65rem;
  padding: 1px 6px;
  border-radius: 8px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  margin: 1px 2px;
  white-space: nowrap;
}

/* ── Item help popup ── */
.item-help-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.item-help-popup {
  background: var(--surface, #1a1a2e);
  border: 1px solid var(--accent-primary, #64b5f6);
  border-radius: 12px;
  padding: 1.2rem;
  max-width: 320px;
  width: 100%;
}
.item-help-name {
  font-size: 1.1rem;
  margin-bottom: 0.5rem;
  text-align: center;
}
.item-help-pills {
  text-align: center;
  margin-bottom: 0.5rem;
}
.item-help-desc {
  font-size: 0.85rem;
  color: var(--text-secondary, #8ab4d8);
  line-height: 1.4;
}
```

- [ ] **Step 5: Syntax check**

Run: `node --check public/js/ui/post-combat-shop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add public/js/ui/post-combat-shop.js public/game.css
git commit -m "feat(A4): add shop item help button, stat pills, and detail popup"
```

---

### Task 5: S4 — Fix Attack Card Furigana on Unknown Words (Bug A5)

**Files:**
- Modify: `public/game.css:5123-5127`

- [ ] **Step 1: Fix CSS display property**

In `public/game.css`, find the rule at line 5123 (search for the comment `/* ── Suppress mini-card inside attack cards`). Change `display: inline` to `display: inline-block` and add `vertical-align: baseline`:

```css
/* BEFORE (lines 5123-5128): */
.sac-vocab .bs-word:has(.bs-word-en) {
  display: inline;
  border: none;
  padding: 0;
  margin: 0;
}

/* AFTER: */
.sac-vocab .bs-word:has(.bs-word-en) {
  display: inline-block;
  border: none;
  padding: 0;
  margin: 0;
  vertical-align: baseline;
}
```

The `.sac-vocab .bs-word-en { display: none; }` rule on line 5129 stays unchanged — it correctly hides the English annotation (the meaning is already shown via `.sac-meaning`).

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All pass (CSS change, no JS affected).

- [ ] **Step 3: Commit**

```bash
git add public/game.css
git commit -m "fix(A5): preserve ruby furigana on unknown words in attack cards"
```

---

## Chunk 2: Phase 2 — S2, S5 (parallel, after Phase 1 merges)

> **Important:** Phase 2 tasks start AFTER Phase 1 (S1, S3, S4) merges into master. Pull latest before starting. S2 and S5 touch different regions of `combat-loop.js` and can run in parallel.

### Task 6: S5 — Add Per-Turn Befriend Guard (Bug C1)

**Files:**
- Modify: `src/routes/game/combat.js:217-227` (add guard + set flag)
- Modify: `src/game/loop.js:558` (clear flag on new turn)
- Modify: `public/js/ui/combat-loop.js:507-514` (check flag in client)

- [ ] **Step 1: Add server-side guard in befriend-talk route**

In `src/routes/game/combat.js`, inside the `/befriend-talk` route handler (line 217), add a guard after the existing checks:

```js
  router.post('/befriend-talk', (req, res) => {
    const gameManager = req.gameManager;
    const combat = gameManager.combat;

    if (!combat?.active || !combat.isCreatureCombat) {
      return res.status(400).json({ error: 'No active creature combat' });
    }

    if (combat.npcId) {
      return res.status(400).json({ error: 'Cannot befriend NPC trainer creatures' });
    }

    // Per-turn befriend guard — only one attempt per turn
    if (combat.befriendUsedThisTurn) {
      return res.status(400).json({ error: 'Already attempted befriend this turn' });
    }
```

Then after the RNG check (after line 237 `const { accepted, chance } = rollTalkAcceptance(target);`), set the flag:

```js
    const { accepted, chance } = rollTalkAcceptance(target);
    combat.befriendUsedThisTurn = true;
```

- [ ] **Step 2: Clear flag on new combat turn**

In `src/game/loop.js`, in `creatureCombatCycle()` at line 558, add the flag reset right after `swapPhase = false`:

```js
    // Once an action is committed, free swap window closes
    this.combat.swapPhase = false;

    // Reset per-turn befriend guard for next turn
    this.combat.befriendUsedThisTurn = false;
```

- [ ] **Step 3: Serialize flag in `getState()` so it reaches the client**

In `src/game/loop.js`, in the `getState()` method at line 238-250, the combat object explicitly enumerates fields. Add `befriendUsedThisTurn` so the client can see it:

```js
// In getState(), inside the combat object (after line 249):
        npcData: this.combat.npcData || null,
        befriendUsedThisTurn: this.combat.befriendUsedThisTurn || false
```

Without this, the server-side guard works (blocks the POST) but the client keeps showing the Talk button.

- [ ] **Step 4: Add client-side check**

In `public/js/ui/combat-loop.js`, in `isBefriendAvailable()` (line 507-514), add the flag check:

```js
function isBefriendAvailable() {
  const state = getGameState();
  if (!state.combat?.isCreatureCombat || state.combat?.npcId) return false;
  if (state.combat?.befriendUsedThisTurn) return false;
  const enemies = state.combat.enemies || [];
  const alive = enemies.filter(e => e.hp > 0 && !e.befriended);
  if (alive.length !== 1) return false;
  return (alive[0].hp / alive[0].maxHp) <= 0.5;
}
```

- [ ] **Step 5: Syntax check**

Run: `node --check src/routes/game/combat.js && node --check src/game/loop.js && node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add src/routes/game/combat.js src/game/loop.js public/js/ui/combat-loop.js
git commit -m "fix(C1): add per-turn befriend guard to prevent talk button loop"
```

---

### Task 7: S2 part 1 — Remove Hardcoded Japanese Narration (Bug E1)

**Files:**
- Modify: `src/routes/game/combat.js:47-51`
- Modify: `public/js/ui/combat-loop.js:2470,2482`

- [ ] **Step 1: Return null from server endpoint**

In `src/routes/game/combat.js`, replace the hardcoded strings at lines 47-51:

```js
// BEFORE:
      narration = isBoss
        ? 'ボスが倒れる。「お前は...強かった...」長い戦いが終わった。よくやった！'
        : '敵が倒れる。「まさか...」最後の言葉が消える。勝利だ。';
    } else {
      narration = '力が抜ける。「弱かったな...」敵の声が遠くなる。目の前が暗くなる...';

// AFTER:
      narration = null;
    } else {
      narration = null;
```

- [ ] **Step 2: Remove client fallback strings**

In `public/js/ui/combat-loop.js`:

At line 2470, remove the fallback narration but keep the flow logic:
```js
// BEFORE:
      await narration.showNarration('市民解放！');

// AFTER (delete the line entirely — keep the lines around it):
```

At line 2482, same:
```js
// BEFORE:
      await narration.showNarration('敗北...');

// AFTER (delete the line entirely):
```

- [ ] **Step 3: Syntax check**

Run: `node --check src/routes/game/combat.js && node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/game/combat.js public/js/ui/combat-loop.js
git commit -m "fix(E1): remove hardcoded Japanese from combat-end narration"
```

---

### Task 8: S2 part 2 — Wire renderEnFirst for NPC Dialogue Display (Bug B2 — code)

**Files:**
- Modify: `public/js/ui/combat-loop.js:2502,2528,2540,2583`

**Prerequisite:** Both `renderJpFirst` and `renderEnFirst` are already imported in combat-loop.js at line 31:
```js
import { renderJpFirst, renderEnFirst } from './bootstrap-client.js';
```
No import changes needed.

- [ ] **Step 1: Verify renderEnFirst import exists**

Confirm the import at line 31 of `public/js/ui/combat-loop.js` includes `renderEnFirst`. It should — this is a verification-only step.

- [ ] **Step 2: Wrap greeting with renderEnFirst**

At line 2502:
```js
// BEFORE:
  await narration.showNarration(npcData.greeting, { speaker: npcName });

// AFTER:
  await narration.showNarration(renderEnFirst(npcData.greeting), { speaker: npcName, html: true });
```

- [ ] **Step 3: Wrap freed narration**

At line 2528:
```js
// BEFORE:
  await narration.showNarration(freed, { speaker: npcName });

// AFTER:
  await narration.showNarration(renderEnFirst(freed), { speaker: npcName, html: true });
```

- [ ] **Step 4: Wrap round npcLine**

At line 2540:
```js
// BEFORE:
  await narration.showNarration(round.npcLine, { speaker: npcName, persistent: true });

// AFTER:
  await narration.showNarration(renderEnFirst(round.npcLine), { speaker: npcName, persistent: true, html: true });
```

- [ ] **Step 5: Wrap response option text**

At line 2583:
```js
// BEFORE:
          <div class="shrine-creature-name" style="color:var(--accent-primary)">${option.text}</div>

// AFTER:
          <div class="shrine-creature-name" style="color:var(--accent-primary)">${renderEnFirst(option.text)}</div>
```

- [ ] **Step 6: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 7: Run tests**

Run: `npm test`
Expected: All pass.

- [ ] **Step 8: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "fix(B2): wire renderEnFirst for NPC dialogue display"
```

---

### Task 9: S2 part 3 — Rewrite NPC Dialogue Content (Bug B2 — content)

**Files:**
- Modify: `data/npcs.json` (all 20 NPCs' dialogue strings)

This task rewrites ~280 raw Japanese dialogue strings into English-first tagged format: `{english|kanji|reading}`.

- [ ] **Step 1: Read existing NPC data to understand the structure**

Read `data/npcs.json`. Each NPC has:
- `greeting` (1 string)
- `postCombat.freed` (1 string)
- `postCombat.rounds[]` — 3 rounds, each with:
  - `npcLine` (1 string)
  - `options[]` — 3 options, each with `text` (1 string)

Total: 14 strings per NPC × 20 NPCs = 280 strings.

- [ ] **Step 2: Rewrite dialogue for all 20 NPCs**

For each NPC, rewrite all 14 dialogue strings from raw Japanese to English-first tagged format.

**Format reference** (from `data/prologue.json`):
- Known concept in English: `The creature looks at you.`
- Teaching a word: `The {creature|生き物|いきもの} looks at you.`
- Multiple tagged words: `A {small|小さな|ちいさな} {creature|生き物|いきもの} appears.`

**Rules:**
- Each string should be primarily English with Japanese words tagged in `{english|kanji|reading}` format
- Tag 1-3 words per string (don't over-tag — readability matters)
- Match each NPC's personality and tone from their character data in `npcs.json`
- Use words relevant to the NPC's area and role
- Option texts should be short (1 sentence max) since they're displayed as buttons
- **Translation accuracy is critical** — per CLAUDE.md, all translations must be dictionary-accurate. Don't flip transitivity, don't embellish meanings.

**Worked example — 1 NPC (use as style reference for all 20):**

Suppose an NPC named "Rikka" is a researcher in the library area. Her original raw Japanese:
- greeting: `「実験の途中で変な光が出て…」`
- freed: `「ありがとう！頭がスッキリした。」`
- round 1 npcLine: `「あなたも研究に興味がある？」`
- round 1 options: `「はい、とても」`, `「少しだけ」`, `「いいえ」`

Rewritten to tagged format:
- greeting: `"A {strange|変な|へんな} {light|光|ひかり} appeared during the experiment..."`
- freed: `"Thank you! My {head|頭|あたま} feels clear now."`
- round 1 npcLine: `"Are you also {interested|興味|きょうみ} in {research|研究|けんきゅう}?"`
- round 1 options: `"Yes, very much"`, `"Just a {little|少し|すこし}"`, `"No"`

Note: options are short button labels. Tag sparingly (0-1 words per option).

**Parallelization:** This can be split across 10 subagents (2 NPCs each) for speed. Each subagent reads the full NPC data for their 2 NPCs from `npcs.json`, rewrites the dialogue strings in-place, and saves. A sequential merge step combines changes into the final `npcs.json`.

- [ ] **Step 3: Validate all rewritten dialogue**

After all dialogue is written, run validation:

1. Check that every dialogue string contains valid `{english|kanji|reading}` tags:
   - Regex: each tag matches `\{[^|]+\|[^|]+\|[^}]+\}`
   - No unmatched `{` or `}`
2. Check no raw Japanese (kanji/hiragana/katakana) exists outside of tags
3. Spot-check 2-3 NPCs for tone consistency
4. **Translation accuracy**: pick 10 tagged words across different NPCs and verify the English gloss matches dictionary definitions (per CLAUDE.md rules)

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All pass (data-only change).

- [ ] **Step 5: Commit**

```bash
git add data/npcs.json
git commit -m "content(B2): rewrite 20 NPCs' dialogue to English-first tagged format"
```

---

## Post-Implementation

### Task 10: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All Tier 1 + 2 tests pass.

- [ ] **Step 2: Syntax check all modified files**

```bash
node --check public/js/ui/combat-loop.js && \
node --check public/game.js && \
node --check public/js/ui/post-combat-shop.js && \
node --check src/game/services/item-service.js && \
node --check src/routes/game/combat.js && \
node --check src/game/loop.js && \
echo "All OK"
```

- [ ] **Step 3: Visual verification checklist (Playwright)**

After all code merges, verify visually:
- [ ] B1: NPC skill attack card rows are visible during NPC combat
- [ ] A3: Area header shows bootstrap mini-cards instead of raw kanji
- [ ] A4: Shop items have `?` button, stat pills, and detail popup
- [ ] A5: Unknown words on attack cards show furigana
- [ ] B2: NPC dialogue shows English-first tagged text (not raw Japanese)
- [ ] E1: No Japanese fallback text on combat end
- [ ] C1: Talk button doesn't reappear after failed befriend attempt
- [ ] D1: Former charge items show MP restore description
