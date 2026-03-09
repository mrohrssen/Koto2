# NPC Combat Skills Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** NPCs can use AOE skills during combat (25% chance per turn, between player and enemy phases), showing 3 vocab cards.

**Architecture:** NPCs gain minimal combat fields (`baseWord`, `attack`, `skills[]`) and reuse the existing `executeMove()` pipeline via a pseudo-creature. A new `data/npc-skills.json` holds NPC-specific skills. The backend inserts an NPC skill phase in `_handleCreatureAttackTurn`, and the frontend shows split attack cards for each hit.

**Tech Stack:** Node.js (ES modules), Express, vanilla JS frontend

---

## Task 1: Create `data/npc-skills.json` with placeholder skills

**Files:**
- Create: `data/npc-skills.json`

**Step 1: Create the NPC skills data file**

Create `data/npc-skills.json` with 4 placeholder skills (one per category). These use the same shape as `data/moves.json` entries so `executeMove()` can consume them directly. The actual Japanese words will be filled in later — use English placeholders for now.

```json
[
  {
    "id": "npc-aoe-attack",
    "name": "NPC Attack",
    "nameEn": "NPC Attack",
    "reading": "",
    "meaning": "attack",
    "element": "neutral",
    "category": "damage",
    "target": "all_enemies",
    "power": 8,
    "mpCost": 0,
    "statusEffect": null,
    "statusChance": 0,
    "statusDuration": 0
  },
  {
    "id": "npc-aoe-heal",
    "name": "NPC Heal",
    "nameEn": "NPC Heal",
    "reading": "",
    "meaning": "heal",
    "element": "neutral",
    "category": "heal",
    "target": "all_allies",
    "power": 8,
    "mpCost": 0,
    "statusEffect": null,
    "statusChance": 0,
    "statusDuration": 0
  },
  {
    "id": "npc-aoe-buff",
    "name": "NPC Buff",
    "nameEn": "NPC Buff",
    "reading": "",
    "meaning": "buff",
    "element": "neutral",
    "category": "buff",
    "target": "all_allies",
    "power": 25,
    "mpCost": 0,
    "statusEffect": "attack_buff",
    "statusChance": 100,
    "statusDuration": 2
  },
  {
    "id": "npc-aoe-debuff",
    "name": "NPC Debuff",
    "nameEn": "NPC Debuff",
    "reading": "",
    "meaning": "debuff",
    "element": "neutral",
    "category": "debuff",
    "target": "all_enemies",
    "power": 5,
    "mpCost": 0,
    "statusEffect": "poison",
    "statusChance": 100,
    "statusDuration": 2
  }
]
```

**Step 2: Commit**

```bash
git add data/npc-skills.json
git commit -m "feat: add placeholder npc-skills.json data file"
```

---

## Task 2: Add combat fields to NPCs in `data/npcs.json`

**Files:**
- Modify: `data/npcs.json`

**Step 1: Add `baseWord`, `baseReading`, `baseMeaning`, `attack`, and `skills` to each NPC**

Add these fields to all 5 NPCs. Use placeholder base words for now (the user will provide real ones later). Each NPC gets all 4 placeholder skills and an `attack` stat scaled to their tier.

For each NPC object, add after the `tier` field:

```json
"baseWord": "TBD",
"baseReading": "TBD",
"baseMeaning": "TBD",
"attack": 10,
"skills": ["npc-aoe-attack", "npc-aoe-heal", "npc-aoe-buff", "npc-aoe-debuff"]
```

Attack values by tier:
- Tier 1 (nagi): `attack: 10`
- Tier 2 (makoto, sora): `attack: 14`
- Tier 3 (toshio): `attack: 18`
- Tier 4 (fumi): `attack: 22`

Check each NPC's `tier` field in `data/npcs.json` to assign the right value.

**Step 2: Commit**

```bash
git add data/npcs.json
git commit -m "feat: add combat fields (baseWord, attack, skills) to NPCs"
```

---

## Task 3: Add NPC skill loading to `npc-service.js`

**Files:**
- Modify: `src/game/services/npc-service.js`
- Test: `tests/unit/game/npc-service.test.js`

**Step 1: Write failing tests for skill loading**

Add to `tests/unit/game/npc-service.test.js`:

```javascript
import {
  loadNpcs,
  selectNpcForEncounter,
  shuffleOptions,
  getNpcBond,
  updateBond,
  recordEncounter,
  loadNpcSkills,
  getNpcSkillsForNpc,
  rollNpcSkill
} from '../../../src/game/services/npc-service.js';

// ... existing tests ...

describe('NPC Service - loadNpcSkills', () => {
  it('loads NPC skills array', () => {
    const skills = loadNpcSkills();
    assert.ok(Array.isArray(skills), 'should return array');
    assert.ok(skills.length >= 4, 'should have at least 4 skills');
  });

  it('each skill has required move fields', () => {
    const skills = loadNpcSkills();
    for (const skill of skills) {
      assert.ok(skill.id, `skill missing id`);
      assert.ok(skill.category, `${skill.id} missing category`);
      assert.ok(skill.target, `${skill.id} missing target`);
      assert.ok(typeof skill.power === 'number', `${skill.id} missing power`);
    }
  });
});

describe('NPC Service - getNpcSkillsForNpc', () => {
  it('returns skill objects for an NPC with skills', () => {
    const npcs = loadNpcs();
    const npc = Object.values(npcs).find(n => n.skills?.length > 0);
    if (!npc) return; // Skip if no NPCs have skills yet
    const skills = getNpcSkillsForNpc(npc);
    assert.ok(Array.isArray(skills), 'should return array');
    assert.ok(skills.length > 0, 'should have skills');
    assert.ok(skills[0].id, 'skill objects should have id');
  });

  it('returns empty array for NPC without skills', () => {
    const skills = getNpcSkillsForNpc({ id: 'fake', skills: [] });
    assert.deepStrictEqual(skills, []);
  });

  it('returns empty array for NPC with no skills field', () => {
    const skills = getNpcSkillsForNpc({ id: 'fake' });
    assert.deepStrictEqual(skills, []);
  });
});

describe('NPC Service - rollNpcSkill', () => {
  it('returns null when NPC has no skills', () => {
    const result = rollNpcSkill({ id: 'fake', skills: [] });
    assert.strictEqual(result, null);
  });

  it('returns a skill object or null (probabilistic)', () => {
    const npcs = loadNpcs();
    const npc = Object.values(npcs).find(n => n.skills?.length > 0);
    if (!npc) return;
    // Run 100 times — should get at least one non-null and one null
    let gotSkill = false;
    let gotNull = false;
    for (let i = 0; i < 100; i++) {
      const result = rollNpcSkill(npc);
      if (result) { gotSkill = true; assert.ok(result.id, 'returned skill should have id'); }
      else gotNull = true;
    }
    assert.ok(gotSkill, 'should return a skill at least once in 100 rolls');
    assert.ok(gotNull, 'should return null at least once in 100 rolls (75% chance per roll)');
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm run test:unit -- --test-name-pattern="NPC Service - loadNpcSkills|NPC Service - getNpcSkillsForNpc|NPC Service - rollNpcSkill"
```

Expected: FAIL — `loadNpcSkills`, `getNpcSkillsForNpc`, `rollNpcSkill` not exported.

**Step 3: Implement in `src/game/services/npc-service.js`**

Add at the top of the file, after the existing `_npcCache` variable:

```javascript
let _npcSkillCache = null;

/**
 * Reads and caches data/npc-skills.json.
 */
export function loadNpcSkills() {
  if (!_npcSkillCache) {
    _npcSkillCache = JSON.parse(readFileSync(join(__dirname, '../../../data/npc-skills.json'), 'utf8'));
  }
  return _npcSkillCache;
}

/**
 * Returns resolved skill objects for a given NPC.
 * @param {object} npc - NPC object with optional skills[] array of skill IDs
 * @returns {object[]} Array of skill objects from npc-skills.json
 */
export function getNpcSkillsForNpc(npc) {
  if (!npc.skills?.length) return [];
  const allSkills = loadNpcSkills();
  const skillMap = new Map(allSkills.map(s => [s.id, s]));
  return npc.skills.map(id => skillMap.get(id)).filter(Boolean);
}

const NPC_SKILL_CHANCE = 0.25;

/**
 * Roll for NPC skill usage. 25% chance to return a random skill, else null.
 * @param {object} npc - NPC object with skills[] and attack stat
 * @returns {object|null} A skill object or null
 */
export function rollNpcSkill(npc) {
  const skills = getNpcSkillsForNpc(npc);
  if (skills.length === 0) return null;
  if (Math.random() >= NPC_SKILL_CHANCE) return null;
  return skills[Math.floor(Math.random() * skills.length)];
}
```

**Step 4: Run tests to verify they pass**

```bash
npm run test:unit -- --test-name-pattern="NPC Service"
```

Expected: All NPC Service tests PASS.

**Step 5: Commit**

```bash
git add src/game/services/npc-service.js tests/unit/game/npc-service.test.js
git commit -m "feat: add NPC skill loading and roll functions to npc-service"
```

---

## Task 4: Add `executeNpcSkill` to `creature-combat-service.js`

**Files:**
- Modify: `src/game/services/creature-combat-service.js`
- Test: `tests/unit/game/creature-combat-service.test.js`

**Step 1: Write failing tests**

Add to `tests/unit/game/creature-combat-service.test.js` (or create a new test block). First check what tests exist:

```bash
grep -n "describe\|it(" tests/unit/game/creature-combat-service.test.js | head -20
```

Then add:

```javascript
import { executeNpcSkill } from '../../../src/game/services/creature-combat-service.js';

describe('executeNpcSkill', () => {
  // Helper to make a creature
  function makeCreature(id, hp, maxHp, attack, element) {
    return { id, name: id, nameEn: id, element, hp, maxHp, attack, baseWord: 'w', baseReading: 'r', baseMeaning: 'm', activeEffects: [], moves: [], level: 5 };
  }

  const npcData = {
    id: 'nagi',
    name: 'ナギ',
    nameEn: 'Nagi',
    attack: 10,
    baseWord: '凪',
    baseReading: 'なぎ',
    baseMeaning: 'calm',
    element: 'neutral'
  };

  it('AOE damage hits all alive player creatures', () => {
    const skill = { id: 'npc-aoe-attack', name: 'Storm', nameEn: 'Storm', reading: 'あらし', meaning: 'storm', element: 'neutral', category: 'damage', target: 'all_enemies', power: 8, statusEffect: null, statusChance: 0, statusDuration: 0 };
    const allies = [makeCreature('a1', 50, 50, 8, 'water'), makeCreature('a2', 40, 40, 6, 'fire')];
    const enemies = [makeCreature('e1', 30, 30, 5, 'wood')];

    const result = executeNpcSkill(npcData, skill, allies, enemies);

    assert.ok(Array.isArray(result.attacks), 'should return attacks array');
    assert.strictEqual(result.attacks.length, 2, 'should hit both alive player creatures');
    for (const atk of result.attacks) {
      assert.strictEqual(atk.attackerId, 'nagi');
      assert.strictEqual(atk.attackerBaseWord, '凪');
      assert.ok(atk.damage > 0, 'should deal damage');
    }
    // Verify HP was actually reduced
    assert.ok(allies[0].hp < 50, 'first creature should take damage');
    assert.ok(allies[1].hp < 40, 'second creature should take damage');
  });

  it('AOE heal heals all alive NPC creatures', () => {
    const skill = { id: 'npc-aoe-heal', name: 'Heal', nameEn: 'Heal', reading: '', meaning: 'heal', element: 'neutral', category: 'heal', target: 'all_allies', power: 8, statusEffect: null, statusChance: 0, statusDuration: 0 };
    const allies = [makeCreature('a1', 50, 50, 8, 'water')];
    const enemies = [makeCreature('e1', 15, 30, 5, 'wood'), makeCreature('e2', 10, 30, 5, 'fire')];

    const result = executeNpcSkill(npcData, skill, allies, enemies);

    assert.strictEqual(result.attacks.length, 2, 'should heal both alive NPC creatures');
    for (const atk of result.attacks) {
      assert.ok(atk.healAmount > 0, 'should have heal amount');
    }
    assert.ok(enemies[0].hp > 15, 'first NPC creature should be healed');
  });

  it('AOE buff applies to all alive NPC creatures', () => {
    const skill = { id: 'npc-aoe-buff', name: 'Buff', nameEn: 'Buff', reading: '', meaning: 'buff', element: 'neutral', category: 'buff', target: 'all_allies', power: 25, statusEffect: 'attack_buff', statusChance: 100, statusDuration: 2 };
    const allies = [makeCreature('a1', 50, 50, 8, 'water')];
    const enemies = [makeCreature('e1', 30, 30, 5, 'wood')];

    const result = executeNpcSkill(npcData, skill, allies, enemies);

    assert.strictEqual(result.attacks.length, 1, 'should buff 1 alive NPC creature');
    assert.strictEqual(result.attacks[0].effectApplied, 'attack_buff');
    assert.ok(enemies[0].activeEffects.some(e => e.type === 'attack_buff'), 'NPC creature should have attack buff');
  });

  it('AOE debuff targets all alive player creatures', () => {
    const skill = { id: 'npc-aoe-debuff', name: 'Debuff', nameEn: 'Debuff', reading: '', meaning: 'debuff', element: 'neutral', category: 'debuff', target: 'all_enemies', power: 5, statusEffect: 'poison', statusChance: 100, statusDuration: 2 };
    const allies = [makeCreature('a1', 50, 50, 8, 'water'), makeCreature('a2', 40, 40, 6, 'fire')];
    const enemies = [makeCreature('e1', 30, 30, 5, 'wood')];

    const result = executeNpcSkill(npcData, skill, allies, enemies);

    assert.strictEqual(result.attacks.length, 2, 'should debuff both alive player creatures');
    for (const atk of result.attacks) {
      assert.strictEqual(atk.effectApplied, 'poison');
    }
  });

  it('skips dead creatures', () => {
    const skill = { id: 'npc-aoe-attack', name: 'Storm', nameEn: 'Storm', reading: '', meaning: 'storm', element: 'neutral', category: 'damage', target: 'all_enemies', power: 8, statusEffect: null, statusChance: 0 };
    const allies = [makeCreature('a1', 50, 50, 8, 'water'), makeCreature('a2', 0, 40, 6, 'fire')];
    const enemies = [];

    const result = executeNpcSkill(npcData, skill, allies, enemies);

    assert.strictEqual(result.attacks.length, 1, 'should only hit alive creatures');
    assert.strictEqual(result.attacks[0].targetId, 'a1');
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm run test:unit -- --test-name-pattern="executeNpcSkill"
```

Expected: FAIL — `executeNpcSkill` is not exported.

**Step 3: Implement `executeNpcSkill`**

Add to `src/game/services/creature-combat-service.js`, before the final exports or at the bottom of the file. This function builds a pseudo-creature from NPC data and delegates to `executeMove()`:

```javascript
/**
 * Execute an NPC skill against the appropriate targets.
 * The NPC acts as a pseudo-creature caster using executeMove().
 *
 * IMPORTANT: "allies" and "enemies" are from the PLAYER's perspective:
 *   - allies = player's creatures
 *   - enemies = NPC's creatures
 *
 * NPC skill targeting (from NPC's perspective) flips these:
 *   - "all_enemies" in skill = player's creatures (allies param)
 *   - "all_allies" in skill = NPC's creatures (enemies param)
 *
 * @param {object} npcData - NPC with id, name, nameEn, attack, baseWord, baseReading, baseMeaning
 * @param {object} skill - Skill object (same shape as moves.json entry)
 * @param {object[]} allies - Player's creatures (from player perspective)
 * @param {object[]} enemies - NPC's creatures (from player perspective)
 * @returns {{ attacks: object[] }}
 */
export function executeNpcSkill(npcData, skill, allies, enemies) {
  // Build pseudo-creature from NPC data for executeMove() compatibility
  const pseudoCreature = {
    id: npcData.id,
    name: npcData.name,
    nameEn: npcData.nameEn,
    element: npcData.element || 'neutral',
    attack: npcData.attack || 10,
    baseWord: npcData.baseWord,
    baseReading: npcData.baseReading,
    baseMeaning: npcData.baseMeaning,
    activeEffects: [],
    hp: 999,
    maxHp: 999
  };

  // Flip perspective: NPC's "allies" are the enemies array, NPC's "enemies" are allies array
  // executeMove resolveTargets uses: allies = caster's team, enemies = opposing team
  const npcAllies = enemies;   // NPC's team (enemies from player perspective)
  const npcEnemies = allies;   // NPC's opponents (player's creatures)

  // executeMove needs defeatedEnemyIds (for XP) — NPC skills don't award XP
  const defeatedEnemyIds = new Set();

  const result = executeMove(pseudoCreature, -1, skill, 0, npcAllies, npcEnemies, null, null, defeatedEnemyIds);

  return { attacks: result.attacks };
}
```

**Step 4: Run tests to verify they pass**

```bash
npm run test:unit -- --test-name-pattern="executeNpcSkill"
```

Expected: All PASS.

**Step 5: Commit**

```bash
git add src/game/services/creature-combat-service.js tests/unit/game/creature-combat-service.test.js
git commit -m "feat: add executeNpcSkill to creature-combat-service"
```

---

## Task 5: Integrate NPC skill phase into `_handleCreatureAttackTurn` in `loop.js`

**Files:**
- Modify: `src/game/loop.js`

**Step 1: Add imports**

At the top of `src/game/loop.js`, add to the existing creature-combat-service import:

```javascript
import { executeNpcSkill } from './services/creature-combat-service.js';
import { loadNpcs, rollNpcSkill } from './services/npc-service.js';
```

Check if `loadNpcs` and other npc-service imports already exist — only add what's missing.

**Step 2: Insert NPC skill phase in `_handleCreatureAttackTurn`**

In `src/game/loop.js`, method `_handleCreatureAttackTurn` (around line 579), insert between the victory check block (ends ~line 611) and the enemy phase (line ~614 `const enemyResult = processEnemyTurn(...)`):

```javascript
    // === NPC SKILL PHASE ===
    let npcSkillAttacks = [];
    let npcSkillUsed = null;
    if (this.combat.npcId && this.combat.npcData) {
      const fullNpc = loadNpcs()[this.combat.npcId];
      if (fullNpc) {
        const skill = rollNpcSkill(fullNpc);
        if (skill) {
          // Build npcData with combat fields from the full NPC record
          const npcCombat = {
            id: fullNpc.id,
            name: fullNpc.name,
            nameEn: fullNpc.nameEn,
            attack: fullNpc.attack || 10,
            element: fullNpc.element || 'neutral',
            baseWord: fullNpc.baseWord || '',
            baseReading: fullNpc.baseReading || '',
            baseMeaning: fullNpc.baseMeaning || ''
          };
          const skillResult = executeNpcSkill(npcCombat, skill, this.combat.allies, this.combat.enemies);
          npcSkillAttacks = skillResult.attacks;
          npcSkillUsed = {
            skillId: skill.id,
            skillName: skill.name,
            skillNameEn: skill.nameEn,
            npcName: fullNpc.nameEn,
            npcNameJp: fullNpc.name
          };
          logger.info('[CreatureCombat] NPC skill used:', skill.nameEn, '→', npcSkillAttacks.length, 'hits');
        }
      }
    }
```

**Step 3: Check for player defeat after NPC skill (if NPC used a damage skill)**

After the NPC skill block and before the enemy phase, add:

```javascript
    // Check if NPC skill KO'd all player creatures
    if (npcSkillAttacks.length > 0) {
      const allAlliesKOAfterNpc = this.combat.allies.every(a => !a || a.hp <= 0);
      if (allAlliesKOAfterNpc) {
        this.combat.active = false;
        this.run.active = false;
        this.emitState();
        return {
          actionType: 'attack',
          playerAttacks: playerResult.attacks || [],
          npcSkillAttacks,
          npcSkillUsed,
          enemyAttacks: [],
          xpEvents: playerResult.xpEvents || [],
          mpRegens: playerResult.mpRegens || [],
          effectEvents,
          koSwaps: [],
          combatEnded: true,
          victory: false,
          turnCount: this.combat.turnCount,
          creatureParty: this.run.creatureParty
        };
      }
    }
```

**Step 4: Add `npcSkillAttacks` and `npcSkillUsed` to ALL return objects**

Update every `return { ... }` in `_handleCreatureAttackTurn` to include:

```javascript
npcSkillAttacks,
npcSkillUsed,
```

There are 3 return statements in this method:
1. Victory return (~line 599) — add `npcSkillAttacks: [], npcSkillUsed: null,` (NPC skill doesn't fire if victory already)
2. Defeat return (~line 647) — add `npcSkillAttacks, npcSkillUsed,`
3. Continue return (~line 666) — add `npcSkillAttacks, npcSkillUsed,`

**Step 5: Syntax check**

```bash
node --check src/game/loop.js && echo "OK"
```

Expected: `OK`

**Step 6: Run full test suite**

```bash
npm test
```

Expected: All existing tests still pass.

**Step 7: Commit**

```bash
git add src/game/loop.js
git commit -m "feat: integrate NPC skill phase into combat turn"
```

---

## Task 6: Handle `npcSkillAttacks` in frontend `combat-loop.js`

**Files:**
- Modify: `public/js/ui/combat-loop.js`

**Step 1: Add NPC sprite path helper**

Near the top of `combat-loop.js`, after the existing `creatureSpritePath` import:

```javascript
function npcSpritePath(npcId) {
  return `/assets/sprites/npcs/${npcId}.webp`;
}
```

**Step 2: Create `showNpcSkillAttacksAnimated` function**

Add a new function near `showEnemyAttacksAnimated` (around line 1060). This function shows one split attack card per hit, using the NPC sprite instead of a creature sprite:

```javascript
/**
 * Show NPC skill attack cards sequentially (one per target).
 * Each card is a vocab review opportunity showing NPC base word + skill name + target.
 * @param {Object} result - Combat cycle result from server
 * @param {Object} allyHpMap - Running ally HP map (for damage skills targeting player)
 */
async function showNpcSkillAttacksAnimated(result, allyHpMap) {
  if (!result.npcSkillAttacks?.length) return;

  // Show a brief NPC skill announcement
  const actionArea = document.getElementById('action-area');
  if (actionArea && result.npcSkillUsed) {
    actionArea.innerHTML = `<div class="combat-creature-attack" style="color:#FFB74D;font-weight:bold">${result.npcSkillUsed.npcNameJp || result.npcSkillUsed.npcName} uses ${result.npcSkillUsed.skillNameEn}!</div>`;
    await delay(600);
  }

  for (const atk of result.npcSkillAttacks) {
    // Override attackerId sprite to use NPC sprite path
    const npcAtk = {
      ...atk,
      // The buildSplitAttackCard uses creatureSpritePath(atk.attackerId) for sprite
      // We need to override — use a special prefix so the card shows NPC sprite
      _npcSpriteOverride: npcSpritePath(atk.attackerId)
    };

    let attackCard = null;

    if (atk.category === 'heal') {
      if (actionArea) {
        actionArea.innerHTML = `<div class="combat-creature-attack" style="color:#4CAF50">${atk.attackerName} heals ${atk.targetName}! +${atk.healAmount || 0} HP</div>`;
      }
    } else if (atk.category === 'buff' || atk.category === 'shield') {
      if (actionArea) {
        actionArea.innerHTML = `<div class="combat-creature-attack" style="color:#64B5F6">${atk.attackerName} buffs ${atk.targetName}!${atk.effectApplied ? ' → ' + atk.effectApplied : ''}</div>`;
      }
    } else if (atk.category === 'debuff') {
      if (actionArea) {
        actionArea.innerHTML = `<div class="combat-creature-attack" style="color:#CE93D8">${atk.attackerName} debuffs ${atk.targetName}!${atk.effectApplied ? ' → ' + atk.effectApplied : ''}</div>`;
      }
    } else {
      // Damage: show split attack card
      attackCard = insertNpcAttackCard(npcAtk);
    }

    // Sound + visual effects for damage
    if (atk.damage > 0) {
      playSFX('player-hit');
      showDamageNumber(atk.damage, true, false);
      animatePlayerHurt();
    }

    // Update ally HP after NPC damage
    if (atk.damage > 0 && allyHpMap[atk.targetId]) {
      allyHpMap[atk.targetId].hp = Math.max(0, allyHpMap[atk.targetId].hp - atk.damage);
      updateCreatureHpBars(result.creatureParty?.active, allyHpMap);
    }

    // Update enemy HP after NPC heal
    if (atk.healAmount > 0 && result.enemies) {
      const enemy = result.enemies.find(e => e.id === atk.targetId);
      if (enemy) {
        // Enemy HP bars are already at final state — no need to animate incrementally
      }
    }

    if (attackCard) {
      await waitForCardTap(attackCard);
    } else {
      await delay(800);
    }
  }
}
```

**Step 3: Create `insertNpcAttackCard` helper**

Add near `insertAttackCard`:

```javascript
/**
 * Build and insert a split attack card for an NPC skill hit.
 * Uses NPC sprite instead of creature sprite.
 */
function insertNpcAttackCard(atk) {
  const actionArea = document.getElementById('action-area');
  if (!actionArea) return null;

  // Build card HTML using same structure as buildSplitAttackCard
  // but with NPC sprite path override
  const theme = ELEMENT_THEME[atk.moveElement] || ELEMENT_THEME['neutral'] || { border: 'rgba(0,0,0,0.1)', bg: '#f5f7fa', accent: '#8b92a0' };
  const spriteUrl = atk._npcSpriteOverride || creatureSpritePath(atk.attackerId);
  const targetSprite = creatureSpritePath(atk.targetId);

  const baseWordHtml = wrapWithRuby(atk.attackerBaseWord, atk.attackerBaseReading);
  const skillNameHtml = wrapWithRuby(atk.attackerSkillName, atk.attackerSkillReading);

  const attackerNameJp = atk.attackerNameJp || atk.attackerName;
  const attackerNameHtml = wrapWithRuby(attackerNameJp, attackerNameJp, atk.attackerName);

  const damageSign = atk.damage > 0 ? `-${atk.damage}` : (atk.healAmount > 0 ? `+${atk.healAmount}` : '0');
  const targetDisplayName = atk.targetNameJp || atk.targetName || '';
  const targetNameHtml = wrapWithRuby(targetDisplayName, targetDisplayName, atk.targetName);

  const baseIcon = actionIconPath(atk.attackerBaseMeaning);
  const skillIcon = actionIconPath(atk.attackerSkillEn);

  const html = `<div class="split-attack-card" style="--sac-border:${theme.border};--sac-bg:${theme.bg};--sac-accent:${theme.accent};--sac-row-dur:${ATTACK_CARD_TIMING.ROW_ANIM_DURATION}ms">
    <div class="sac-left">
      <img class="sac-sprite" src="${spriteUrl}" alt="">
      <div class="sac-attacker-name">${attackerNameHtml}</div>
    </div>
    <div class="sac-right">
      <div class="sac-row" data-row="0">
        ${baseIcon ? `<img class="sac-action-icon" src="${baseIcon}" alt="" onerror="this.style.display='none'">` : ''}
        <span class="sac-vocab">${baseWordHtml}</span>
        <span class="sac-meaning">${atk.attackerBaseMeaning || ''}</span>
        <span class="sac-tag sac-tag-base">BASE</span>
      </div>
      <div class="sac-row" data-row="1">
        ${skillIcon ? `<img class="sac-action-icon" src="${skillIcon}" alt="" onerror="this.style.display='none'">` : ''}
        <span class="sac-vocab">${skillNameHtml}</span>
        <span class="sac-meaning">${atk.attackerSkillEn || ''}</span>
        <span class="sac-tag sac-tag-atk">NPC</span>
      </div>
      <div class="sac-row sac-impact" data-row="2">
        <span class="sac-impact-arrow">\u2192</span>
        <img class="sac-impact-sprite" src="${targetSprite}" alt="">
        <span class="sac-impact-name">${targetNameHtml}</span>
        <span class="sac-damage">${damageSign}</span>
      </div>
    </div>
    <span class="sac-continue" style="display:none">\u25BC</span>
  </div>`;

  actionArea.innerHTML = html;
  const card = actionArea.querySelector('.split-attack-card');
  if (!card) return null;

  // Staggered row reveal (same as regular attack cards)
  const rows = card.querySelectorAll('.sac-row');
  rows.forEach((row, i) => {
    setTimeout(() => row.classList.add('sac-row-visible'), i * ATTACK_CARD_TIMING.ROW_STAGGER);
  });

  return card;
}
```

**Step 4: Wire into the attack flow**

In the `executeCreatureMovesTurn` function (the one that processes the combat cycle response), find the section between showing player attacks and showing enemy attacks. There are TWO code paths that handle attack results (the move-based path around line 1290 and the legacy path). In both, insert the NPC skill display between player attacks and enemy attacks.

Find this pattern (appears around line 1293):
```javascript
      // Enemy attacks phase (reuse existing code)
      const allyHpMap = buildAllyHpMap(result);
```

Insert BEFORE it:
```javascript
      // === NPC Skill Phase ===
      if (result.npcSkillAttacks?.length > 0) {
        const npcAllyHpMap = buildAllyHpMap(result);
        await delay(400);
        await showNpcSkillAttacksAnimated(result, npcAllyHpMap);
      }
```

Do this for BOTH code paths that handle attack results in the file. Search for `buildAllyHpMap(result)` to find them all. There should be two — one in the move-based flow and one in the legacy flow.

**Step 5: Also wire into the defend flow**

The defend flow (`_handleCreatureDefendTurn` in `loop.js`) does NOT trigger NPC skills per the design (only attack turns). No changes needed there.

**Step 6: Syntax check**

```bash
node --check public/js/ui/combat-loop.js && echo "OK"
```

Expected: `OK`

**Step 7: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: show NPC skill attack cards in combat UI"
```

---

## Task 7: Enrich `npcData` in combat state to include combat fields

**Files:**
- Modify: `src/game/loop.js` (in `startCreatureEncounter`)

**Step 1: Extend `npcData` stored in combat state**

In `src/game/loop.js`, method `startCreatureEncounter` (around line 482-493), the current code stores limited npcData. Extend it to include the new combat fields:

Change from:
```javascript
      this.combat.npcData = {
        id: npc.id,
        name: npc.name,
        nameEn: npc.nameEn,
        greeting: npc.greeting,
        defeatLine: npc.defeatLine
      };
```

Change to:
```javascript
      this.combat.npcData = {
        id: npc.id,
        name: npc.name,
        nameEn: npc.nameEn,
        greeting: npc.greeting,
        defeatLine: npc.defeatLine,
        attack: npc.attack || 10,
        baseWord: npc.baseWord || '',
        baseReading: npc.baseReading || '',
        baseMeaning: npc.baseMeaning || '',
        skills: npc.skills || []
      };
```

Note: Task 5 uses `loadNpcs()[this.combat.npcId]` to get the full NPC record, so this enrichment is mainly for the client-side and state serialization. Both approaches work — the backend always loads fresh from `loadNpcs()`.

**Step 2: Syntax check**

```bash
node --check src/game/loop.js && echo "OK"
```

**Step 3: Commit**

```bash
git add src/game/loop.js
git commit -m "feat: enrich npcData in combat state with skill fields"
```

---

## Task 8: Run full test suite and verify

**Step 1: Run all tests**

```bash
npm test
```

Expected: All Tier 1 + Tier 2 tests PASS.

**Step 2: Syntax check all modified files**

```bash
node --check src/game/loop.js && node --check src/game/services/npc-service.js && node --check src/game/services/creature-combat-service.js && echo "ALL OK"
```

Expected: `ALL OK`

**Step 3: Verify the NPC skills data files are valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('data/npc-skills.json','utf8')); console.log('npc-skills.json OK')"
node -e "const d=JSON.parse(require('fs').readFileSync('data/npcs.json','utf8')); Object.values(d).forEach(n => { if(!n.skills) throw new Error(n.id+' missing skills') }); console.log('npcs.json OK')"
```

Expected: Both `OK`.

---

## Task 9: Final integration commit

**Step 1: Review all changes**

```bash
git log --oneline -10
git diff HEAD~5 --stat
```

**Step 2: Final commit (if any uncommitted changes remain)**

```bash
git status
# If there are uncommitted changes:
git add -A && git commit -m "chore: final cleanup for NPC combat skills feature"
```

---

## Summary of Files Changed

| File | Action | Description |
|------|--------|-------------|
| `data/npc-skills.json` | **Create** | Placeholder NPC skill definitions (4 skills) |
| `data/npcs.json` | **Modify** | Add `baseWord`, `baseReading`, `baseMeaning`, `attack`, `skills` to all 5 NPCs |
| `src/game/services/npc-service.js` | **Modify** | Add `loadNpcSkills()`, `getNpcSkillsForNpc()`, `rollNpcSkill()` |
| `src/game/services/creature-combat-service.js` | **Modify** | Add `executeNpcSkill()` |
| `src/game/loop.js` | **Modify** | Insert NPC skill phase in `_handleCreatureAttackTurn`, enrich `npcData` |
| `public/js/ui/combat-loop.js` | **Modify** | Add `showNpcSkillAttacksAnimated()`, `insertNpcAttackCard()`, wire into attack flow |
| `tests/unit/game/npc-service.test.js` | **Modify** | Add tests for skill loading and roll |
| `tests/unit/game/creature-combat-service.test.js` | **Modify** | Add tests for `executeNpcSkill` |
