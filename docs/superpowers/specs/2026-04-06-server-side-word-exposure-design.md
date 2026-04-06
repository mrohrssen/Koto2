# Server-Side Word Exposure

**Date:** 2026-04-06
**Status:** Approved

## Problem

All word exposure currently happens client-side. The frontend's `addExposure()` / `flushExposures()` calls POST to `/api/game/known-words/expose` — the server never exposes words itself. This means:

- The simulator only captures combat words and NPC shop items (~30 words in 30 days)
- Area 1 should teach ~80 words but barks (63 content words), NPC dialogue, CID dialogue, and other sources never reach the FSRS system unless a browser is running
- Word tracking depends on frontend JS executing correctly
- Any future client (mobile app, alternative frontend) would need to reimplement all exposure logic

## Solution

Move word exposure from the frontend to the game engine. The server exposes words as a side effect of generating content — combat attacks, barks, dialogue, item offers. The frontend renders content and styles known/unknown words, but is not responsible for tracking exposure.

## Architecture

### Core: `exposeWords()` function

Extract the body of the `POST /known-words/expose` route handler into a standalone function in `src/game/bootstrap/word-knowledge.js`:

```
exposeWords(userId, words: Array<{word, meaning}>)
  → for each: registerExposure(wk, word)
  → if exposures >= EXPOSURE_THRESHOLD (5): createCard(userId, 'vocab', word, {word, meaning})
  → saveWordKnowledge(wk)
```

The GameManager gets `userId` stored on it at creation time in `manager-registry.js` (it's already per-user, just doesn't carry the ID). Any GameManager method can then call `this.exposeWords([...])`.

### Call sites

Seven places in the game engine:

1. **Combat attacks** (`_handleCreatureAttackTurn` in `loop.js`): After `processInterleavedPvERound`, expose `attackerBaseWord` and `moveName`/`attackerSkillName` from all player and enemy attacks.

2. **Combat barks** (same method): After resolving the round, determine triggers (onAttack, onHit, onVictory, onKO, onLowHP). Pick eligible barks via i+1 filtering. Expose bark `_contentWords`. Return barks in response as `cycle.barks`.

3. **Encounter start** (`startCreatureEncounter` in `loop.js`): Expose each enemy creature's name (base word) when they spawn.

4. **NPC battle dialogue** (`start-creature-encounter` route in `combat.js`): When NPC battle dialogue lines are selected via `selectNpcLine`, expose their `_contentWords`.

5. **CID dialogue** (`start-run` route in `run.js`): When CID scripts are selected for the run intro, expose their content words.

6. **Friendly NPC offers** (`friendly-npc-offers` route): Expose each offered item's `word` field when the 3 items are generated.

7. **Move select** (implicit from #1): Move names are exposed when attacks resolve. No separate call needed.

### Bark picker

New file: `src/game/bark-picker.js`

```
pickCombatBarks(triggers: string[], knownWords: Set<string>, barkPool: object, usedBarks: Set<string>)
  → returns Array<{trigger, text, _tokens, _contentWords}>
```

- 25% chance per trigger (matches current frontend behavior)
- i+1 filtering: at most 1 unknown content word per bark
- Tracks used barks per combat to avoid repeats (stored on `combat.usedBarks`)
- Returns picked barks with content words for exposure and rendering

### Data flow

```
Player action → GameManager method
  → resolves game logic (attacks, offers, dialogue)
  → calls this.exposeWords([{word, meaning}, ...])
    → registerExposure() per word
    → createCard() at threshold 5
  → returns response (includes barks if combat)

Frontend renders response, styles words as known/unknown
Simulator processes response, hub speed review grades cards
Neither is responsible for word tracking
```

## Frontend changes

**Remove** all `addExposure()` and `flushExposures()` calls from:
- `combat-loop.js`
- `speech-bubble.js`
- `scene.js`
- `move-select.js`
- `room-transition.js`
- `game.js`
- `exploration.js`
- `economy.js`
- `narration-box.js`
- `dialogue-display.js`
- `creature-row.js`
- `post-combat-shop.js`
- `pvp-lobby.js`
- `move-learn.js`

**Keep** in `bootstrap-client.js`:
- `getKnownWords()` — frontend still needs this for display styling
- `renderJpFirst()`, `renderJpSentence()` — rendering functions
- The `_pendingExposures` map and `addExposure`/`flushExposures` exports can be deleted

**`speech-bubble.js`**: Stop picking barks locally. Read `barks` from the combat cycle response. If no bark for this round, show nothing. The 25% trigger chance and i+1 filtering are now server-side.

**`POST /api/game/known-words/expose` endpoint**: Keep it. It is still the mechanism the server uses internally. But the frontend stops calling it.

## Simulator changes

**Remove** the manual `known-words/expose` POST calls from:
- `simulator/engine/combat.js:218-221` — the `wordsExposed` array collection and the POST at end of combat
- `simulator/engine/rooms/friendly-npc.js:48-52` — the item word expose call

The simulator keeps calling game APIs (`creature-combat-cycle`, `friendly-npc-offers`, etc.) and the server handles exposure as a side effect. The simulator's combat handler can still collect wordsExposed for event logging, but must not POST them to the expose endpoint.

Hub speed review loop is unchanged.

## Out of scope

- Whack-a-mole word exposure (future work)
- Changing the EXPOSURE_THRESHOLD value (currently 5)
- Adding new word sources to the data (more creatures, items, etc.)
