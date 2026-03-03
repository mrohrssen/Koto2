---
name: move-forge
description: Design new combat moves from Japanese verbs. Each move teaches a verb and has element, category, power, status effects. Triggers on "move forge", "new moves", "forge moves", "move from verb".
user_invocable: true
---

# Move Forge

Turn Japanese verbs into combat moves for Koto, a Japanese vocabulary learning RPG. Each move is named after a Japanese verb and teaches that word to the player.

## Quick Reference: The Flow

```
Phase 0: Input & Discovery    -> find verbs, JPDB lookup
Phase 1: Move Design           -> element, category, target, power, status, tier
Phase 2: Balance Check         -> compare against existing moves.json distribution
Phase 3: User Review           -> present table for approval
Phase 4: Save                  -> append to staging JSON
```

## Input Mode Detection

Parse skill arguments:

- **Direct mode:** `/move-forge 走る` -- verb provided. JPDB lookup, proceed to Phase 1.
- **Discovery mode:** `/move-forge` or `/move-forge --stage 3` -- discover verbs for a target stage.
- **Batch mode:** `/move-forge --stage 3 --count 10` -- design multiple moves for a stage.

---

## Discovery Mode

1. **Check stage gaps.** Run `node scripts/forge-discovery.mjs --gaps move` to see which stages need moves most.
2. **Pick target stage.** Auto-pick the stage with the largest deficit, or use the `--stage` flag.
3. **Discover candidates.** Run `node scripts/forge-discovery.mjs --type move --stage N --limit 20` to get stage-filtered verb candidates from `actions.json`, `movement.json`, and `combat.json`.
4. Present selection table:

| # | Word | Reading | Meaning | JPDB Rank | WK Level | Stage | Source |
|---|------|---------|---------|-----------|----------|-------|--------|

5. User picks verbs or provides their own. Proceed to Phase 1 for each.

---

## Phase 0: Input & JPDB Lookup

1. **JPDB lookup** for the verb using `scripts/lib/jpdb-helpers.mjs`. Write a temp script to `/tmp/` and run it:

```javascript
#!/usr/bin/env node
const { resolveCommonForms } = await import(process.cwd() + '/scripts/lib/jpdb-helpers.mjs');
import { readFile } from 'fs/promises';

const words = ['走る']; // use kanji form
const apiKey = (await readFile(process.cwd() + '/data/.creature-forge-jpdb-key', 'utf8')).trim();
const results = await resolveCommonForms(words, apiKey);
for (const r of results) {
  console.log(JSON.stringify(r));
}
```

2. Present results:

| Word | Reading | Rank | Raw Meanings | All Forms |
|------|---------|------|-------------|-----------|

**Always show raw JPDB `meanings` array.** Never paraphrase.

3. Verify the verb is not already in `data/moves.json`. If it is, warn and suggest alternatives.

---

## Phase 1: Move Design

For each verb, determine the move's combat properties:

### Element Assignment

Based on verb meaning and imagery:
| Verb Feel | Element | Examples |
|-----------|---------|----------|
| Physical force, weight, earth | earth | 打つ (hit), 押す (push), 踏む (step on) |
| Speed, cutting, precision, metal | metal | 切る (cut), 刺す (stab), 磨く (polish) |
| Growth, nature, life, wood | wood | 育てる (raise), 巻く (wrap), 絡む (entangle) |
| Heat, energy, explosion, fire | fire | 焼く (burn), 爆ぜる (burst), 照らす (shine) |
| Flow, cold, cleansing, water | water | 流す (pour), 凍る (freeze), 洗う (wash) |
| Generic, universal actions | neutral | 走る (run), 食べる (eat), 見る (look) |

### Category Assignment

Based on verb semantics:
| Verb Type | Category | Target |
|-----------|----------|--------|
| Physical action (切る, 打つ, 投げる) | damage | single_enemy or all_enemies |
| Protective (守る, 隠れる, 防ぐ) | shield | self, single_ally, or all_allies |
| Mental/status (惑わす, 眠る, 混乱) | debuff | single_enemy or all_enemies |
| Enhancement (走る, 強める, 急ぐ) | buff | self or single_ally |
| Caring/restoring (治す, 助ける, 癒す) | heal | single_ally or all_allies |
| Consuming (吸う, 奪う) | drain | single_enemy |

### Power, MP Cost, and Tier

Assign based on verb "intensity" and JPDB rank:

| Tier | Power | MP Cost | Rank Range | Description |
|------|-------|---------|------------|-------------|
| 1 | 15-30 | 8-18 | Any | Basic moves, common verbs |
| 2 | 28-50 | 18-26 | Any | Stronger, more specific verbs |
| 3 | 50-65 | 30-42 | Any | Powerful, dramatic verbs |

**Non-damage moves:** Power is 0 for buffs/debuffs. Heals use power as heal %. Shields use power as damage reduction %.

### Status Effects

If the verb implies a status, assign it:
| Status | Duration | Chance | Example Verbs |
|--------|----------|--------|---------------|
| poison | 3 turns | 50-80% | 毒を盛る, 汚す |
| sleep | 2 turns | 40-60% | 眠る, 歌う (lullaby) |
| stun | 1 turn | 30-50% | 驚かす, 叩く (hard hit) |
| confuse | 2 turns | 40-60% | 惑わす, 混ぜる |
| attack_buff | 2-3 turns | 80-100% | 鍛える, 強める |
| haste | 1 turn (consumed) | 100% | 走る, 急ぐ |
| shield | 2 turns | 100% | 守る, 隠れる |
| team_shield | 2 turns | 100% | 庇う, 囲む |
| taunt | 2 turns | 100% | 挑む, 吠える |

### Stage Assignment

Compute via `language/stage-utils.js`:
- WK words: `stage = Math.ceil(wkLevel / 6)`
- Non-WK: lowest stage where `jpdbKanaCap >= rank`

### nameEn (English Display Name)

A short, evocative English name (1-2 words) based on the verb meaning. Must be dictionary-accurate -- no embellishment.
- 走る -> "Dash", 切る -> "Slash", 守る -> "Guard", 治す -> "Heal"

### description

One sentence describing the move's combat effect in plain English. Matches what the player sees.

---

## Phase 2: Balance Check

After designing the move(s), check against existing `data/moves.json`:

1. **Element distribution:** Count moves per element. Flag if adding this move makes any element > 25% of total.
2. **Category distribution:** Target ~40% damage, ~15% buff, ~15% debuff, ~12% shield, ~10% heal, ~8% drain. Flag large imbalances.
3. **Stage distribution:** Ensure the target stage has moves across all categories (no stage with zero heals).
4. **Duplicate check:** No two moves with the same `id` or same `name`.

Present a brief balance summary.

---

## Phase 3: User Review

Present the designed move(s):

| Field | Value |
|-------|-------|
| id | hashiru |
| name | 走る |
| nameEn | Dash |
| reading | はしる |
| meaning | to run / to rush, to dash |
| rank | 400 |
| element | neutral |
| category | buff |
| target | self |
| power | 0 |
| mpCost | 10 |
| statusEffect | haste |
| statusChance | 100 |
| statusDuration | 1 |
| tier | 1 |
| description | Rushes forward at full speed, gaining an extra action. |
| stage | 1 |

For batch mode, show a summary table:

| # | Move | Element | Category | Tier | Power | MP | Status | Stage |
|---|------|---------|----------|------|-------|----|--------|-------|

Ask: "Approve? Or tell me what to change."

---

## Phase 4: Save

1. Read `data/new-moves-staging.json` (or initialize `[]`).
2. Build move object(s) matching `data/moves.json` schema:

```json
{
  "id": "hashiru",
  "name": "走る",
  "nameEn": "Dash",
  "reading": "はしる",
  "meaning": "to run / to rush, to dash",
  "rank": 400,
  "element": "neutral",
  "category": "buff",
  "target": "self",
  "power": 0,
  "mpCost": 10,
  "statusEffect": "haste",
  "statusChance": 100,
  "statusDuration": 1,
  "tier": 1,
  "description": "Rushes forward at full speed, gaining an extra action.",
  "stage": 1
}
```

3. Append. Write back.
4. Confirm: **"Saved [N] move(s) to staging! [M] total moves now in data/new-moves-staging.json."**

---

## Translation Accuracy (NON-NEGOTIABLE)

- **Show raw JPDB meanings arrays.** Never summarize.
- **Use primary dictionary definitions** for the `meaning` field.
- **Transitivity matters.** 狂う = "go mad" (intransitive), NOT "drive mad."
- **No embellishment.** "run" stays "run", not "blazing sprint."
- **nameEn must be dictionary-accurate.** Short and evocative, but truthful.

---

## Checklist Before Saving

- [ ] All JPDB ranks from API calls (not guessed)
- [ ] Raw meanings arrays shown to user and verified
- [ ] English translations dictionary-accurate
- [ ] Element assignment makes sense for the verb
- [ ] Category assignment matches verb semantics
- [ ] Power/mpCost within tier ranges
- [ ] Status effect appropriate for the verb (or null)
- [ ] Stage computed from word rank/WK level
- [ ] No duplicate id or name with existing moves
- [ ] Balance check passed (element/category/stage distribution)
- [ ] `description` is one plain English sentence
- [ ] `nameEn` is 1-2 words, dictionary-accurate
