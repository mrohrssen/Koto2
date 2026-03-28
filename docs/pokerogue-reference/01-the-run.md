# The Run — PokeRogue Mechanics Reference

> Source: /home/ubuntu/Pokerogue (commit: 505bcff2452)
> Generated: 2026-03-28

## Overview

A "run" in PokeRogue is a roguelike session where the player progresses through a series of waves (battles), each set in a biome with its own species pool. Every 10 waves is a boss fight, followed by a healing + shop phase. The biome changes at these 10-wave boundaries, following a directed graph of biome connections.

Five game modes exist: Classic (200 waves, story bosses, the "main" mode), Endless (infinite waves), Spliced Endless (endless with fused Pokemon), Daily (50-wave seed-based speedrun), and Challenge (Classic with self-imposed restrictions). Each mode shares the same wave/boss framework but differs in wave count, difficulty scaling, shop availability, and win conditions.

The run's difficulty curve is controlled by three interlocking systems: enemy level scaling (quadratic formula based on wave number), a dynamic level cap (prevents overleveling), and biome-specific species pools (controls what you fight and can catch).

## Table of Contents

- [Game Modes](#game-modes)
- [Wave Structure & Boss Schedule](#wave-structure--boss-schedule)
- [Fixed Battle Schedule (Classic Mode)](#fixed-battle-schedule-classic-mode)
- [Enemy Level Scaling](#enemy-level-scaling)
- [Level Cap](#level-cap)
- [EXP Distribution](#exp-distribution)
- [EXP Growth Curves](#exp-growth-curves)
- [Biome Progression](#biome-progression)
- [Biome Species Pools](#biome-species-pools)
- [Boss Encounters](#boss-encounters)
- [Mystery Encounter Spawning](#mystery-encounter-spawning)
- [Starting Configuration](#starting-configuration)
- [Win/Loss Conditions](#winloss-conditions)
- [Challenge System](#challenge-system)
- [Score Calculation](#score-calculation)

---

## Game Modes

PokeRogue has five game modes that share the same combat engine but differ in run length, starting conditions, and rules.

**Key values:**

| Mode | ID | Start Level | Start Money | Waves | Shop | Biome Path | Mystery Encounters |
|------|----|-------------|-------------|-------|------|------------|--------------------|
| Classic | 0 | 5 | 1000 | 200 | Yes | Fixed story path | Yes (waves 10-180) |
| Endless | 1 | 5 | 1000 | Infinite | Yes | Random | No |
| Spliced Endless | 2 | 5 | 1000 | Infinite | Yes | Random (fused only) | No |
| Daily | 3 | 20 | Seed-based | 50 | No | Seed-based | No |
| Challenge | 4 | 5 | 1000 | 200 | Yes | Fixed story path | Yes (waves 10-180) |

Daily mode has a unique difficulty modifier: the effective wave for enemy scaling is `wave + 30 + floor(wave / 5)`, making enemies significantly tougher than they appear. A wave 30 daily fight has the difficulty of roughly wave 66 in Classic.

**Koto Relevance:** High — Koto's run system maps directly to this. Classic is the primary template; Daily is a good model for short sessions.

*(source: `enums/game-modes.ts:1-7`, `game-mode.ts:131-190`, `game-mode.ts:463-502`)*

---

## Wave Structure & Boss Schedule

Waves are the fundamental unit of progression. The game uses a repeating 10-wave cycle that creates a consistent rhythm of regular fights, boss fights, and rest stops.

**How it works:**

- **Regular waves (X2-X9):** Wild encounters or trainer battles
- **Boss waves (X0):** Stronger enemies from the boss species pool, higher rewards
- **Boundary waves (X1):** First wave of a new biome; trainers are suppressed here to avoid sprite conflicts during biome transitions
- **Heal + Shop:** After completing a boss wave (X0), before the next biome starts (X1), the player heals and selects modifier rewards

This creates a 10-wave "heartbeat": 9 fights of increasing tension, a boss climax, then a breather with healing and loot.

**Key values:**

| Wave Type | Condition | Notes |
|-----------|-----------|-------|
| Regular | `wave % 10` is 2-9 | Normal encounters |
| Boss | `wave % 10 == 0` | Boss-tier enemies, level x1.2 |
| Boundary | `wave % 10 == 1` | No trainers, biome transition |
| Heal/Shop | After X0, before X1 | Full party heal + modifier selection |
| Endless minor boss | `wave % 250 == 0` | Endless mode milestone |
| Endless major boss | `wave % 1000 == 0` | Endless mode major milestone |

**Koto Relevance:** High — The 10-wave cycle is directly portable. The boss-every-10 rhythm with a rest stop after is well-proven pacing.

*(source: `game-mode.ts:285-310`, `game-mode.ts:308-344`)*

---

## Fixed Battle Schedule (Classic Mode)

Classic and Challenge modes have pre-scripted story battles at specific waves — rivals, gym leaders, evil teams, Elite Four, and the Champion. These replace the normal random encounters.

**How it works:**

Fixed battles are stored in a lookup table keyed by wave number. When the game reaches a fixed-battle wave, it loads that trainer config instead of generating a random encounter.

**Key values:**

| Wave | Encounter | Type |
|------|-----------|------|
| 5 | Town Youngster | Intro |
| 8 | Rival 1 | Story |
| 25 | Rival 2 | Story |
| 35 | Evil Grunt 1 | Team |
| 55 | Rival 3 | Story |
| 62-64 | Evil Grunts 2-3 | Team |
| 66 | Evil Admin 1 | Team |
| 95 | Rival 4 | Story |
| 112 | Evil Grunt 4 | Team |
| 114 | Evil Admin 2 | Team |
| 115 | Evil Boss 1 | Team |
| 145 | Rival 5 | Story |
| 164 | Evil Admin 3 | Team |
| 165 | Evil Boss 2 | Team |
| 182 | Elite Four 1 | Elite |
| 184 | Elite Four 2 | Elite |
| 186 | Elite Four 3 | Elite |
| 188 | Elite Four 4 | Elite |
| 190 | Champion | Final |
| 195 | Rival 6 | Post-game |

The final boss at wave 200 is Eternamax Eternatus — a scripted encounter with special music and cutscenes.

**Interactions:** Challenges can override or add fixed battles. A random offset (`offsetGym`) shifts some trainer waves by +10 for variety between runs.

**Koto Relevance:** High — Story-beat placement at specific waves is directly portable to Koto's NPC/boss encounters.

*(source: `enums/fixed-boss-waves.ts:1-23`, `game-mode.ts:351-370`)*

---

## Enemy Level Scaling

Enemy levels follow a quadratic curve that accelerates difficulty as the run progresses, with bosses getting a 20% level boost.

**How it works:**

```
difficultyWave = wave                              (Classic/Endless/Challenge)
difficultyWave = wave + 30 + floor(wave / 5)       (Daily)

baseLevel = 1 + (difficultyWave / 2) + (difficultyWave / 25)^2
```

For boss waves, multiply by 1.2:
```
bossLevel = baseLevel * 1.2
```

A random offset is applied: bosses get a small variance based on `wave / 10`, non-bosses get a Gaussian distribution with deviation `10 / wave`.

The final boss (wave 200 Classic) has no random offset and is rounded to the nearest multiple of 25.

**Example values:**

| Wave | Difficulty Wave | Base Level | Boss Level (x1.2) |
|------|----------------|------------|-------------------|
| 10 | 10 | 6 | 7 |
| 20 | 20 | 12 | 14 |
| 50 | 50 | 29 | 35 |
| 100 | 100 | 67 | 80 |
| 150 | 150 | 112 | 134 |
| 200 | 200 | 165 | 198 |

The quadratic term `(wave/25)^2` means early waves feel linear but late-game scaling accelerates sharply. Wave 50 adds only +4 from the quadratic, but wave 200 adds +64.

**Koto Relevance:** High — This formula is directly portable. The quadratic curve is elegant and well-balanced.

*(source: `battle.ts:127-150`, `game-mode.ts:192-199`)*

---

## Level Cap

A dynamic level cap prevents the player from overleveling. It's always slightly above the current boss level, giving the player a small but consistent edge.

**How it works:**

```
waveForCalc = ceil(currentWave / 10) * 10
difficultyWave = gameMode.getWaveForDifficulty(waveForCalc)
baseLevel = (1 + difficultyWave/2 + (difficultyWave/25)^2) * 1.2
levelCap = ceil(baseLevel / 2) * 2 + 2
```

In plain English: take the boss level for the current 10-wave block, round up to the nearest even number, add 2. The player can be ~2 levels above the boss but no more.

**Example progression:**

| Wave Range | Boss Level | Level Cap | Player Edge |
|------------|-----------|-----------|-------------|
| 1-10 | 7 | 6 | -1 (early game is tight) |
| 11-20 | 13 | 8 | -5 |
| 51-60 | 35 | 22 | -13 |
| 91-100 | 80 | 41 | -39 |
| 191-200 | 198 | 63 | -135 |

Note: The level cap is quite restrictive — at later waves, the boss is significantly higher level than the cap allows the player to be. This forces reliance on items/modifiers and smart play rather than raw levels.

When the wave crosses a 10-wave boundary and the cap increases, a `LevelCapPhase` notification shows the new cap to the player.

**Koto Relevance:** High — Level caps prevent grinding cheese and force engagement with other systems (items, type matchups).

*(source: `battle-scene.ts` (getMaxExpLevel), `phases/level-cap-phase.ts:1-26`)*

---

## EXP Distribution

When an enemy faints, EXP is calculated and distributed among participating and non-participating party members.

**How it works:**

1. **Base EXP from the defeated enemy:**
```
baseExp = (enemySpecies.baseExp * enemyLevel) / 5 + 1
```

2. **Battle type multiplier:**

| Battle Type | Multiplier |
|-------------|-----------|
| Wild | x1.0 |
| Trainer | x1.5 |
| Mystery Encounter | x1.5 (customizable) |

3. **Distribution among participants:**
```
perPokemon = baseExp / numberOfParticipants
```

4. **Non-participants with ExpShare:**
```
expShareBonus = (baseExp / numberOfParticipants) * (expShareStacks * 0.2)
```

5. **Per-Pokemon modifiers (applied in order):**

| Modifier | Effect |
|----------|--------|
| Pokerus | x1.5 |
| EXP Booster item | x(1 + stacks * 0.1) |

6. **EXP Balance modifier (optional):** If the player has an EXP Balancer, it redistributes EXP to favor underleveled party members:
   - Finds the median level of EXP-eligible members
   - Members below median share a pool equally
   - Members above median get 0 from the balance pool
   - Blend rate: `0.2 * stackCount` toward the balanced distribution

Pokemon at or above the level cap receive no EXP.

**Koto Relevance:** High — The participant/non-participant split with ExpShare is a good model for party-wide progression.

*(source: `battle-scene.ts` (applyPartyExp ~lines 2000-2100), `field/pokemon.ts` (getExpValue))*

---

## EXP Growth Curves

Six growth curves determine how much total EXP is needed to reach each level. Each species is assigned one curve.

**How it works:**

| Curve | Level 50 EXP | Level 100 EXP | Character |
|-------|-------------|---------------|-----------|
| Erratic | 131,324 | 600,000 | Fast early, slow late |
| Fast | 106,120 | 800,000 | Consistently fast |
| Medium Fast | 125,000 | 1,000,000 | The "standard" curve |
| Medium Slow | 125,126 | 1,059,860 | Slow early, catches up |
| Slow | 156,250 | 1,250,000 | Consistently slow |
| Fluctuating | 151,222 | 1,640,000 | Slow overall |

**Formulas (at level 100):**

```
Erratic:       (level^4 + level^3 * 2000) / 3500
Fast:          level^3 * 4/5
Medium Fast:   level^3
Medium Slow:   level^3 * 6/5 - 15*level^2 + 100*level - 140
Slow:          level^3 * 5/4
Fluctuating:   level^3 * (level/2 + 8) * 4 / (100 + level)
```

For non-Medium-Fast curves at level 100, the game interpolates:
```
totalExp = floor(speciesCurve * 0.325 + mediumFast * 0.675)
```

This prevents extreme curves from making species feel too different at high levels.

**Koto Relevance:** Medium — Growth curves add species differentiation. Could simplify to 2-3 curves for Koto.

*(source: `data/exp.ts:1-126`)*

---

## Biome Progression

Every 10 waves, the biome changes. Biomes are connected in a directed graph — each biome has a list of possible next biomes, some with weighted probability.

**How it works:**

1. After a boss wave (X0), the game looks up the current biome's `biomeLinks`
2. Each link is either a direct connection or a weighted connection `[biome, probability_denominator]`
3. For weighted links: the biome is eligible if `random(0, denominator) == 0`
4. The player moves to the selected biome (or a random eligible one)
5. If the player has a Map Modifier item, they can manually choose from available links

**Special cases:**
- **Classic wave 190+:** Forces the END biome for the final boss stretch
- **Endless every 50 waves:** Forces the END biome
- **Daily:** Biome path is deterministic based on the daily seed
- **Endless/Spliced Endless:** Biome is randomly selected (no graph)

There are 30+ biomes total (Town, Plains, Grass, Forest, Cave, Desert, Volcano, etc.), each with unique species pools, weather tendencies, and visual themes.

**Koto Relevance:** High — The biome graph with weighted connections is a great model for Koto's area progression. The Map Modifier giving player agency is a nice touch.

*(source: `phases/select-biome-phase.ts:1-115`, `init/init-biome-depths.ts:1-41`, `game-mode.ts:286-303`)*

---

## Biome Species Pools

Each biome has a stratified species pool with rarity tiers and time-of-day modifiers. This controls what wild Pokemon and bosses appear.

**How it works:**

Each biome defines species for 9 pool tiers, each with 4 time-of-day variants (Dawn, Day, Dusk, Night) plus an "All" category.

**Wild encounter tier probabilities (512 possible values):**

| Tier | Range | Probability |
|------|-------|-------------|
| Common | 156-511 | 69.5% |
| Uncommon | 32-155 | 24.2% |
| Rare | 6-31 | 5.1% |
| Super Rare | 1-5 | 1.0% |
| Ultra Rare | 0 | 0.2% |

**Boss encounter tier probabilities (64 possible values):**

| Tier | Range | Probability |
|------|-------|-------------|
| Boss | 20-63 | 68.8% |
| Boss Rare | 6-19 | 21.9% |
| Boss Super Rare | 1-5 | 7.8% |
| Boss Ultra Rare | 0 | 1.6% |

**Example (Grass biome):**
- Common (Day): Hoppip, Silcoon
- Uncommon (Day): Sunkern, Combee
- Rare (All): Bulbasaur, Growlithe, Turtwig, Bonsly
- Boss (All): Miltank, Scolipede, Whimsicott, Lilligant
- Boss Rare (All): Venusaur, Arcanine, Sudowoodo, Torterra

**Koto Relevance:** High — The tiered pool system with time-of-day variation is directly portable. The probability breakpoints are well-tuned.

*(source: `field/arena.ts:181-222`, `data/balance/biomes/grass.ts`, `data/balance/biomes/volcano.ts`, `data/balance/biomes/end.ts`)*

---

## Boss Encounters

Boss-wave enemies are drawn from the boss species pool and can have multi-segment health bars that require multiple "kills" to fully defeat.

**How it works:**

1. Boss detection: `wave % 10 == 0`
2. Species drawn from the boss tier pool (see Biome Species Pools)
3. Level multiplied by 1.2 over the base wave level
4. Boss health is divided into segments — each segment must be depleted before the next becomes vulnerable
5. Segment count scales with the enemy's base stat total (BST) and wave number
6. In double battles, segments are reduced: `segments = ceil(segments * thisBST / totalBST)`

**Special boss encounters:**

| Wave | Mode | Boss | Notes |
|------|------|------|-------|
| 200 | Classic | Eternamax Eternatus | Final boss, special form |
| 250 | Endless | Eternatus (normal form) | Milestone boss |
| 1000+ | Endless | Eternatus (Eternamax) | Major milestone |
| Any 50th | Endless | END biome forced | Mini-boss cycle |

The Classic final boss at wave 200 is always a randomized legendary with perfect IVs (BST >= 600, excluding Eternatus and Arceus).

**Koto Relevance:** High — Multi-segment boss HP is a great mechanic for making boss fights feel epic without just inflating numbers.

*(source: `game-mode.ts:308-344`, `battle.ts:127-150`, `phases/encounter-phase.ts:109-200`)*

---

## Mystery Encounter Spawning

Mystery encounters are special random events that appear between regular waves. A "pity" system ensures they appear at a consistent rate regardless of luck.

**How it works:**

The system uses a rolling weight that increases each time a mystery encounter fails to spawn:

```
BASE_WEIGHT = 3
MAX_WEIGHT = 256
WEIGHT_INCREMENT_ON_MISS = 3

Each eligible wave:
  spawnChance = currentWeight / 256
  if spawn succeeds: reset weight to BASE_WEIGHT
  if spawn fails: weight += WEIGHT_INCREMENT_ON_MISS
```

An anti-variance system targets 12 encounters per Classic run (~1 every 16.7 waves):
```
TARGET_PER_RUN = 12
ANTI_VARIANCE_MODIFIER = 15

adjustment = (expectedCount - actualCount) * ANTI_VARIANCE_MODIFIER / 256
weight += adjustment
```

If you've been unlucky, the weight increases faster. If you've been lucky, it slows down.

**Wave ranges where mystery encounters can appear:**

| Mode | Range |
|------|-------|
| Classic | Waves 10-180 |
| Challenge | Waves 10-180 |
| Daily | None |
| Endless | None |

**Koto Relevance:** Medium — The pity/anti-variance system for random event frequency is a clean design worth adapting.

*(source: `constants.ts:15-96`, `game-mode.ts:421-433`)*

---

## Starting Configuration

Every run begins with fixed parameters that vary by game mode.

**How it works:**

| Parameter | Classic | Endless | Daily | Challenge |
|-----------|---------|---------|-------|-----------|
| Starting wave | 1 | 1 | 1 | 1 |
| Starting level | 5 | 5 | 20 | 5 |
| Starting money | 1000 | 1000 | Seed-based | 1000 |
| Starting biome | Town | Random | Seed-based | Town |
| Party size | 1-6 (player choice) | 1-6 | 3 (seed-based) | 1-6 |

The player selects their starting party from unlocked starters, spending from a point budget (default 10 points). Higher-rarity starters cost more points. See the Party Building doc for starter cost details.

A random `offsetGym` flag is set at run start, which shifts certain trainer wave positions by +10 for variety between runs.

**Koto Relevance:** High — Starting conditions directly map to Koto's run initialization.

*(source: `game-mode.ts:131-190`, `starting-wave.ts:1-3`)*

---

## Win/Loss Conditions

**Victory conditions by mode:**

| Mode | Win Condition | Score Bonus |
|------|--------------|-------------|
| Classic | Defeat Eternatus at wave 200 | +5,000 |
| Challenge | Defeat Eternatus at wave 200 | +5,000 |
| Daily | Clear wave 50 boss | +2,500 |
| Endless | Optional milestones at 250, 500, 750, 1000 | +0 |

**Defeat:** The entire player party faints. Some mystery encounters have special loss conditions that can override this.

**On defeat:**
- Game over screen with score summary
- Retry option available if enabled
- Session save persists for post-mortem

**Failsafe:** If the wave somehow exceeds 200 in Classic mode, the game forces a victory.

**Koto Relevance:** High — Victory conditions define the run's purpose. Classic's wave 200 target is a good template.

*(source: `phases/game-over-phase.ts:33-200`, `phases/end-card-phase.ts:1-52`, `game-mode.ts:291-302`)*

---

## Challenge System

Challenges are optional modifiers that make Classic runs harder in specific ways. Each challenge has a severity level (1-3) and awards ribbons on completion.

**How it works:**

Challenges hook into the game at specific points via application functions:

| Hook | What It Modifies |
|------|-----------------|
| `applyStarterChoice` | Restricts available starters |
| `applyPokemonInBattle` | Validates party legality mid-run |
| `applyLevelChange` | Modifies enemy level scaling |
| `applyFixedBattle` | Overrides specific trainer configs |
| `applyPartyHeal` | Can disable automatic healing |
| `applyShop` | Can disable the shop entirely |

**Known challenge types:**

| Challenge | Effect |
|-----------|--------|
| Fresh Start | No held items or item drops |
| Single Generation | Only Pokemon from one generation |
| Nuzlocke | Permanent death on faint |
| Passives Disabled | Passive abilities don't activate |
| Level Scaling | Enemies scale faster |
| Splash Only | Can only use the move Splash |

**Koto Relevance:** Medium — Challenge modifiers add replayability. The hook-based architecture is clean and extensible.

*(source: `data/challenge.ts:42-446`)*

---

## Score Calculation

Each run tracks a score based on battle performance. Score rewards fast, efficient play.

**How it works:**

```
battleScore = sum of enemy party BST values

turnMultiplier = sineEaseOut(1 - min(turns - 2, 10 * partyMult) / (10 * partyMult))

if doubleBattle: battleScore /= 1.5

finalBattleScore = floor(battleScore * turnMultiplier)
```

The turn multiplier rewards finishing battles quickly — fewer turns = higher multiplier. The sine ease-out curve means the first few extra turns barely matter, but dragging a fight out tanks the score.

**Clear bonuses:**

| Mode | Bonus |
|------|-------|
| Classic | +5,000 |
| Challenge | +5,000 |
| Daily | +2,500 |
| Endless | +0 |

**Koto Relevance:** Low — Score is cosmetic. Could adapt for leaderboards but not core gameplay.

*(source: `battle.ts:215-235`, `game-mode.ts:382-392`)*
