# Creature and Move Expansion Design

**Date:** 2026-05-06  
**Status:** Draft design, awaiting user review  
**Scope:** Add the approved creature roster and approved move set as data, manually design capped learnsets, remove legacy creature vocabulary identity fields, and do not place the new creatures in areas yet.

## Goal

Koto needs a larger creature and move set that is playable as soon as the data lands. The implementation should:

- Add every approved creature from `approved-creature-roster-stats-proposal.csv`.
- Add every approved move from `move-verb-expansion-approved-mechanics.csv`.
- Manually design each new creature's learnset, up to 6 moves.
- Ensure every approved new move appears in at least one creature learnset.
- Reuse existing moves where they are a good thematic or progression fit.
- Avoid adding art or area encounters in this pass.

The result is a richer combat vocabulary pool without changing encounter placement or asset requirements.

## Source Data

Use these files as the authoritative inputs:

- Creature stats: `/Users/michiarohrssen/Documents/Claude/koto-wt-approved-creature-roster-stats/output/approved-creature-roster-stats-proposal.csv`
- Creature readings, meanings, and ranks: `output/roster-expansion-suggestions-master.csv`
- Move mechanics: `output/move-verb-expansion-approved-mechanics.csv`
- Existing creature patterns: `data/creatures.json`
- Existing move schema: `data/moves.json`
- Move rules: `docs/move-system-reference.md`

The creature stats CSV does not carry readings, definitions, or JPDB ranks. Those should be joined from `output/roster-expansion-suggestions-master.csv` by Japanese word first, with English creature name as a sanity check.

## Creature Schema

Creature identity should become name-centric. The legacy vocabulary fields are an old concept and should not be used for new data:

- Remove or stop authoring `baseWord`.
- Remove or stop authoring `baseReading`.
- Remove or stop authoring `baseMeaning`.
- Remove or stop authoring `baseRank`.

Creature templates should use:

- `name`: Japanese display name.
- `nameEn`: English display name.
- `reading`: Japanese reading.
- `meaning`: dictionary-accurate English meaning.
- `rank`: JPDB rank.
- `element`, `rarity`, `archetype`.
- Existing stat-template fields: `baseHp`, `baseAttack`, `baseMp`, `baseDefense`, `baseDex`.
- `learnset`, `stage`, and `createdAt`.

Keep the stat field names as `baseHp`, `baseAttack`, `baseMp`, `baseDefense`, and `baseDex`. In this context, `base` means template stats, not a separate vocabulary identity.

### Consumer Migration

Runtime consumers should read the name-centric fields:

- Creature instantiation should expose `reading`, `meaning`, and `rank` on runtime creatures.
- Entity token creation should use `name`, `reading`, and `meaning`.
- Whack-a-mole creature pool rows should use `name`, `reading`, and `meaning`.
- Tests should stop asserting `baseWord`, `baseReading`, `baseMeaning`, or `baseRank` for creature identity.

For older saved runtime creatures, save sync may tolerate legacy fields as a migration input, but template data should move to the new fields. Compatibility should be transitional, not a reason to keep authoring old fields.

## Move Import

Every row in `move-verb-expansion-approved-mechanics.csv` whose `Human Judgement` starts with `Add` should become one move in `data/moves.json`.

Move IDs should be deterministic and stable:

- Prefer the Japanese reading converted to the existing romanized ID style when it is short and unambiguous.
- If two rows share a reading or collide with an existing move ID, append a short English-name suffix.
- Do not reuse an existing ID for a mechanically different move.

Move fields should map directly from the CSV:

- `name`: Japanese.
- `nameEn`: approved move name.
- `reading`: reading.
- `meaning`: dictionary definition from the CSV.
- `rank`: JPDB rank.
- `element`, `category`, `target`, `power`, `mpCost`.
- `statusEffect`, `statusChance`, `statusDuration`.
- `statChanges` when the CSV contains JSON stat changes.
- `tier`, `description`, `stage`, `createdAt`.

Blank status effects should become `null`. Blank stat changes should be omitted unless the existing move-data validators require an empty object.

## Learnset Design

Each new creature should learn between 4 and 6 moves, capped at 6 total learnset entries. The cap is on authored learnset entries, not active battle slots; the existing battle code keeps only the latest active moves.

### Manual Design Requirement

Learnsets must be authored by a designer thinking creature-by-creature. Do not use an algorithm, scoring script, auto-fill script, "best candidate" loop, or bulk generated assignment to choose moves. Scripts may import approved move/creature rows and may validate the finished authored result, but they must not decide which creature learns which move.

The learnset pass should burn attention liberally. For each new creature, explicitly consider:

- Creature fantasy: what the creature is, how it fights, and what its late identity should feel like.
- Rarity and stats: how much power, utility, and complexity the creature can justify.
- Element: why every non-neutral move belongs, especially if it is off-element.
- Archetype: how the kit expresses Fighter, Mage, Trickster, or Tank/Healer without becoming one-note.
- Vocabulary exposure: whether high-frequency useful verbs can appear earlier without damaging theme or balance.
- Progression feel: how the level 1 move grows into mid-game tools and then a signature late move.

The implementation should include a human-authored design ledger, either as a section in the implementation notes or a separate temporary working document, listing every new creature with its chosen moves and 1-3 sentences of reasoning. That ledger is design evidence; it is not generated output.

Use mixed level patterns so learnsets do not feel copy-pasted:

- 4 moves: `1 / 7 / 16 / 28`
- 5 moves: `1 / 6 / 12 / 20 / 30`
- 5 moves: `1 / 7 / 14 / 22 / 32`
- 6 moves: `1 / 5 / 10 / 16 / 24 / 34`
- 6 moves: `1 / 6 / 12 / 18 / 26 / 36`

Common creatures should usually have 4 or 5 moves. Uncommon creatures should usually have 5 moves. Rare, epic, legendary, and broad-theme creatures can use 6 moves when needed for coverage or identity.

### Level 1 Rules

Every creature must have exactly one move available by level 1.

Level 1 moves must be basic and readable:

- Allowed: straightforward `damage` moves.
- Allowed: basic damage moves with light status riders such as poison, stun, sleep, or confuse if the power and chance are modest.
- Not allowed: `buff`, `debuff`, `heal`, or `cleanse`.
- Not allowed: `drain`, because it heals the user and is too strong for the opening slot.
- Not allowed: multi-target or high-tier moves unless the creature is explicitly designed as a special case, and no approved creature in this expansion should need that exception.

This is stricter than the current data in places and should be enforced for the expanded roster.

### Rarity and Power

Higher-rarity creatures should generally learn stronger moves, but rarity should not override theme completely.

Use this tier guidance:

- Common: mostly tier 1-2, with at most one tier 3 late move.
- Uncommon: tier 1-3, with tier 3 as the normal late cap.
- Rare: tier 1-4, with tier 4 late and used sparingly.
- Epic: tier 1-4, with stronger tier 3-4 late moves and at least one signature-feeling move.
- Legendary: tier 1-4, with the strongest late move assignments and a kit that feels boss-tier.

Strong moves should appear at later levels. Tier 3 moves should usually start around level 16 or later. Tier 4 moves should usually appear around level 28 or later.

### Frequency and Exposure

JPDB rank should influence learn timing:

- High-frequency moves should be preferred earlier when they fit the creature.
- Lower-frequency, dramatic, compound, or idiomatic moves should appear later.
- If two moves are equally thematic and similarly powered, choose the higher-frequency word earlier.

Frequency should not force a non-thematic assignment. It is a tie-breaker and progression tool, not the primary identity rule.

### Element Matching

Creature learnsets should be element-matched or neutral by default:

- Fire creatures: fire and neutral, with off-element only for strong theme.
- Water creatures: water and neutral, with wood/earth only for creature anatomy or control themes.
- Earth creatures: earth and neutral, with wood for animals that bite, claw, bind, or poison.
- Wood creatures: wood and neutral, with earth/metal only for physical anatomy.
- Metal creatures: metal and neutral, with light-like metal moves for celestial or radiant creatures.

Off-element moves are allowed only when the creature fantasy makes the move obvious, such as a snake using wood poison/bind moves despite being earth.

### Archetype Bias

Archetype should bias move category, not rigidly lock it:

- Fighter: direct damage, charge, strike, trample, slash, punch, pierce, and occasional self-buff.
- Mage: ranged, elemental, area, status, cleanse, heal, and team support.
- Trickster: dex manipulation, status, control, lower-power damage with riders, steal, dodge, bind, confuse, poison.
- Tank/Healer: defense buffs, taunt/protect, heals, cleanse, lower-dex control, and heavy body attacks.

Each creature should still have enough damage to function in combat. Support-heavy kits should include at least two damage or drain moves by the end of the learnset.

## Coverage Strategy

Coverage is a constraint on the manual design, not an assignment algorithm. The designer should:

1. Import all approved new moves.
2. Read the full move list and note natural thematic clusters by hand.
3. Manually author each creature's learnset and reasoning, creature by creature.
4. Run validation to find orphan moves, illegal level-1 moves, over-cap learnsets, and unknown IDs.
5. Revisit the authored learnsets by hand to resolve validation failures.
6. Repeat manual review and validation until every imported move has a real thematic home.

Do not solve orphan moves by dumping leftovers onto arbitrary creatures. If a move is difficult to place, pause and think through which creature fantasy can honestly support it, or revise a weaker existing assignment to make room.

The "no orphan moves" rule applies to newly imported approved moves. Existing moves may remain used as they are today, and may be reused in new learnsets where useful.

There are 44 approved creatures and roughly 147 approved new moves, so the 6-move cap leaves enough capacity for coverage. Capacity alone is not enough: each assignment still needs a creature-specific thematic and balance reason.

## Validation

Add or update automated checks so data mistakes are caught quickly:

- Every move ID referenced by any learnset exists in `data/moves.json`.
- Every new approved move appears in at least one creature learnset.
- Every creature has a level 1 learnset entry.
- No creature has more than 6 learnset entries.
- No level 1 move is `buff`, `debuff`, `heal`, `drain`, or cleanse-bearing.
- No level 1 move is tier 3 or 4.
- No creature template is missing `reading`, `meaning`, `rank`, or `baseDex`.
- New creature templates do not author `baseWord`, `baseReading`, `baseMeaning`, or `baseRank`.
- Imported moves conform to `docs/move-system-reference.md`.

Existing tests around older creatures can be migrated to the new identity fields at the same time. If existing old creatures are not fully migrated in the same pass, the validation should distinguish new templates from legacy templates, but the preferred design is to migrate all creature templates together.

## Implementation Shape

This is primarily a data and schema migration task:

- Modify `data/moves.json`.
- Modify `data/creatures.json`.
- Modify creature instantiation and save-sync code to expose name-centric identity fields.
- Modify UI/API consumers that currently read creature `base*` vocabulary fields.
- Modify tests for creature identity and learnset validation.
- Do not modify `data/areas.json`.
- Do not add sprites or background assets.
- Do not change combat engine mechanics unless validation reveals that an approved move uses a field unsupported by the already-approved move system reference.

If implementation discovers a required mechanics gap, stop and report it before adding new combat behavior. This task is meant to wire approved data into the existing move mechanics engine, not silently expand the engine.

## Acceptance Criteria

The work is complete when:

- All approved creatures are present in `data/creatures.json`.
- All approved moves are present in `data/moves.json`.
- Every approved new move is used by at least one creature.
- Every new creature has 4-6 learnset entries and exactly one level 1 move.
- No new creature is placed in an area.
- No new art is required for tests or runtime loading.
- Creature identity uses `name`, `nameEn`, `reading`, `meaning`, and `rank` rather than old `base*` vocabulary fields.
- Unit tests and relevant data validation pass.
