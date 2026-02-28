# Narration System Overhaul — Vocab-Personalized Text Cache

## Vision

Every piece of flavor text the player reads should use Japanese words they know (+ i+1 learning targets). Text is pre-generated per user, cached, and served instantly. Once the player has seen a line, it's marked stale and regenerated in the background with their updated vocabulary. The player constantly sees fresh, personalized text that evolves with their learning.

This follows the pattern already proven by the befriend dialogue system: generate once, cache to disk, serve instantly, refresh when stale.

---

## Step 1: Remove Wasted Narration Generation

The backend currently generates narration for events the frontend silently discards:

- `runStart` — generated in `src/routes/game/run.js`, ignored by `public/game.js`
- `floorEnter` — generated in `src/routes/game/run.js`, ignored by frontend
- `encounterStart` — generated in `src/routes/game/run.js` and `combat.js`, ignored by frontend

**Action:** Remove the `generateGameNarration()` calls for these events. Saves AI tokens and reduces response latency.

---

## Step 2: Build the Per-User Text Cache System

### Architecture

```
data/text-cache-{userId}.json
{
  "version": 1,
  "generatedAt": "2026-02-12T...",
  "vocabSnapshot": ["word1", "word2", ...],   // vocab state at generation time
  "entries": {
    "enemy.drone_alpha.possessed.0": {
      "text": "システムに従え...",
      "seen": false,
      "generatedWithVocab": 142                // vocab count at generation
    },
    "chip.firewall.description": { ... },
    "item.shield_boost.descriptionJa": { ... },
    ...
  }
}
```

### Lifecycle

1. **First run / empty cache:** Generate all text entries using user's current vocab (batch, like befriend system)
2. **Serve:** When the game needs text, pull from cache instantly — no AI latency
3. **Mark seen:** After displaying text to the player, mark that entry `seen: true`
4. **Background refresh:** On next run start (or login), find all `seen: true` entries and regenerate them using the user's updated vocab. New words they've learned appear in the refreshed text.
5. **Vocab drift detection:** If user's vocab has grown significantly since last generation, prioritize regeneration

### Text Categories to Cache

| Category | Source Today | Count | Priority |
|----------|-------------|-------|----------|
| Enemy dialogue (possessed/glitching/liberated) | Hardcoded JSON (`data/enemies.json`) | ~840 lines | High — players read these closely |
| Chip descriptions + skill descriptions | Hardcoded JSON (`data/chips.json`) | ~128 strings | High — shown in UI constantly |
| Item descriptions | Hardcoded JSON (`data/items.json`) | ~92 strings | High — shown on pickup |
| Combat end narration (victory/defeat) | AI generated on-the-fly (`dm.js`) | ~10 variants | High — seen every combat |
| Creature descriptions | Hardcoded JSON (`data/creatures.json`) | ~46 strings | Medium |
| Door hints (Chippy) | Seed phrases + AI remix | ~100 seeds | Medium — already partially cached |
| Ward/floor descriptions | Hardcoded in `rooms.js` | ~45 strings | Low |

**Total: ~1,250 text entries per user**

### Generation Strategy

- Use the existing AI provider system + vocab repair pipeline
- Feed the original English/Japanese text as a "seed" (like door hints do)
- AI rewrites it using the player's known vocabulary
- Keep the meaning/personality intact, just swap in words they know
- Fall back to the original hardcoded text if cache is empty or generation fails

---

## Step 3: Frontend — Serve from Cache Instead of Hardcoded JSON

Currently the frontend receives raw JSON data (enemy objects, chip objects) with hardcoded descriptions. Change the flow:

- Backend enriches API responses with cached personalized text before sending
- Frontend displays whatever text the backend provides (no change needed on frontend for most cases)
- Backend marks entries as `seen` when served

---

## Step 4: Background Refresh Pipeline

On run start (same trigger point as befriend pre-generation):

1. Load user's current vocab from JPDB cache
2. Load their text cache
3. Find all entries where `seen: true`
4. Regenerate those entries with updated vocab
5. Save back to cache
6. Entries are fresh for next encounter

This runs fire-and-forget in the background, same as `generateMissingDialogues()`.

---

## Design Decisions

### Batching: One entry per AI call
Each text entry gets its own AI call (~1,250 calls for initial generation). Prioritizes quality over speed — each line gets full attention and fine-grained vocab targeting.

### Refresh strategy: Two tiers
Text falls into two categories with different refresh rules:

| Type | Examples | Refresh when... |
|------|----------|-----------------|
| **Dialogue** (things characters "say") | Enemy possessed/glitching/liberated lines, combat narration, door hints | Every time it's been seen — people say something new each time you talk to them |
| **Descriptions** (reference text) | Chip descriptions, item descriptions, skill descriptions, creature descriptions, ward descriptions | Only when vocab has drifted significantly (user learned N+ new words) — descriptions don't change every time you look at an item |

### AI provider: TBD — benchmark first
Build the system provider-agnostic. Run comparison tests across Haiku, Sonnet, and user-configured providers to compare quality vs. cost before committing. User will provide API keys for testing.

### Combat end narration: Pre-generated pool per enemy type
- Generate a pool of victory + defeat lines for each enemy/boss
- Pick one at random each combat — instant delivery, no AI latency
- Refresh the used line in background after it's been seen
- Defeating a boss should feel different from defeating a grunt

### Tone: Seed-controlled
The original hardcoded line acts as a tone/mood anchor. AI rewrites preserve the intent and feeling of that specific line while swapping in vocabulary the player knows. Most predictable quality — no personality drift between regenerations.
