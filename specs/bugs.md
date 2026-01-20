# Known Bugs

## Combat


- [ ] Boss defeated not detected, cannot progress to next floor
  - Error: `narration.showNarration is not a function` at `game.js:988`
  - This breaks nextFloor call, boss defeat state never saves
  - Subsequent calls fail with "Boss not defeated"
  - **Priority: High** - blocks game progression

  - [ ] Chip refresh doesn't work in chip shop
  - **Priority: Low**

- [x] ~~Player gets free hits during combat flow transitions~~ (Fixed: 31ff01e)
  - Combat now starts paused, requiring vocab review before first attack
  - After glitching dialogue, enemy attacks instead of player getting free hit
  - Added `combatPausedForVocab` guard to `executePlayerAttack()`

## JPDB Integration

- [x] ~~Duplicate words appear in reviews after being okayed in previous combat~~ (Fixed: f7b00a7)
  - Root cause: Frontend word cache persisted across combat sessions
  - Fix: `clearWordCache()` now called at start of each combat in `initCombatWords()`

- [ ] Local vocab cache severely out of sync with JPDB
  - **Priority: High** - affects core learning functionality

  ### Symptom
  Words with state "known" appearing in review queue when JPDB shows 700+ "due" words available. Example: 怖い (kowai) showing up despite being "known" not "due".

  ### Root Cause
  The local cache file `.jchat-vocab-suggestions.json` has stale word states that don't match JPDB's current data.

  ### Evidence
  - Local cache: 286 words with "due" state
  - Local cache: 2002 words with "known" state
  - JPDB reports: 700+ due words
  - Conclusion: ~400+ words that are "due" in JPDB are incorrectly marked as other states locally

  ### Architecture Overview
  ```
  JPDB Server (source of truth)
       ↓
  .jchat-vocab-suggestions.json (local cache - STALE)
       ↓
  getDueWordsWithMeanings() in src/jpdb.js:638
       ↓
  /api/game/due-words endpoint
       ↓
  Frontend word-practice.js
  ```

  ### Relevant Code
  - `src/game/vocab-manager.js` - manages cache, has `refreshWordStateCache()` function
  - `src/jpdb.js:638-776` - `getDueWordsWithMeanings()` reads from stale cache
  - `src/jpdb.js:125` - `refreshWordStateCache()` exists but not being called effectively
  - Cache file: `.jchat-vocab-suggestions.json`

  ### How Cache Gets Populated
  - `vocab-manager.js` has `refreshWordStateCache(apiKey, vocabulary, force)`
  - Only refreshes if `force=true` OR cache is "stale" (30 min expiry)
  - `checkedThisSession` flag prevents multiple refreshes per session
  - But: refresh only updates words passed in `vocabulary` param, not ALL words

  ### Band-aid Applied (NOT a real fix)
  - Removed "known" from priority order in `getDueWordsWithMeanings()`
  - Also added "redundant" to exclusion list
  - This hides the symptom but doesn't fix the stale cache

  ### Real Fix Needed
  1. Either: Fetch due words directly from JPDB API instead of local cache
  2. Or: Implement proper cache sync that refreshes ALL word states periodically
  3. Or: Add endpoint to force full cache refresh from JPDB

  ### JPDB API Reference
  - Need to check if JPDB has an endpoint to get all due words directly
  - Current approach of caching word states locally is fundamentally flawed if states change frequently



## Assets

- [ ] Missing chip icon assets (404 errors)
  - `/assets/icons/chips/minimalist.png`
  - `/assets/icons/chips/lifelink.png`
  - `/assets/icons/chips/powerCell.png`
  - **Priority: Low** - cosmetic only
