# Universal Token Migration

**Date:** 2026-04-09
**Status:** Approved
**Scope:** Migrate all Japanese text rendering to the universal token pipeline

## Goal

Every piece of Japanese text shown to the player must flow through one pipeline:
- **Sentences** (barks, CID scripts, NPC lines, shop frames, befriend prompts, greetings) → pre-tokenized at build time via Sudachi in `frame-sources.json` → `frames.json` → `renderJpSentence()`
- **Single-word entities** (move names, item names, creature names) → wrapped at runtime via `entityToToken()` → `renderJpSentence()`

One token format: `{surface, base, reading, meaning}` for content, `{surface}` for punctuation, `{slot}` for entity placeholders.

One eligibility function: `isEligible()` from `token-format.js`.

One rendering function: `renderJpSentence()` from `bootstrap-client.js`.

## Systems Migrated

| System | Current State | Target State |
|--------|--------------|--------------|
| Shop frames | Universal tokens (done) | No change |
| Shop greetings | Universal tokens (done) | No change |
| Creature barks | Old format (`_tokens`/`_contentWords`/`baseForm`) in `barks.json` | Migrate to `frame-sources.json` → universal tokens |
| CID scripts | Old format in `cid-scripts.json` | Migrate to `frame-sources.json` → universal tokens |
| NPC lines | Old format in `npc-lines.json` | Migrate to `frame-sources.json` → universal tokens |
| Move selection | Plain strings, `renderJpFirst()` | `entityToToken()` → `renderJpSentence()` |
| Befriend prompts | Hardcoded strings in frontend JS | New frame sources with i+1 ladder → universal tokens |

## Section 1: Build Pipeline

### frame-sources.json

Grows with new categories:

- `"bark_onHit"`, `"bark_onVictory"`, `"bark_onLowHP"`, etc. — one entry per bark text, extracted from current `barks.json`
- `"befriend_wait"` — 5 i+1 ladder variants for the "wait!" prompt
- `"befriend_name"` — 5 i+1 ladder variants for the "what's my name?" prompt
- `"cid_<scriptId>"` — CID script lines, each line as a frame entry
- `"npc_<npcId>_<slot>"` — NPC lines grouped by NPC and dialogue slot

### tokenize-static.js

No changes needed. Already iterates all entries regardless of category and outputs `frames.json` with `{id, category, raw, tokens, words}`.

### frames.json

Becomes the single output for all pre-tokenized Japanese text. Old separate files are deleted.

### Old files removed

- `data/dialogue/barks.json`
- `data/dialogue/cid-scripts.json`
- `data/dialogue/npc-lines.json`

## Section 2: Server-Side Changes

### dialogue-loader.js

Rewired to load from `frames.json`:

- Single `loadDialoguePools(dataDir)` reads `frames.json` and partitions into pools by category prefix
- `getBarkPool()` — barks grouped by trigger (category `"bark_onHit"` → trigger `"onHit"`)
- `getCidScripts()` — CID script frames grouped by script ID
- `getNpcLines()` — NPC line frames grouped by NPC ID
- `getShopFrames()` — shop category frames (currently private functions in `src/routes/game/run.js` lines 34/44, consolidate here)
- `getGreetingFrames()` — greeting category frames (same, from `run.js`)
- `getBefriendFrames()` — befriend prompt frames grouped by prompt type
- `getDialogueWordSet()` — iterates `frames.json` entries using `words` arrays (universal format)

### dialogue-filter.js

Migrated to universal format:

- `isLineEligible()` switches from `_tokens`/`baseForm`/`isPunctuation()` to calling `isEligible()` from `token-format.js`
- `selectBark()`, `selectCidScript()`, `selectNpcLine()` — update field references from `_tokens`/`_contentWords` to `tokens`/`words`
- Remove duplicate `isPunctuation()` and `PUNCT_POS` — `token-format.js` is the authority
- Selection logic (bark 80/20 split, CID unseen-first, NPC curriculum preference) stays as-is

### loop.js

- Bark sending changes from `{ trigger, text, _tokens, _contentWords }` to `{ trigger, text, tokens, words }`
- Word exposure uses `words` array instead of `_contentWords`

### Befriend quiz route

- `generateBefriendQuiz()` attaches pre-tokenized befriend prompt frames (selected via i+1 from the pool) to quiz data
- Client receives `waitPrompt: {tokens, words}` and `namePrompt: {tokens, words}` instead of hardcoding strings

### Move data

No server changes. Moves already carry `name`, `reading`, `nameEn`, `meaning`. Client wraps via `entityToToken()`.

### friendly-npc-offers route

No changes needed — already on universal format.

## Section 3: Frontend Changes

All `renderJpFirst()` callsites migrate to `entityToToken()` → `renderJpSentence()`. Complete callsite inventory:

### bootstrap-client.js

- `renderJpFirst()` removed
- `renderJpSentence()` unchanged
- Export client-side `entityToToken()` that wraps `{name/word, reading, nameEn/meaning}` → universal token

### move-select.js (line 57)

- Replace `renderJpFirst(move.name, move.reading, move.nameEn)` with `entityToToken(move)` → `renderJpSentence()`

### combat-loop.js (lines 743, 2911, 2961)

- Line 743: Move name in help popup — same `entityToToken(move)` → `renderJpSentence()` pattern
- Lines 2911, 2961: `renderBefriendQuiz()` receives pre-tokenized prompt frames from server response as `quizData.waitPrompt: {tokens, words}` and `quizData.namePrompt: {tokens, words}`. Renders via `renderJpSentence()` instead of hardcoded `'まって！！'` and `'なまえは？'` strings

### scene.js (lines 418, 449)

- Line 418: NPC role word — `entityToToken(npc.role)` → `renderJpSentence()`
- Line 449: NPC skill pill name — `entityToToken(skill)` → `renderJpSentence()`

### creature-row.js (lines 191-194)

- Creature popup subtitle: modifier word + base word — each wrapped via `entityToToken()` → `renderJpSentence()`

### pvp-lobby.js (lines 66-69)

- Same creature popup pattern as `creature-row.js` — identical migration for PvE/PvP parity

### move-learn.js (lines 27, 98)

- Move learn/replace screen: move name display — `entityToToken(move)` → `renderJpSentence()`

### post-combat-shop.js (lines 57, 74)

- Item name in shop row and help popup — `entityToToken(item)` → `renderJpSentence()`

### narration-box.js (line 210)

- Speaker label when speaker is `{name, reading, meaning}` — `entityToToken(speaker)` → `renderJpSentence()`

### speech-bubble.js

- Remove `isTokenized` dual-path in `showBubble()` — always render universal tokens via `renderJpSentence()`
- Update `showBubble()` to read `phrase.tokens` (not `phrase._tokens`)
- Remove `pickLegacyPhrase()`, `getLegacyPhrases()`, `_phrases` — dead code
- `findServerBark()` returns `{ tokens, words }` format

### dialogue-display.js

No changes — already uses `renderJpSentence()`.

### game.js (line 116)

- Remove `renderJpFirst` from import statement

## Section 4: Dead Code Removal

### Functions removed

- `renderJpFirst()` from `bootstrap-client.js`
- `isPunctuation()` and `PUNCT_POS` from `dialogue-filter.js`
- `pickLegacyPhrase()`, `getLegacyPhrases()`, `_phrases` from `speech-bubble.js`

### Format references removed everywhere

- `_tokens` → `tokens`
- `_contentWords` → `words`
- `baseForm` → `base`
- `isTokenized` flag removed

### Loaders consolidated

`getShopFrames()` and `getGreetingFrames()` move into `dialogue-loader.js` alongside bark/CID/NPC/befriend accessors. One loader, one file, partitioned by category.

## Section 5: New Content

### Befriend prompt i+1 ladders

5 variants per prompt, each adding one content word on top of the previous. Words chosen for high learning value.

**"Wait" ladder** (befriend_wait):
5 variants building from simple to complex, teaching common useful words.

**"What's my name?" ladder** (befriend_name):
5 variants building from simple to complex, teaching common useful words.

Specific word choices to be finalized during implementation with JPDB frequency data.

## Not Changed

- Selection logic in `dialogue-filter.js` — keeps working, just reads universal format
- Befriend quiz answer flow (English name buttons, correct/wrong processing)
- CSS styling — deferred to a later pass per area of the game
