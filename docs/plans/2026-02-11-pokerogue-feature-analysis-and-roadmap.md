# PokeRogue Feature Analysis & NEO TOKYO Roadmap

> **Purpose:** Comprehensive analysis of PokeRogue's systems, gap analysis against NEO TOKYO: System Liberation, and a prioritized phased roadmap for future development.
>
> **Sources:** PokeRogue source code (`pagefaultgames/pokerogue` v1.11.6), [PokeRogue Wiki](https://wiki.pokerogue.net), [DeepWiki analysis](https://deepwiki.com/pagefaultgames/pokerogue), [PokeRogue beginner guides](https://pokeroguewiki.com/beginner-guide/), NEO TOKYO codebase analysis.

---

## Table of Contents

1. [PokeRogue Feature Inventory](#1-pokerogue-feature-inventory)
2. [NEO TOKYO Current State](#2-neo-tokyo-current-state)
3. [Gap Analysis](#3-gap-analysis)
4. [Prioritized Roadmap](#4-prioritized-roadmap)

---

## 1. PokeRogue Feature Inventory

### 1.1 Core Game Loop

| Feature | Detail |
|---------|--------|
| **Wave structure** | 200 waves in Classic mode. Every 10 waves = biome change + boss. Trainers at waves 5, 8, 25, 35, etc. |
| **Death = restart** | All Pokemon faint → run over, start from wave 1. Roguelike permadeath. |
| **Shop between waves** | Post-battle item shop with tiered random drops + purchasable items. One free reward per battle. |
| **Biome progression** | 35 biomes with unique Pokemon pools, trainers, weather, terrain, background art, and BGM. Biome paths branch at intervals. |
| **Starting selection** | Pick starters from your unlocked Pokedex using a point budget (max 10 pts, each species costs 1-9 pts). |

### 1.2 Game Modes (5 total)

| Mode | Structure | Key Differences |
|------|-----------|-----------------|
| **Classic** | 200 waves, fixed bosses, curated biome path | Standard run, has trainers + mystery encounters. Start at level 5, 1000 money. |
| **Endless** | Infinite waves, random biomes/bosses | No cap (stops at wave 5850 currently). Starter budget raised to 15. High-score chase. |
| **Spliced Endless** | Endless but all Pokemon are fusions | Unlocked by beating Classic with a fused Pokemon. |
| **Daily Run** | 50 waves, seeded (same for all players) | Start at level 20. Fixed seed = global leaderboard. Short biomes. |
| **Challenge** | Classic structure + self-imposed constraints | 10+ challenge types: monotype, single-gen, inverted type chart, fresh start, hardcore, flip stats, lower starter budget. |

### 1.3 Combat System

**Turn structure:** Standard Pokemon turn-based combat. Player selects from Fight/Bag/Pokemon/Run. Speed determines order. Doubles supported (2v2).

**Move system (920+ moves):**
- Physical, Special, Status categories
- PP system (limited uses per move)
- 180+ composable `MoveAttr` classes for effects (recoil, drain, multi-hit, weather-dependent power, stat changes, status infliction, field hazards, screens, etc.)
- Charge moves, two-turn moves, priority moves
- Type-based damage with STAB bonus

**Ability system (310+ abilities):**
- 200+ `AbAttr` classes using composition pattern
- Pre-battle, post-summon, pre-defend, post-defend, pre-attack, post-attack, end-of-turn triggers
- Field-wide abilities, ally-affecting abilities
- Hidden abilities unlockable via meta-progression

**Type system:** 18 standard types + Stellar (Tera). Full type effectiveness chart with dual-typing. Type immunities, resistances, weaknesses.

**Status effects:**
- 7 non-volatile: Poison, Toxic, Paralysis, Sleep, Freeze, Burn, Faint
- 80+ volatile (BattlerTag): Confusion, Infatuation, Flinch, Trapping (8+ variants), Protection (6+ variants), Seeding/Drain, Move Restriction (Disable, Encore, Taunt, Torment, Imprison, Heal Block), Forced multi-turn, Substitute, Destiny Bond, Perish Song, etc.

**Weather (10 types):** Sunny, Rain, Sandstorm, Hail, Snow, Fog, Heavy Rain, Harsh Sun, Strong Winds, None

**Terrain (5 types):** Electric, Grassy, Misty, Psychic, None

**Arena tags:** Entry hazards (Stealth Rock, Spikes, Toxic Spikes, Sticky Web), Screens (Reflect, Light Screen, Aurora Veil), Rooms (Trick Room), Gravity, Conditional protection (Wide Guard, Quick Guard)

**Double battles:** Full 2v2 support with ally-aware abilities, multi-target moves, position-based targeting, `BattlerIndex` (PLAYER, PLAYER_2, ENEMY, ENEMY_2)

**AI system:** Rule-based enemy AI with weighted moveset generation (STAB bonus, level-scaled move access, boss extra weights), species generation per trainer type, progressive rival teams (6 stages)

### 1.4 Monster/Species System

| Feature | Scale |
|---------|-------|
| **Pokemon species** | ~1,025 (all gens 1-9) |
| **Types** | 18 + Stellar |
| **Stats** | HP, Attack, Defense, Sp.Atk, Sp.Def, Speed (6-stat system with IVs, EVs, Natures) |
| **Evolution** | Level-up, item, trade, mega, form change, fusion-specific |
| **Natures** | 25 (20 stat-affecting + 5 neutral). Changeable via Nature Mints. |
| **Abilities** | Primary + Hidden. Passives unlockable via candy. |
| **Shiny system** | 3 tiers: Yellow (Luck 1), Blue (Luck 2), Red (Luck 3). Each tier provides luck bonus. |

**Fusion system (unique to PokeRogue):**
- DNA Splicer item fuses two Pokemon
- Averaged stat spreads, combined movesets and types
- Primary type from first Pokemon, secondary from second
- Spliced Endless mode forces all Pokemon to be fusions
- Enemies can also be fused via `EnemyFusionChanceModifier`

**Starter system:**
- Point-based budget (max 10, species cost 1-9 pts)
- IVs transfer from caught specimens to starters permanently
- Candy unlocks passive abilities and reduces starter cost
- Natures, forms, shinies, gender all transfer on catch/hatch

### 1.5 Item/Modifier System (80+ types)

**Tier system:** COMMON → GREAT → ULTRA → ROGUE → MASTER → LUXURY

**Key categories:**

| Category | Examples |
|----------|---------|
| **Healing** | Potions (HP restore), Status cure, PP restore, Full heal |
| **Stat boosters** | Vitamins (+10% stat), Nature Weight (amplify nature), Base Stat modifiers |
| **Type boosters** | +20% damage per type per stack (additive) |
| **Combat items** | Focus Band (survive fatal), Quick Claw (speed bypass), King's Rock (flinch), Multi Lens (extra hits) |
| **Economy** | Amulet Coin (money on hit), Money Interest, Money Multiplier |
| **Passive recovery** | Leftovers (turn heal), Shell Bell (hit heal) |
| **Berries** | 11 types: Sitrus (HP), Lum (status cure), stat-boost berries at low HP, Leppa (PP restore) |
| **Pokeballs** | 6 types: Pokeball, Great, Ultra, Rogue, Master, Luxury |
| **Capture boosters** | Critical catch chance, shiny rate boost, hidden ability rate boost |
| **Evolution** | Evolution stones, TMs, form change items |
| **Fusion** | DNA Splicer (fuse two Pokemon) |
| **Mega/Tera/Gmax access** | Must find item to unlock these mechanics |
| **EXP boosters** | Lucky Egg, EXP Share, EXP Balance (distribute evenly) |
| **Map** | Map modifier (reveals biome path) |
| **Meta items** | Extra modifier choices, lock modifier tiers, temp stat boosts (X Attack etc.) |

**Enemy scaling:** Enemies gain progressive buffs as waves increase — damage boost, damage reduction, turn heal, status infliction, endure chance, fusion chance.

**Shop mechanics:** Wave-scaled inventory, tiered pricing, `HealShopCostModifier` reduces healing costs. Mystery encounters can provide custom shop options.

### 1.6 Egg & Gacha System

**Egg tiers:**

| Tier | Hatch waves | Drop rate | Pity |
|------|-------------|-----------|------|
| Common | 10 | ~80% | — |
| Rare | 25 | ~17% | 9 eggs |
| Epic | 50 | ~3% | 59 eggs |
| Legendary | 100 | ~0.4% | 412 eggs |
| Manaphy (special) | 50 | 1/8 Manaphy vs Phione | — |

**Gacha machines:** Multiple pull types with different rate boosts (Move UP! for egg moves, Legendary UP! for legendary species, Shiny UP! for increased shiny rate)

**Vouchers (4 tiers):**
- Regular → 1 egg
- Plus → 5 eggs
- Premium → 10 eggs (guaranteed Rare)
- Golden → 25 eggs (guaranteed Epic)
- Earned from: gym leaders, evil team bosses, Elite Four, Champion, completing modes, every 50th Endless wave

### 1.7 Meta-Progression

| System | Persistence |
|--------|-------------|
| **Pokedex** | Every caught/hatched Pokemon permanently unlocks as a starter. Best IVs, shinies, abilities, natures transfer. |
| **Candy** | Species-specific currency from catches/hatches. Unlocks passive abilities, reduces starter cost. |
| **Eggs** | Persist between runs, hatch over accumulated waves. |
| **Vouchers** | Accumulate across runs, spent in gacha. |
| **Achievements** | 430+ achievement definitions across 7 types (Money, Ribbon, Damage, Heal, Level, Modifier, Challenge). Grant vouchers. |
| **Game stats** | Lifetime stats: wins, losses, money earned, Pokemon caught, run duration. |
| **Unlockables** | Game modes, features gated behind achievements/completion. |
| **Save system** | 5 save slots per account. Cloud sync via API backend. Version migration system (5 migration versions). |

### 1.8 Mystery Encounters (31 types)

Random narrative events that break up the battle loop. Appear between waves 10-180 in Classic mode. Each has requirements, tiers, and multiple player choices.

Examples: Mysterious Chest (loot/trap), Dark Deal (Faustian bargain), Safari Zone (catching minigame), Training Session (improve Pokemon), Department Store Sale (discounted shopping), Shady Vitamin Dealer (risky stat boosts), Global Trade System (NPC trading), Weird Dream (surreal transformation), Winstrate Challenge (multi-battle gauntlet), Clowning Around (trickster chaos)

Average ~12 encounters per Classic run. Biome-gated (civilization vs extreme vs general).

### 1.9 UI & Player Experience

| System | Detail |
|--------|--------|
| **UI handlers** | ~45 unique screens (battle command, move select, party management, summary, starter select, Pokedex, settings, egg gacha, achievements, run history, etc.) |
| **UI widgets** | ~30 container components (HP bars, ability bar, candy bar, EXP bar, damage numbers, leaderboard, event banners, etc.) |
| **Input support** | Keyboard (QWERTY), 5 gamepad types (DualShock, Xbox 360, Pro Controller, Generic, SNES), touch controls with landscape/portrait. Full rebinding UI. |
| **Tutorial** | 9-step guided tutorial (intro, menu, starter select, Pokedex, Pokerus, stat changes, item shop, egg gacha) |
| **Localization** | 14 languages via i18next (EN, JA, KO, ZH-CN, ZH-TW, FR, DE, ES, IT, PT-BR, TR, RU, TH, PL) |
| **Sprite system** | 3 shiny variants per species, expanded (high-res) sprites, palette swap system |
| **Animation system** | Phase-based: move animations, shiny sparkles, damage shake, evolution morphs, form changes |
| **Settings** | Display, Audio, Gamepad, Keyboard categories. Battle style, text speed, audio volume, etc. |

### 1.10 Social & Infrastructure

| System | Detail |
|--------|--------|
| **Accounts** | Server-side with Discord/Google OAuth. Cloud saves. Guest mode. Admin role. |
| **Daily leaderboard** | Seeded daily runs compared globally. Scoreboard with categories. |
| **Timed events** | Date-gated events with banner art, shiny rate multipliers, special encounters, candy friendship boosts, April Fools. |
| **Tech stack** | Phaser 3 game engine, TypeScript, Vite build, Vitest testing, Biome linter, pnpm, i18next, crypto-js encryption. |
| **Save integrity** | Client session ID prevents multi-tab conflicts. Save encryption (crypto-js). ZIP compression for export/import. |

---

## 2. NEO TOKYO Current State

### 2.1 What We Have

| System | NEO TOKYO Implementation |
|--------|-------------------------|
| **Game loop** | Hub → ward selection → floor exploration (7-10 rooms + boss) → combat → post-combat → next room. 7 floors per run. |
| **Combat** | Vocab-pause turn-based: review Japanese word → player action → enemy action → pause for next word. |
| **Player actions** | Attack (chip pipeline), Defend (50% reduction + 0.5x counter), Ultimate (robot combat charged ability) |
| **Enemy system** | 60+ enemies across 4 tiers with intent system (Attack, Heavy Attack, Defend, Special, Rage). 7 floor bosses + final boss. Multi-phase boss patterns. Special abilities (Split Consciousness, Call Backup, Barrier, Vanish, Retaliation, etc.) |
| **Chip system** | Balatro-style pipeline: 5 chips fire left-to-right, each modifying damage. Effects: flatAdd, multiply, conditional, critMod, recursion, sacrifice, stacking, rampingMultiply. 5 rarity tiers. Charged chip skills. |
| **Robot combat** | Alternative mode: 1-3 active + 0-3 reserve robots. 5 elements (wood→earth→water→fire→metal cycle, 1.5x/0.67x). XP/leveling. Befriend system (capture at ≤50% HP via dialogue). Swap mechanics. |
| **Exploration** | Ward path system (5 tiers converging to Imperial Palace). Branching rooms with Chippy door hints. Room types: encounter, shrine, quiz, wordDiscovery, dealer, boss. |
| **Meta-progression** | Essence currency → 4 upgrade types (Vitality, Treasure Sense, Attack Power, Credit Find). 6 achievements. Lifetime stats. Robot collection persists. |
| **Vocabulary** | JPDB integration for Japanese learning. Per-user vocab cache. Word discovery rooms. Befriend dialogue uses known vocabulary. Door hints filtered to known words. |
| **AI narration** | Dungeon Master system: floor/ward lore, enemy personality, combat narration, sensory rotation, narration memory (avoids repetition). Japanese-first prompting. |
| **Shops** | Starting chip shop, post-combat shop, dealer room (uncommon+ chips), robot item shop |
| **UI** | Combat loop, exploration, character, chip select/row, post-combat shop, robot row, narration box, modals, economy, leaderboard, speed review |
| **Audio** | Combat SFX, TTS via VOICEVOX for narration |
| **Testing** | E2E (Playwright, 66 tests), unit tests (154), integration tests (14) |

### 2.2 Our Unique Strengths (Not in PokeRogue)

| Feature | Advantage |
|---------|-----------|
| **Japanese vocabulary learning** | Core mechanic — vocab-pause combat, word discovery rooms, JPDB integration |
| **AI-powered narration** | Dynamic Dungeon Master with memory, sensory rotation, character voices |
| **Chip pipeline** | Balatro-inspired ordered modifier chain — more strategic than PokeRogue's stacking items |
| **Befriend via dialogue** | Capture requires answering Japanese conversation questions — learning + gameplay fusion |
| **Chippy door sense** | AI-remixed hints using player's known vocabulary — adaptive difficulty in language |
| **TTS narration** | VOICEVOX text-to-speech for Japanese immersion |
| **Cyberpunk Tokyo setting** | Distinct aesthetic vs. PokeRogue's Pokemon pixel art |

---

## 3. Gap Analysis

### 3.1 Critical Gaps (High Impact, Our Game Feels Incomplete Without These)

| # | PokeRogue Feature | NEO TOKYO Status | Impact |
|---|-------------------|-----------------|--------|
| G1 | **Multiple game modes** (Classic, Endless, Daily, Challenge) | Only one mode (7-floor run) | Players hit content ceiling fast. No replayability hooks beyond meta-progression. |
| G2 | **Item stacking & diversity** (80+ modifier types, 6 tiers) | Chip system is deep but limited shop items. Robot shop has ~6 item types. | Strategic variety per run feels narrow. Every run plays similarly. |
| G3 | **Mystery encounters / event rooms** (31 types with narrative choices) | 5 room types (encounter, shrine, quiz, wordDiscovery, dealer) but minimal narrative variety | Exploration feels repetitive. No "what will happen next?" tension. |
| G4 | **Persistent collection as core loop** (Pokedex → starters, IVs transfer, candy upgrades) | Robot collection persists but lacks depth. No IV/stat transfer, no candy, no passive unlocks. | Meta-progression feels thin. Players lack long-term goals after a few runs. |
| G5 | **Daily seeded runs + leaderboard** | Basic leaderboard exists but no seeded daily runs | No daily engagement hook. No "compete with friends" moment. |

### 3.2 Important Gaps (Medium Impact, Would Significantly Improve Experience)

| # | PokeRogue Feature | NEO TOKYO Status | Impact |
|---|-------------------|-----------------|--------|
| G6 | **Biome diversity** (35 biomes with unique pools, weather, terrain, art, BGM) | Ward system with 5 tiers, but rooms within a ward feel samey | Runs blend together visually and mechanically. |
| G7 | **Enemy scaling modifiers** (progressive buffs as waves increase) | Tier-based enemy stats but no progressive scaling within a run | Late-game difficulty feels flat. |
| G8 | **Challenge modes** (monotype, fresh start, inverted, etc.) | None | No way for experienced players to create fresh challenges. |
| G9 | **Timed events** (seasonal events with special encounters, rate boosts) | None | No "log in today for something special" motivation. |
| G10 | **Evolution / form changes** | Robots level up but don't evolve or change forms | No "my creature is growing" emotional payoff. |
| G11 | **Fusion system** | None | PokeRogue's most creative differentiator. Generates emergent uniqueness per run. |
| G12 | **Tutorial system** | None (players must figure it out) | New player onboarding is rough. |

### 3.3 Nice-to-Have Gaps (Lower Priority, Polish & Depth)

| # | PokeRogue Feature | NEO TOKYO Status | Impact |
|---|-------------------|-----------------|--------|
| G13 | **Egg / gacha system** | None | Additional meta-progression layer and daily engagement. |
| G14 | **Input rebinding** (keyboard, gamepad, touch) | Basic mobile support | Accessibility and player comfort. |
| G15 | **Localization** (14 languages) | Japanese + English | Limited audience reach (though Japanese is our core). |
| G16 | **Save encryption + cloud sync** | Basic auth + file saves | Save tampering possible. No cross-device play. |
| G17 | **Run history** | Lifetime stats exist but no per-run history | Can't review or compare past runs. |
| G18 | **Achievement diversity** | 6 achievements | PokeRogue has 430+. Ours feel like placeholders. |
| G19 | **Weather / terrain effects** | None in combat | Combat lacks environmental strategy layer. |
| G20 | **Double/multi battles** | Robot combat supports multi-robot but no 2v2 traditional | Less tactical depth in standard combat. |

### 3.4 Features We Should NOT Copy

| PokeRogue Feature | Why Skip |
|-------------------|----------|
| **6-stat system (HP/Atk/Def/SpA/SpD/Spe)** | Our 2-stat system (attack, maxHp) keeps combat simple and focused on vocab learning. Adding complexity would dilute the educational core. |
| **920+ moves** | Our chip pipeline IS the move system. Adding traditional moves would create redundancy. |
| **IV/EV grinding** | Too grindy for a learning game. Keep stat progression simple. |
| **18 types** | Our 5-element system (wood/earth/water/fire/metal) is clean and learnable. More types = more memorization that isn't Japanese. |
| **Pokeball varieties** | We have befriending (dialogue-based capture). Pokeballs would be thematically wrong. |
| **Full Pokedex** | 1000+ species is Pokemon's advantage. Our robots are hand-crafted for the setting. Quality over quantity. |

---

## 4. Prioritized Roadmap

### Phase 1: Replayability & Engagement (Weeks 1-3)
*Goal: Make players want to do "one more run"*

#### 1A. Endless Mode [G1]
- After clearing 7 floors, option to continue with scaling difficulty
- Floors 8+ draw from random ward pools with +10% enemy stats per floor
- Leaderboard tracks highest floor reached
- **Effort:** Medium (reuse existing floor generation, add scaling formula)

#### 1B. Daily Seeded Runs [G1, G5]
- Generate daily seed from date → deterministic room sequence, enemy rolls, shop offerings
- Fixed starting chips/robots for fairness
- Global leaderboard: score = floors cleared × enemies defeated × vocab answered correctly
- **Effort:** Medium (add seed-based RNG, leaderboard API endpoint)

#### 1C. Expand Mystery/Event Rooms [G3]
- Add 8-10 new room types inspired by PokeRogue mystery encounters, adapted to our setting:
  - **Black Market Dealer** — high-risk chip trades (could be better or worse rarity)
  - **Hacker's Terminal** — mini vocab quiz for bonus credits or chip upgrade
  - **Street Performer** — spend credits for random buff (attack boost, heal, chip reroll)
  - **Memory Fragment** — narrative lore piece + essence reward
  - **Trapped Room** — fight elite enemy or sacrifice a chip to pass
  - **Robot Workshop** — repair/upgrade a robot for credits
  - **Abandoned Shrine** — gamble: 50% shrine upgrade, 50% curse (stat debuff for 3 rooms)
  - **Information Broker** — reveals all remaining room types on the floor
- Each has 2-3 player choices with different outcomes
- **Effort:** Large (new room type logic, UI for choices, AI narration per type)

#### 1D. Run Modifiers / Challenge Mode [G8]
- Start with 3-4 challenge toggles:
  - **Monotype** — only one element for robots
  - **Pacifist** — must befriend, not defeat enemies
  - **Glass Cannon** — 2x attack, 0.5x HP
  - **Fresh Start** — no meta-progression bonuses
- Each challenge adds a score multiplier
- **Effort:** Small-Medium (modifier flags on run state, scoring adjustment)

---

### Phase 2: Collection Depth & Meta-Progression (Weeks 4-6)
*Goal: Give players long-term goals that persist across runs*

#### 2A. Robot Evolution System [G10]
- Robots evolve at level thresholds (e.g., level 5, level 10)
- Evolution changes sprite, stats, and skill
- Some robots branch (choose evolution path)
- Evolution requires a specific vocab milestone (e.g., "answer 10 water-element words correctly")
- **Effort:** Large (new data format, sprites, evolution UI, vocab tracking per element)

#### 2B. Robot Candy / Passive System [G4]
- Earn species-specific "data chips" from befriending and combat
- Spend data chips to:
  - Unlock passive ability (auto-skill that triggers without charge)
  - Reduce team-point cost
  - Unlock alternate skill
- Passive abilities tied to personality archetype (20 archetypes already exist)
- **Effort:** Medium (new currency, unlock UI, passive system on robot)

#### 2C. Expanded Achievement System [G18]
- Grow from 6 to 30+ achievements across categories:
  - **Combat:** Deal 10K damage, win with 1 HP, defeat boss without defending
  - **Collection:** Befriend 10/25/50 robots, collect all elements, evolve 5 robots
  - **Vocab:** Learn 100/500/1000 words, answer 50 befriend questions correctly
  - **Exploration:** Visit all wards, clear floor without taking damage, find all room types
  - **Meta:** Reach floor 15 in Endless, complete 3 daily runs, earn 5000 essence
- Achievements grant essence + unlock cosmetic titles
- **Effort:** Medium (achievement definition framework + UI)

#### 2D. Enhanced Robot Collection UI [G4]
- Collection grid showing all discovered robots (silhouettes for undiscovered)
- Per-robot detail page: stats, skills, evolution chain, data chip progress, lore
- Filter/sort by element, rarity, discovered date
- Show "% complete" for collection milestones
- **Effort:** Medium (UI work, collection data model enhancements)

---

### Phase 3: Combat Depth & Strategic Variety (Weeks 7-9)
*Goal: Make each combat encounter feel distinct*

#### 3A. Environmental Effects in Combat [G19]
- Ward-specific combat modifiers (our version of weather/terrain):
  - **Nerima (suburban):** Neutral — no modifier
  - **Shibuya (neon district):** Electric interference — chip skills charge 1 turn faster
  - **Shinjuku (nightlife):** Foggy — 15% miss chance on all attacks
  - **Minato (waterfront):** Wet — water element +20% damage, fire -20%
  - **Imperial Palace (digital void):** System instability — random stat swings each turn
- Visual indicator on combat screen showing active effect
- **Effort:** Medium (combat modifier system, per-ward config, UI indicator)

#### 3B. Item/Consumable Expansion [G2]
- Add 15-20 new combat items beyond current robot shop:
  - **Overclock Module** — next attack deals 2x but takes 50% recoil
  - **Firewall** — absorbs next hit completely (consumed)
  - **Debug Patch** — removes all negative status effects
  - **RAM Upgrade** — permanently +5 max HP for one robot
  - **Bandwidth Boost** — chip pipeline gains +1 slot for this floor
  - **Virus Injector** — enemy takes 10% max HP per turn for 3 turns
  - **Backup Drive** — revive one KO'd robot at 50% HP
  - **Stealth Module** — skip next encounter room (one-time)
- Items persist for the run (not between runs)
- **Effort:** Medium (item definitions, shop integration, combat effects)

#### 3C. Enemy Scaling Within Runs [G7]
- Progressive difficulty curve per floor:
  - Floor 1: Base stats
  - Floor 3: Enemies gain +10% stats, occasional special abilities
  - Floor 5: +20% stats, more frequent specials, rare double encounters
  - Floor 7: +30% stats, boss has 3 phases, new boss-only abilities
  - Endless mode: +5% per floor beyond 7, enemy special ability frequency increases
- **Effort:** Small (scaling multiplier on enemy generation, already tier-based)

#### 3D. Chip Synergy System [G2]
- Named synergies when specific chip combinations are in the pipeline:
  - **Overload** (3+ multiply chips) — final damage +15% bonus
  - **Critical Mass** (flatAdd + critMod adjacent) — crit multiplier doubled
  - **Recursive Loop** (recursion chip + stacking chip) — stacks build 2x faster
  - **Glass Cannon** (sacrifice chip in slot 1) — all subsequent chips get 1.5x power
- Synergy indicator on chip equip screen
- Chippy comments on powerful synergies during combat
- **Effort:** Medium (synergy detection logic, UI indicators, chip data additions)

---

### Phase 4: Social & Retention (Weeks 10-12)
*Goal: Keep players coming back and competing*

#### 4A. Timed Events System [G9]
- Infrastructure for date-gated events:
  - Weekly vocab challenges (learn 50 words from a theme = bonus essence)
  - Monthly boss rush (fight all 7 bosses back-to-back, leaderboard)
  - Seasonal events (New Year's shrine event, Golden Week special wards)
- Event banner on hub screen
- Event-specific achievements
- **Effort:** Large (event framework, scheduling, content creation)

#### 4B. Run History & Replay [G17]
- Save summary of each completed run: floors reached, enemies defeated, robots used, vocab learned, score
- Browse last 25 runs with detail view
- Share run summary (shareable link or screenshot)
- **Effort:** Medium (run summary data model, history UI, share feature)

#### 4C. Tutorial / Onboarding System [G12]
- 6-8 tutorial steps for first-time players:
  1. Character creation + name
  2. Hub overview + starting a run
  3. First room + combat basics (attack/defend)
  4. Vocab-pause explanation (why you review words)
  5. Chip equipping + pipeline concept
  6. Robot introduction + befriending
  7. Shop mechanics
  8. Meta-progression (essence + upgrades)
- Skippable for returning players
- **Effort:** Medium (tutorial state tracking, overlay UI, step content)

#### 4D. Social Leaderboards Expansion [G5]
- Multiple leaderboard categories:
  - Highest Endless floor
  - Most vocab learned in a run
  - Fastest Classic clear
  - Daily run score
  - Most robots befriended in a run
- Weekly/monthly/all-time tabs
- **Effort:** Medium (leaderboard API expansion, category tracking, UI tabs)

---

### Phase 5: Polish & Depth (Weeks 13+)
*Goal: Deepen systems for long-term players*

#### 5A. Robot Fusion [G11]
- Combine two robots to create a hybrid:
  - Averaged stats, combined element (dual-element?), merged skill set
  - Visual fusion sprite (combine base sprites)
  - Fusion-specific ultimates
- Requires special "Fusion Core" item from Endless mode or achievements
- Fused robots cannot be unfused (strategic permanent choice)
- **Effort:** Very Large (sprite generation, stat merging, new combat logic for dual-elements)

#### 5B. Egg/Incubation System [G13]
- Earn "data fragments" from combat and befriending
- Combine fragments to create robot eggs with random species
- Eggs hatch after N rooms explored (10/25/50 based on tier)
- Hatched robots may have rare skills or higher base stats
- Ties into collection completion
- **Effort:** Large (egg data model, hatch mechanics, fragment drops, incubator UI)

#### 5C. Cloud Save & Cross-Device [G16]
- Server-side save storage (already have auth system)
- Sync on login, conflict resolution (latest timestamp wins)
- Export/import save as encrypted file
- **Effort:** Medium (API endpoints for save upload/download, conflict handling)

#### 5D. Advanced Input Support [G14]
- Gamepad support for TV/desktop play
- Improved touch controls with haptic feedback
- Key rebinding UI
- Accessibility: text size options, colorblind mode for element indicators
- **Effort:** Medium (input abstraction layer, settings UI)

---

### Roadmap Summary

| Phase | Theme | Timeline | Key Deliverables |
|-------|-------|----------|-----------------|
| **1** | Replayability | Weeks 1-3 | Endless mode, Daily runs, 8-10 new room types, Challenge mode |
| **2** | Collection Depth | Weeks 4-6 | Robot evolution, Candy/passive system, 30+ achievements, Collection UI |
| **3** | Combat Depth | Weeks 7-9 | Environmental effects, 15-20 new items, Enemy scaling, Chip synergies |
| **4** | Social & Retention | Weeks 10-12 | Timed events, Run history, Tutorial, Expanded leaderboards |
| **5** | Polish & Depth | Weeks 13+ | Robot fusion, Egg system, Cloud save, Advanced input |

### Priority Matrix

```
                    HIGH IMPACT
                        |
     Endless Mode  ●    |    ● Daily Runs
     Mystery Rooms ●    |    ● Robot Evolution
                        |
  LOW EFFORT ───────────┼─────────── HIGH EFFORT
                        |
     Challenge Mode ●   |    ● Timed Events
     Enemy Scaling  ●   |    ● Robot Fusion
                        |
                   LOW IMPACT
```

### Guiding Principles

1. **Never sacrifice the learning core.** Every feature should integrate with or complement Japanese vocabulary learning. Robot evolution gated by vocab milestones. Mystery encounters include language puzzles. Leaderboards factor vocab accuracy.

2. **Quality over quantity.** PokeRogue has 1000+ species because it's Pokemon. We have hand-crafted robots with personality, dialogue, and lore. 30 deep robots > 300 shallow ones.

3. **Emergent runs, not scripted ones.** The goal is: "every run feels different." Chip pipeline synergies, room type variety, environmental effects, and robot team composition should create natural variety without requiring 920 moves.

4. **Respect the player's time.** Our players are studying Japanese. Runs should be 20-40 minutes (not 3+ hours like Classic PokeRogue). Daily runs especially should be completable in 15-20 minutes.

5. **AI as a feature, not a crutch.** Our DM narration, Chippy hints, and vocabulary-aware content are things PokeRogue cannot do. Lean into AI-powered personalization as the differentiator.
