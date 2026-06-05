# Party Skill Trees Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old individual Party Skill catalog with six five-level Party Skill trees across offers, saves, combat, PvP teams, and ranked bots.

**Architecture:** Keep `src/game/party-skills.js` as the canonical tree catalog and helper API so existing imports stay stable. Migrate old skill IDs into compact `{ id, level }` tree entries on load and team save. Update the shared combat engine so PvE and PvP consume tree levels through helper functions instead of old skill-ID sets.

**Tech Stack:** Node.js ES modules, node:test, Express route/service modules, shared PvE/PvP combat services, browser UI modules.

---

## File Structure

- Modify `src/game/party-skills.js`: replace old individual catalog with tree catalog, display helpers, offer generation, selection, migration, and passive multiplier helpers.
- Modify `src/game/combat/party-skill-engine.js`: replace old skill checks with tree-level mechanics for Arc Strike, Counter Master, Buff Master, and Debuff Master.
- Modify `src/game/services/exploration-service.js`: normalize skills before offers, apply selection increments, scale room-entry recovery for HP Master.
- Modify `src/routes/game/run.js`: normalize NPC battle offer generation and NPC reward selection.
- Modify `src/game/manager-registry.js`: migrate active run skills and saved PvP team skills on load.
- Modify `src/routes/game/pvp.js`: normalize saved PvP team snapshots.
- Modify `src/game/services/creature-combat-service.js`: pass party skills into XP/heal helpers and apply HP Master healing and Exp Master logic.
- Modify `src/shared/combat/pve-turn-core.js`: mirror healing and XP multiplier behavior for the shared optimistic/turn resolver path.
- Modify `src/pvp/pvp-combat.js`: preserve shared combat parity for action hooks and self-sabotage.
- Modify `src/pvp/bot-generation.js`: draft compact tree skills for ranked bots.
- Modify `public/js/ui/pvp-lobby.js`: display tree names and levels for PvP team skill tags.
- Modify `public/js/ui/exploration.js`: render offer titles/descriptions returned by the server without old assumptions.
- Update tests under `tests/unit/game`, `tests/unit/combat`, `tests/unit/pvp`, `tests/unit/routes`, and `tests/unit/ui`.

## Task 1: Party Skill Tree Catalog And Helpers

**Files:**
- Modify: `src/game/party-skills.js`
- Modify: `tests/unit/game/party-skills.test.js`

- [ ] **Step 1: Replace the party-skills unit tests with tree-model expectations**

Replace `tests/unit/game/party-skills.test.js` with:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PARTY_SKILL_TREES,
  PARTY_SKILL_TREE_IDS,
  applyPartySkillChoice,
  getHealingMultiplier,
  getHpMasterMaxHpMultiplier,
  getPartySkillDisplay,
  getPartySkillLevel,
  getPostCombatRecoveryMultiplier,
  getXpMultiplier,
  normalizePartySkills,
  rollSkillMasterOffers
} from '../../../src/game/party-skills.js';

describe('party skill trees', () => {
  it('defines six five-level trees with player-facing descriptions', () => {
    assert.deepEqual(PARTY_SKILL_TREE_IDS, [
      'arcStrike',
      'hpMaster',
      'counterMaster',
      'buffMaster',
      'expMaster',
      'debuffMaster'
    ]);
    for (const id of PARTY_SKILL_TREE_IDS) {
      assert.equal(PARTY_SKILL_TREES[id].levels.length, 5);
      for (let level = 1; level <= 5; level++) {
        const display = getPartySkillDisplay(id, level);
        assert.equal(display.id, id);
        assert.equal(display.level, level);
        assert.match(display.title, new RegExp(`${PARTY_SKILL_TREES[id].name} - Lvl\\. ${level}`));
        assert.equal(typeof display.desc, 'string');
        assert.ok(display.desc.length > 10);
      }
    }
  });

  it('rollSkillMasterOffers returns next-level tree offers and excludes maxed trees', () => {
    const offers = rollSkillMasterOffers({
      ownedSkillIds: [
        { id: 'arcStrike', level: 2 },
        { id: 'hpMaster', level: 5 }
      ],
      count: 6,
      rng: () => 0.99
    });

    assert.equal(offers.find(o => o.id === 'arcStrike').level, 3);
    assert.equal(offers.some(o => o.id === 'hpMaster'), false);
    assert.equal(new Set(offers.map(o => o.id)).size, offers.length);
    assert.ok(offers.length <= 5);
  });

  it('rollSkillMasterOffers returns three level-one options for empty runs', () => {
    const offers = rollSkillMasterOffers({ ownedSkillIds: [], count: 3, rng: () => 0.01 });
    assert.equal(offers.length, 3);
    assert.deepEqual(offers.map(o => o.level), [1, 1, 1]);
  });

  it('applyPartySkillChoice creates and increments compact entries', () => {
    const skills = [];
    assert.deepEqual(applyPartySkillChoice(skills, 'arcStrike'), [{ id: 'arcStrike', level: 1 }]);
    assert.deepEqual(applyPartySkillChoice(skills, 'arcStrike'), [{ id: 'arcStrike', level: 2 }]);
    assert.deepEqual(applyPartySkillChoice(skills, 'counterMaster'), [
      { id: 'arcStrike', level: 2 },
      { id: 'counterMaster', level: 1 }
    ]);
  });

  it('applyPartySkillChoice rejects maxed trees and unknown IDs', () => {
    assert.throws(() => applyPartySkillChoice([{ id: 'arcStrike', level: 5 }], 'arcStrike'), /max level/);
    assert.throws(() => applyPartySkillChoice([], 'nope'), /Unknown Party Skill tree/);
  });

  it('normalizePartySkills migrates old IDs into compact tree entries', () => {
    const normalized = normalizePartySkills([
      { id: 'arcStrike' },
      { id: 'forkedArc' },
      { id: 'retaliationStrike' },
      { id: 'momentum' },
      { id: 'superEffectiveMend' },
      'finisherFeast'
    ]);

    assert.deepEqual(normalized, [
      { id: 'arcStrike', level: 2 },
      { id: 'counterMaster', level: 1 },
      { id: 'buffMaster', level: 1 },
      { id: 'hpMaster', level: 1 },
      { id: 'expMaster', level: 1 }
    ]);
  });

  it('normalization clamps levels and getPartySkillLevel reads compact entries', () => {
    const normalized = normalizePartySkills([
      { id: 'arcStrike', level: 9 },
      { id: 'arcStrike', level: 2 },
      { id: 'debuffMaster', level: 0 }
    ]);

    assert.deepEqual(normalized, [
      { id: 'arcStrike', level: 5 },
      { id: 'debuffMaster', level: 1 }
    ]);
    assert.equal(getPartySkillLevel(normalized, 'arcStrike'), 5);
    assert.equal(getPartySkillLevel(normalized, 'hpMaster'), 0);
  });

  it('returns HP, recovery, healing, and XP multipliers by tree level', () => {
    assert.equal(getHpMasterMaxHpMultiplier([{ id: 'hpMaster', level: 0 }]), 1);
    assert.equal(getHpMasterMaxHpMultiplier([{ id: 'hpMaster', level: 1 }]), 1.25);
    assert.equal(getHpMasterMaxHpMultiplier([{ id: 'hpMaster', level: 5 }]), 2.25);
    assert.equal(getPostCombatRecoveryMultiplier([{ id: 'hpMaster', level: 1 }]), 1);
    assert.equal(getPostCombatRecoveryMultiplier([{ id: 'hpMaster', level: 2 }]), 2);
    assert.equal(getHealingMultiplier([{ id: 'hpMaster', level: 2 }]), 1);
    assert.equal(getHealingMultiplier([{ id: 'hpMaster', level: 3 }]), 1.5);
    assert.equal(getXpMultiplier([{ id: 'expMaster', level: 4 }]), 2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --test tests/unit/game/party-skills.test.js
```

Expected: FAIL with missing exports such as `PARTY_SKILL_TREES` or assertion failures from the old catalog.

- [ ] **Step 3: Replace `src/game/party-skills.js` with the tree catalog and helper API**

Use this implementation as the new file body:

```js
export const PARTY_SKILL_TREE_IDS = Object.freeze([
  'arcStrike',
  'hpMaster',
  'counterMaster',
  'buffMaster',
  'expMaster',
  'debuffMaster'
]);

export const PARTY_SKILL_TREES = Object.freeze({
  arcStrike: {
    id: 'arcStrike',
    name: 'Arc Strike',
    levels: [
      { desc: 'Your attacks arc to another enemy for 30% damage.' },
      { desc: 'Arc strikes have a 50% chance to bounce one more time.' },
      { desc: 'Arc strike bounces deal 50% more damage per bounce.' },
      { desc: 'Arc strikes always bounce twice when possible.' },
      { desc: 'After the second bounce, arc strikes have a 25% chance to keep bouncing.' }
    ]
  },
  hpMaster: {
    id: 'hpMaster',
    name: 'HP Master',
    levels: [
      { desc: "All ally creatures' max HP increases by 25%." },
      { desc: 'After combat, ally creatures restore 100% more HP.' },
      { desc: 'Healing actions restore 50% more HP.' },
      { desc: 'Healing actions give the healed creature a random buff.' },
      { desc: "All ally creatures' max HP increases by another 100%." }
    ]
  },
  counterMaster: {
    id: 'counterMaster',
    name: 'Counter Master',
    levels: [
      { desc: 'When hit, ally creatures have a 50% chance to counterattack with 7 power.' },
      { desc: 'When hit, ally creatures have a 75% chance to counterattack.' },
      { desc: 'Ally creatures always counterattack when hit.' },
      { desc: 'Counterattacks deal double damage while the countering creature is below 50% HP.' },
      { desc: 'All counterattack damage is doubled.' }
    ]
  },
  buffMaster: {
    id: 'buffMaster',
    name: 'Buff Master',
    levels: [
      { desc: 'Each turn, ally creatures have a 25% chance to gain a random buff.' },
      { desc: 'Each turn, ally creatures have a 50% chance to gain a random buff.' },
      { desc: 'Each turn, ally creatures have a 75% chance to gain a random buff.' },
      { desc: 'Each turn, ally creatures gain a random buff.' },
      { desc: 'When an ally creature acts, it has a 25% chance to give a random ally a random buff.' }
    ]
  },
  expMaster: {
    id: 'expMaster',
    name: 'Exp Master',
    levels: [
      { desc: 'Ally creatures gain 25% more XP.' },
      { desc: 'Ally creatures gain 50% more XP.' },
      { desc: 'Ally creatures gain 75% more XP.' },
      { desc: 'Ally creatures gain 100% more XP.' },
      { desc: 'When an ally creature levels up, it has a 10% chance to level up again.' }
    ]
  },
  debuffMaster: {
    id: 'debuffMaster',
    name: 'Debuff Master',
    levels: [
      { desc: 'Enemies hit by your attacks have a 20% chance to receive a random debuff.' },
      { desc: 'Enemies hit by your attacks have a 40% chance to receive a random debuff.' },
      { desc: 'Enemies hit by your attacks have a 60% chance to receive a random debuff.' },
      { desc: 'Enemies hit by your attacks have an 80% chance to receive a random debuff.' },
      { desc: 'When an enemy acts, it has a 50% chance to give one of its own allies a random debuff.' }
    ]
  }
});

export const OLD_PARTY_SKILL_ID_TO_TREE = Object.freeze({
  arcStrike: 'arcStrike',
  forkedArc: 'arcStrike',
  resonantArc: 'arcStrike',
  chainSurge: 'arcStrike',
  elementalCascade: 'arcStrike',
  retaliationStrike: 'counterMaster',
  hardenedRiposte: 'counterMaster',
  furyCounter: 'counterMaster',
  vengefulMark: 'counterMaster',
  lastStand: 'counterMaster',
  sharedVigor: 'buffMaster',
  momentum: 'buffMaster',
  diverseEmpowerment: 'buffMaster',
  overflowVitality: 'buffMaster',
  radiantAura: 'buffMaster',
  contagion: 'debuffMaster',
  erosion: 'debuffMaster',
  virulentChain: 'debuffMaster',
  afflictionBurst: 'debuffMaster',
  pandemic: 'debuffMaster',
  superEffectiveMend: 'hpMaster',
  guardPulse: 'hpMaster',
  hasteSpark: 'buffMaster',
  battleRhythm: 'buffMaster',
  finisherFeast: 'expMaster'
});

export const PARTY_SKILLS_CATALOG = PARTY_SKILL_TREES;
export const ACTIVE_PARTY_SKILL_IDS = new Set(PARTY_SKILL_TREE_IDS);

function clampLevel(level) {
  return Math.max(1, Math.min(5, Math.floor(Number(level) || 1)));
}

function treeIdForEntry(entry) {
  const rawId = typeof entry === 'string' ? entry : entry?.id || entry?.skillId;
  if (!rawId) return null;
  if (PARTY_SKILL_TREES[rawId]) return rawId;
  return OLD_PARTY_SKILL_ID_TO_TREE[rawId] || null;
}

export function normalizePartySkills(runPartySkills = []) {
  const levelsById = new Map();
  for (const entry of runPartySkills || []) {
    const id = treeIdForEntry(entry);
    if (!id) continue;
    const isCompact = typeof entry === 'object' && PARTY_SKILL_TREES[entry.id] && entry.level != null;
    const credit = isCompact ? clampLevel(entry.level) : 1;
    levelsById.set(id, Math.min(5, (levelsById.get(id) || 0) + credit));
  }
  return PARTY_SKILL_TREE_IDS
    .filter(id => levelsById.has(id))
    .map(id => ({ id, level: clampLevel(levelsById.get(id)) }));
}

export function getPartySkillLevel(runPartySkills, id) {
  return normalizePartySkills(runPartySkills).find(skill => skill.id === id)?.level || 0;
}

export function getPartySkillDisplay(id, level = 1) {
  const tree = PARTY_SKILL_TREES[id];
  if (!tree) return null;
  const clamped = clampLevel(level);
  return {
    id,
    level: clamped,
    name: tree.name,
    title: `${tree.name} - Lvl. ${clamped}`,
    desc: tree.levels[clamped - 1].desc
  };
}

export function rollSkillMasterOffers({ ownedSkillIds = [], count = 3, rng = Math.random } = {}) {
  const normalized = normalizePartySkills(ownedSkillIds);
  const byId = new Map(normalized.map(skill => [skill.id, skill.level]));
  const eligible = PARTY_SKILL_TREE_IDS
    .map(id => ({ id, level: (byId.get(id) || 0) + 1 }))
    .filter(offer => offer.level <= 5);

  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  const n = Math.max(0, Math.min(Number(count) || 0, eligible.length));
  return eligible.slice(0, n).map(offer => getPartySkillDisplay(offer.id, offer.level));
}

export function applyPartySkillChoice(runPartySkills, id) {
  if (!PARTY_SKILL_TREES[id]) throw new Error(`Unknown Party Skill tree: ${id}`);
  const normalized = normalizePartySkills(runPartySkills);
  const existing = normalized.find(skill => skill.id === id);
  if (existing && existing.level >= 5) throw new Error(`${PARTY_SKILL_TREES[id].name} is already at max level`);
  if (existing) existing.level += 1;
  else normalized.push({ id, level: 1 });
  normalized.sort((a, b) => PARTY_SKILL_TREE_IDS.indexOf(a.id) - PARTY_SKILL_TREE_IDS.indexOf(b.id));
  return normalized;
}

export function getHpMasterMaxHpMultiplier(runPartySkills) {
  const level = getPartySkillLevel(runPartySkills, 'hpMaster');
  return 1 + (level >= 1 ? 0.25 : 0) + (level >= 5 ? 1 : 0);
}

export function getPostCombatRecoveryMultiplier(runPartySkills) {
  return getPartySkillLevel(runPartySkills, 'hpMaster') >= 2 ? 2 : 1;
}

export function getHealingMultiplier(runPartySkills) {
  return getPartySkillLevel(runPartySkills, 'hpMaster') >= 3 ? 1.5 : 1;
}

export function getXpMultiplier(runPartySkills) {
  const level = getPartySkillLevel(runPartySkills, 'expMaster');
  if (level >= 4) return 2;
  if (level >= 3) return 1.75;
  if (level >= 2) return 1.5;
  if (level >= 1) return 1.25;
  return 1;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
node --test tests/unit/game/party-skills.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add src/game/party-skills.js tests/unit/game/party-skills.test.js
/usr/bin/git commit -m "feat: add party skill tree catalog"
```

## Task 2: Save And PvP Team Migration

**Files:**
- Modify: `src/game/manager-registry.js`
- Modify: `src/routes/game/pvp.js`
- Create: `tests/unit/game/party-skill-migration.test.js`

- [ ] **Step 1: Write migration tests for runs and PvP teams**

Create `tests/unit/game/party-skill-migration.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePartySkills } from '../../../src/game/party-skills.js';
import { savePvpTeam } from '../../../src/routes/game/pvp.js';

describe('party skill migration integration', () => {
  it('normalizes active run party skills into compact tree entries', () => {
    const run = {
      partySkills: [
        { id: 'arcStrike' },
        { id: 'forkedArc' },
        { id: 'retaliationStrike' },
        { id: 'momentum' },
        { id: 'finisherFeast' }
      ]
    };

    run.partySkills = normalizePartySkills(run.partySkills);

    assert.deepEqual(run.partySkills, [
      { id: 'arcStrike', level: 2 },
      { id: 'counterMaster', level: 1 },
      { id: 'buffMaster', level: 1 },
      { id: 'expMaster', level: 1 }
    ]);
  });

  it('savePvpTeam stores normalized compact tree skills', () => {
    const gm = {
      run: {
        creatureParty: {
          active: [{ id: 'hi', uid: 'a', hp: 5, maxHp: 10, mp: 1, maxMp: 8, activeEffects: [{ type: 'poison' }] }],
          reserves: [],
          maxTotal: 6
        },
        partySkills: [{ id: 'arcStrike' }, { id: 'forkedArc' }, { id: 'momentum' }],
        itemBuffs: {}
      },
      meta: { pvpTeams: [null, null, null] }
    };

    assert.equal(savePvpTeam(gm, 0), true);
    assert.deepEqual(gm.meta.pvpTeams[0].partySkills, [
      { id: 'arcStrike', level: 2 },
      { id: 'buffMaster', level: 1 }
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --test tests/unit/game/party-skill-migration.test.js
```

Expected: FAIL because `savePvpTeam()` still copies old skill entries.

- [ ] **Step 3: Normalize manager run and saved PvP teams on load**

In `src/game/manager-registry.js`, import `normalizePartySkills`:

```js
import { normalizePartySkills } from './party-skills.js';
```

Inside the existing save-load migration block, after `manager.run = data.run` is assigned and before `if (data.combat)`, add:

```js
if (Array.isArray(manager.run?.partySkills)) {
  const normalized = normalizePartySkills(manager.run.partySkills);
  if (JSON.stringify(normalized) !== JSON.stringify(manager.run.partySkills)) {
    manager.run.partySkills = normalized;
    needsSave = true;
  }
}
```

Inside the existing `for (const team of (manager.meta?.pvpTeams || []))` loop, after the creature cleanup calls, add:

```js
if (Array.isArray(team?.partySkills)) {
  const normalized = normalizePartySkills(team.partySkills);
  if (JSON.stringify(normalized) !== JSON.stringify(team.partySkills)) {
    team.partySkills = normalized;
    needsSave = true;
  }
}
```

- [ ] **Step 4: Normalize PvP team snapshots when saving**

In `src/routes/game/pvp.js`, import `normalizePartySkills`:

```js
import { normalizePartySkills } from '../../game/party-skills.js';
```

Inside `savePvpTeam()`, after the `snapshot` object is created and before `refreshCreatureListUids(snapshot.creatureParty.active);`, add:

```js
snapshot.partySkills = normalizePartySkills(snapshot.partySkills || []);
```

- [ ] **Step 5: Run migration tests**

Run:

```bash
node --test tests/unit/game/party-skill-migration.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add src/game/manager-registry.js src/routes/game/pvp.js tests/unit/game/party-skill-migration.test.js
/usr/bin/git commit -m "feat: migrate party skill trees"
```

## Task 3: Skill Master And NPC Reward Acquisition

**Files:**
- Modify: `src/game/services/exploration-service.js`
- Modify: `src/routes/game/run.js`
- Modify: `tests/unit/game/skill-master-service.test.js`
- Modify: `tests/unit/routes/optimistic-run-routes.test.js`

- [ ] **Step 1: Replace Skill Master service tests with level-increment expectations**

In `tests/unit/game/skill-master-service.test.js`, replace imports from `PARTY_SKILLS_CATALOG` with `PARTY_SKILL_TREE_IDS`, and update the two behavior tests to:

```js
  it('getSkillMasterOffers returns next-level tree offers and excludes maxed trees', () => {
    const { svc } = makeGmWithSkillMasterRoom({
      partySkills: [{ id: 'arcStrike', level: 2 }, { id: 'hpMaster', level: 5 }]
    });
    const { offered } = svc.getSkillMasterOffers();
    assert.equal(offered.some(o => o.id === 'hpMaster'), false);
    assert.equal(offered.find(o => o.id === 'arcStrike')?.level, 3);
    assert.ok(offered.every(o => / - Lvl\. \d$/.test(o.title)));
  });

  it('chooseSkillMasterOffer increments existing tree levels', () => {
    const { gm, room, svc } = makeGmWithSkillMasterRoom({
      partySkills: [{ id: 'arcStrike', level: 1 }]
    });
    room.skillMaster = {
      offered: [{ id: 'arcStrike', level: 2 }, { id: 'counterMaster', level: 1 }],
      chosenId: null,
      completed: false
    };

    const firstChoose = svc.chooseSkillMasterOffer('arcStrike');
    assert.strictEqual(firstChoose.chosenId, 'arcStrike');
    assert.deepEqual(gm.run.partySkills, [{ id: 'arcStrike', level: 2 }]);
    assert.strictEqual(room.skillMaster.chosenId, 'arcStrike');
    assert.strictEqual(room.skillMaster.completed, true);
    assert.strictEqual(room.interacted, true);
  });
```

- [ ] **Step 2: Run the service test to verify it fails**

Run:

```bash
node --test tests/unit/game/skill-master-service.test.js
```

Expected: FAIL because stored offers are still raw old IDs and selection dedupes instead of incrementing.

- [ ] **Step 3: Update `ExplorationService.getSkillMasterOffers()`**

In `src/game/services/exploration-service.js`, import:

```js
import { applyPartySkillChoice, normalizePartySkills, rollSkillMasterOffers, getPartySkillDisplay } from '../party-skills.js';
```

Replace each current `ownedSkillIds` offer generation block with:

```js
this.gm.run.partySkills = normalizePartySkills(this.gm.run?.partySkills || []);
pick.offered = rollSkillMasterOffers({ ownedSkillIds: this.gm.run.partySkills, count: 3 });
```

For room-based offers, use:

```js
this.gm.run.partySkills = normalizePartySkills(this.gm.run?.partySkills || []);
room.skillMaster.offered = rollSkillMasterOffers({ ownedSkillIds: this.gm.run.partySkills, count: 3 });
```

When reading stored offers, support both compact objects and old raw IDs during migration:

```js
const offered = (room.skillMaster.offered || [])
  .map(offer => typeof offer === 'string'
    ? getPartySkillDisplay(offer, 1)
    : getPartySkillDisplay(offer.id, offer.level))
  .filter(Boolean);
```

- [ ] **Step 4: Update `ExplorationService.chooseSkillMasterOffer()`**

In both initial-pick and room-pick selection paths, replace duplicate-push logic with:

```js
this.gm.run.partySkills = applyPartySkillChoice(this.gm.run.partySkills || [], skillId);
```

Update offer validation to support object offers:

```js
const offeredIds = Array.isArray(pick.offered) ? pick.offered.map(o => typeof o === 'string' ? o : o.id) : [];
```

Use the same mapping for `room.skillMaster.offered`.

- [ ] **Step 5: Update NPC battle reward routes**

In `src/routes/game/run.js`, import `applyPartySkillChoice` and `normalizePartySkills`.

In `/npc-battle-skill-offers`, replace old ID generation with:

```js
gm.run.partySkills = normalizePartySkills(gm.run?.partySkills || []);
room.npcBattle.offered = rollSkillMasterOffers({ ownedSkillIds: gm.run.partySkills, count: 3 });
```

When returning display objects, replace the mapper with:

```js
const offered = (room.npcBattle.offered || [])
  .map(offer => typeof offer === 'string'
    ? getPartySkillDisplay(offer, 1)
    : getPartySkillDisplay(offer.id, offer.level))
  .filter(Boolean);
```

In `/npc-battle-skill-choose`, validate offer IDs with:

```js
const offeredIds = room.npcBattle.offered.map(offer => typeof offer === 'string' ? offer : offer.id);
if (!offeredIds.includes(skillId)) {
  throw new Error('Invalid skill choice');
}
```

Replace duplicate-push logic with:

```js
gm.run.partySkills = applyPartySkillChoice(gm.run.partySkills || [], skillId);
```

- [ ] **Step 6: Run acquisition tests**

Run:

```bash
node --test tests/unit/game/skill-master-service.test.js tests/unit/routes/optimistic-run-routes.test.js
```

Expected: PASS after updating route assertions that still expect `[{ id: 'momentum' }]` to use a tree entry such as `[{ id: 'buffMaster', level: 1 }]`.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add src/game/services/exploration-service.js src/routes/game/run.js tests/unit/game/skill-master-service.test.js tests/unit/routes/optimistic-run-routes.test.js
/usr/bin/git commit -m "feat: acquire party skill tree levels"
```

## Task 4: HP Master Max HP Sync And Recovery

**Files:**
- Modify: `src/game/party-skills.js`
- Modify: `src/game/services/exploration-service.js`
- Modify: `tests/unit/game/party-skills.test.js`
- Modify: `tests/unit/game/skill-master-service.test.js`

- [ ] **Step 1: Add tests for idempotent max HP sync and recovery scaling**

Append to `tests/unit/game/party-skills.test.js`:

```js
describe('HP Master stat sync', () => {
  it('syncPartySkillHpBonuses applies max HP bonuses idempotently', async () => {
    const { syncPartySkillHpBonuses } = await import('../../../src/game/party-skills.js');
    const party = {
      active: [{ id: 'a', hp: 50, maxHp: 100 }],
      reserves: [{ id: 'r', hp: 20, maxHp: 80 }]
    };

    syncPartySkillHpBonuses(party, [{ id: 'hpMaster', level: 1 }]);
    syncPartySkillHpBonuses(party, [{ id: 'hpMaster', level: 1 }]);

    assert.equal(party.active[0].maxHp, 125);
    assert.equal(party.active[0].hp, 63);
    assert.equal(party.reserves[0].maxHp, 100);
    assert.equal(party.reserves[0].hp, 25);

    syncPartySkillHpBonuses(party, [{ id: 'hpMaster', level: 5 }]);
    assert.equal(party.active[0].maxHp, 225);
    assert.equal(party.reserves[0].maxHp, 180);
  });

  it('syncPartySkillHpBonuses respects later base maxHp changes', async () => {
    const { syncPartySkillHpBonuses } = await import('../../../src/game/party-skills.js');
    const party = { active: [{ id: 'a', hp: 50, maxHp: 100 }], reserves: [] };

    syncPartySkillHpBonuses(party, [{ id: 'hpMaster', level: 1 }]);
    party.active[0].maxHp = 140;
    party.active[0].hp = 70;

    syncPartySkillHpBonuses(party, [{ id: 'hpMaster', level: 1 }]);
    assert.equal(party.active[0].maxHp, 175);
    assert.equal(party.active[0].hp, 88);
  });
});
```

Add a recovery test to `tests/unit/game/skill-master-service.test.js`:

```js
  it('room-entry recovery doubles with HP Master level 2', () => {
    const creature = { id: 'hi', hp: 50, maxHp: 100 };
    const { svc } = makeGmWithSkillMasterRoom({
      partySkills: [{ id: 'hpMaster', level: 2 }]
    });
    svc.gm.run.creatureParty = { active: [creature], reserves: [] };

    svc._healAllLivingCreaturesForRoomEntry();
    assert.equal(creature.hp, 60);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test tests/unit/game/party-skills.test.js tests/unit/game/skill-master-service.test.js
```

Expected: FAIL because `syncPartySkillHpBonuses` does not exist and recovery is still 5%.

- [ ] **Step 3: Add idempotent HP sync helpers**

Append to `src/game/party-skills.js`:

```js
function allPartyCreatures(party) {
  return [
    ...(party?.active || []),
    ...(party?.reserves || [])
  ].filter(Boolean);
}

export function syncPartySkillHpBonuses(party, runPartySkills) {
  const nextMult = getHpMasterMaxHpMultiplier(runPartySkills);
  for (const creature of allPartyCreatures(party)) {
    if (!creature || typeof creature.maxHp !== 'number') continue;

    const prevMult = Number(creature.partySkillHpMultiplier) || 1;
    const savedBase = Number(creature.partySkillBaseMaxHp) || 0;
    const expectedCurrent = savedBase > 0 ? Math.floor(savedBase * prevMult) : 0;
    const currentMaxHp = Math.max(1, Math.floor(creature.maxHp));
    const baseMaxHp = expectedCurrent === currentMaxHp ? savedBase : currentMaxHp;
    const hpRatio = currentMaxHp > 0 ? Math.max(0, Math.min(1, (Number(creature.hp) || 0) / currentMaxHp)) : 1;
    const nextMaxHp = Math.max(1, Math.floor(baseMaxHp * nextMult));

    creature.maxHp = nextMaxHp;
    if ((Number(creature.hp) || 0) <= 0) {
      creature.hp = 0;
    } else {
      creature.hp = Math.max(1, Math.min(nextMaxHp, Math.round(nextMaxHp * hpRatio)));
    }

    if (nextMult === 1) {
      delete creature.partySkillBaseMaxHp;
      delete creature.partySkillHpMultiplier;
    } else {
      creature.partySkillBaseMaxHp = baseMaxHp;
      creature.partySkillHpMultiplier = nextMult;
    }
  }
}
```

- [ ] **Step 4: Apply HP sync after skill selection and before room recovery**

In `src/game/services/exploration-service.js`, import `getPostCombatRecoveryMultiplier` and `syncPartySkillHpBonuses`.

At the start of `_healAllLivingCreaturesForRoomEntry()`, after `if (!party) return;`, add:

```js
syncPartySkillHpBonuses(party, this.gm.run?.partySkills || []);
const recoveryMultiplier = getPostCombatRecoveryMultiplier(this.gm.run?.partySkills || []);
```

Replace:

```js
const healAmount = Math.floor(creature.maxHp * ROOM_HEAL_PERCENT);
```

with:

```js
const healAmount = Math.floor(creature.maxHp * ROOM_HEAL_PERCENT * recoveryMultiplier);
```

After every `this.gm.run.partySkills = applyPartySkillChoice(...)` call in `chooseSkillMasterOffer()`, add:

```js
syncPartySkillHpBonuses(this.gm.run.creatureParty, this.gm.run.partySkills);
```

- [ ] **Step 5: Run HP tests**

Run:

```bash
node --test tests/unit/game/party-skills.test.js tests/unit/game/skill-master-service.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add src/game/party-skills.js src/game/services/exploration-service.js tests/unit/game/party-skills.test.js tests/unit/game/skill-master-service.test.js
/usr/bin/git commit -m "feat: apply hp master recovery"
```

## Task 5: Arc Strike Tree Combat

**Files:**
- Modify: `src/game/combat/party-skill-engine.js`
- Modify: `tests/unit/combat/party-skill-engine.test.js`

- [ ] **Step 1: Add Arc Strike tree tests**

Add these tests near the existing Arc Strike tests in `tests/unit/combat/party-skill-engine.test.js`:

```js
test('Arc Strike Lvl 2 can add one extra bounce', () => {
  const allies = [makeAlly({ element: 'fire' })];
  const enemies = [
    makeEnemy({ id: 'e1', hp: 100, element: 'fire' }),
    makeEnemy({ id: 'e2', hp: 100, element: 'fire' }),
    makeEnemy({ id: 'e3', hp: 100, element: 'fire' })
  ];
  const attacks = [makeDmgRecord({ damage: 100, targetIndex: 0 })];

  withStubbedRandom(0.01, () => {
    applyAfterPlayerAttacks({
      attacks,
      allies,
      enemies,
      runPartySkills: [{ id: 'arcStrike', level: 2 }],
      combat: makeCombat()
    });
  });

  assert.equal(attacks[0].partySkillProcs.filter(p => p.type === 'chainHit').length, 2);
});

test('Arc Strike Lvl 3 uses additive 50% bounce damage scaling', () => {
  const allies = [makeAlly({ element: 'fire' })];
  const enemies = [
    makeEnemy({ id: 'e1', hp: 500, element: 'fire' }),
    makeEnemy({ id: 'e2', hp: 500, element: 'fire' }),
    makeEnemy({ id: 'e3', hp: 500, element: 'fire' })
  ];
  const attacks = [makeDmgRecord({ damage: 100, targetIndex: 0 })];

  withStubbedRandom(0.01, () => {
    applyAfterPlayerAttacks({
      attacks,
      allies,
      enemies,
      runPartySkills: [{ id: 'arcStrike', level: 4 }],
      combat: makeCombat()
    });
  });

  const chainHits = attacks[0].partySkillProcs.filter(p => p.type === 'chainHit');
  assert.equal(chainHits[0].damage, 30);
  assert.equal(chainHits[1].damage, 45);
});

test('Arc Strike Lvl 5 can keep bouncing after the second bounce', () => {
  const allies = [makeAlly({ element: 'fire' })];
  const enemies = [
    makeEnemy({ id: 'e1', hp: 500, element: 'fire' }),
    makeEnemy({ id: 'e2', hp: 500, element: 'fire' }),
    makeEnemy({ id: 'e3', hp: 500, element: 'fire' })
  ];
  const attacks = [makeDmgRecord({ damage: 100, targetIndex: 0 })];
  const rolls = [0.01, 0.01, 0.01, 0.99];
  const original = Math.random;
  Math.random = () => rolls.length ? rolls.shift() : 0.99;
  try {
    applyAfterPlayerAttacks({
      attacks,
      allies,
      enemies,
      runPartySkills: [{ id: 'arcStrike', level: 5 }],
      combat: makeCombat()
    });
  } finally {
    Math.random = original;
  }

  assert.equal(attacks[0].partySkillProcs.filter(p => p.type === 'chainHit').length, 3);
});
```

- [ ] **Step 2: Run tests to verify failures**

Run:

```bash
node --test tests/unit/combat/party-skill-engine.test.js
```

Expected: FAIL because the engine still checks old `forkedArc` and `resonantArc` IDs.

- [ ] **Step 3: Update party skill engine imports and level checks**

In `src/game/combat/party-skill-engine.js`, replace the catalog import with:

```js
import { getPartySkillLevel } from '../party-skills.js';
```

Update `toActivePartySkillIdSet()` to remain exported for compatibility, but base it on normalized tree levels:

```js
export function toActivePartySkillIdSet(runPartySkills) {
  const ids = [];
  for (const id of ['arcStrike', 'hpMaster', 'counterMaster', 'buffMaster', 'expMaster', 'debuffMaster']) {
    if (getPartySkillLevel(runPartySkills, id) > 0) ids.push(id);
  }
  return new Set(ids);
}
```

- [ ] **Step 4: Replace Arc Strike bounce logic**

Inside `applyAfterPlayerAttacks()`, before the attack loop, add:

```js
const arcLevel = getPartySkillLevel(runPartySkills, 'arcStrike');
```

Replace the old Arc Strike block that starts at the `// ── Arc Strike: chain to another enemy ──` comment with a helper call:

```js
if (arcLevel >= 1) {
  applyArcStrikeTree({ record, attacker, enemies, combat, rng, arcLevel });
}
```

Add this helper above the spread mechanics section:

```js
function chainDamageForBounce(baseDmg, bounceIndex, arcLevel) {
  const basePct = 0.30;
  const pct = arcLevel >= 3 ? basePct + 0.15 * bounceIndex : basePct;
  return Math.floor(baseDmg * pct);
}

function shouldContinueArcBounce({ bounceIndex, arcLevel, rng }) {
  if (bounceIndex === 0) return true;
  if (arcLevel >= 4 && bounceIndex === 1) return true;
  if (arcLevel >= 2 && bounceIndex === 1) return rollProc(0.50, rng);
  if (arcLevel >= 5 && bounceIndex >= 2) return rollProc(0.25, rng);
  return false;
}

function applyArcStrikeTree({ record, attacker, enemies, combat, rng, arcLevel }) {
  const baseDmg = Math.max(0, Number(record.damage) || 0);
  if (baseDmg <= 0) return;

  let bounceIndex = 0;
  let sourceIndex = record.targetIndex;
  while (shouldContinueArcBounce({ bounceIndex, arcLevel, rng })) {
    const targets = livingEnemies(enemies).filter(enemy => enemies.indexOf(enemy) !== sourceIndex);
    if (targets.length === 0) break;

    const target = randomFrom(targets, rng);
    const targetIndex = enemies.indexOf(target);
    const damage = Math.min(chainDamageForBounce(baseDmg, bounceIndex, arcLevel), target.hp);
    target.hp -= damage;
    combat.chainHitsThisTurn += 1;

    record.partySkillProcs.push({
      skillId: 'arcStrike',
      skillName: 'Arc Strike',
      type: 'chainHit',
      targetIndex,
      damage,
      element: attacker?.element || 'neutral',
      isSE: getElementMultiplier(attacker?.element || 'neutral', target.element) > 1,
      bounceNum: bounceIndex + 1,
      sourceIndex
    });

    sourceIndex = targetIndex;
    bounceIndex += 1;
  }
}
```

Remove old `forkedArc`, `resonantArc`, `chainSurge`, `elementalCascade`, and `pandemic` logic from the chain block. These old skills are replaced by the new tree and should not fire.

- [ ] **Step 5: Run Arc Strike tests**

Run:

```bash
node --test tests/unit/combat/party-skill-engine.test.js
```

Expected: Existing old-skill tests for removed skills fail. Update those tests in the same file by deleting assertions for removed old IDs (`forkedArc`, `resonantArc`, `chainSurge`, `elementalCascade`, `pandemic`, `contagion`, `afflictionBurst`, `radiantAura`, `diverseEmpowerment`, `overflowVitality`, `sharedVigor`, `erosion`, `momentum`) and keeping only tests for new tree mechanics, count helpers, and regression playback.

- [ ] **Step 6: Run the reduced combat engine test**

Run:

```bash
node --test tests/unit/combat/party-skill-engine.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add src/game/combat/party-skill-engine.js tests/unit/combat/party-skill-engine.test.js
/usr/bin/git commit -m "feat: replace arc strike tree combat"
```

## Task 6: Counter Master Combat

**Files:**
- Modify: `src/game/combat/party-skill-engine.js`
- Modify: `tests/unit/game/party-skill-engine-counter.test.js`
- Modify: `tests/unit/pvp/pvp-combat.test.js`

- [ ] **Step 1: Replace counter tests with tree-level behavior**

In `tests/unit/game/party-skill-engine-counter.test.js`, add or replace tests with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeInlineCounter } from '../../../src/game/combat/party-skill-engine.js';

function ally(overrides = {}) {
  return { id: 'a', nameEn: 'Ally', hp: 50, maxHp: 100, attack: 20, element: 'fire', statStages: { atk: 0, def: 0, dex: 0 }, ...overrides };
}

function enemy(overrides = {}) {
  return { id: 'e', nameEn: 'Enemy', hp: 100, maxHp: 100, element: 'wood', statStages: { atk: 0, def: 0, dex: 0 }, ...overrides };
}

test('Counter Master Lvl 1 counters with 50% chance and 7 power', () => {
  const allies = [ally()];
  const enemies = [enemy()];
  const counter = computeInlineCounter(
    { targetIndex: 0, attackerIndex: 0, damage: 10 },
    allies,
    enemies,
    [{ id: 'counterMaster', level: 1 }],
    {},
    () => 0.01
  );

  assert.ok(counter);
  assert.equal(counter.damage > 0, true);
  assert.equal(counter.targetIndex, 0);
});

test('Counter Master Lvl 2 fails only above 75% roll', () => {
  const result = computeInlineCounter(
    { targetIndex: 0, attackerIndex: 0, damage: 10 },
    [ally()],
    [enemy()],
    [{ id: 'counterMaster', level: 2 }],
    {},
    () => 0.80
  );
  assert.equal(result, null);
});

test('Counter Master Lvl 3 always counters when hit', () => {
  const result = computeInlineCounter(
    { targetIndex: 0, attackerIndex: 0, damage: 10 },
    [ally()],
    [enemy()],
    [{ id: 'counterMaster', level: 3 }],
    {},
    () => 0.99
  );
  assert.ok(result);
});

test('Counter Master Lvl 4 and Lvl 5 damage multipliers stack', () => {
  const baseEnemies = [enemy({ hp: 200 })];
  const base = computeInlineCounter(
    { targetIndex: 0, attackerIndex: 0, damage: 10 },
    [ally({ hp: 80 })],
    baseEnemies,
    [{ id: 'counterMaster', level: 3 }],
    {},
    () => 0.01
  );

  const boostedEnemies = [enemy({ hp: 200 })];
  const boosted = computeInlineCounter(
    { targetIndex: 0, attackerIndex: 0, damage: 10 },
    [ally({ hp: 40 })],
    boostedEnemies,
    [{ id: 'counterMaster', level: 5 }],
    {},
    () => 0.01
  );

  assert.equal(boosted.damage, base.damage * 4);
});
```

- [ ] **Step 2: Run counter tests to verify failures**

Run:

```bash
node --test tests/unit/game/party-skill-engine-counter.test.js
```

Expected: FAIL because old `retaliationStrike` checks remain.

- [ ] **Step 3: Implement Counter Master levels**

In `computeInlineCounter()`, replace the active set gate with:

```js
const counterLevel = getPartySkillLevel(runPartySkills, 'counterMaster');
if (counterLevel <= 0) return null;
```

Replace the fixed chance with:

```js
const counterChance = counterLevel >= 3 ? 1 : counterLevel >= 2 ? 0.75 : 0.50;
if (!rollProc(counterChance, rng)) return null;
```

Replace counter damage calculation with:

```js
let counterDmg = calculateCreatureDamage({
  attackerLevel: Math.max(1, defender.level || 1),
  attack: defender.attack || 10,
  defenderDefense: Math.max(1, enemy.defense || 5),
  power: 7,
  typeMultiplier: getElementMultiplier(defender.element || 'neutral', enemy.element || 'neutral'),
  variance: 1
});

if (counterLevel >= 4 && defender.hp < defender.maxHp * 0.50) {
  counterDmg = Math.floor(counterDmg * 2);
}
if (counterLevel >= 5) {
  counterDmg = Math.floor(counterDmg * 2);
}
```

Because `party-skill-engine.js` currently imports `getElementMultiplier`, add `calculateCreatureDamage` to its imports from `../../shared/combat/creature-math.js` if available there. If `calculateCreatureDamage` is only in `../creatures.js`, import it from `../creatures.js` instead:

```js
import { calculateCreatureDamage } from '../creatures.js';
```

Remove old `hardenedRiposte`, `furyCounter`, `vengefulMark`, and `lastStand` branches.

- [ ] **Step 4: Run counter and PvP tests**

Run:

```bash
node --test tests/unit/game/party-skill-engine-counter.test.js tests/unit/pvp/pvp-combat.test.js
```

Expected: PASS after updating PvP tests that still pass `['retaliationStrike']` to use `[{ id: 'counterMaster', level: 1 }]`.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add src/game/combat/party-skill-engine.js tests/unit/game/party-skill-engine-counter.test.js tests/unit/pvp/pvp-combat.test.js
/usr/bin/git commit -m "feat: add counter master combat"
```

## Task 7: Buff Master And Debuff Master Combat Hooks

**Files:**
- Modify: `src/game/combat/party-skill-engine.js`
- Modify: `src/pvp/pvp-combat.js`
- Modify: `tests/unit/combat/party-skill-engine.test.js`
- Modify: `tests/unit/pvp/pvp-combat.test.js`

- [ ] **Step 1: Add random stat buff/debuff tests**

Append to `tests/unit/combat/party-skill-engine.test.js`:

```js
test('Buff Master Lvl 4 gives every living ally one random buff at round start', () => {
  const allies = [makeAlly(), makeAlly()];
  const events = applyRoundStartSkills({
    allies,
    enemies: [makeEnemy()],
    runPartySkills: [{ id: 'buffMaster', level: 4 }],
    combat: makeCombat(),
    rng: () => 0.01
  });

  assert.equal(events.filter(e => e.type === 'buffMaster').length, 2);
  assert.equal(allies[0].statStages.atk, 1);
  assert.equal(allies[1].statStages.atk, 1);
});

test('Debuff Master Lvl 4 applies random debuffs to enemies hit by attacks', () => {
  const attacks = [makeDmgRecord({ damage: 50, targetIndex: 0 })];
  const enemies = [makeEnemy({ hp: 100 })];
  applyAfterPlayerAttacks({
    attacks,
    allies: [makeAlly()],
    enemies,
    runPartySkills: [{ id: 'debuffMaster', level: 4 }],
    combat: makeCombat(),
    rng: () => 0.01
  });

  assert.equal(enemies[0].statStages.atk, -1);
  assert.ok(attacks[0].partySkillProcs.some(p => p.skillId === 'debuffMaster' && p.type === 'stageChange'));
});

test('Debuff Master Lvl 5 can make an acting enemy debuff its own ally', async () => {
  const { applyEnemySelfSabotage } = await import('../../../src/game/combat/party-skill-engine.js');
  const enemies = [makeEnemy({ id: 'e0' }), makeEnemy({ id: 'e1' })];
  const event = applyEnemySelfSabotage({
    actingIndex: 0,
    enemies,
    runPartySkills: [{ id: 'debuffMaster', level: 5 }],
    rng: () => 0.01
  });

  assert.equal(event.type, 'debuffMasterSelfSabotage');
  assert.equal(enemies[event.targetIndex].statStages.atk, -1);
});
```

- [ ] **Step 2: Run tests to verify failures**

Run:

```bash
node --test tests/unit/combat/party-skill-engine.test.js
```

Expected: FAIL because new random buff/debuff helpers do not exist.

- [ ] **Step 3: Add random stat helpers**

In `src/game/combat/party-skill-engine.js`, add:

```js
const RANDOM_STATS = Object.freeze(['atk', 'def', 'dex']);

function randomStat(rng = Math.random) {
  return RANDOM_STATS[Math.floor(rng() * RANDOM_STATS.length)];
}

function applyRandomBuff(target, rng = Math.random) {
  const stat = randomStat(rng);
  initStatStages(target);
  const delta = applyStatChange(target, stat, 1);
  return { stat, delta };
}

function applyRandomDebuff(target, rng = Math.random) {
  const stat = randomStat(rng);
  initStatStages(target);
  const delta = applyStatChange(target, stat, -1);
  return { stat, delta };
}
```

- [ ] **Step 4: Implement Buff Master round-start and action hook**

Change `applyRoundStartSkills()` signature to accept `rng`:

```js
export function applyRoundStartSkills({ allies, enemies, runPartySkills, combat, rng = Math.random }) {
```

Remove old Erosion, Momentum, and Overflow Vitality blocks. Add:

```js
const buffLevel = getPartySkillLevel(runPartySkills, 'buffMaster');
const buffChance = buffLevel >= 4 ? 1 : buffLevel >= 3 ? 0.75 : buffLevel >= 2 ? 0.50 : buffLevel >= 1 ? 0.25 : 0;
if (buffChance > 0) {
  for (let i = 0; i < allies.length; i++) {
    const ally = allies[i];
    if (!ally || ally.hp <= 0) continue;
    if (!rollProc(buffChance, rng)) continue;
    const { stat, delta } = applyRandomBuff(ally, rng);
    if (delta !== 0) {
      events.push({ type: 'buffMaster', targetSide: 'ally', targetIndex: i, stat, delta });
    }
  }
}
```

Inside `applyAfterPlayerAttacks()`, before debuff processing, add:

```js
const buffLevel = getPartySkillLevel(runPartySkills, 'buffMaster');
if (buffLevel >= 5 && rollProc(0.25, rng)) {
  const targets = livingAllies(allies);
  const target = randomFrom(targets, rng);
  const targetIndex = allies.indexOf(target);
  if (target) {
    const { stat, delta } = applyRandomBuff(target, rng);
    if (delta !== 0) {
      record.partySkillProcs.push({
        skillId: 'buffMaster',
        skillName: 'Buff Master',
        type: 'stageChange',
        targetSide: 'ally',
        targetIndex,
        stat,
        delta
      });
    }
  }
}
```

- [ ] **Step 5: Implement Debuff Master hit debuffs and self-sabotage**

Inside `applyAfterPlayerAttacks()`, after Arc Strike processing for each qualifying attack record, add:

```js
const debuffLevel = getPartySkillLevel(runPartySkills, 'debuffMaster');
const debuffChance = debuffLevel >= 4 ? 0.80 : debuffLevel >= 3 ? 0.60 : debuffLevel >= 2 ? 0.40 : debuffLevel >= 1 ? 0.20 : 0;
if (debuffChance > 0) {
  for (const proc of [{ targetIndex: record.targetIndex, primary: true }, ...(record.partySkillProcs || []).filter(p => p.type === 'chainHit')]) {
    const target = enemies?.[proc.targetIndex];
    if (!target || target.hp <= 0) continue;
    if (!rollProc(debuffChance, rng)) continue;
    const { stat, delta } = applyRandomDebuff(target, rng);
    if (delta !== 0) {
      record.partySkillProcs.push({
        skillId: 'debuffMaster',
        skillName: 'Debuff Master',
        type: 'stageChange',
        targetSide: 'enemy',
        targetIndex: proc.targetIndex,
        stat,
        delta
      });
    }
  }
}
```

Export this helper:

```js
export function applyEnemySelfSabotage({ actingIndex, enemies, runPartySkills, rng = Math.random }) {
  if (getPartySkillLevel(runPartySkills, 'debuffMaster') < 5) return null;
  if (!rollProc(0.50, rng)) return null;
  const acting = enemies?.[actingIndex];
  if (!acting || acting.hp <= 0) return null;
  const candidates = livingEnemies(enemies).filter(enemy => enemy !== acting);
  if (candidates.length === 0) return null;
  const target = randomFrom(candidates, rng);
  const targetIndex = enemies.indexOf(target);
  const { stat, delta } = applyRandomDebuff(target, rng);
  if (delta === 0) return null;
  return {
    type: 'debuffMasterSelfSabotage',
    targetSide: 'enemy',
    actingIndex,
    targetIndex,
    stat,
    delta
  };
}
```

- [ ] **Step 6: Thread self-sabotage through PvE and PvP enemy action paths**

In `src/game/services/combat-cycle-service.js`, after enemy attack records are produced and before counter processing in enemy phases, call:

```js
const sabotageEvents = [];
for (const atk of enemyResult.attacks || []) {
  const event = applyEnemySelfSabotage({
    actingIndex: atk.attackerIndex,
    enemies: this.gm.combat.enemies,
    runPartySkills: this.gm.run.partySkills,
    rng: Math.random
  });
  if (event) sabotageEvents.push(event);
}
```

Append `sabotageEvents` to `effectEvents` in every result object returned by the touched enemy-action method. For example, replace `effectEvents,` with:

```js
effectEvents: [...effectEvents, ...sabotageEvents],
```

If the method returns a variable named `rawEffectEvents` instead of `effectEvents`, create a local `const combinedEffectEvents = [...effectEvents, ...sabotageEvents];` immediately before the return and use `effectEvents: combinedEffectEvents`.

In `src/pvp/pvp-combat.js`, after each slot action resolves, call `applyEnemySelfSabotage()` from the perspective of the opposing party skills:

```js
const sabotage = applyEnemySelfSabotage({
  actingIndex: slot.index,
  enemies: attackerSide,
  runPartySkills: isA ? partySkillsB : partySkillsA
});
if (sabotage) {
  orderedAttacks.push({ ...sabotage, side: sideLabel, playbackIndex: playbackCounter++ });
}
```

Import `applyEnemySelfSabotage` from `../game/services/creature-combat-service.js` after re-exporting it there.

- [ ] **Step 7: Run combat and PvP tests**

Run:

```bash
node --test tests/unit/combat/party-skill-engine.test.js tests/unit/pvp/pvp-combat.test.js
```

Expected: PASS after updating any old `erosion`, `momentum`, or `contagion` expectations to new tree entries.

- [ ] **Step 8: Commit**

```bash
/usr/bin/git add src/game/combat/party-skill-engine.js src/game/services/creature-combat-service.js src/game/services/combat-cycle-service.js src/pvp/pvp-combat.js tests/unit/combat/party-skill-engine.test.js tests/unit/pvp/pvp-combat.test.js
/usr/bin/git commit -m "feat: add buff and debuff master combat"
```

## Task 8: HP Master Healing And Exp Master XP

**Files:**
- Modify: `src/game/services/creature-combat-service.js`
- Modify: `src/shared/combat/pve-turn-core.js`
- Modify: `src/game/services/exploration-service.js`
- Modify: `src/game/creatures.js`
- Modify: `tests/unit/combat/creature-combat-service.test.js`

- [ ] **Step 1: Add healing and XP tests**

In `tests/unit/combat/creature-combat-service.test.js`, add `resolveSingleActorAction` to the existing import from `../../../src/game/services/creature-combat-service.js`.

Append to `tests/unit/combat/creature-combat-service.test.js`:

```js
describe('Party Skill Trees - HP and EXP Master', () => {
  it('HP Master Lvl 3 makes heal moves restore 50% more HP', () => {
    const ally = instantiateCreature('mizu');
    ally.moves.push({ id: 'test-heal', name: '治す', nameEn: 'Test Heal', element: 'neutral', category: 'heal', target: 'self', power: 20, mpCost: 0 });
    ally.hp = 1;
    const result = resolveSingleActorAction({
      actorSide: 'ally',
      actorIndex: 0,
      allies: [ally],
      enemies: [instantiateCreature('ki')],
      choices: [{ creatureIndex: 0, moveId: 'test-heal', targetIndex: 0 }],
      creatureParty: { active: [ally], reserves: [] },
      runPartySkills: [{ id: 'hpMaster', level: 3 }],
      combat: {},
      rng: () => 0.50
    });

    const attack = result.actionSegments[0].attacks[0];
    assert.ok(attack.healAmount > 0);
    assert.equal(attack.healAmount, Math.floor(((ally.attack / 10) * 20 * 1.0) * 1.5));
  });

  it('HP Master Lvl 4 gives healed target a random buff', () => {
    const ally = instantiateCreature('mizu');
    ally.moves.push({ id: 'test-heal', name: '治す', nameEn: 'Test Heal', element: 'neutral', category: 'heal', target: 'self', power: 20, mpCost: 0 });
    ally.hp = 1;
    ally.statStages = { atk: 0, def: 0, dex: 0 };
    resolveSingleActorAction({
      actorSide: 'ally',
      actorIndex: 0,
      allies: [ally],
      enemies: [instantiateCreature('ki')],
      choices: [{ creatureIndex: 0, moveId: 'test-heal', targetIndex: 0 }],
      creatureParty: { active: [ally], reserves: [] },
      runPartySkills: [{ id: 'hpMaster', level: 4 }],
      combat: {},
      rng: () => 0.01
    });

    assert.equal(ally.statStages.atk, 1);
  });

  it('Exp Master Lvl 4 doubles kill XP', () => {
    const party = { active: [instantiateCreature('ki')], reserves: [] };
    const result = awardKillXp(party, 5, 1, 0, null, null, [{ id: 'expMaster', level: 4 }]);
    assert.equal(result.xpGrants[0].xp, 500);
  });
});
```

- [ ] **Step 2: Run tests to verify failures**

Run:

```bash
node --test tests/unit/combat/creature-combat-service.test.js
```

Expected: FAIL because process functions do not consume tree multipliers yet.

- [ ] **Step 3: Update XP award function signature**

In `src/game/services/creature-combat-service.js`, import:

```js
import { getPartySkillLevel, getXpMultiplier } from '../party-skills.js';
```

Change `awardKillXp` signature to:

```js
export function awardKillXp(creatureParty, enemyLevel, xpMultiplier = 1.0, xpBalanceStacks = 0, metaMults = null, itemBuffs = null, runPartySkills = []) {
```

Replace base XP calculation with:

```js
const partySkillXpMultiplier = getXpMultiplier(runPartySkills);
const baseXp = Math.floor(BASE_KILL_XP * enemyLevel * 2 * partySkillXpMultiplier);
```

After collecting `levelUps`, add Lvl 5 extra-level logic:

```js
if (getPartySkillLevel(runPartySkills, 'expMaster') >= 5) {
  for (const entry of entries) {
    if (levelUps.some(lu => lu.creatureId === entry.creature.id) && Math.random() < 0.10) {
      const extra = addXpToCreature(entry.creature, xpToNextLevel(entry.creature.level), metaMults, itemBuffs);
      for (const lu of extra) {
        levelUps.push({
          creatureId: entry.creature.id,
          creatureName: entry.creature.nameEn,
          oldLevel: lu.level - 1,
          newLevel: lu.level,
          maxHp: lu.maxHp,
          attack: lu.attack,
          hpGain: lu.hpGain,
          maxMp: lu.maxMp,
          mpGain: lu.mpGain,
          newMove: lu.newMove,
          partySkillBonus: 'expMaster'
        });
      }
    }
  }
}
```

Update these `awardKillXp(...)` call sites to pass `runPartySkills`:

- `src/game/services/creature-combat-service.js`: both calls inside `executeMove()`.
- `src/shared/combat/pve-turn-core.js`: the call inside `maybeAwardKillXp()`.
- `src/game/services/combat-cycle-service.js`: the poison-KO call around the existing `_collectPoisonKoXpEvents()` flow.

Thread `runPartySkills` through these function signatures:

```js
function executeMove(creature, creatureIndex, move, targetIndex, allies, enemies, itemBuffs, creatureParty, defeatedEnemyIndices, metaMults = null, defenderItemBuffs = null, rng = Math.random, runPartySkills = [])
```

```js
export function processMoveTurn(allies, enemies, moveChoices, itemBuffs = null, creatureParty = null, metaMults = null, rng = Math.random, runPartySkills = [])
```

```js
export function executeSlotMoveTurn(allies, enemies, creatureIndex, choices, options = {})
```

Inside `executeSlotMoveTurn()`, pass `options.runPartySkills || []` into `executeMove(...)`.

Inside `resolveSingleActorAction()`, pass the existing `runPartySkills` value through `executeSlotMoveTurn()`:

```js
runPartySkills: isAlly ? runPartySkills : null,
```

Inside `processInterleavedPvERound()`, pass `options.runPartySkills || []` through `executeSlotMoveTurn()` for ally actions.

- [ ] **Step 4: Apply HP Master healing multiplier and buff**

In `src/game/services/creature-combat-service.js`, import:

```js
import { getHealingMultiplier } from '../party-skills.js';
import { applyStatChange, initStatStages } from '../combat/effects.js';
```

Add local helper:

```js
function applyHpMasterHeal({ target, amount, runPartySkills, rng = Math.random }) {
  const boosted = Math.floor(amount * getHealingMultiplier(runPartySkills));
  const healed = applyHeal(target, boosted);
  if (healed > 0 && getPartySkillLevel(runPartySkills, 'hpMaster') >= 4) {
    const stats = ['atk', 'def', 'dex'];
    const stat = stats[Math.floor(rng() * stats.length)];
    initStatStages(target);
    applyStatChange(target, stat, 1);
  }
  return healed;
}
```

In player heal and drain cases inside `executeMove()`, replace `applyHeal(...)` calls with `applyHpMasterHeal(...)` using the threaded `runPartySkills` argument. In enemy heal and drain cases, keep the existing `applyHeal(...)` calls so player Party Skills do not buff enemy healing.

Mirror this helper in `src/shared/combat/pve-turn-core.js` so optimistic/shared turn resolution uses the same heal amounts.

- [ ] **Step 5: Run XP/healing tests**

Run:

```bash
node --test tests/unit/combat/creature-combat-service.test.js tests/unit/combat/pve-turn-resolver-determinism.test.js
```

Expected: PASS after call sites pass `runPartySkills`.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add src/game/services/creature-combat-service.js src/shared/combat/pve-turn-core.js src/shared/combat/pve-turn-resolver.js src/game/services/combat-cycle-service.js tests/unit/combat/creature-combat-service.test.js tests/unit/combat/pve-turn-resolver-determinism.test.js
/usr/bin/git commit -m "feat: add hp and exp master rewards"
```

## Task 9: Ranked Bot Generation And PvP Team Display

**Files:**
- Modify: `src/pvp/bot-generation.js`
- Modify: `public/js/ui/pvp-lobby.js`
- Modify: `tests/unit/pvp/bot-generation.test.js`
- Modify: `tests/unit/ui/pvp-team-save-feedback.test.js`

- [ ] **Step 1: Update bot generation tests for compact tree entries**

In `tests/unit/pvp/bot-generation.test.js`, replace `assert.equal(bot.team.partySkills.length, 5);` with:

```js
    const totalSkillLevels = bot.team.partySkills.reduce((sum, skill) => sum + skill.level, 0);
    assert.equal(totalSkillLevels, 5);
    assert.ok(bot.team.partySkills.every(skill => typeof skill.id === 'string' && skill.level >= 1 && skill.level <= 5));
```

Add:

```js
  it('allows bots to draft Exp Master to simulate player builds', () => {
    const bots = generateRankedBotBatch({ count: 100, seed: 'exp-master-check' });
    assert.ok(bots.some(bot => bot.team.partySkills.some(skill => skill.id === 'expMaster')));
  });
```

- [ ] **Step 2: Run bot tests to verify failures**

Run:

```bash
node --test tests/unit/pvp/bot-generation.test.js
```

Expected: FAIL because bots still generate five old individual entries.

- [ ] **Step 3: Generate bot skills through tree offers**

In `src/pvp/bot-generation.js`, replace old imports with:

```js
import { applyPartySkillChoice, rollSkillMasterOffers } from '../game/party-skills.js';
```

Replace `legalPartySkillIds()` and `generatePartySkills()` with:

```js
function generatePartySkills(random) {
  let picked = [];
  for (let i = 0; i < 5; i++) {
    const offers = rollSkillMasterOffers({ ownedSkillIds: picked, count: 3, rng: random });
    if (offers.length === 0) break;
    const choice = offers[Math.floor(random() * offers.length)];
    picked = applyPartySkillChoice(picked, choice.id);
  }
  return picked;
}
```

Update `validateGeneratedBotProfile()` party skill check to:

```js
const partySkillLevelTotal = (bot?.team?.partySkills || []).reduce((sum, skill) => sum + (skill.level || 0), 0);
if (partySkillLevelTotal !== 5) errors.push('party_skill_level_total');
```

Update `summarizeBotForReview()`:

```js
partySkills: bot.team.partySkills.map(skill => `${skill.id}:${skill.level}`),
```

- [ ] **Step 4: Update PvP lobby display**

In `public/js/ui/pvp-lobby.js`, replace `PARTY_SKILL_NAMES` with:

```js
const PARTY_SKILL_NAMES = {
  arcStrike: 'Arc Strike',
  hpMaster: 'HP Master',
  counterMaster: 'Counter Master',
  buffMaster: 'Buff Master',
  expMaster: 'Exp Master',
  debuffMaster: 'Debuff Master'
};
```

Replace skill tag name resolution with:

```js
const id = typeof s === 'string' ? s : (s?.id || s?.skillId || '');
const level = typeof s === 'object' && s?.level ? ` Lvl. ${s.level}` : '';
const name = `${PARTY_SKILL_NAMES[id] || id}${level}`;
return `<span class="pvp-skill-tag">${escapeHtml(name)}</span>`;
```

- [ ] **Step 5: Run bot and UI tests**

Run:

```bash
node --test tests/unit/pvp/bot-generation.test.js tests/unit/ui/pvp-team-save-feedback.test.js
```

Expected: PASS after updating any test fixture skill IDs to compact tree entries.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add src/pvp/bot-generation.js public/js/ui/pvp-lobby.js tests/unit/pvp/bot-generation.test.js tests/unit/ui/pvp-team-save-feedback.test.js
/usr/bin/git commit -m "feat: draft tree skills for pvp bots"
```

## Task 10: Exploration UI And Offer Rendering

**Files:**
- Modify: `public/js/ui/exploration.js`
- Modify: `public/js/ui/exploration-dom.js`
- Modify: `tests/unit/ui/exploration-skill-master.test.js`

- [ ] **Step 1: Update UI tests for title/description offers**

In `tests/unit/ui/exploration-skill-master.test.js`, update skill fixture offers from:

```js
{ id: 'arcStrike', name: 'Arc Strike', desc: 'Chain hit' }
```

to:

```js
{ id: 'arcStrike', level: 1, name: 'Arc Strike', title: 'Arc Strike - Lvl. 1', desc: 'Your attacks arc to another enemy for 30% damage.' }
```

Add an assertion where cards are rendered:

```js
assert.match(actionArea.innerHTML, /Arc Strike - Lvl\. 1/);
assert.match(actionArea.innerHTML, /30% damage/);
```

- [ ] **Step 2: Run UI test to verify failures**

Run:

```bash
node --test tests/unit/ui/exploration-skill-master.test.js
```

Expected: FAIL if the UI still uses `s.name` only for card title.

- [ ] **Step 3: Render offer titles**

In `public/js/ui/exploration.js`, in both Skill Master and NPC battle selection card construction, replace:

```js
title: s.name || s.id,
subtitle: s.desc || '',
```

with:

```js
title: s.title || s.name || s.id,
subtitle: s.desc || '',
```

In inventory party skill display, replace old display mapping with:

```js
const title = s.title || `${s.name || s.id}${s.level ? ` Lvl. ${s.level}` : ''}`;
const desc = s.desc || '';
```

Use `escapeHtml(title)` and `escapeHtml(desc)` when injecting HTML.

- [ ] **Step 4: Run UI tests**

Run:

```bash
node --test tests/unit/ui/exploration-skill-master.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add public/js/ui/exploration.js public/js/ui/exploration-dom.js tests/unit/ui/exploration-skill-master.test.js
/usr/bin/git commit -m "feat: display party skill tree levels"
```

## Task 11: Cleanup Old Party Skill Expectations

**Files:**
- Modify: `tests/unit/combat/party-skills.test.js`
- Modify: `tests/unit/pvp/socket-handler-team-selection.test.js`
- Modify: `tests/unit/pvp/match-manager.test.js`
- Modify: `tests/unit/routes/optimistic-run-routes.test.js`
- Modify: `docs/playtest-guide.md`

- [ ] **Step 1: Replace old skill IDs in tests**

Search:

```bash
rg -n "'momentum'|'retaliationStrike'|'erosion'|'contagion'|'sharedVigor'|'diverseEmpowerment'|'arcStrike'" tests src public docs/playtest-guide.md
```

Replace old fixtures according to this mapping:

```js
const skillFixtures = {
  arcStrike: [{ id: 'arcStrike', level: 1 }],
  momentum: [{ id: 'buffMaster', level: 1 }],
  sharedVigor: [{ id: 'buffMaster', level: 1 }],
  diverseEmpowerment: [{ id: 'buffMaster', level: 1 }],
  retaliationStrike: [{ id: 'counterMaster', level: 1 }],
  erosion: [{ id: 'debuffMaster', level: 1 }],
  contagion: [{ id: 'debuffMaster', level: 1 }]
};
```

In tests that intentionally cover migration, keep old IDs as input and assert compact entries as output.

- [ ] **Step 2: Update playtest guide skill examples**

In `docs/playtest-guide.md`, replace old examples:

```md
Three party skill cards below (e.g., Retaliation Strike, Arc Strike, Shared Vigor)
```

with:

```md
Three party skill cards below (e.g., Counter Master - Lvl. 1, Arc Strike - Lvl. 1, Buff Master - Lvl. 1)
```

- [ ] **Step 3: Run broad unit tests**

Run:

```bash
npm run test:unit
```

Expected: PASS. If failures mention removed old skill IDs, update those fixtures to compact tree entries or migration assertions.

- [ ] **Step 4: Commit**

```bash
/usr/bin/git add tests docs/playtest-guide.md
/usr/bin/git commit -m "test: update party skill tree expectations"
```

## Task 12: Full Verification And Manual Playtest

**Files:**
- No source files unless verification exposes a defect.

- [ ] **Step 1: Run syntax checks for edited JS files**

Run:

```bash
node --check src/game/party-skills.js
node --check src/game/combat/party-skill-engine.js
node --check src/game/services/exploration-service.js
node --check src/routes/game/run.js
node --check src/routes/game/pvp.js
node --check src/pvp/bot-generation.js
node --check public/js/ui/exploration.js
node --check public/js/ui/pvp-lobby.js
```

Expected: every command exits 0 with no syntax error.

- [ ] **Step 2: Run full tests**

Run:

```bash
npm test
```

Expected: PASS for Tier 1 and Tier 2.

- [ ] **Step 3: Start dev server for visual verification**

Run:

```bash
npm run dev
```

Expected: Vite prints a local URL for `http://localhost:5173`.

- [ ] **Step 4: Verify the local server responds**

Run:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:5173
```

Expected: `200`.

- [ ] **Step 5: Manual browser playtest**

Ask the user before opening Playwright, because the repo instructions say not to launch Playwright without asking first. After approval, use the playtest guide and verify:

- Initial Skill Master offers show three cards titled `Tree Name - Lvl. 1`.
- A later Skill Master or NPC battle reward offers the next level for a tree already owned.
- Picking a tree level changes `window.__gameState.run.partySkills` to compact entries.
- PvP team save cards show skill tags with levels.
- Combat visibly shows Arc Strike, Counter Master, random buff, and random debuff effects.

- [ ] **Step 6: Commit verification fixes**

If Step 5 required fixes, inspect the changed file list:

```bash
/usr/bin/git status --short
```

Then add the known Party Skill implementation surface and commit:

```bash
/usr/bin/git add src/game/party-skills.js src/game/combat/party-skill-engine.js src/game/services/exploration-service.js src/game/services/creature-combat-service.js src/game/services/combat-cycle-service.js src/shared/combat/pve-turn-core.js src/shared/combat/pve-turn-resolver.js src/routes/game/run.js src/routes/game/pvp.js src/pvp/pvp-combat.js src/pvp/bot-generation.js public/js/ui/exploration.js public/js/ui/pvp-lobby.js tests docs/playtest-guide.md
/usr/bin/git commit -m "fix: polish party skill tree playtest issues"
```

If Step 5 required no fixes, do not create an empty commit.
