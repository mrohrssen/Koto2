# Koto — World Bible

This is the single source of truth for the game's theme, setting, and tone. All AI agents generating content for Koto should reference this document.

## Game Identity

**Koto** is a Japanese vocabulary learning RPG. The player explores a vibrant world, befriends creatures, and learns Japanese through immersive gameplay. Every piece of Japanese text follows the i+1 principle: only words the player already knows, plus at most 1 new word.

## Setting

A fantastical world inspired by Earth — futuristic, utopian, and alive with color. Humans and creatures coexist in a prosperous civilization. Each region is named with real Japanese vocabulary because the names themselves are learning content.

Think Genshin Impact's world design meets Pokemon's creature partnership.

## Conflict

A mysterious disruption is spreading across the world, causing normally peaceful creatures to become wild and aggressive. The player travels to different areas to investigate the disruption, calm agitated creatures, and befriend them to restore harmony.

- **Combat = calming/befriending**, not killing or "liberating"
- Creatures are not evil — they're confused and need help
- The player builds a team of befriended creatures who fight alongside them

## Tone

- **Bright, hopeful, adventurous** — this is an optimistic world worth protecting
- Visual references: Genshin Impact, Pokemon, Honkai Star Rail, Xenoblade Chronicles
- **NOT**: dark, dystopian, cyberpunk, grimdark, horror, post-apocalyptic
- Saturday morning anime energy, not Blade Runner

## Naming Philosophy

Every name in the game teaches Japanese vocabulary:
- **Creatures** are named from Japanese words (JPDB frequency data)
- **Areas** are named from Japanese location/nature words
- **Items** are named from Japanese food/object words
- Names are NEVER changed for lore reasons — learning comes first
- See `docs/ARCHITECTURE.md` for the frequency-ordered naming system

## What This Replaces

The game was previously called "NEO TOKYO: System Liberation" with a dark cyberpunk theme (AI corruption, possessed citizens, ward-based Tokyo districts). That theme is fully retired. If you see remnants of it in code comments, variable names, or historical plan docs, ignore them — the current theme is described in this document.
