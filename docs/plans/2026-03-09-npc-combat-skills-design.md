# NPC Combat Skills Design

**Date:** 2026-03-09
**Status:** Approved

## Overview

NPCs can now use skills during combat that interrupt the normal battle flow. Each turn there is a fixed 25% chance the NPC will use a skill between the player phase and enemy phase. NPC skills are AOE — they hit all creatures on one side, producing 3 vocab cards (one per target) for the player to tap through.

## Design Principles

- **Pseudo-creature approach**: NPCs gain minimal combat stats (`attack`, `baseWord`, `skills[]`) and reuse the existing `executeMove()` pipeline. No separate damage engine.
- **Same card format**: NPC skill cards use `buildSplitAttackCard()` with NPC sprite, NPC base word, skill name, and target creature.
- **MVP scope**: No NPC HP/MP, no cooldowns, no skill selection AI — pure random from the NPC's skill pool.

## Data Model Changes

### `data/npcs.json` — New fields per NPC

```json
{
  "nagi": {
    "...existing fields...",
    "baseWord": "TBD",
    "baseReading": "TBD",
    "baseMeaning": "TBD",
    "attack": 10,
    "skills": ["npc-skill-id-1", "npc-skill-id-2"]
  }
}
```

- `baseWord/baseReading/baseMeaning`: Vocab word associated with this NPC (shown on attack cards)
- `attack`: Combat stat used in damage formulas (derived from NPC tier)
- `skills`: Array of skill IDs referencing `data/npc-skills.json`

### New file: `data/npc-skills.json`

Same shape as creature moves in `data/moves.json`, enabling `executeMove()` reuse:

```json
[
  {
    "id": "npc-aoe-attack-example",
    "name": "嵐",
    "nameEn": "Storm",
    "reading": "あらし",
    "meaning": "storm",
    "element": "neutral",
    "category": "damage",
    "target": "all_enemies",
    "power": 8,
    "statusEffect": null,
    "statusChance": 0,
    "statusDuration": 0
  }
]
```

Skill categories and their targeting:

| Category | Target | Effect |
|----------|--------|--------|
| `damage` | `all_enemies` (player's creatures) | AOE damage to all player creatures |
| `heal` | `all_allies` (NPC's creatures) | AOE heal to all NPC creatures |
| `buff` | `all_allies` (NPC's creatures) | AOE buff to all NPC creatures |
| `debuff` | `all_enemies` (player's creatures) | AOE debuff to all player creatures |

Note: "enemies" and "allies" are from the NPC's perspective. Since the NPC fights alongside their creatures (the `enemies` array from the player's perspective), targeting flips:
- `all_enemies` in NPC context = `this.combat.allies` (player's creatures)
- `all_allies` in NPC context = `this.combat.enemies` (NPC's creatures)

## Combat Flow

### Turn sequence with NPC skill

```
1. Effect ticks (poison, durations)
2. Player phase (move selection → execution → XP → victory check)
3. *** NPC SKILL PHASE (new) ***
   - Only if combat.npcId is set
   - 25% chance (Math.random() < 0.25)
   - Pick random skill from NPC's skills[]
   - Build pseudo-creature from NPC stats
   - Execute against all targets (up to 3)
   - Collect as npcSkillAttacks[] in response
4. Enemy phase (creature attacks)
5. KO swaps, defeat check
```

### Backend: `_handleCreatureAttackTurn` in `src/game/loop.js`

Insert between player phase victory check (line ~611) and enemy phase (line ~614):

1. Check `this.combat.npcId` exists and `this.combat.npcData` has skills
2. Roll `Math.random() < 0.25`
3. Pick random skill: `skills[Math.floor(Math.random() * skills.length)]`
4. Build pseudo-creature: `{ attack: npc.attack, element: 'neutral', activeEffects: [] }`
5. Determine targets based on skill category:
   - `damage`/`debuff` → `this.combat.allies` (player's creatures)
   - `heal`/`buff`/`shield` → `this.combat.enemies` (NPC's creatures)
6. For each alive target, call `executeMove()` or equivalent
7. Return `npcSkillAttacks[]` in response

### Response payload addition

```javascript
{
  ...existing fields...,
  npcSkillAttacks: [
    {
      attackerId: "nagi",
      attackerName: "Nagi",
      attackerNameJp: "ナギ",
      attackerElement: "neutral",
      attackerBaseWord: "凪",
      attackerBaseReading: "なぎ",
      attackerBaseMeaning: "calm",
      attackerSkillName: "嵐",
      attackerSkillReading: "あらし",
      attackerSkillEn: "Storm",
      moveElement: "neutral",
      category: "damage",
      targetIndex: 0,
      targetId: "creature-id",
      targetName: "CreatureName",
      targetNameJp: "クリーチャー名",
      damage: 12,
      healAmount: 0,
      effectApplied: null
    },
    // ...one per target (up to 3)
  ],
  npcSkillUsed: {
    skillId: "npc-aoe-attack-example",
    skillName: "嵐",
    skillNameEn: "Storm",
    npcName: "Nagi",
    npcNameJp: "ナギ"
  }
}
```

### Frontend: `combat-loop.js`

After showing player attacks, before showing enemy attacks:

1. Check `response.npcSkillAttacks?.length > 0`
2. For each attack in `npcSkillAttacks`:
   - Call `insertAttackCard(atk, true)` (isEnemy = true, since NPC is opponent)
   - Player taps to continue (same `waitForCardTap` flow)
   - Card fades out
3. Continue to enemy phase

The split attack card already supports all needed fields. The NPC sprite path will be `sprites/npcs/{npcId}.webp` instead of a creature sprite — we adapt `creatureSpritePath()` or pass the URL directly.

## NPC Skill Loading

New utility in `src/game/services/npc-service.js`:

- `loadNpcSkills()` — loads and caches `data/npc-skills.json`
- `getNpcSkillsForNpc(npcId)` — returns the skill objects for a given NPC's `skills[]` array
- `rollNpcSkill(npcData)` — 25% chance check + random skill selection, returns skill or null

## Files to Modify

| File | Change |
|------|--------|
| `data/npcs.json` | Add `baseWord`, `baseReading`, `baseMeaning`, `attack`, `skills` to each NPC |
| `data/npc-skills.json` | **New file** — NPC skill definitions |
| `src/game/services/npc-service.js` | Add skill loading + roll functions |
| `src/game/loop.js` | Insert NPC skill phase in `_handleCreatureAttackTurn` |
| `src/game/services/creature-combat-service.js` | Possibly export helper for single-move execution against a target list |
| `public/js/ui/combat-loop.js` | Handle `npcSkillAttacks` in response, show cards |
| `tests/unit/game/npc-service.test.js` | Test skill loading, roll logic |
| `tests/unit/game/creature-combat-service.test.js` | Test NPC skill execution |

## Out of Scope (MVP)

- NPC HP/MP tracking
- Skill cooldowns or usage limits
- Intelligent skill selection (AI-based)
- NPC-specific card visual styling
- NPC skill animations beyond existing attack card
- Skill forging/balancing (separate skill: npc-skill-forge)
