# Vocabulary Systems — How Koto Teaches 6,000+ Words

**Date**: 2026-03-01
**Status**: Living design document — all future content decisions reference this.

This document defines every vocabulary-carrying system in the game, what word types each system teaches, HOW the player learns through each mechanic, and how it all maps to WaniKani's 60-level curriculum (~6,300 words).

For marketing-safe evidence language and study-count references, see [`docs/language-learning-evidence.md`](language-learning-evidence.md).

## Core Principle

**Vocabulary needs drive game mechanics, not the other way around.** If a word type doesn't have a natural game system to teach it, we design a new mechanic — we don't force words into ill-fitting systems or dump them into narration.

Every piece of Japanese text follows the **i+1 principle**: only words the player already knows, plus at most 1 new word.

---

## System Overview

| System | Est. Words | Word Types | Player Exposure |
|---|:---:|---|---|
| Creatures | ~1,000 | Concrete nouns + adjectives | Every combat action |
| Moves | 600–1,000 | Verbs (all types) | Every combat action |
| Consumable Items | ~225 | Food, medicine, compound nouns | Buy, find, use |
| Equipment | ~100 | Weapon/armor/material nouns | Equip, craft, view |
| Crafting Resources | ~100 | Material/nature nouns | Gather, craft |
| Town/Base Buildings | ~100 | Structure/place nouns | Build, upgrade, visit |
| Areas + Sub-Areas | ~330–380 | Location nouns + adjectives | Always on screen |
| NPCs | ~300 | People, occupations, social nouns | Talk, trade, quest |
| **Subtotal (active systems)** | **~2,755–3,205** | | |
| Narration/Immersion | ~3,100–3,550 | Grammar, adverbs, counters, abstract nouns | Every sentence |
| **Grand Total** | **~6,000–6,300** | | |

---

## System 1: Creatures (~1,000 words)

### What It Teaches
- **500 unique Japanese words** (concrete nouns): animals, plants, celestial/weather, mythical/fantasy, abstract-visual
- **500 unique modifiers** (adjectives): i-adjectives, na-adjectives, colors, temperament, state/condition

Every creature has a unique Japanese word AND a unique modifier. No two creatures share either.

### How the Player Learns

**Split attack card (highest repetition).** Every time any creature acts in combat — the player's or the opponent's — the split attack card displays the creature's Japanese word with its reading and English meaning. A player who fights 10 battles per session with 3 creatures sees creature Japanese words 100+ times per session. This is the single highest-repetition vocabulary in the game.

**First encounter introduction.** When the player encounters a new creature species for the first time, the full name is displayed: modifier + Japanese word (e.g., 古代の亀 = "Ancient Turtle"). Both words are introduced with readings and meanings.

**Collection screen.** The player's creature collection shows all creatures with their full names. Browsing the collection reinforces both Japanese words and modifiers passively.

**Creature info panel.** Tapping any creature shows its full info: name, modifier, Japanese word, element, moves, stats. The modifier is always visible here.

**Dual role: Exploration or Town Work.** Each creature can either join the player's exploration party OR stay home and work in the town. Creatures assigned to town buildings contribute to that building's function — a creature at the 病院 (hospital) helps heal faster, one at the 市場 (market) unlocks better shop inventory. This creates three vocabulary reinforcement loops:
1. **Incentive to collect more creatures** — you need workers AND fighters, so you seek out more creatures and encounter more Japanese words/modifiers.
2. **Cross-system word pairing** — the player sees their creature's name next to the building's name repeatedly (古代の亀 works at 病院), linking creature vocabulary to structure vocabulary.
3. **Rotation reinforcement** — swapping creatures between roles means revisiting their names and stats regularly.

### What Does NOT Belong as Creature Japanese Words
- **Food/life words** (卵, 果物, 茸) → these are consumable items
- **Materials/objects** (石, 鉄, 鏡, 鍵) → these are equipment or crafting resources
- **Structures** (塔, 橋, 門, 壁) → these are town buildings
- **Phenomena** (炎, 氷, 波) → these are move effects or area themes

### Japanese Word Categories That DO Work

| Category | Examples (EN) | Why They Work |
|---|---|---|
| Animals (~150) | cat, wolf, whale, butterfly, hawk, frog, crab, firefly | Natural creature identity — you picture it immediately |
| Plants/nature (~80) | flower, tree, moss, bamboo, seed, root, vine | Living things that can be creature-like |
| Celestial/weather (~40) | star, moon, thunder, wind, rainbow, cloud | Elemental creature archetypes |
| Mythical/fantasy (~150) | spirit, dragon, ghost, demon, fairy, phoenix | The fantasy genre provides hundreds |
| Abstract-visual (~80) | shadow, dream, echo, voice, light, darkness | Creature identity through concept |

Stretching across the full JPDB range (not just top 6,000) unlocks rarer but real words for higher-tier creatures.

### Modifier Pool (~500 unique adjectives)

| Type | Examples (EN) |
|---|---|
| Size/shape | big, small, round, thin, long, wide |
| Sensory | bright, dark, cold, hot, soft, hard, heavy |
| Color | red, blue, white, black, green, gold, silver |
| Temperament | fierce, calm, swift, lazy, cunning, gentle |
| Age/state | ancient, young, withered, frozen, rusted, cracked |
| Quality | strong, weak, beautiful, strange, mysterious |
| i-adjectives | fast, slow, near, far, deep, shallow, tall |
| na-adjectives | quiet, famous, dangerous, free, special |
| Verb-derived | frozen (凍った), broken (壊れた), hidden (隠れた) |

Verb-derived modifiers (past-tense verbs used as adjectives) expand the pool significantly and teach verb conjugation patterns naturally.

### Rarity Distribution (500 creatures)

| Rarity | Count | JPDB Range | Where Found |
|---|:---:|---|---|
| Common | 180 | rank 1–2,000 | Everywhere, early areas |
| Uncommon | 160 | rank 2,001–3,500 | Mid/late areas |
| Rare | 100 | rank 3,501–6,000 | Area-specific, 1–2 per area |
| Epic | 40 | rank 6,000–10,000 | Cross-area rare spawns |
| Legendary | 20 | rank 10,000+ | Unique boss creatures, quest rewards |

---

## System 2: Moves (600–1,000 words)

### What It Teaches
- **Verbs of all types**: combat, movement, emotion, communication, daily life, perception, transformation

Moves are NOT limited to "combat verbs." 泣く (cry), 眠る (sleep), 歌う (sing), and 騙す (deceive) are all valid moves — they map to debuffs, heals, buffs, and status effects respectively.

### How the Player Learns

**Split attack card (shared with creature Japanese word).** Every time a creature uses a move, the card shows both the creature's Japanese word AND the move's verb. The player processes two vocabulary words per combat action.

**Move selection.** During the player's turn, they choose from their creature's available moves. Each move shows: Japanese verb, reading, English meaning, and move category (damage/heal/buff/debuff/shield). The act of choosing forces the player to read and evaluate each word.

**Enemy move announcements.** When opponent creatures use moves, the move name and verb are displayed. The player learns passively even when it's not their turn.

**Learnset progression.** Each creature has a learnset of 8–10 moves, learning new ones every 2–3 levels. This drip-feeds new verbs to the player as creatures grow, tied to their progression.

### Move Categories and Verb Mappings

| Move Category | Verb Types | Examples (EN) |
|---|---|---|
| Damage | Physical action, elemental | cut, hit, kick, burn, freeze |
| Heal | Care, recovery, life | heal, rest, eat, drink, recover |
| Buff | Movement, perception, growth | run, fly, focus, sharpen, enlarge |
| Debuff | Emotion, communication, mental | cry, scream, deceive, confuse, frighten |
| Shield | Defense, evasion, protection | guard, dodge, hide, endure, protect |
| Drain | Transfer, taking | steal, absorb, drain, take |

### Tier Progression

| Tier | JPDB Range | Count | When Learned |
|---|---|:---:|---|
| Tier 1 | rank 500–2,000 | ~180 | Starter moves, creature levels 1–5 |
| Tier 2 | rank 2,001–4,000 | ~220 | Creature levels 5–15 |
| Tier 3 | rank 4,001–8,000 | ~130 | Creature levels 16–25 |
| Tier 4 | rank 8,000+ | ~70 | Signature moves, level 25+ |

See `docs/language-systems/move-pool-sizing.md` for detailed spaced repetition constraints.

---

## System 3: Consumable Items (~225 words)

### What It Teaches
- **Food nouns** (米, 肉, 魚, 茶, 卵)
- **Medicine/nature words** (薬, 草, 毒)
- **Katakana loanwords** (カレー, パン, チーズ, ジュース)
- **Compound word formation** (when applicable)

### How the Player Learns

**Crafting as compound word teaching.** Many consumable items are crafted by combining two ingredients — and the resulting item name IS the compound word formed from those ingredients. The player combines 牛 (beef) + 汁 (soup) and gets 牛汁 (beef soup). This teaches compound word formation through gameplay action, not passive display. The player literally builds the word by combining its parts.

**Compound decomposition (optional, not forced).** Items found as loot or purchased can also be compound words that show their 2 components: 緑茶 = 緑 (green) + 茶 (tea). But crafted items teach this more powerfully because the player performs the combination themselves.

**Single-word items.** Some items are single words (おにぎり, 薬, パン) that don't decompose. These just teach the word directly.

**Purchase decisions.** Dealer rooms (shops) display items with their names, effects, and prices. The player reads and evaluates Japanese item names to decide what to buy. This is active reading, not passive exposure.

**Inventory management.** Items in the player's inventory show their Japanese names. Scrolling through inventory = passive vocabulary review.

**Use in context.** Using a healing item during combat shows its name in the combat log. The player associates the word with its effect (食べる → HP restored).

### Item Types

| Type | Count | Effect | Word Pattern |
|---|:---:|---|---|
| Food/drink | ~55 | Heal HP | food + food compound OR single food word |
| Medicine/herbs | ~20 | Cure status, restore | nature + medical word |
| Boost stones | ~25 | Permanent stat bonus | descriptor + material |
| Battle tools | ~20 | Damage/debuff enemies | action noun + object |
| Field tools | ~15 | Navigation, discovery | object + purpose |
| Charms/talismans | ~15 | Buffs, elemental resist | element + charm |

---

## System 4: Equipment (~100 words)

### What It Teaches
- **Weapon nouns** (剣 sword, 刀 katana, 弓 bow, 槍 spear)
- **Armor/defense nouns** (盾 shield, 鎧 armor)
- **Material nouns** (鋼 steel, 鉄 iron, 金 gold)

### How the Player Learns

**1 equip slot per creature.** Each creature can hold one piece of equipment. Simple system — no loadout management, just pick the best gear for each creature.

**Equip screen.** When equipping gear, the player sees the item's Japanese name, reading, and meaning alongside its stat effects. The decision to equip forces reading.

**Persistent display.** Equipped items are shown on the creature's info panel, visible every time the player checks their team. Low-effort reinforcement.

**Crafting.** Equipment can be crafted from resources (see System 5), connecting material nouns to finished products.

### Naming Patterns
Equipment follows the same flexible naming as items — can be modifier+base (鋼の剣 "Steel Sword"), compound (火剣 "Fire Sword"), or single word (刀 "Katana"). No forced pattern.

---

## System 5: Crafting Resources (~100 words)

### What It Teaches
- **Raw material nouns** (木 wood, 鉄 iron, 石 stone, 草 herb)
- **Nature/gathering nouns** (水 water, 土 earth, 砂 sand)

### How the Player Learns

**Gathering during exploration.** Resources are found while exploring areas. Each resource pickup shows the Japanese word with reading and meaning. Sub-areas determine what resources spawn — a pond sub-area yields water resources, a forest floor yields wood and herbs.

**Crafting recipes.** The crafting UI shows what materials are needed to create an item or equipment piece. The player reads material names repeatedly as they check recipes and gather ingredients. This creates a goal-driven reason to learn the words — "I need 鉄 to make this sword."

**Inventory stacking.** Resources stack in inventory with Japanese names visible. As the player accumulates materials, they passively review the same words.

### Three Output Channels
1. **Food/Consumable Items** — crafting compounds naturally: 牛 (beef) + 汁 (soup) = 牛汁 (beef soup). This is the most natural compound word teaching mechanic in the game — the player combines two known ingredient words and sees the resulting compound, learning word-formation by doing.
2. **Equipment** — crafting weapons and gear from materials
3. **Town buildings** — crafting upgrades for the home base (see System 6)

---

## System 6: Town/Base Buildings (~100 words)

### What It Teaches
- **Structure/place nouns** (病院 hospital, 学校 school, 市場 market, 宿 inn, 図書館 library)
- **Upgrade modifiers** (大きい big, 新しい new, 特別な special)

### How the Player Learns

**Town overview screen.** The player's home base displays all built structures with Japanese names. This screen is visited frequently — it's the hub between expeditions. Every building name is passive vocabulary exposure.

**Building and upgrading.** When the player builds or upgrades a structure, the full name is displayed with meaning. Upgrades add modifiers: 小さな市場 → 大きな市場 (Small Market → Big Market). This teaches adjective progression naturally.

**Functional interaction.** Each building has a gameplay purpose — the shop sells items, the hospital heals creatures, the training ground levels creatures. The player visits buildings for specific needs, reinforcing the word through context (I go to 病院 when my creature is hurt → 病院 = hospital).

**Creature workers.** Creatures not in the player's exploration party can be assigned to town buildings. Each building benefits from having creatures work there — faster healing at the hospital, better prices at the market, rarer resources at the workshop. The player sees their creature's name displayed alongside the building's name, creating a persistent cross-system word pairing. This also gives every captured creature a purpose — even creatures the player doesn't bring into combat contribute to the town's prosperity.

**Thematic fit.** This system absorbs the "structures" vocabulary that didn't fit as creature names. Words like 塔 (tower), 橋 (bridge), 門 (gate), 壁 (wall) become things the player builds in their utopia town where creatures and humans thrive together.

---

## System 7: Areas + Sub-Areas (~330–380 words)

### What It Teaches
- **50 core location nouns** (森 forest, 海 ocean, 山 mountain, 城 castle)
- **50 core area modifiers** (深い deep, 暗い dark, 凍った frozen, 静かな quiet)
- **50–80 sub-area location nouns** (池 pond, 川 river, 小屋 hut, 道 path, 滝 waterfall)
- **30–50 sub-area modifiers** (小さな small, 隠れた hidden, 古い old)
- **~150 thematic environment words** (3 per core area, woven into narration)

### How the Player Learns

**Always-on-screen display.** The current location is displayed as `[Area Name — Sub-Area Name]` at the top of the exploration screen at all times: `深い森 — 小さな池` (Deep Forest — Small Pond). The player reads this passively every moment they're exploring. This is zero-effort vocabulary exposure.

**Room entry narration.** Every room transition includes the area/sub-area name in the DM narration: "小さな池の奥に何かが光っている" (Something is shining in the depths of the Small Pond). The player encounters the location words embedded in sentences.

**Area selection.** After completing an area, the player chooses between 2 options for their next destination. Each option shows the area name with meaning. This forced choice makes the player read and compare two location words.

**Sub-area word reuse across biomes.** The key learning advantage: sub-area nouns repeat across different core areas. 池 (pond) appears in Deep Forest, Frozen Mountain, and Ruined Castle. The player sees the same word in 3 different contexts — which is exactly how vocabulary sticks. The sub-area pool is shared, maximizing repetition.

**Thematic environment words.** Each core area has 3 thematic words seeded into DM narration prompts. For 凍った湖 (Frozen Lake), the DM is told to weave in 氷 (ice), 反射 (reflection), 沈黙 (silence). These appear naturally in room descriptions, not as labeled flashcards.

### Structure: 50 Core Areas × 5–8 Sub-Areas

Each core area is `modifier + location noun`. Sub-areas within it are also `modifier + location noun` but drawn from a shared pool that repeats across biomes.

Example:
```
深い森 (Deep Forest)
├── 小さな池 (Small Pond) — water creatures spawn here
├── 古い小屋 (Old Hut) — NPC encounter
├── 暗い道 (Dark Path) — standard encounters
├── 隠れた泉 (Hidden Spring) — rare resource node
└── 苔の洞窟 (Mossy Cave) — boss encounter
```

---

## System 8: NPCs (~300 words)

### What It Teaches
- **50+ name-meaning words** (personality/nature nouns): 凪 (calm), 誠 (sincerity), 勇 (courage)
- **100+ occupation words**: 医者 (doctor), 商人 (merchant), 先生 (teacher), 兵士 (soldier)
- **100+ personality/social keywords**: 約束 (promise), 秘密 (secret), 冒険 (adventure)

### How the Player Learns

**NPC title display.** Every NPC shows their name and occupation: `ナギ — 商人` (Nagi — Merchant). The occupation word is visible every time the player interacts with them. Town NPCs are visited repeatedly, reinforcing occupation vocabulary through functional use (I go to the 商人 to buy things → 商人 = merchant).

**Name-meaning introduction.** When first meeting an NPC, their name's origin word is explained: "ナギ — from 凪 (calm)." This is a one-time introduction that gives the name meaning.

**Personality keywords in dialogue.** Each NPC has a personality keyword that appears 2–3 times across their dialogue. A loyal NPC's conversations repeatedly use 約束 (promise). A secretive NPC keeps referencing 秘密 (secret). Repetition within character-specific context aids memorization.

**Dialogue choices.** NPC conversations offer the player 2–3 response options in Japanese (i+1 validated). Choosing a response requires reading all options — active engagement, not passive reading.

### NPC Roles

| Role | Count | Where Found | Vocab Focus |
|---|:---:|---|---|
| Town residents | ~40 | Home base | Occupation words, daily life |
| Shopkeepers/crafters | ~15 | Town + area shops | Trade/material words |
| Quest-givers | ~20 | Town + areas | Abstract nouns, objectives |
| Rival trainers | ~20 | Area encounters | Personality/emotion words |
| Story NPCs | ~10 | Key story moments | Social/relationship words |
| Wandering NPCs | ~15 | Random area encounters | Mixed vocabulary |

### No More Standalone Enemies

All combat is creature vs creature. "Enemy" NPCs exist as rival trainers who command their own creature teams, but no NPC fights directly. The old `enemies.json` concept is retired — those become rival trainer NPCs.

---

## System 9: Narration/Immersion (~3,100–3,550 words)

### What It Teaches
This is the only system that teaches **grammar and function words** — the glue of the language that only makes sense in sentences.

| Word Type | Count | Examples |
|---|:---:|---|
| Core grammar verbs | ~80 | する, なる, ある, いる, できる |
| Auxiliary/compound verbs | ~60 | てくる, ていく, てしまう, ておく |
| Pronouns/demonstratives | ~60 | 私, 彼, これ, それ, ここ, どこ |
| Conjunctions/connectors | ~50 | だから, しかし, そして, けれど |
| Adverbs | ~120 | もう, まだ, とても, きっと, 全然 |
| Abstract nouns | ~250 | 時間, 問題, 意味, 理由, 気持ち |
| Social/communication verbs | ~100 | 言う, 聞く, 話す, 頼む, 答える |
| Numbers/counters | ~100 | 一, 二, 個, 匹, 本, 回, 度 |
| Time words | ~80 | 今, 前, 後, 朝, 夜, 時, 年 |
| Cognitive/state verbs | ~80 | 思う, 知る, 分かる, 忘れる, 信じる |
| Positional/spatial | ~60 | 上, 下, 中, 外, 前, 奥, 手前 |
| Common adjectives | ~80 | いい, 同じ, 多い, 少ない, 難しい |
| Particles/grammar markers | ~100 | は, が, を, に, で, ように, として |
| Sentence-enders/fillers | ~40 | よ, ね, か, って, なあ, かな |
| Remaining high-frequency | ~490+ | Mixed: fills gaps across all types |

### How the Player Learns

**i+1 narration engine.** All generated text (room descriptions, combat narration, NPC dialogue frames, area intros) is validated against the player's known vocabulary. If a sentence has >1 unknown word, it gets rewritten using known words + at most 1 new one. The player never sees text they can't mostly understand.

**Progressive complexity.** Early areas generate simple narration: 部屋に入った。暗い。何かがいる。(Entered the room. Dark. Something is there.) As the player learns more words through active systems, the narration engine unlocks more complex sentence structures — because more grammar words are "known" and available. The text naturally gets richer as the player progresses.

**Narration words aren't assigned — they emerge.** Unlike creatures or moves, narration words aren't tied to specific game objects. The i+1 engine introduces だから when the player is ready for it, based on their current vocabulary. The game doesn't plan which room teaches だから — it just ensures enough text exposure that it appears naturally.

**Multiple narration touchpoints per session:**
- Room entry descriptions (every room)
- Combat narration (start, end, special events)
- NPC dialogue framing ("The merchant smiles and says...")
- Area introduction text (entering a new area)
- Quest descriptions and updates
- Item/creature discovery text

**Per-user text cache.** All narration is pre-generated per user, cached, and served instantly. After the player sees a line, it's marked stale and regenerated in the background with their updated vocabulary. See `docs/narration-overhaul.md` for architecture details.

### Why ~50% Narration Is Acceptable

Grammar words, counters, adverbs, particles, and abstract nouns genuinely cannot be attached to game objects. You can't name a creature だから or make an item called もう. These words only make meaning in sentences, and the i+1 narration engine is purpose-built to teach them. The active game systems handle the other ~50% (nouns, verbs, adjectives) where concrete association to game objects accelerates learning.

---

## Cross-System Reinforcement

The same word appearing in multiple systems strengthens retention. Overlap is intentional:

| Word | System 1 | System 2 | System 3 |
|---|---|---|---|
| 火 (fire) | Creature modifier | Crafting resource | Area thematic word |
| 石 (stone) | — | Crafting resource | Item component |
| 守る (protect) | Move verb | — | NPC personality keyword |
| 森 (forest) | Creature habitat | — | Area location noun |
| 強い (strong) | Creature modifier | Equipment modifier | Narration adjective |
| 牛 (beef) | — | Crafting ingredient | Item compound (牛汁) |
| 病院 (hospital) | Town building (creature works here) | — | NPC occupation location |

A single combat encounter in 凍った湖 (Frozen Lake) exposes the player to:
- **Area words:** 凍った (frozen) + 湖 (lake) — on screen
- **Creature names:** 魚 (fish), 亀 (turtle) — on attack cards
- **Creature modifiers:** 冷たい (cold), 透明な (transparent) — on creature info
- **Move verbs:** 凍る (freeze), 流れる (flow), 守る (protect) — every attack
- **Thematic words:** 反射 (reflection), 沈黙 (silence) — in room descriptions
- **Grammar words:** また (again), 静かに (quietly) — in every sentence

12+ unique words reinforced in a single encounter, across 6 channels simultaneously.

---

## Quests: A Delivery Mechanism, Not a Vocab System

Quests do not own vocabulary. They combine words from other systems:
- **NPCs** give quests (quest-giver occupation + personality words)
- **Areas** host quests (location + sub-area words)
- **Creatures** are quest objectives (base + modifier words)
- **Items/Equipment** are quest rewards (item words)
- **Narration** describes quests (grammar + abstract nouns)

Quest names and descriptions use i+1 validated text. The vocabulary comes from the systems above — quests are the vehicle that motivates the player to engage with all of them.

---

## How the SRS Meta-AI Directs Gameplay

The game world is organized by word frequency. Every area, creature, NPC, and item is tagged with a frequency tier. The SRS acts as a meta-AI that knows:
- What words the player has learned (from JPDB sync + in-game tracking)
- What words the player needs to review (spaced repetition schedule)
- What words the player is ready to learn next (i+1 candidates)

**The SRS curates the player's options, but the player always chooses.** After completing an area, the player picks from 2–3 next areas — all appropriate for their current vocabulary level. Within an area, which creatures spawn, which NPCs appear, and which items drop are all influenced by what words the player needs exposure to.

Early explorations naturally lead to areas with high-frequency words. As the player progresses, the SRS opens up areas with lower-frequency content. A player who has mastered ~1,000 words will never be offered an area whose creatures use rank-5,000 Japanese words — the SRS ensures every encounter is productive.

This means **the game is always tailored to the player's vocabulary level**. Two players at different levels exploring the "same" area may encounter different creatures, different item drops, and different narration complexity.

---

## 10-Stage Content Plan

Each stage defines both a **content tier** (what exists in the game world at this frequency band) and a **development milestone** (what you need to build). Stages are cumulative.

The stages are organized by a **curated word list** that combines WaniKani levels with JPDB frequency data into a single progression. The exact word assignments per stage will be determined when that curated list is built. The numbers below are targets — the curated list is the source of truth.

### Stage 1: Foundation
**~400 words | Highest-frequency core vocabulary**

**Player experience:** The tutorial and first explorations. The player learns how combat works, befriends their first creatures, and explores a handful of areas near the starting town. Everything uses the most common Japanese words. Simple narration: short sentences, basic grammar.

**What the SRS does:** At this stage, the SRS is mostly passive. Content is linear — there aren't enough areas for meaningful choice. The SRS tracks what the player has seen and ensures speed review covers the words from their encounters.

| System | Content | Words | Dev Deliverables |
|---|---|:---:|---|
| Creatures | 40 | 80 | Current roster (~37), polish and fill gaps |
| Moves | 150 | 150 | Current roster, all tier 1 |
| Items | 30 | 40 | Current roster (~27), add a few compounds |
| Equipment | — | — | Not yet introduced |
| Crafting | — | — | Not yet introduced |
| Town | — | — | Not yet introduced |
| Areas | 5 + sub-areas | 50 | Current 5 areas, add 5–8 sub-areas each |
| NPCs | 5 | 15 | Current 3 + 2 new, add occupations |
| Narration | Basic i+1 | ~65 | Current narration engine |
| **Total** | | **~400** | |

**Dev focus:** Prove the core loop. Combat teaches words. Speed review reinforces. Creature collection motivates exploration.

---

### Stage 2: First Expansion
**~800 words | Common everyday vocabulary**

**Player experience:** The world opens up. The player discovers their home base town and starts building it. Equipment drops from defeated rival trainers. Crafting resources appear in sub-areas. The player has 10 areas to explore and starts seeing meaningful choices — the SRS offers 2 area options after each completion, both containing words the player is ready for.

**What the SRS does:** With 10 areas, the SRS begins actively curating. If the player needs to review 森-related words, it offers areas with forest sub-areas. If they're ready for water vocabulary, a lake or ocean area appears as an option.

| System | Content | Words | Dev Deliverables |
|---|---|:---:|---|
| Creatures | 70 total | 140 | +30 creatures with unique bases/modifiers |
| Moves | 200 total | 200 | +50 moves, introduce tier 2 |
| Items | 50 total | 65 | +20 items, first compound decompositions |
| Equipment | 15 pieces | 15 | **New system!** 1 slot per creature, basic weapons |
| Crafting | 10 resources | 10 | **New system!** Gathering from sub-areas |
| Town | 5 buildings | 10 | **New system!** First buildings: shop, inn, training |
| Areas | 10 + sub-areas | 100 | +5 areas, sub-area system fully online |
| NPCs | 20 total | 50 | +15 NPCs: shopkeepers, first rival trainers |
| Narration | Expanded | ~210 | Text cache system, more grammar variety |
| **Total** | | **~800** | |

**Dev focus:** Introduce town, equipment, crafting. Sub-areas go live. SRS begins curating area options.

---

### Stage 3: Core Systems Complete
**~1,500 words | Solid beginner vocabulary**

**Player experience:** All 8 game systems are active. The town is growing — the player builds a hospital, library, market. Rival trainers appear as area bosses with their own creature teams. The crafting economy connects gathering → crafting → equipment/items. Quests from town NPCs send the player to specific areas. The SRS is now fully active, weaving review words into every encounter.

**What the SRS does:** Full operation. Every area choice, creature spawn, and item drop is influenced by what words the player needs. The narration engine uses progressively complex sentences as the player's grammar vocabulary grows.

| System | Content | Words | Dev Deliverables |
|---|---|:---:|---|
| Creatures | 120 total | 240 | Creature rarity system (common/uncommon/rare) |
| Moves | 300 total | 300 | Full tier 2, introduce tier 3 |
| Items | 70 total | 100 | Compound + single mix, all item types represented |
| Equipment | 30 total | 30 | Material-based naming (鉄の剣, etc.) |
| Crafting | 25 total | 25 | Recipes for items + equipment |
| Town | 12 buildings | 25 | All core building types present |
| Areas | 20 + sub-areas | 160 | Biome variety (forest, mountain, ocean, desert, ruins) |
| NPCs | 40 total | 100 | All NPC roles active (residents, trainers, quest-givers) |
| Narration | Full cache | ~520 | Per-user text cache, background refresh |
| **Total** | | **~1,500** | |

**Dev focus:** All systems online. Crafting economy. Quest system. Full SRS curation.

---

### Stage 4: N5/N4 Coverage
**~2,200 words | Basic conversational vocabulary**

**Player experience:** A player at this stage can understand simple Japanese conversations. The town is thriving — creatures roam the streets alongside humans. Story quests reveal the world's lore. Areas are thematically rich with detailed sub-areas. The player has a diverse creature collection and starts specializing builds.

**What the SRS does:** Introduces review-focused encounters. If the player hasn't seen a word in 2+ weeks, the SRS increases its spawn rate — the creature with that Japanese word appears more often, the area with that thematic word gets offered as a choice.

| System | Content | Words | Dev Deliverables |
|---|---|:---:|---|
| Creatures | 180 total | 360 | Epic rarity tier, element specialization |
| Moves | 400 total | 400 | Spaced repetition validated per move-pool doc |
| Items | 90 total | 135 | Tiered items (basic → advanced) |
| Equipment | 45 total | 45 | Crafted equipment progression |
| Crafting | 40 total | 40 | Tiered resources matching area difficulty |
| Town | 18 buildings | 40 | Upgrade paths (小さな市場 → 大きな市場) |
| Areas | 28 + sub-areas | 225 | 28 unique biomes, thematic depth |
| NPCs | 60 total | 160 | Story NPCs, recurring rival trainers |
| Narration | Rich | ~795 | Complex sentence structures, conjunctions |
| **Total** | | **~2,200** | |

**Dev focus:** Story content. Building upgrade system. Review-focused SRS encounters.

---

### Stage 5: N3 Entry
**~3,000 words | Intermediate reading ability**

**Player experience:** The player can read simple articles in Japanese. The game world feels expansive — 35 areas across diverse biomes. Half the creature roster exists. The town is a bustling utopia. Narration uses compound sentences, varied conjunctions, and nuanced vocabulary. The player starts encountering literary/poetic words in rare creature names and high-tier moves.

| System | Content | Words | Dev Deliverables |
|---|---|:---:|---|
| Creatures | 250 total | 500 | Half roster, legendary tier introduced |
| Moves | 500 total | 500 | Full tier 3, introduce tier 4 |
| Items | 110 total | 165 | Rare crafted items |
| Equipment | 60 total | 60 | Element-aligned gear |
| Crafting | 55 total | 55 | Advanced recipes |
| Town | 22 buildings | 50 | Specialized buildings (図書館, 道場) |
| Areas | 35 + sub-areas | 280 | 70% of final area count |
| NPCs | 80 total | 210 | Full quest chains |
| Narration | Mature | ~1,180 | Literary narration for advanced areas |
| **Total** | | **~3,000** | |

**Dev focus:** Content depth over breadth. Polish existing systems. Literary narration tier.

---

### Stage 6: N3 Complete
**~3,800 words | Solid intermediate vocabulary**

| System | Content | Words | Dev Deliverables |
|---|---|:---:|---|
| Creatures | 300 total | 600 | Cross-area rare spawns |
| Moves | 600 total | 600 | Full tier 3 + early tier 4 |
| Items | 125 total | 190 | Area-exclusive items |
| Equipment | 70 total | 70 | Endgame equipment tier |
| Crafting | 65 total | 65 | Rare material system |
| Town | 25 buildings | 55 | Town reputation/prosperity system |
| Areas | 40 + sub-areas | 320 | 80% of final area count |
| NPCs | 95 total | 250 | NPC relationship depth |
| Narration | Advanced | ~1,650 | Multiple speech registers (formal, casual, poetic) |
| **Total** | | **~3,800** | |

**Dev focus:** Endgame loops. Town prosperity. NPC relationships.

---

### Stage 7: N2 Entry
**~4,400 words | Pre-advanced vocabulary**

| System | Content | Words | Dev Deliverables |
|---|---|:---:|---|
| Creatures | 350 total | 700 | 70% of roster |
| Moves | 700 total | 700 | Deep tier 4 |
| Items | 135 total | 200 | Prestige consumables |
| Equipment | 80 total | 80 | Set bonuses |
| Crafting | 75 total | 75 | Master crafting recipes |
| Town | 28 buildings | 65 | Cultural buildings (劇場, 美術館) |
| Areas | 43 + sub-areas | 340 | Post-game challenge areas |
| NPCs | 105 total | 275 | Post-game NPC arcs |
| Narration | Full register | ~1,965 | Keigo (polite speech) in formal NPC dialogue |
| **Total** | | **~4,400** | |

**Dev focus:** Post-game content. Challenge areas. Prestige systems.

---

### Stage 8: N2 Mid
**~5,100 words | University/professional vocabulary**

| System | Content | Words | Dev Deliverables |
|---|---|:---:|---|
| Creatures | 400 total | 800 | 80% of roster |
| Moves | 800 total | 800 | Compound verbs (打ち込む, 切り裂く) |
| Items | 140 total | 210 | Legendary items |
| Equipment | 85 total | 85 | Legendary equipment |
| Crafting | 85 total | 85 | Endgame material chains |
| Town | 30 buildings | 70 | Full town infrastructure |
| Areas | 46 + sub-areas | 355 | 92% of final area count |
| NPCs | 115 total | 290 | Master-tier trainers |
| Narration | Mature | ~2,405 | Near-native narration complexity |
| **Total** | | **~5,100** | |

**Dev focus:** Content completeness. Compound verb moves. Legendary tier.

---

### Stage 9: N2 Complete
**~5,700 words | Strong intermediate-advanced vocabulary**

| System | Content | Words | Dev Deliverables |
|---|---|:---:|---|
| Creatures | 450 total | 900 | 90% of roster |
| Moves | 900 total | 900 | Near-complete verb coverage |
| Items | 145 total | 218 | Polish and fill gaps |
| Equipment | 90 total | 90 | Complete equipment tree |
| Crafting | 90 total | 90 | All recipes available |
| Town | 32 buildings | 75 | Flourishing utopia |
| Areas | 48 + sub-areas | 370 | 96% of final area count |
| NPCs | 125 total | 300 | Full NPC roster minus final additions |
| Narration | Near-complete | ~2,757 | Full grammar coverage |
| **Total** | | **~5,700** | |

**Dev focus:** Gap filling. Balancing. Polish.

---

### Stage 10: Full Coverage
**~6,300 words | Complete WaniKani + JPDB curated curriculum**

| System | Content | Words | Dev Deliverables |
|---|---|:---:|---|
| Creatures | 500 total | 1,000 | Full roster |
| Moves | 1,000 total | 1,000 | Full move pool |
| Items | 150 total | 225 | Full item catalog |
| Equipment | 100 total | 100 | Full equipment tree |
| Crafting | 100 total | 100 | Full resource/recipe system |
| Town | 35 buildings | 100 | Complete utopia town |
| Areas | 50 + sub-areas | 380 | All 50 areas with 5–8 sub-areas each |
| NPCs | 140 total | 300 | Full NPC world |
| Narration | Complete | ~3,095 | Full grammar + function word coverage |
| **Total** | | **~6,300** | |

**Player experience at Stage 10:** The player can read most Japanese text they encounter in daily life. The town is a thriving utopia where 140 NPCs live and work alongside 500 creature species. The game world spans 50 areas with 250–400 sub-areas. Every corner of the world teaches vocabulary, and the SRS ensures no word is forgotten.

**Dev focus:** Content complete. Ongoing balance and seasonal content if player demand exists.

---

### Stage Summary

| Stage | Words | Areas | Creatures | Moves | NPCs | Key Milestone |
|---|:---:|:---:|:---:|:---:|:---:|---|
| 1 | 400 | 5 | 40 | 150 | 5 | Core loop proven |
| 2 | 800 | 10 | 70 | 200 | 20 | Town + equipment + crafting debut |
| 3 | 1,500 | 20 | 120 | 300 | 40 | All 8 systems online |
| 4 | 2,200 | 28 | 180 | 400 | 60 | N5/N4 complete, story quests |
| 5 | 3,000 | 35 | 250 | 500 | 80 | N3 entry, half creature roster |
| 6 | 3,800 | 40 | 300 | 600 | 95 | N3 complete, endgame loops |
| 7 | 4,400 | 43 | 350 | 700 | 105 | N2 entry, post-game content |
| 8 | 5,100 | 46 | 400 | 800 | 115 | N2 mid, compound verbs |
| 9 | 5,700 | 48 | 450 | 900 | 125 | N2 complete, polish |
| 10 | 6,300 | 50 | 500 | 1,000 | 140 | Full coverage, content complete |

---

## Art Asset Requirements by Stage

Every game object needs a visual asset. This section tracks what art is required at each stage and the current inventory.

### Sprite Sizes

| Asset Type | Size | Format |
|---|---|---|
| Creatures (static) | 1024x1024 | WebP, transparent background |
| Creatures (idle animation) | 480x480 → trimmed to 330px | Animated WebP, transparent, 24fps looping |
| NPCs / Rival trainers | 1024x1024 | WebP, transparent background |
| Bosses | 1024x1024 | WebP, transparent background |
| Moves (action icons) | 128x128 | WebP, transparent background |
| Items | 128x128 | WebP, transparent background |
| Equipment icons | 128x128 | WebP, transparent background |
| Crafting resource icons | 128x128 | WebP, transparent background |
| Area backgrounds | 1536x1024 | WebP, full bleed |
| Town building art | TBD | TBD |

All sprites must be well-drawn illustrations, NOT pixel art.

**Creature sprites require TWO assets each:** a static sprite (fallback) and a looping idle animation (animated WebP, 49 frames at 24fps). The idle animation is generated via the ComfyUI WAN I2V pipeline — see `docs/creature-animation-pipeline.md` for the full workflow. This doubles the effective creature art count.

### Current Inventory (as of 2026-03-01)

| Asset Type | Count |
|---|---:|
| Creatures (static + idle) | 37 + 37 idle |
| Moves (action icons) | 195 |
| Items | 81 |
| NPCs | 5 |
| Bosses | 0 |
| Equipment icons | 0 |
| Crafting resource icons | 0 |
| Area background sets | 5 areas x 20 variants |
| Town building art | 0 |

### Cumulative Asset Targets per Stage

Each creature requires a static sprite AND an idle animation (2 files per creature).

| Asset Type | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 | S10 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Creatures (x2 each) | 40 | 70 | 120 | 180 | 250 | 300 | 350 | 400 | 450 | 500 |
| Moves | 150 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 1,000 |
| Items | 30 | 50 | 70 | 90 | 110 | 125 | 135 | 140 | 145 | 150 |
| Equipment | — | 15 | 30 | 45 | 60 | 70 | 80 | 85 | 90 | 100 |
| Crafting resources | — | 10 | 25 | 40 | 55 | 65 | 75 | 85 | 90 | 100 |
| NPCs | 5 | 20 | 40 | 60 | 80 | 95 | 105 | 115 | 125 | 140 |
| Area BG sets | 5 | 10 | 20 | 28 | 35 | 40 | 43 | 46 | 48 | 50 |
| Town buildings | — | 5 | 12 | 18 | 22 | 25 | 28 | 30 | 32 | 35 |

### New Art Required per Stage (Delta)

| Asset Type | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 | S10 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Creatures (x2 each) | — | +30 | +50 | +60 | +70 | +50 | +50 | +50 | +50 | +50 |
| Moves | — | +5 | +100 | +100 | +100 | +100 | +100 | +100 | +100 | +100 |
| Items | — | +20 | +20 | +20 | +20 | +15 | +10 | +5 | +5 | +5 |
| Equipment | — | +15 | +15 | +15 | +15 | +10 | +10 | +5 | +5 | +10 |
| Crafting resources | — | +10 | +15 | +15 | +15 | +10 | +10 | +10 | +5 | +10 |
| NPCs | — | +15 | +20 | +20 | +20 | +15 | +10 | +10 | +10 | +15 |
| Area BG sets | — | +5 | +10 | +8 | +7 | +5 | +3 | +3 | +2 | +2 |
| Town buildings | — | +5 | +7 | +6 | +4 | +3 | +3 | +2 | +2 | +3 |

Stage 1 is covered by the current inventory. Stage 2 is where new art production begins — equipment icons, crafting resources, town buildings, and 15 additional NPCs are the key new asset types.

### Grand Total at Stage 10

~2,825 unique art files: 500 creatures x 2 (static + idle animation) = 1,000 files, 1,000 move icons, 150 item icons, 100 equipment icons, 100 crafting icons, 140 NPCs, ~300 area backgrounds (50 areas x ~6 each), and 35 town building illustrations.

### Freelance Art Budget Estimate

Based on Fiverr commission market rates for fakemon/creature design, RPG icons, and 2D game backgrounds (as of early 2026).

**Per-asset rates (bulk/batch pricing):**

| Asset Type | Rate | Source |
|---|---|---|
| Creature (static illustration) | ~$15 | Fakemon commissions, $5–$25 range |
| Creature (idle animation loop) | ~$10 | Simple breathing/sway loop, $5–$10 range |
| Move/item/equip/craft icon | ~$4 | RPG skill icons in batch, $3–$5 range |
| NPC (full illustration) | ~$20 | Same complexity as creatures |
| Area background (full scene) | ~$30 | 2D game environments, $10–$45 range |
| Town building illustration | ~$15 | Simpler than full scenes |

**Cost per stage (new art only):**

| Stage | Creatures | Icons | NPCs | Backgrounds | Town | Est. Total |
|---|---|---|---|---|---|---|
| S1 | covered | covered | covered | covered | — | ~$0 |
| S2 | 30 x $25 | 50 x $4 | 15 x $20 | 30 x $30 | 5 x $15 | ~$2k |
| S3 | 50 x $25 | 150 x $4 | 20 x $20 | 60 x $30 | 7 x $15 | ~$4k |
| S4 | 60 x $25 | 150 x $4 | 20 x $20 | 48 x $30 | 6 x $15 | ~$4k |
| S5 | 70 x $25 | 150 x $4 | 20 x $20 | 42 x $30 | 4 x $15 | ~$4k |
| S6–S10 | 250 x $25 | 505 x $4 | 60 x $20 | 81 x $30 | 13 x $15 | ~$12k |
| **Full game** | | | | | | **~$26k** |

**Breakdown by category (full game):**

| Category | Assets | Est. Cost |
|---|---|---|
| Creatures (static + idle) | 500 x 2 | ~$12.5k |
| All icons (moves + items + equip + craft) | 1,350 | ~$5.5k |
| NPCs | 140 | ~$2.8k |
| Area backgrounds | ~300 | ~$9k |
| Town buildings | 35 | ~$0.5k |
| **Total** | **~2,825 files** | **~$26k** |

Creatures are ~48% of total art spend. Backgrounds are ~35%. Icons are cheap in bulk.

---

## Design Rules for Future Content

1. **Every game object must teach at least 1 word.** No creature, item, NPC, area, or building exists without a vocabulary purpose.

2. **Word type determines game system.** Verbs → moves. Concrete nouns → creatures/items/equipment. Place nouns → areas/town. People nouns → NPCs. Grammar → narration. Don't force words into wrong systems.

3. **Overlap is a feature.** The same word appearing in multiple systems (creature modifier AND area modifier AND narration adjective) strengthens retention through varied context.

4. **Frequency rank determines progression.** High-frequency words (JPDB rank 1–2,000) appear in early stages. Low-frequency words (rank 6,000+) are late-game content. This ensures the player learns the most useful words first.

5. **Compounds are allowed but never forced.** Items and equipment can be compound words with decomposition shown, or single words. The data structure supports both.

6. **No standalone enemies.** All combat is creature vs creature. Enemy NPCs are rival trainers who command creature teams.

7. **Sub-area pools are shared.** Sub-area location nouns and modifiers repeat across core areas. This maximizes repetition across different contexts.

8. **Quests are delivery mechanisms.** They combine vocabulary from NPCs, areas, creatures, and narration. They don't own unique words.

9. **Town buildings absorb structure vocabulary.** Words like 塔, 橋, 門, 市場, 図書館 are things the player builds, not creature names.

10. **Narration carries grammar — and that's correct.** Function words, particles, adverbs, counters, and abstract nouns only make sense in sentences. The i+1 narration engine is the right vehicle for ~50% of the vocabulary.

11. **Crafting teaches compound words by doing.** Food/item crafting combines two ingredient words into a compound word. The player builds the word by combining its parts — this is the most powerful compound word teaching mechanic.

12. **Every creature has a purpose.** Creatures either explore with the player or work in town buildings. No creature sits idle. This incentivizes collecting more creatures (more vocabulary exposure) and creates cross-system word pairings between creature names and building names.
