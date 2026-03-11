# English-Default Bootstrap Language System

**Date:** 2026-03-11
**Status:** Design approved
**Relationship to GDD:** This is the MVP implementation of the GDD's bootstrap language system (Sections 3b/6). The Translator device remains the in-world framing for all language scaffolding. Features not in this MVP (multi-stage scaffolding, romaji support, Translator level celebrations, hand-curated word curriculum) can be layered on later. The existing `bootstrap-renderer.js`, `bootstrap-parser.js`, `bootstrap-api.js`, and `word-tracker.js` code was built for a different approach and should be rewritten or discarded during implementation.

## Summary

Default the game to English for new players. Use a bootstrap renderer to gradually convert static text (names, labels, descriptions, i18n strings) from English to Japanese as the player learns words. Dialogue (NPC and creature) is always generated in Japanese using the existing i+1 system, constrained to the player's known-words set.

## Core Concept

The game starts fully playable in English. Static text elements pass through a bootstrap renderer that checks the player's known-words set (powered by an in-house FSRS spaced-repetition system) and shows/hides English annotations accordingly. Dialogue is always Japanese, but naturally simple when the player knows few words.

New users upload a `.txt` file of known Japanese words (one word per line) during account creation. This seeds their known-words set. A base word set is provided for users who have no prior Japanese knowledge. Zero-knowledge cold start is not a design goal for this MVP.

## Text Type Decisions

### Always English
| Text Type | Notes |
|-----------|-------|
| UI chrome (buttons, menus, settings, errors) | No change needed |
| Stats (HP, ATK, etc.) | Always English |
| Auth screens | No change needed |

### JP-First (always show Japanese, furigana always, English fades when learned)
| Text Type | Source |
|-----------|--------|
| Creature names | Static (creatures.json) — show full name e.g. "Kamedor" with subtitle `古代の亀` |
| Move/skill names | Static (moves.json) |
| Item names | Static (items.json) |
| Area/room names | Static (areas.json) |
| NPC roles | Static (npcs.json) — new `role` field needed, e.g. `隠者` for "hermit" |

**Rendering:** Always display kanji with `<ruby>` furigana. When the word is unknown to the player, show an English annotation. When known, the English annotation is hidden.

**Creature card change:** Show full creature identity, not just the English name. Format: "Kamedor" (header) with Japanese subtitle showing base word + modifier (e.g. `古代の亀` with furigana and fading English).

**NPC name change:** Format as "Nagi — `隠者`" where the role word gets the jp-first treatment. Requires adding a `role` field (Japanese word + reading + meaning) to NPC data. The npc-forge skill needs updating to generate this.

### EN-First (start English, swap in Japanese as words are learned)

These are **static text only** — pre-tagged at authoring time with explicit word mappings. No runtime English-to-Japanese scanning.

| Text Type | Source |
|-----------|--------|
| Item descriptions | Static (items.json `description` field) — pre-tagged |
| Move/skill descriptions | Static (moves.json `description` field) — pre-tagged |
| Combat text (damage, status msgs) | Static (i18n strings) — pre-tagged |
| Befriend/party prompts | Static (i18n strings) — pre-tagged |
| Game over screen | Static (i18n strings) — pre-tagged |
| Shrine prompts | Static (i18n strings) — pre-tagged |
| Team select text | Static (i18n strings) — pre-tagged |

**Pre-tagging format:** `{english|kanji|reading}`. Kanji field is empty for kana-only words.

Examples:
```
"Heal all {creatures|生き物|いきもの} for 10% of max HP"
"{CRITICAL HIT|クリティカル|}"
"Choose a {monster|モンスター|} to {train|修練|しゅうれん}"
```

The renderer checks each tagged word against the player's known-words set. Known words render as `<ruby>kanji<rt>reading</rt></ruby>`, unknown words render as the English text. Untagged English words always stay English.

This eliminates the polysemy/morphology matching problem entirely — every substitution point is hand-curated at authoring time.

### Always Japanese (i+1 constrained to player's known words)
| Text Type | Source |
|-----------|--------|
| NPC dialogue | Dynamic (AI-generated Japanese, i+1 constrained) |
| Creature dialogue | Dynamic (AI-generated Japanese, i+1 constrained) |
| NPC greeting/defeatLine/postCombat | Dynamic (AI-generated Japanese, i+1 constrained — replace current static strings) |

These use the existing Phase 3 generation system. The player's known-words set (seeded by upload, grown by FSRS) determines the vocabulary available to the AI. A base word set ensures all players have enough vocabulary for basic dialogue.

### Stubbed Out
| Text Type | Reason |
|-----------|--------|
| DM narration | Not used, disruptive — remove narration boxes entirely |
| Chippy (door hints, door intros) | Doesn't fit current flow, disruptive |
| Door branching | Remove choice UI, auto-advance to next room (random backend pick) |
| Quiz rooms | Remove from room pool |
| Area descriptions | Ignore for now |

These features are disabled in code, not deleted. They can return later as new content that the bootstrap system handles automatically.

### Unchanged
| Text Type | Notes |
|-----------|-------|
| Speed review | Already bilingual, stays as-is. Becomes the primary active-recall mechanism for the FSRS system — the main way words transition from "exposed" to "known." |

## Architecture

### Bootstrap Renderer

A single renderer with two display modes, applied to **static pre-tagged text only**:

**`jp-first`** (creature names, move names, item names, area names, NPC roles):
- Always show kanji with `<ruby>` furigana
- Show English annotation if word is unknown
- Hide English annotation if word is known

**`en-first`** (item descriptions, move descriptions, i18n combat strings):
- Pre-tagged English text with explicit `{english|kanji|reading}` markers
- Known words render as `<ruby>kanji<rt>reading</rt></ruby>`
- Unknown words render as the English text
- Untagged words always stay English

### Word Identity

A word is identified by its kanji string (or kana string for kana-only words). This is the `wordId` used throughout the system.

- `isWordKnown(playerId, "森")` — checks if player knows 森
- `isWordKnown(playerId, "カレーパン")` — checks the compound word as a unit

Compound words (e.g. カレーパン) are tracked independently from their components (カレー, パン). Knowing the components does not imply knowing the compound.

### Word Knowledge Definition

A word is **known** when the player has successfully recalled it at least once in speed review. Mere exposure (seeing it in combat, on a card, etc.) registers the word in the FSRS system but does not mark it as "known." Active recall through speed review is what transitions a word from "seen" to "known."

This drives the learning loop:
1. Player encounters word through gameplay (combat, items, names) → word registered as "seen" in FSRS
2. Speed review quizzes the player on seen words → successful recall marks word as "known"
3. Bootstrap renderer shows/hides English based on known status
4. Dialogue system uses known words set for i+1 generation

### New User Onboarding

1. User registers (username, password, invite code)
2. Upload a `.txt` file of known Japanese words (one per line, kanji or kana)
3. Each uploaded word is matched against game vocabulary and/or a dictionary
4. Matched words seed the player's FSRS known-words set as "known"
5. Game begins — UI is English, names show Japanese with English annotations, dialogue uses uploaded word list for i+1

A base word set is provided for users with no prior Japanese knowledge. Zero-knowledge cold start (no words at all) is not a design goal for this MVP.

### Data Changes Required

**creatures.json:** No schema change. Frontend needs to render `baseMeaning` + `modifier.meaning` as the creature subtitle.

**npcs.json:** Add `role` field to each NPC:
```json
{
  "role": {
    "word": "隠者",
    "reading": "いんじゃ",
    "meaning": "hermit"
  }
}
```
Remove static `greeting`, `defeatLine`, and `postCombat` strings. These will be dynamically generated by the NPC AI dialogue system, i+1 constrained to the player's known words.

**npc-forge skill:** Update to generate the `role` field for new NPCs.

**i18n strings:** Pre-tag each string with `{english|kanji|reading}` markers for words that should be swappable to Japanese.

**Item/move descriptions:** Pre-tag `description` fields in items.json and moves.json with `{english|kanji|reading}` markers.

**Auth UI:** Add file upload input to the registration form.

**Existing code:** The old bootstrap system code (`bootstrap-renderer.js`, `bootstrap-parser.js`, `bootstrap-api.js`, `word-tracker.js`) is incompatible with this simpler model and should be rewritten or discarded.

### Existing Players

Existing players who are already in the full Japanese system stay there. The bootstrap renderer applies to them the same way — since they know most words, English annotations are mostly hidden, and dialogue generates as full Japanese. No migration needed.

## Separate Concerns (Not In This Spec)

- **FSRS system design** — the in-house spaced-repetition system that replaces JPDB. Needs its own brainstorm/spec.
- **Intro sequence** — can be added later as regular game content. The bootstrap system will handle it automatically.
- **Dialogue minimum word threshold** — the minimum number of known words before NPC/creature dialogue is shown. Can be tuned after implementation.
