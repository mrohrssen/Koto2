# PokeRogue Feature Analysis & NEO TOKYO Roadmap

> Comprehensive analysis of [PokeRogue](https://github.com/pagefaultgames/pokerogue) features mapped against NEO TOKYO: System Liberation, with a prioritized development roadmap.

---

## 1. PokeRogue Complete Feature Analysis

### 1.1 Core Architecture

| Aspect | Details |
|--------|---------|
| **Framework** | Phaser 3 (2D game framework), TypeScript |
| **Build** | Vite, pnpm workspace |
| **Rendering** | Canvas/WebGL via Phaser |
| **State** | Scene-based architecture with phase queue system |
| **Saves** | localStorage + cloud sync to server |
| **Localization** | 20+ languages via i18n system |
| **Testing** | Vitest unit tests |

### 1.2 Game Modes

**Classic Mode (Default)**
- 200 waves to completion, boss every 10 waves
- Max starter cost: 10 points
- Gym leaders at waves 20/30, then every 30 waves (6 total)
- Elite Four at wave 180, Champion at wave 200
- Beating Classic unlocks Endless, Spliced Endless, and Challenge modes

**Endless Mode (Unlockable)**
- Infinite waves, no victory condition
- Max starter cost raised to 15
- Difficulty scales indefinitely
- Every 50 waves grants a "token" (permanent enemy buff or player debuff)
- Leaderboard based on waves survived

**Spliced Endless Mode (Unlockable)**
- Unlocked by beating Classic with a fused Pokemon in party
- ALL Pokemon (yours and enemies) are randomly fused
- Visual chaos + strategic depth from unpredictable type combos

**Daily Run**
- Seeded run -- same challenge for all players that day
- Preset starters (not player-chosen)
- First completion each day awards Egg Voucher Premium
- Leaderboard rankings per day

**Challenge Mode (Unlockable)**
- Modifier system on top of Classic structure
- **Mono Gen**: Restrict to a single generation (1-9)
- **Mono Type**: Restrict to a single type
- **Fresh Start**: All starter unlocks stripped
- **Stackable**: Can combine challenges

### 1.3 Wave and Encounter System

- Waves 1-9: Wild encounters. Wave 10: Boss. Wave 20: First Gym Leader.
- Boss every 10th wave, Gym Leader every ~30 waves
- Waves 180-200: Elite Four + Champion gauntlet
- Encounter types: Wild, Double wild, Trainer (33% double), Gym Leader, E4, Champion
- Day/Night cycle (40 waves = 1 day): Day, Dusk, Night, Dawn -- affects spawns

### 1.4 Biome System

- **35+ unique biomes**: Town, Plains, Forest, Swamp, Beach, Lake, Sea, Mountain, Cave, Desert, Ice Cave, Meadow, Power Plant, Graveyard, Dojo, Factory, Ruins, Jungle, Fairy Cave, Temple, Slum, Snowy Forest, Island, Wasteland, Abyss, Space, Laboratory, End, and more
- Each biome has unique background art, Pokemon pool (tier-based), trainer pool
- Biome transitions create branching paths
- Weather defaults per biome (Desert = Sandstorm, Ice Cave = Hail)
- Time-of-day spawn variants

### 1.5 Combat System

**Turn Structure**: Speed-based, Fight/Switch/Item/Run, double battles (2v2)

**Moves**: 900+ moves, Physical/Special/Status, PP system, 18-type effectiveness, STAB 1.5x

**Abilities**: 200+ abilities, standard + hidden, triggers on entry/weather/status/HP/moves

**Status Effects**:
- Primary: Burn, Freeze, Paralysis, Poison, Bad Poison, Sleep
- Volatile: Confusion, Infatuation, Taunt, Encore, Disable
- Entry hazards: Stealth Rock, Spikes, Toxic Spikes, Sticky Web
- Screens: Reflect, Light Screen, Aurora Veil

**Weather**: Sun (Fire+50%), Rain (Water+50%), Sandstorm, Hail/Snow, Fog (-10% acc), Extreme weather (ability-only)

**Terrain**: Electric (+30%, no Sleep), Grassy (+30%, HP regen), Misty (Dragon-50%, no status), Psychic (+30%, no priority)

### 1.6 Pokemon and Species System

- 1000+ Pokemon (Gens 1-9), full base stats, dual typing
- IVs (0-31), Nature (+/-10%), EVs, Level 1-100
- Evolution: level-up, item, trade, friendship, Mega, form changes
- **Fusion** (unique): DNA Splicer merges 2 Pokemon -- stats averaged, types combined (Primary type1 + Secondary type2), movepools merged, each half evolves independently, unsplicing loses the sacrifice
- **Shiny**: 1/4096 base, 3 variants per Pokemon, gacha boosts to 1/64

### 1.7 Item and Modifier System

- Free item roulette after each non-boss battle, items stack
- **Rarity**: Common/Great/Ultra/Rogue/Master
- **Categories**: Healing, Stat Boosters (+10%/stack), Held Items (Berry Pouch, Focus Band, Leftovers, Shell Bell, Lucky Egg), Rare Candy, TMs, Pokeballs, DNA Splicer, Money items
- Endless Mode: Permanent tokens every 50 waves
- Shop with rerolls, rarity-scaled costs

### 1.8 Starter and Meta-Progression

- Choose up to 6 Pokemon, cost-budgeted (10 Classic / 15 Endless)
- Customize: Nature, Ability, Gender, Form, Shiny, Moveset
- Catches/hatches permanently unlock starters with best-trait transfer
- **Candy**: Per-species currency for passive abilities, egg purchases, upgrades
- **Egg Gacha**: 4 voucher tiers, 5 egg tiers, 3 gacha machines (Standard, Move UP!, Shiny UP!)
- Hatched Pokemon come with egg moves (3 common + 1 rare)
- **Pokedex**: Full collection tracker with filters and completion %
- **Achievements/Ribbons**: Milestone-based, challenge-specific

### 1.9 Save, Account, and Social

- System Save (persistent) + Session Save (per-run)
- Cloud sync, cross-device play
- Leaderboards: Classic, Endless, Daily
- Timed/seasonal events
- Touch controls, keyboard (customizable), gamepad

---

## 2. NEO TOKYO Current State

### Game Loop
- Ward-based exploration through Tokyo districts (5 tiers, 7 floors, 8-11 rooms/floor)
- Room types: encounter, shrine, quiz, wordDiscovery, dealer, boss
- Branching paths with Chippy door hints

### Combat (Two Modes)
- **Chip Combat**: Vocab-pause turn-based, Balatro-style pipeline damage
- **Robot Combat**: Party-based (3+3), 5 elements (wood/earth/water/fire/metal), befriending

### Robot System
- Befriend at <=50% HP via AI dialogue (3-question conversation)
- 5 elements with advantage cycle, rarity tiers, XP/leveling
- Persistent collection across runs, point-budget team selection

### Chip System (Unique)
- Pipeline damage (left-to-right), 5 rarity tiers, 10+ effect types
- Charged skill system (activate after N combat cycles)

### Vocabulary Learning (Unique)
- JPDB integration, speed review flashcards, vocab-pause combat
- Door hints filtered to known vocabulary, per-user caches

### AI Narration (Unique)
- DM with memory, Chippy/SYSTEM personalities, sensory rotation, VOICEVOX TTS

### Meta-Progression
- Essence currency, 4 upgrade tracks, 6 achievements, lifetime stats, robot collection

### Enemies
- 60+ templates (4 tiers), 7 floor bosses + final boss
- Special abilities, multi-phase patterns, personality dialogue

---

## 3. Gap Analysis

### What PokeRogue Has That We Don't

| Feature | Gap Size | Notes |
|---------|----------|-------|
| Multiple Game Modes (5) | **LARGE** | We have 1 mode |
| Fusion System | **LARGE** | No equivalent |
| Egg/Gacha Progression | **LARGE** | No equivalent |
| Biome Variety (35+) | **MEDIUM** | We have 5-tier wards |
| Item Stacking/Roulette | **MEDIUM** | Our chip drops are simpler |
| Per-Species Candy | **MEDIUM** | We have global essence only |
| Daily Seeded Runs | **MEDIUM** | No equivalent |
| Challenge Modifiers | **MEDIUM** | No equivalent |
| Weather/Terrain | **MEDIUM** | No equivalent |
| Status Effect Depth | **MEDIUM** | Basic enemy abilities only |
| Collection UI Quality | **MEDIUM** | Basic catalog |
| Animation Quality | **MEDIUM** | CSS vs Phaser |
| Leaderboard Depth | **SMALL** | Basic version exists |
| Cloud Saves | **SMALL** | Auth exists, no cloud sync |

### What We Have That PokeRogue Doesn't

| Feature | Advantage |
|---------|-----------|
| Japanese Vocab Learning | Completely unique educational core loop |
| AI-Driven Narration | Dynamic storytelling with memory |
| Text-to-Speech (VOICEVOX) | Voice acting for Japanese text |
| Chippy Companion | AI companion with personality |
| Chip Pipeline (Balatro-style) | More strategic than held items |
| Befriend Dialogue | Mini-game capture more engaging than Pokeball |
| Cultural Theming | Tokyo cyberpunk aesthetic |

---

## 4. Prioritized Roadmap

### Phase 0: Foundation and Polish (~2 weeks)
*Impact: HIGH | Effort: LOW-MEDIUM | Prerequisite for everything else*

- [ ] Polish robot combat balance across all 7 floors
- [ ] Improve collection UI (grid, filters, stats comparison)
- [ ] Add unique visual themes per ward
- [ ] Fix flaky tests (target 66/66)

### Phase 1: Endless Mode (~2-3 weeks)
*Impact: HIGH | Effort: MEDIUM | Biggest retention lever*

- [ ] Infinite ward exploration after clearing 7 floors with scaling difficulty
- [ ] Difficulty tokens every N floors (permanent enemy buffs)
- [ ] Endless leaderboard (highest floor reached)
- [ ] Unlock gate (requires 1 Classic clear)

### Phase 2: Daily Seeded Runs (~1-2 weeks)
*Impact: HIGH | Effort: MEDIUM | Social + competitive hook*

- [ ] Daily seed (same wards/enemies/rooms for all players)
- [ ] Fixed starter robots (preset team)
- [ ] Daily leaderboard and rewards (bonus essence, exclusive unlock progress)
- [ ] Vocab seed (same words for all players that day)

### Phase 3: Robot Fusion (~3-4 weeks)
*Impact: HIGH | Effort: HIGH | Signature feature potential*

- [ ] Circuit Splicer item: stats averaged, dual-element, combined skills, sprite mashup
- [ ] Dual-element system for fused robots
- [ ] Unsplice mechanic (secondary robot lost)
- [ ] Fusion collection tracker
- [ ] Spliced Endless Mode (all robots randomly fused)

### Phase 4: Egg/Hatching System (~2-3 weeks)
*Impact: MEDIUM-HIGH | Effort: MEDIUM | Meta-progression depth*

- [ ] Robot eggs from bosses/achievements/essence
- [ ] Egg tiers (Common/Rare/Epic/Legendary) mapped to robot rarity
- [ ] Hatch after N rooms explored (incubator slots: 1-3 per run)
- [ ] Egg-exclusive skills for hatched robots
- [ ] Duplicate candy from hatching owned robots

### Phase 5: Challenge Modes (~2 weeks)
*Impact: MEDIUM | Effort: LOW-MEDIUM | Replayability multiplier*

- [ ] Mono-Element, Chipless, Robotless, Fresh Start, Vocab Hard Mode
- [ ] Stackable challenges
- [ ] Challenge rewards (skins, ribbons, essence multipliers)

### Phase 6: Weather and Environmental Effects (~2-3 weeks)
*Impact: MEDIUM | Effort: MEDIUM*

- [ ] Ward weather (Neon Storm, Data Fog, Heat Wave, Digital Rain, Null Zone)
- [ ] Room-specific terrain bonuses
- [ ] Robot abilities that set weather on entry

### Phase 7: Status Effects (~2-3 weeks)
*Impact: MEDIUM | Effort: MEDIUM*

- [ ] Burn (-ATK, DoT), Freeze (skip chance), Shock (-Speed), Corrode (-DEF, DoT), Glitch (random)
- [ ] Chip and robot skill status infliction/curing
- [ ] Element-based resistance, status cure items

### Phase 8: Enhanced Ward System (~3-4 weeks)
*Impact: MEDIUM | Effort: HIGH*

- [ ] Ward-specific enemy pools and room types
- [ ] Ward boss theming, secret wards with unique robots
- [ ] Ward completion map, environmental art per ward

### Phase 9: Candy and Per-Robot Upgrades (~2 weeks)
*Impact: MEDIUM | Effort: LOW-MEDIUM*

- [ ] Per-species candy from duplicates
- [ ] Passive ability unlock, stat boosts, alternate ultimates, visual variants

### Phase 10: Animation Polish (Ongoing)
*Impact: MEDIUM | Effort: HIGH*

- [ ] Attack animations, floating damage numbers, screen shake
- [ ] Transition animations, particle effects, victory/defeat cinematics

---

## Priority Matrix

| Phase | Impact | Effort | Score |
|-------|--------|--------|-------|
| Phase 0: Polish | HIGH | LOW | 10/10 |
| Phase 1: Endless | HIGH | MED | 9/10 |
| Phase 2: Daily Runs | HIGH | MED | 9/10 |
| Phase 3: Fusion | HIGH | HIGH | 8/10 |
| Phase 5: Challenges | MED | LOW | 8/10 |
| Phase 4: Eggs | MED-HIGH | MED | 7/10 |
| Phase 7: Status Effects | MED | MED | 7/10 |
| Phase 6: Weather | MED | MED | 6/10 |
| Phase 9: Candy | MED | LOW | 6/10 |
| Phase 8: Wards | MED | HIGH | 5/10 |
| Phase 10: Animations | MED | HIGH | 5/10 |

---

## Key Takeaways

**What makes PokeRogue addictive**: Multiple game modes, deep meta-progression, daily runs, item roulette micro-rewards, fusion emergent strategy, egg gacha collection goals.

**NEO TOKYO's advantages**: Vocabulary learning (unique), AI narration (dynamic), chip pipeline (Balatro-style), cultural theming (Tokyo cyberpunk), befriend dialogue (engaging capture).

**Strategic recommendations**:
1. **Prioritize modes over content** -- Endless + Daily + Challenges multiply existing content
2. **Lean into AI** as a differentiator, not just a feature
3. **Robot fusion with dual elements** could be the signature mechanic
4. **Keep 5 elements simple** -- don't copy the 18-type chart
5. **Eggs before candy** -- excitement before grind

---

## Sources

- [PokeRogue GitHub](https://github.com/pagefaultgames/pokerogue)
- [PokeRogue Wiki](https://wiki.pokerogue.net/)
- [PokeRogue DeepWiki](https://deepwiki.com/pagefaultgames/pokerogue)
- [PokeRogue Guide](https://pokerogue.cc/blogs/faq-and-comprehensive-guide)
- [PokeRogue Modes](https://wiki.pokerogue.net/gameplay:modes)
- [PokeRogue Fusion](https://wiki.pokerogue.net/gameplay:mechanics:fusion)
- [PokeRogue Weather](https://wiki.pokerogue.net/gameplay:mechanics:weather)
- [PokeRogue Eggs](https://wiki.pokerogue.net/gameplay:eggs)
- [PokeRogue Challenges](https://wiki.pokerogue.net/gameplay:modes:challenges)
- [PokeRogue Items](https://wiki.pokerogue.net/gameplay:items)
