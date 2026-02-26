# Combat Vocab Reinforcement Cards — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show a neon-edge vocab card (creature name, base word, attack name + icons) every time a creature attacks in combat, replacing the plain damage text.

**Architecture:** Server adds four vocab fields to each attack object. Frontend renders a styled card with creature sprite + action icon rows. CSS handles element-colored borders and fade-in animation.

**Tech Stack:** Express.js backend, vanilla JS frontend, CSS animations

---

### Task 1: Add vocab fields to player attack objects

**Files:**
- Modify: `src/game/services/robot-combat-service.js:81-92`
- Test: `tests/unit/robot-combat-service.test.js`

**Step 1: Write the failing test**

In `tests/unit/robot-combat-service.test.js`, add a new test inside the existing `'Robot Combat - Attack Turn'` describe block:

```js
it('includes vocab fields in attack objects', () => {
  const allies = [instantiateRobot('kamedor')];
  const enemies = [instantiateRobot('kazenoko')];
  const result = processAttackTurn(allies, enemies);
  const atk = result.attacks[0];
  assert.strictEqual(atk.attackerNameJp, 'カメドル');
  assert.strictEqual(atk.attackerBaseWord, '亀');
  assert.ok(atk.attackerSkillName, 'should have Japanese skill name');
  assert.ok(atk.attackerSkillEn, 'should have English skill name for icon lookup');
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --test-name-pattern "includes vocab fields"`
Expected: FAIL — `atk.attackerNameJp` is `undefined`

**Step 3: Write minimal implementation**

In `src/game/services/robot-combat-service.js`, inside `processAttackTurn()`, add four fields to the attack object at line 81-92:

```js
attacks.push({
  attackerId: robot.id,
  attackerName: robot.nameEn,
  attackerNameJp: robot.name,
  attackerBaseWord: robot.baseWord,
  attackerSkillName: robot.autoSkill.name,
  attackerSkillEn: robot.autoSkill.nameEn,
  attackerElement: robot.element,
  targetId: target.id,
  targetName: target.nameEn,
  damage,
  elementMultiplier: elemMult,
  targetDefeated,
  attackerCharges: robot.ultimate.charges,
  attackerChargesRequired: robot.ultimate.chargesRequired,
});
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- --test-name-pattern "includes vocab fields"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/game/services/robot-combat-service.js tests/unit/robot-combat-service.test.js
git commit -m "feat: add vocab fields to player attack objects"
```

---

### Task 2: Add vocab fields to enemy attack objects

**Files:**
- Modify: `src/game/services/robot-combat-service.js:175-184`
- Test: `tests/unit/robot-combat-service.test.js`

**Step 1: Write the failing test**

In the existing `'Robot Combat - Enemy Turn'` describe block:

```js
it('includes vocab fields in enemy attack objects', () => {
  const allies = [instantiateRobot('hikaribon')];
  const enemies = [instantiateRobot('kamedor')];
  const result = processEnemyTurn(enemies, allies);
  const atk = result.attacks[0];
  assert.strictEqual(atk.attackerNameJp, 'カメドル');
  assert.strictEqual(atk.attackerBaseWord, '亀');
  assert.ok(atk.attackerSkillName);
  assert.ok(atk.attackerSkillEn);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --test-name-pattern "includes vocab fields in enemy"`
Expected: FAIL

**Step 3: Write minimal implementation**

In `processEnemyTurn()`, update the `attacks.push` at lines 175-184:

```js
attacks.push({
  attackerId: enemy.id,
  attackerName: enemy.nameEn,
  attackerNameJp: enemy.name,
  attackerBaseWord: enemy.baseWord,
  attackerSkillName: enemy.autoSkill.name,
  attackerSkillEn: enemy.autoSkill.nameEn,
  attackerElement: enemy.element,
  targetId: target.id,
  targetName: target.nameEn,
  damage,
  elementMultiplier: elemMult,
  targetDefeated: target.hp <= 0,
});
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- --test-name-pattern "includes vocab fields in enemy"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/game/services/robot-combat-service.js tests/unit/robot-combat-service.test.js
git commit -m "feat: add vocab fields to enemy attack objects"
```

---

### Task 3: Add CSS for vocab attack card

**Files:**
- Modify: `public/game.css` (after the existing `.combat-robot-attack` block at line ~907)

**Step 1: Add the styles**

Insert after line 907 (after the `.combat-robot-attack strong` rule):

```css
/* ===== VOCAB ATTACK CARD ===== */
.vocab-attack-card {
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border-radius: 8px;
  border-left: 3px solid var(--vocab-card-element-color, #aaa);
  padding: 6px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  animation: vocabCardIn 200ms ease-out;
  max-width: 260px;
  margin: 0 auto;
}

.vocab-attack-card.enemy {
  border-left-color: var(--accent-red, #ff5252);
}

.vocab-attack-row {
  display: flex;
  align-items: center;
  gap: 8px;
  opacity: 0;
  animation: vocabRowIn 150ms ease-out forwards;
}

.vocab-attack-row:nth-child(1) { animation-delay: 0ms; }
.vocab-attack-row:nth-child(2) { animation-delay: 50ms; }
.vocab-attack-row:nth-child(3) { animation-delay: 100ms; }

.vocab-attack-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
  flex-shrink: 0;
  border-radius: 4px;
}

.vocab-attack-text {
  font-size: 15px;
  font-weight: var(--font-weight-semi, 600);
  color: var(--text-primary, #fff);
  white-space: nowrap;
}

.vocab-attack-card .combat-damage-line {
  text-align: center;
  font-size: 16px;
  font-weight: var(--font-weight-bold, 700);
  margin-top: 2px;
  opacity: 0;
  animation: vocabRowIn 150ms ease-out 150ms forwards;
}

.vocab-attack-card.enemy .combat-damage-line {
  color: var(--accent-red, #ff5252);
}

@keyframes vocabCardIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes vocabRowIn {
  from { opacity: 0; transform: translateX(-6px); }
  to { opacity: 1; transform: translateX(0); }
}
```

**Step 2: Syntax check**

Run: `node --check public/game.css 2>&1 || echo "CSS files don't need node --check, just verify no syntax errors visually"`

CSS doesn't have a node check — just verify the file saves correctly.

**Step 3: Commit**

```bash
git add public/game.css
git commit -m "feat: add CSS for vocab attack card with stagger animations"
```

---

### Task 4: Build the vocab card renderer in combat-loop.js

**Files:**
- Modify: `public/js/ui/combat-loop.js`

**Step 1: Add the rendering function**

Add this function near the top of `combat-loop.js`, after the imports (after line ~47):

```js
// ============ VOCAB ATTACK CARD ============

const ELEMENT_COLORS = {
  wood: '#4CAF50', fire: '#F44336', earth: '#8D6E63', metal: '#9E9E9E', water: '#2196F3'
};

const ACTION_ICON_BASE = '/assets/sprites/actions';

/**
 * Build HTML for the vocab attack card shown when a creature attacks.
 * @param {Object} atk - Attack object from server (with vocab fields)
 * @param {boolean} isEnemy - Whether this is an enemy attack
 * @param {string} effectKey - i18n key for damage text
 * @returns {string} HTML string
 */
function buildVocabAttackCard(atk, isEnemy, effectKey) {
  const elementColor = ELEMENT_COLORS[atk.attackerElement] || '#aaa';
  const enemyClass = isEnemy ? ' enemy' : '';

  // Creature sprite (24px mini version)
  const spriteUrl = `/assets/sprites/robots/${atk.attackerId}-idle.webp`;
  const spriteFallback = `/assets/sprites/robots/${atk.attackerId}.webp`;

  // Action icon from skill English name
  const skillSlug = (atk.attackerSkillEn || '').toLowerCase().replace(/\s+/g, '-');
  const actionIconUrl = `${ACTION_ICON_BASE}/${skillSlug}.webp`;

  return `<div class="vocab-attack-card${enemyClass}" style="--vocab-card-element-color: ${elementColor}">
    <div class="vocab-attack-row">
      <img class="vocab-attack-icon" src="${spriteUrl}" onerror="this.src='${spriteFallback}'" alt="">
      <span class="vocab-attack-text">${atk.attackerNameJp || atk.attackerName}</span>
    </div>
    <div class="vocab-attack-row">
      <img class="vocab-attack-icon" src="${spriteUrl}" onerror="this.src='${spriteFallback}'" alt="">
      <span class="vocab-attack-text">${atk.attackerBaseWord || ''}</span>
    </div>
    <div class="vocab-attack-row">
      <img class="vocab-attack-icon" src="${actionIconUrl}" onerror="this.style.display='none'" alt="">
      <span class="vocab-attack-text">${atk.attackerSkillName || ''}</span>
    </div>
    <div class="combat-damage-line">${t(effectKey, atk.attackerName, atk.damage)}</div>
  </div>`;
}
```

**Step 2: Replace player attack display**

In `combat-loop.js`, find the player attack display (~line 763-768):

```js
// BEFORE:
const effectKey = atk.elementMultiplier > 1 ? 'dealsStrong' :
                  atk.elementMultiplier < 1 ? 'dealsWeak' : 'dealsDamage';
const actionArea = document.getElementById('action-area');
if (actionArea) {
  actionArea.innerHTML = `<div class="combat-robot-attack">${t(effectKey, atk.attackerName, atk.damage)}</div>`;
}

// AFTER:
const effectKey = atk.elementMultiplier > 1 ? 'dealsStrong' :
                  atk.elementMultiplier < 1 ? 'dealsWeak' : 'dealsDamage';
const actionArea = document.getElementById('action-area');
if (actionArea) {
  actionArea.innerHTML = atk.attackerNameJp
    ? buildVocabAttackCard(atk, false, effectKey)
    : `<div class="combat-robot-attack">${t(effectKey, atk.attackerName, atk.damage)}</div>`;
}
```

**Step 3: Replace enemy attack display**

In `showEnemyAttacksAnimated()` (~line 595-598):

```js
// BEFORE:
const actionArea = document.getElementById('action-area');
if (actionArea) {
  actionArea.innerHTML = `<div class="combat-robot-attack enemy">${t(effectKey, atk.attackerName, atk.damage)}</div>`;
}

// AFTER:
const actionArea = document.getElementById('action-area');
if (actionArea) {
  actionArea.innerHTML = atk.attackerNameJp
    ? buildVocabAttackCard(atk, true, effectKey)
    : `<div class="combat-robot-attack enemy">${t(effectKey, atk.attackerName, atk.damage)}</div>`;
}
```

**Step 4: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: OK

**Step 5: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: render vocab attack cards during combat"
```

---

### Task 5: Manual playtest verification

**Prerequisite:** Start the dev server with `npm run dev` or `npm start`.

**Step 1: Load the game and enter combat**

Navigate to `http://localhost:3000`, log in, and enter a combat encounter.

**Step 2: Verify player attack card**

When your robots attack, confirm:
- Neon edge card appears with element-colored left border
- Row 1: creature sprite + Japanese name (e.g., カメドル)
- Row 2: creature sprite + base word (e.g., 亀)
- Row 3: action icon + skill name (e.g., 噛む)
- Damage text below
- Rows stagger-animate in

**Step 3: Verify enemy attack card**

When enemies attack, confirm:
- Same card layout but with red-tinted left border
- Enemy creature's vocab shows correctly
- Damage text is red

**Step 4: Verify fallback for missing data**

If any attack object lacks `attackerNameJp` (shouldn't happen, but edge cases), the old plain text should display instead.

**Step 5: Commit any fixes**

If anything needs adjustment during playtest, fix and commit.
