# Koto (琴) — Game Design Document

**Last updated:** 2026-03-01
**Status:** Living document — the single source of truth for Koto's game design vision.

This document describes the **target vision** for Koto. Systems marked with ✅ are implemented; systems marked with 📋 are designed but unbuilt. Current implementation details live in [ARCHITECTURE.md](ARCHITECTURE.md); this document focuses on *where we're going*.

---

## Table of Contents

1. [Vision & Identity](#1-vision--identity)
2. [World & Setting](#2-world--setting)
3. [Story & Narrative Arc](#3-story--narrative-arc)
4. [Core Learning Philosophy](#4-core-learning-philosophy)
5. [The Vocabulary Architecture](#5-the-vocabulary-architecture)
6. [Progressive Language System](#6-progressive-language-system)
7. [Player Journey](#7-player-journey)
8. [Creatures](#8-creatures)
9. [Combat](#9-combat)
10. [Exploration & Areas](#10-exploration--areas)
11. [Items, Crafting & Equipment](#11-items-crafting--equipment)
12. [Town & Base Building](#12-town--base-building)
13. [NPCs & Social Systems](#13-npcs--social-systems)
14. [Narration Engine](#14-narration-engine)
15. [Meta-Progression](#15-meta-progression)
16. [Content Roadmap](#16-content-roadmap)
17. [Art Direction](#17-art-direction)
18. [Audio & Music](#18-audio--music)
19. [Design Principles & Constraints](#19-design-principles--constraints)

---

## 1. Vision & Identity

**Koto** is a Japanese vocabulary learning RPG. The player explores a vibrant world, befriends creatures, and learns Japanese through immersive gameplay.

**The elevator pitch:** Pokemon meets Duolingo, but instead of flashcard drills, every game mechanic *is* the learning. Creature names are nouns, moves are verbs, areas are location words, narration teaches grammar. A player who finishes the game has learned ~6,000 Japanese words — enough to read most everyday text — and they learned them by *playing*, not studying.

**What makes Koto different from other language learning games:**

- **Vocabulary drives mechanics.** Most games retrofit language onto existing gameplay. Koto designs mechanics around word types. If a category of words doesn't have a natural game system, we build one.
- **Comprehensible input, not translation drills.** The player reads Japanese in context — room descriptions, creature names, NPC dialogue — not isolated flashcard prompts. Every sentence is personalized to contain only words they know plus one new word (i+1).
- **The game is the curriculum.** Word frequency data determines which creatures, areas, and items exist. High-frequency words appear early; rare words are endgame content. The player's vocabulary level *is* their game progression.

**Platform:** Mobile-first web app (PWA). Designed for iPhone, works everywhere.

**Target audience:** English speakers learning Japanese, from absolute beginners to intermediate learners (JLPT N5 through N2).

---

## 2. World & Setting

### The World

A fantastical world inspired by Earth — futuristic, utopian, and alive with color. Humans and creatures coexist in a prosperous civilization. Each region is named with real Japanese vocabulary because the names themselves are learning content.

Think **Genshin Impact's world design** meets **Pokemon's creature partnership**.

### Conflict

A mysterious disruption is spreading across the world, causing normally peaceful creatures to become wild and aggressive. The player travels to different areas to investigate the disruption, calm agitated creatures, and befriend them to restore harmony.

- **Combat = calming/befriending**, not killing
- Creatures are not evil — they're confused and need help
- The player builds a team of befriended creatures who fight alongside them

### Tone

- **Bright, hopeful, adventurous** — this is an optimistic world worth protecting
- Saturday morning anime energy
- Visual references: Genshin Impact, Pokemon, Honkai Star Rail, Xenoblade Chronicles
- **NOT**: dark, dystopian, cyberpunk, grimdark, horror, post-apocalyptic

### Naming Philosophy

Every name in the game teaches Japanese vocabulary:

- **Creatures** are named from Japanese words — a base noun (concrete object) plus a modifier (adjective)
- **Areas** are named from Japanese location and nature words
- **Items** are named from Japanese food and object words
- **NPCs** are named from personality and nature nouns
- Names are sourced from frequency-ranked word lists (JPDB deck 81). Learning comes first — names are **never** changed for lore or aesthetic reasons.

---

## 3. Story & Narrative Arc

> 📋 **This section is a placeholder.** The story framework is established (mysterious disruption, creature calming, restoring harmony) but the full narrative arc — act structure, key plot beats, antagonist identity, climax, and resolution — has not been designed.

### What Exists

- **Setup:** A mysterious disruption causes peaceful creatures to become wild and aggressive
- **Player role:** Traveler investigating the disruption, calming creatures, befriending them
- **Moment-to-moment:** Creature-vs-creature combat framed as calming/befriending encounters
- **World state:** The disruption is ongoing; areas vary in severity

### What Needs Design

- **Act structure:** How many acts? What are the major turning points?
- **The source of the disruption:** What is causing creatures to go wild? Is it a natural phenomenon, an entity, a cycle?
- **Antagonist:** Is there one? A rival? A force of nature? An organization?
- **Escalation:** How does the threat grow across 50 areas and 10 stages of content?
- **Climax and resolution:** What does "winning" look like narratively, beyond completing 10 areas?
- **Character arc:** How does the player character change? Do they start as a novice and become a master?
- **Thematic resonance:** The game teaches language through connection and understanding. The story should mirror this — perhaps the disruption is a communication breakdown, and the player's growing ability to understand Japanese *is* the narrative solution.
- **NPC arcs:** How do key NPCs' stories interweave with the main plot?

### Design Constraints for Story

The story must serve the learning system, not compete with it:

1. **No cutscene-heavy narrative** — story is delivered through the same i+1 narration system, meaning it must be expressible within the player's vocabulary
2. **Progressive revelation** — the story can only use concepts the player has words for. Early story beats use simple vocabulary; the full truth requires advanced words
3. **Story motivates exploration** — plot beats should drive the player to new areas (new vocabulary tiers)
4. **No skippable story** — if story text exists, it's learning content. Every line teaches words.

---

## 4. Core Learning Philosophy

### Comprehensible Input (i+1)

**Every piece of Japanese text shown to the player must contain only words they already know, plus at most 1 unknown word.** This is not a guideline — it is the entire purpose of the game. Showing unvalidated Japanese text is a critical bug.

This principle comes from linguist Stephen Krashen's Input Hypothesis: language acquisition happens when learners receive input that is slightly beyond their current level. If the input is too simple, nothing new is learned. If it's too complex, nothing is understood. The sweet spot — *i+1* — is where acquisition happens naturally.

In Koto, this manifests as:

- **AI-generated narration** validated against each player's known vocabulary before display
- **Vocabulary-constrained prompts** that tell the AI exactly which words are available
- **Repair loops** that rewrite any text containing too many unknown words
- **Static text** (creature names, move names, item names) curated from frequency-ranked word lists

### Spaced Repetition (SRS)

Words aren't just introduced — they're systematically reviewed. Koto integrates with JPDB's spaced repetition system to ensure words due for review appear more frequently in gameplay:

- **60%** of AI narration word suggestions are words due for review
- **25%** are words currently being learned
- **15%** are known words (for natural sentence variety)

The player never sees an explicit "review session." The SRS operates invisibly — it influences which creatures spawn, which areas are offered, and which words appear in narration. The game *is* the review.

### Active vs. Passive Learning

Koto uses both, deliberately:

| Mode | Mechanic | Why |
|---|---|---|
| **Active** | Choosing moves in combat, selecting dialogue options, crafting compounds | Forces reading, processing, and decision-making with Japanese words |
| **Passive** | Area names on screen, creature names in party view, inventory browsing | Low-effort repetition that builds familiarity without fatigue |

Active learning introduces words. Passive exposure cements them. Both are necessary — the game balances them across every session.

### Translation Accuracy

This is a language learning game — every translation becomes something the player memorizes. Creative liberties with meaning are as bad as teaching the wrong word.

- **Transitivity matters:** 狂う means "go mad" (intransitive), NOT "drive mad" (transitive)
- **Use primary dictionary definitions:** Present the most common meaning first
- **No embellishment:** Don't upgrade "scatter" to "shatter" or "invite" to "lure" to sound cooler for a game ability
- **When in doubt, check a dictionary.** Say "I'm unsure" rather than guess.

---

## 5. The Vocabulary Architecture

### The Grand Strategy

**Vocabulary needs drive game mechanics, not the other way around.** If a word type doesn't have a natural game system to teach it, we design a new mechanic — we don't force words into ill-fitting systems or dump them into narration.

The game teaches ~6,300 words, mapped to WaniKani's 60-level curriculum and ranked by JPDB frequency data.

### System Overview

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

### Word Type → System Mapping

Each word type has a natural home:

| Word Type | System | Why |
|---|---|---|
| Animal/plant/concept nouns | Creatures | Natural creature identity — you picture it immediately |
| Adjectives | Creature modifiers, area modifiers | Paired with nouns for reinforced context |
| Action verbs | Moves | Combat makes verbs feel like actions, not vocabulary |
| Food/medicine nouns | Consumable items | Buy, craft, and use — functional context |
| Weapon/armor/material nouns | Equipment | Equip and view — persistent display |
| Raw material nouns | Crafting resources | Gather and combine — goal-driven learning |
| Structure/place nouns | Town buildings | Build and visit — repeated interaction |
| Location nouns | Areas and sub-areas | Always on screen during exploration |
| Occupation/social nouns | NPCs | Talk, trade, quest — relationship context |
| Grammar, particles, adverbs, counters, abstract nouns | Narration | Only make meaning in sentences — i+1 engine teaches them |

### Cross-System Reinforcement

The same word appearing across multiple systems strengthens retention. This overlap is deliberate:

A single combat encounter in 凍った湖 (Frozen Lake) exposes the player to:
- **Area words:** 凍った (frozen) + 湖 (lake) — on screen at all times
- **Creature bases:** 魚 (fish), 亀 (turtle) — on attack cards
- **Creature modifiers:** 冷たい (cold), 透明な (transparent) — on creature info
- **Move verbs:** 凍る (freeze), 流れる (flow), 守る (protect) — every attack
- **Thematic words:** 反射 (reflection), 沈黙 (silence) — in room descriptions
- **Grammar words:** また (again), 静かに (quietly) — in every sentence

**12+ unique words reinforced across 6 channels simultaneously.** This is the fundamental advantage of building a game *around* vocabulary rather than bolting vocabulary *onto* a game.

### How the SRS Meta-AI Directs Gameplay

The game world is organized by word frequency. Every area, creature, NPC, and item is tagged with a frequency tier. The SRS acts as a meta-AI that knows:
- What words the player has learned
- What words need review (spaced repetition schedule)
- What words they're ready to learn next (i+1 candidates)

**The SRS curates the player's options, but the player always chooses.** After completing an area, they pick from 2–3 options — all appropriate for their vocabulary level. Within an area, which creatures spawn, which NPCs appear, and which items drop are all influenced by what words the player needs.

This means **the game is tailored to each player's vocabulary.** Two players at different levels exploring the "same" area may encounter different creatures, different items, and different narration complexity.

---

## 6. Progressive Language System

### The Problem

The i+1 system assumes a baseline vocabulary (*i* must exist before *i+1* makes sense). But new players know zero Japanese. How do you bootstrap the first 100 words?

### Three-Phase Narration Model

#### Phase 1: Bootstrap (0–100 words) 📋

Hand-authored English narration with tagged Japanese word replacements. The player reads English with strategically placed Japanese words that are taught through context and repetition.

**Tagged text format:**
```
A cold {wind|風|かぜ|kaze} blew through the {forest|森|もり|mori}.
```

The first ~20 words are taught during a guided prologue. The next ~80 words are introduced across 3 guided runs. Every tagged word is tracked per-player — the system knows exactly how many times each player has seen each word.

**Progressive scaffolding:** As the player sees a word more times, annotations are gradually removed:

| Stage | Exposures | Display | Example |
|---|---|---|---|
| Full scaffold | 1–3 | Furigana + romaji + English | 風 (かぜ, kaze: wind) |
| Partial scaffold | 4–9 | Furigana + English | 風 (かぜ: wind) |
| Furigana only | 10+ | Furigana | 風 (かぜ) |
| Bare | Mastered | No annotations | 風 |

This gradual stripping forces the player to rely less on crutches as the word becomes familiar. The word doesn't disappear — the *scaffolding* does.

#### Phase 2: Transition (100–~250 words) 📋

AI generates English text with strategic Japanese insertions. The AI knows the player's word list and introduces 1 new word per narration block. English naturally decreases as vocabulary grows — a player with 200 known words sees significantly more Japanese than one with 110.

The same progressive scaffolding from Phase 1 applies to every word the player has learned.

#### Phase 3: Full Japanese (~250+ words) ✅

Pure Japanese narration using the i+1 principle. This is the steady state for the rest of the game. The vocabulary repair system validates all AI-generated text against the player's known words and rewrites any sentence with more than 1 unknown word.

### Word Curriculum (~100 bootstrap words)

Curated for high frequency (JPDB/WaniKani), game relevance, and narrative usefulness:

| Category | ~Count | Examples |
|---|---|---|
| Core verbs | 20 | 行く, 見る, 食べる, 使う, 聞く |
| Common nouns | 25 | 水, 火, 森, 町, 人 |
| Nature/creatures | 15 | 空, 星, 風, 月, 光 |
| Adjectives | 15 | 強い, 大きい, 小さい, 新しい |
| Game actions | 10 | 戦う, 守る, 逃げる, 探す |
| Social/greetings | 10 | 友達, 名前, はい, ありがとう |
| Particles/grammar | 5 | の, は, を, に, と |

---

## 7. Player Journey

### Minute 1: First Launch

The player arrives in a bright, welcoming world. A short guided prologue introduces the setting in English with tagged Japanese words (Phase 1 bootstrap). They meet their first creature, learn what the disruption is, and set out.

### Hour 1: Learning the Loop

The player explores their first area, encountering wild creatures in every room. Combat teaches them creature names (nouns) and move names (verbs) through split attack cards that must be read and swiped. Between encounters, room narration introduces grammar words in context. After clearing the area, they've learned 30–50 words without realizing they were studying.

### Hours 2–5: The World Opens Up

By Stage 1 (~400 words), the player has a team of befriended creatures and has explored 5 areas. They start recognizing words across systems — 森 appears in area names, creature descriptions, and narration. The SRS begins offering area choices based on which words they need to review.

### Hours 5–15: Systems Come Online

Stage 2 (~800 words) introduces the town, equipment, and crafting. The player builds structures in their home base, assigns creatures to buildings, and crafts items by combining ingredient words into compound words. Every new system is another vocabulary channel. The narration has shifted from Phase 1 bootstrap to Phase 2 transition — less English, more Japanese.

### Hours 15–40: Full Japanese

By Stage 3 (~1,500 words), all 8 game systems are active. The player reads full Japanese narration (Phase 3) and understands most of it. NPCs offer quests, rival trainers challenge them, and the town is growing. The SRS is fully active, weaving review words into every encounter. The player can read simple Japanese outside the game.

### Hours 40–100+: Mastery

Stages 4–10 progressively expand the world from 2,200 to 6,300 words. The narration grows from simple sentences to complex literary prose. The player encounters compound verbs, keigo (polite speech), and specialized vocabulary. By endgame, they can read most Japanese text they encounter in daily life.

### The Endgame Loop

A player who reaches Stage 10 has:
- **500 creatures** in their collection, each teaching 2 unique words
- **1,000 moves** covering nearly every common Japanese verb
- **A thriving town** of 35 buildings with creature workers
- **50 explored areas** spanning diverse biomes
- **140 NPC relationships** built through creature-vs-creature combat and dialogue
- **~6,300 Japanese words** — equivalent to JLPT N2+ proficiency

The SRS continues operating even at endgame, using the full game world to review words at optimal intervals.

---

## 8. Creatures

### Core Design

Every creature teaches exactly 2 vocabulary words:
- **Base word** (concrete noun): the creature's identity (e.g., 亀 = turtle, 星 = star)
- **Modifier** (adjective): the creature's quality (e.g., 古代の = ancient, 冷たい = cold)

Full name example: **古代の亀** (Ancient Turtle) — teaches both 古代 and 亀.

No two creatures share a base word or modifier. 500 creatures = 500 unique nouns + 500 unique adjectives = 1,000 words.

### Learning Through Combat

The **split attack card** is the highest-repetition vocabulary mechanic in the game. Every time any creature acts in combat — the player's or the opponent's — the card displays the creature's base word with reading and English meaning. A player who fights 10 battles per session with 3 creatures sees creature words **100+ times per session**.

Cards must be **clicked** to flip (reveals word and meaning), then **swiped** to act (right = knew it/attack, left = didn't know/defend). This forces active engagement — the player can't skip reading the word.

### Archetypes

| Archetype | HP | ATK | Role | Ultimate |
|---|---|---|---|---|
| Fighter | 1.0x | 1.0x | Balanced damage dealer | High-power single-target |
| Mage | 0.7–0.8x | 0.7–0.8x | Glass cannon | Devastating AoE (charges faster) |
| Trickster | 0.8–0.9x | 0.8–0.9x | Status disruptor | Status effects (sleep, stun, confuse, poison) |
| Tank/Healer | 1.5–1.75x | 0.7–0.8x | Resilient protector | Team heal or shield |

### Rarity

| Rarity | Stat Mult | Count | JPDB Range | Where Found |
|---|---|:---:|---|---|
| Common | 1.0x | 180 | rank 1–2,000 | Everywhere, early areas |
| Uncommon | 1.1x | 160 | rank 2,001–3,500 | Mid/late areas |
| Rare | 1.2x | 100 | rank 3,501–6,000 | Area-specific, 1–2 per area |
| Epic | 1.3x | 40 | rank 6,000–10,000 | Cross-area rare spawns |
| Legendary | 1.4x | 20 | rank 10,000+ | Unique boss creatures, quest rewards |

Rarity is tied to word frequency — common words make common creatures, rare words make rare creatures. This means early-game creatures use the most useful, everyday vocabulary.

### Element System (Wu Xing)

Five elements in a cycle: **Wood → Earth → Water → Fire → Metal → Wood**

Each element beats the next in the cycle, providing a 1.5x damage bonus. This creates team-building strategy (cover type weaknesses) while keeping the system simple enough to not distract from language learning.

### Dual Role: Explore or Work 📋

Every creature has two possible assignments:
1. **Exploration party** — joins the player in the field, fights in combat
2. **Town worker** — stays at a town building, contributes to its function

A creature at the 病院 (hospital) speeds healing. One at the 市場 (market) unlocks better shop inventory. This means every captured creature has a purpose — even ones not in the combat party — and creates cross-system vocabulary pairing (creature name displayed alongside building name).

### Befriending System ✅

Wild creatures are befriended through a 3-round dialogue encounter. The player converses with the confused creature, choosing i+1-validated Japanese dialogue options. Successful calming = creature joins the team. This frames acquisition as communication and empathy, not capture.

---

## 9. Combat

### Design Philosophy

Combat exists to create vocabulary repetitions, not to be a deep tactical system. It must be **simple enough** that the cognitive load stays on reading Japanese, not on optimizing strategy. Two stats. No crits, no misses, no defense calculations.

### Stats

Only two stats matter:

- **Attack** — damage output
- **Max HP** — survivability

That's it. No STR/AGI/VIT/INT/DEX/LUK. No hit chance. No defense stat. Damage is: `attack × move_power × element_multiplier × variance(0.85–1.15)`.

### Turn Structure

1. **Player's turn:** Choose a creature and a move. The split attack card shows the creature's base word and the move's verb — two vocabulary words per action.
2. **Enemy intent:** The opponent creature's intended action is shown before it acts. The player can react (use items, switch creatures).
3. **Resolution:** Damage applied, status effects processed.
4. **Repeat** until one side's creatures are all knocked out.

### Creature Party

- **3 active + 3 reserves** (6 total)
- **Point budget system:** Each creature costs rarity-based points (Common: 3, Uncommon: 4, Rare: 6, Epic: 7, Legendary: 8). Max budget: 10 points per team. This prevents stacking all legendaries.
- Knocked-out creatures can be revived with items.

### Moves

Every move is a Japanese verb. Move categories map verb types to gameplay effects:

| Category | Verb Types | Effect |
|---|---|---|
| Damage | Physical action, elemental | Deal damage |
| Heal | Care, recovery, life | Restore HP |
| Buff | Movement, perception, growth | Boost ally stats |
| Debuff | Emotion, communication, mental | Lower enemy stats |
| Shield | Defense, evasion, protection | Reduce damage |
| Drain | Transfer, taking | Damage + self-heal |

Non-combat verbs make great moves: 眠る (sleep) = status move, 歌う (sing) = team buff, 騙す (deceive) = debuff. This lets the game teach verbs far beyond "hit" and "attack."

### Move Progression

Each creature has a learnset of 8–10 moves, unlocking new ones every 2–3 levels:

| Tier | JPDB Range | Count | When |
|---|---|:---:|---|
| Tier 1 | rank 500–2,000 | ~180 | Starter moves, levels 1–5 |
| Tier 2 | rank 2,001–4,000 | ~220 | Levels 5–15 |
| Tier 3 | rank 4,001–8,000 | ~130 | Levels 16–25 |
| Tier 4 | rank 8,000+ | ~70 | Signature/prestige, level 25+ |

### Ultimate Abilities

Each creature has a powerful ultimate that charges over multiple turns. Archetypes determine charge speed and effect:
- **Fighters:** High single-target damage (5 turns to charge)
- **Mages:** Devastating AoE (3–4 turns — charges faster)
- **Tricksters:** Mass status effects
- **Tanks/Healers:** Team-wide heal or shield

### Status Effects

| Effect | Duration | Mechanic |
|---|---|---|
| Poison | 3 turns | Damage over time |
| Sleep | 1–2 turns | Skip turn, breaks on damage |
| Stun | 1 turn | Skip turn |
| Confuse | 2 turns | Random action targeting |
| Attack buff | 3 turns | +50% damage |
| Haste | 3 turns | Act first |
| Shield | Until broken | Absorbs X damage |
| Taunt | 2 turns | Force enemy to target this creature |

---

## 10. Exploration & Areas

### Area Structure

Each area is a `modifier + location noun` — two vocabulary words always on screen:

```
深い森 (Deep Forest)
├── 小さな池 (Small Pond)
├── 古い小屋 (Old Hut)
├── 暗い道 (Dark Path)
├── 隠れた泉 (Hidden Spring)
└── 苔の洞窟 (Mossy Cave)
```

The game targets **50 core areas** with **5–8 sub-areas each**, teaching ~330–380 location and descriptor words.

### Sub-Area Design ✅

Sub-areas turn anonymous dungeon rooms into named Japanese locations. Each sub-area is `modifier + location noun`, drawn from a shared pool that repeats across biomes.

**The key learning advantage:** Sub-area nouns repeat across different core areas. 池 (pond) appears in Deep Forest, Frozen Mountain, and Ruined Castle. The player sees the same word in 3+ different visual and narrative contexts — which is exactly how vocabulary sticks.

### Room Types

Each area generates 8–12 rooms in a branching structure. After the first room, the player chooses between left and right paths:

| Room Type | Frequency | Purpose |
|---|---|---|
| Encounter | 65% | Creature combat — vocabulary through battle |
| Shrine | 10% | Healing/buff — narrative vocabulary |
| Quiz | 10% | Knowledge test — active vocabulary recall |
| Word Discovery | 10% | Flashcard introduction of new words |
| Dealer | 10% | Creature trading — vocabulary through negotiation |
| Whack-a-Mole | 5% | Mini-game — vocabulary through speed |

### Area Selection

After completing an area, the player chooses between 2 options for their next destination. Both options are appropriate for their vocabulary level — the SRS curates which areas appear based on what words the player needs to review or learn next. This forced choice creates active reading (comparing two area names) and player agency.

### Run Structure ✅

A run consists of completing **10 areas** in sequence. Each area is a self-contained exploration with its own rooms, creatures, and sub-areas. Completing a run awards meta-progression rewards (essence).

---

## 11. Items, Crafting & Equipment

### Consumable Items (~225 words) — Partially ✅

Items teach food nouns, medicine words, katakana loanwords, and compound word formation.

**Crafting as compound word teaching** is the standout mechanic: the player combines two ingredient words and the resulting item name IS the compound formed from those ingredients. Combining 牛 (beef) + 汁 (soup) produces 牛汁 (beef soup). The player literally builds the word by combining its parts.

**Item types:**

| Type | Count | Effect | Word Pattern |
|---|:---:|---|---|
| Food/drink | ~55 | Heal HP | Food compounds or single food words |
| Medicine/herbs | ~20 | Cure status effects | Nature + medical words |
| Boost stones | ~25 | Permanent stat bonus | Descriptor + material |
| Battle tools | ~20 | Damage/debuff enemies | Action noun + object |
| Field tools | ~15 | Navigation, discovery | Object + purpose |
| Charms/talismans | ~15 | Buffs, elemental resistance | Element + charm |

### Equipment (~100 words) 📋

One equipment slot per creature. Simple system — no loadout complexity.

Equipment teaches weapon nouns (剣 sword, 弓 bow, 槍 spear), armor nouns (盾 shield, 鎧 armor), and material nouns (鋼 steel, 鉄 iron). Naming follows the pattern: `material + weapon type` (e.g., 鋼の剣 = Steel Sword).

Equipped items are persistently visible on the creature info panel, creating low-effort vocabulary reinforcement.

### Crafting Resources (~100 words) 📋

Raw materials found during exploration: 木 (wood), 鉄 (iron), 石 (stone), 草 (herb), 水 (water), 土 (earth), 砂 (sand).

Sub-areas determine what spawns — a pond sub-area yields water resources, a forest floor yields wood and herbs. This connects location vocabulary to resource vocabulary.

Three output channels:
1. **Consumable items** — compound word teaching through combination
2. **Equipment** — material-to-product relationship
3. **Town building upgrades** — crafting contributes to base building

---

## 12. Town & Base Building

> 📋 **This system is designed but not yet implemented.**

### What It Teaches

~100 structure/place nouns: 病院 (hospital), 学校 (school), 市場 (market), 宿 (inn), 図書館 (library), 道場 (dojo), 劇場 (theater), 美術館 (art museum).

### How the Player Learns

**Town overview screen.** The home base displays all built structures with Japanese names. Visited frequently between expeditions — every building name is passive vocabulary exposure.

**Building and upgrading.** Upgrades add modifiers, teaching adjective progression:
- 小さな市場 → 大きな市場 (Small Market → Big Market)
- 古い学校 → 新しい学校 (Old School → New School)

**Creature workers.** Creatures not in the exploration party are assigned to buildings:
- A creature at the 病院 speeds healing
- One at the 市場 unlocks better shop inventory
- One at the 図書館 increases word discovery rate

This creates three vocabulary reinforcement loops:
1. **Incentive to collect more creatures** — you need workers AND fighters
2. **Cross-system word pairing** — creature name displayed next to building name (古代の亀 works at 病院)
3. **Rotation reinforcement** — swapping creatures between roles means revisiting their names

### Thematic Fit

Town buildings absorb the "structures" vocabulary that doesn't fit as creature names. Words like 塔 (tower), 橋 (bridge), 門 (gate), 壁 (wall) become things the player builds in their utopia town where creatures and humans coexist.

---

## 13. NPCs & Social Systems

### What NPCs Teach (~300 words)

- **50+ name-meaning words** (personality/nature nouns): 凪 (calm), 誠 (sincerity), 勇 (courage)
- **100+ occupation words**: 医者 (doctor), 商人 (merchant), 先生 (teacher), 兵士 (soldier)
- **100+ personality/social keywords**: 約束 (promise), 秘密 (secret), 冒険 (adventure)

### NPC Roles

| Role | Count | Where | Vocab Focus |
|---|:---:|---|---|
| Town residents | ~40 | Home base | Occupation words, daily life |
| Shopkeepers/crafters | ~15 | Town + area shops | Trade/material words |
| Quest-givers | ~20 | Town + areas | Abstract nouns, objectives |
| Rival trainers | ~20 | Area encounters | Personality/emotion words |
| Story NPCs | ~10 | Key story moments | Social/relationship words |
| Wandering NPCs | ~15 | Random area encounters | Mixed vocabulary |

### How the Player Learns

**NPC title display.** Every NPC shows name + occupation: `ナギ — 商人` (Nagi — Merchant). The occupation word is visible every interaction.

**Name-meaning introduction.** On first meeting: "ナギ — from 凪 (calm)." A one-time introduction that gives the name meaning.

**Personality keywords in dialogue.** Each NPC has a keyword that recurs across conversations. A loyal NPC repeatedly references 約束 (promise). A secretive NPC keeps mentioning 秘密 (secret). Repetition in character-specific context aids memorization.

**Dialogue choices.** NPC conversations offer 2–3 response options in Japanese, all i+1 validated. Choosing requires reading every option — active engagement.

### All Combat is Creature vs. Creature

Rival trainers don't fight the player directly. They command their own creature teams. This keeps combat in the creature system (vocabulary through split attack cards) and makes every battle about reading Japanese, not watching NPC animations.

### NPC Memory System ✅

NPCs remember past encounters: what happened, relationship bond level, player choices. Dialogue evolves over time — a merchant who's met the player 10 times speaks differently than one meeting them for the first time. This creates naturalistic conversation progression and motivates revisiting NPCs (more vocabulary exposure).

---

## 14. Narration Engine

### What It Teaches (~3,100–3,550 words)

Narration is the **only system that teaches grammar and function words** — the glue of the language that only makes sense in sentences:

| Word Type | Count | Examples |
|---|:---:|---|
| Core grammar verbs | ~80 | する, なる, ある, いる, できる |
| Auxiliary verbs | ~60 | てくる, ていく, てしまう |
| Pronouns/demonstratives | ~60 | 私, 彼, これ, そこ |
| Conjunctions | ~50 | だから, しかし, そして |
| Adverbs | ~120 | もう, まだ, とても, きっと |
| Abstract nouns | ~250 | 時間, 問題, 意味, 気持ち |
| Numbers/counters | ~100 | 一, 二, 個, 匹, 本 |
| Common adjectives | ~80 | いい, 同じ, 多い, 難しい |
| Particles/markers | ~100 | は, が, を, ように, として |
| And more... | ~1,200+ | Time words, cognitive verbs, spatial words, sentence-enders |

These words genuinely cannot be attached to game objects. You can't name a creature だから or make an item called もう. They only make meaning in sentences, and the i+1 narration engine is purpose-built to teach them.

### Architecture ✅

**Prompt assembly** builds a layered system prompt for the AI:
1. Task instructions (what to generate)
2. Vocabulary constraints (exact word list the AI may use)
3. Character card (NPC/creature personality, quirks, goals)
4. World lorebook (setting knowledge)
5. Entity memory (encounter history, relationship)
6. Anti-repetition (avoid recently used lines)

**Vocabulary enforcement** is multi-layered:
1. The AI prompt specifies "use ONLY these words"
2. Generated text is parsed and checked against the player's known vocabulary
3. Any sentence with >1 unknown word is rewritten by the AI
4. Rewritten text is re-checked (up to 3 repair cycles)

**Per-user text cache:** All narration is pre-generated, cached per player, and served instantly. After the player sees a line, it's marked stale and regenerated in the background with their updated vocabulary.

### Progressive Complexity

Narration naturally grows richer as the player learns more words:
- **Early game:** 部屋に入った。暗い。何かがいる。(Entered the room. Dark. Something is there.)
- **Mid game:** 暗い部屋の奥から、小さな光が見える。静かに近づくと、何かが動いた。(From the back of the dark room, a small light is visible. Approaching quietly, something moved.)
- **Late game:** Complex sentences with conjunctions, varied registers, literary vocabulary

This progression is emergent, not scripted. As the player's known word count grows, the AI has more vocabulary available, and naturally produces more sophisticated text.

### Multiple Touchpoints Per Session

- Room entry descriptions (every room)
- Combat narration (start, end, special events)
- NPC dialogue framing
- Area introduction text
- Quest descriptions
- Creature/item discovery text

### Text-to-Speech ✅

All narration can be spoken aloud via VOICEVOX integration:
- 47+ speaker voices mapped to NPC/creature personalities
- Aggressive NPCs get angry voices; mysterious ones get soft whispers
- Individual word audio for vocabulary lookup (tap any word to hear pronunciation)
- Audio caching for instant playback

---

## 15. Meta-Progression

### Essence (Cross-Run Currency) ✅

Earned from exploration runs, spent on permanent upgrades:
- 10 essence per area cleared
- 100 essence bonus for completing a full run (10 areas)

### Permanent Upgrades ✅

| Upgrade | Effect | Max Level |
|---|---|:---:|
| Vitality | +10% max HP per level | 5 |
| Attack Power | +2 ATK per level | 5 |
| Starting Credits | +25 gold per level | 4 |
| Credit Find | +10% gold earned per level | 5 |

### Achievements ✅

Major milestones that award essence: First Victory, Boss Slayer, Veteran Hunter, Dungeon Master, Thousand Slayer, Perfect Run.

### Creature Collection ✅

Persistent across runs. The player's creature roster grows over time — creatures befriended in one run are available in future runs. This gives permanent value to every exploration.

### What Persists vs. What Resets

| Persists | Resets Each Run |
|---|---|
| Creature collection | Current HP/credits |
| Meta-progression upgrades | Room progress |
| Lifetime stats | Item buffs |
| NPC relationships | Area selection |
| Vocabulary knowledge | Combat state |
| Achievement progress | |

---

## 16. Content Roadmap

### 10-Stage Cumulative Plan

Each stage defines a **content tier** (what exists in the game world) and a **development milestone** (what to build). Stages are cumulative — each builds on the previous.

| Stage | Words | JLPT | Areas | Creatures | Moves | NPCs | Key Milestone |
|---|:---:|---|:---:|:---:|:---:|:---:|---|
| 1 | 400 | — | 5 | 40 | 150 | 5 | Core loop proven |
| 2 | 800 | — | 10 | 70 | 200 | 20 | Town + equipment + crafting debut |
| 3 | 1,500 | — | 20 | 120 | 300 | 40 | All 8 systems online |
| 4 | 2,200 | N5/N4 | 28 | 180 | 400 | 60 | Story quests, SRS review encounters |
| 5 | 3,000 | N3 entry | 35 | 250 | 500 | 80 | Half creature roster, literary narration |
| 6 | 3,800 | N3 | 40 | 300 | 600 | 95 | Endgame loops, town prosperity |
| 7 | 4,400 | N2 entry | 43 | 350 | 700 | 105 | Post-game challenge areas |
| 8 | 5,100 | N2 mid | 46 | 400 | 800 | 115 | Compound verb moves |
| 9 | 5,700 | N2 | 48 | 450 | 900 | 125 | Polish and gap filling |
| 10 | 6,300 | N2+ | 50 | 500 | 1,000 | 140 | Content complete |

### Stage Narratives

**Stage 1 (Foundation):** The tutorial and first explorations. Simple narration, basic grammar, most common words. Prove the core loop — combat teaches words, speed review reinforces, creature collection motivates exploration.

**Stage 2 (First Expansion):** The world opens. Town building, equipment, crafting debut. The SRS begins actively curating area choices. 10 areas provide meaningful player choice.

**Stage 3 (Core Systems Complete):** All 8 game systems are active. Town growing, rival trainers appear, crafting economy connects gathering → crafting → equipment/items. Quests send players to specific areas. Full SRS curation.

**Stage 4 (N5/N4 Coverage):** The player can understand simple Japanese conversations. Story quests reveal world lore. Town is thriving. Review-focused encounters ensure no word is forgotten.

**Stage 5 (N3 Entry):** The player can read simple articles. Half the creature roster exists. Literary narration for advanced areas. The game world feels expansive.

**Stages 6–9:** Progressive deepening — endgame loops, post-game content, compound verbs, keigo, multiple speech registers, prestige systems.

**Stage 10 (Full Coverage):** 500 creatures, 1,000 moves, 50 areas, 140 NPCs, 35 town buildings. The player can read most Japanese text in daily life. Content complete.

### Art Asset Requirements

~2,825 unique art files at full completion:

| Asset Type | Count | Size |
|---|---:|---|
| Creature sprites (static + idle animation) | 1,000 | 1024x1024 |
| Move action icons | 1,000 | 128x128 |
| Item icons | 150 | 128x128 |
| Equipment icons | 100 | 128x128 |
| Crafting resource icons | 100 | 128x128 |
| NPC illustrations | 140 | 1024x1024 |
| Area background sets | ~300 | 1536x1024 |
| Town building art | 35 | TBD |

---

## 17. Art Direction

### Visual Identity

**Tone:** Vibrant, bright, optimistic. Saturated and warm color palette. Every character and creature is colorful and distinct.

**References:** Pokemon Z-A, Xenoblade Chronicles, Genshin Impact, Fire Emblem Heroes, Makoto Shinkai films.

**Color philosophy:** Saturated and warm. Varied palette per character. Liberation = orange, pink, gold.

### Sprite Standards

All sprites must be **well-drawn illustrations, NOT pixel art.** This applies universally to creatures, NPCs, items, backgrounds, and action icons.

**Creatures (1024x1024):** Objects personified as cute chibi creatures. Transparent background. Immediately recognizable source object. Cute, appealing personality.

Each creature requires TWO assets: a static sprite (fallback) and a **looping idle animation** (animated WebP, 49 frames at 24fps, generated via ComfyUI WAN I2V pipeline).

**Action/Item/Equipment icons (128x128):** Clean, readable at small sizes. Transparent background. Consistent style across all icons.

**Area backgrounds (1536x1024):** Anime-style environments. Eye-level camera. Vibrant colors, detailed architecture and nature. Blue sky, warm lighting.

**NPC illustrations (1024x1024):** Full-body character art in dynamic poses. Vibrant saturated colors. Transparent background. Gacha-quality character design.

### Generation Pipeline

Sprites are generated using AI (Stable Diffusion SDXL with waiIllustrious checkpoint) and post-processed through a three-gate quality pipeline:

1. **Gate 1 (Technical):** Automated validation — correct dimensions, transparent background, no semi-transparent artifacts
2. **Gate 2 (Vision Judge):** AI vision model evaluates art quality, style consistency, and recognizability
3. **Gate 3 (Human Selection):** Dashboard for human review and final selection from candidates

---

## 18. Audio & Music

> 📋 **This section is a placeholder.** Audio systems exist but lack a holistic design document.

### What Exists

- **Text-to-Speech (VOICEVOX):** 47+ Japanese voices for narration and NPC dialogue. Speaker assignment based on personality type (aggressive, calm, mysterious, etc.). Individual word pronunciation for vocabulary lookup.
- **Background Music:** Area-specific BGM tracks. Ward-specific themes.
- **Sound Effects:** Combat hit/miss sounds, UI interaction sounds, level-up fanfares.

### What Needs Design

- **Music identity:** What is Koto's overall sound? Genre? Instrumentation? Emotional arc across areas?
- **Adaptive music:** Does BGM change based on combat intensity, exploration discovery, or story beats?
- **Creature sounds:** Do creatures have signature audio cues? How does this interact with TTS?
- **Audio progression:** Does the music evolve as the player's Japanese level increases? (Lyrics appearing as the player can understand them?)
- **Ambient audio:** Environmental sounds tied to area themes (forest birds, ocean waves, town bustle)?

---

## 19. Design Principles & Constraints

### Immutable Rules

1. **i+1 is non-negotiable.** Every piece of Japanese text must contain only known words plus at most 1 unknown word. Showing unvalidated Japanese is a critical bug.

2. **Vocabulary drives mechanics.** Word type determines game system. Don't force words into ill-fitting systems. If a word type doesn't have a home, design a new mechanic.

3. **Translation accuracy is sacred.** Every translation the player sees becomes something they memorize. No creative liberties. Dictionary-accurate definitions only.

4. **Every game object teaches at least 1 word.** No creature, item, NPC, area, or building exists without a vocabulary purpose.

5. **Two stats only.** Attack and Max HP. No additional stats, ever. Cognitive load stays on reading Japanese.

6. **All combat is creature vs. creature.** No standalone NPC fights. Rivals command creature teams.

7. **Names are never changed for lore reasons.** Learning comes first. A creature named 亀 is named 亀 because it teaches the word for turtle, not because turtles fit the lore.

### Design Heuristics

8. **Frequency rank determines progression.** High-frequency words appear in early stages. Low-frequency words are late-game content. The most useful words come first.

9. **Overlap is a feature.** The same word appearing in creature names, area names, and narration strengthens retention through varied context.

10. **Compounds are allowed but never forced.** Items and equipment can be compound words with decomposition shown, or single words.

11. **Sub-area pools are shared.** Sub-area location nouns and modifiers repeat across core areas, maximizing repetition in different contexts.

12. **Quests are delivery mechanisms.** They combine vocabulary from NPCs, areas, creatures, and narration. They don't own unique words.

13. **Narration carries grammar — and that's correct.** Function words, particles, adverbs, counters, and abstract nouns only make meaning in sentences. ~50% of vocabulary living in narration is by design, not by default.

14. **Crafting teaches compound words by doing.** The player combines two ingredient words into a compound word. This is the most powerful compound word teaching mechanic.

15. **Every creature has a purpose.** Creatures either explore or work in town buildings. No creature sits idle.

### What Koto Is NOT

- Not a grammar drill app — grammar is absorbed through reading, not explicit instruction
- Not a flashcard app — vocabulary is encountered in context, not isolated cards
- Not a hardcore RPG — combat is intentionally simple to keep focus on language
- Not dark or dystopian — the world is bright, hopeful, and worth protecting
- Not multiplayer-dependent — the core experience is single-player with optional social features

---

*This document supersedes `docs/WORLD.md` and `docs/vocabulary-systems.md`, which are now absorbed into sections 2 and 5 respectively.*
