# Design History

This document consolidates key design decisions and rationale from archived implementation plans. It serves as a reference for understanding why certain features were built the way they were.

---

## January 23, 2026

### Chip System Retheme (from "Bot" to "Chip")

**Decision:** Rename "Bots" to "Chips" throughout the game.

**Rationale:** The "Bot" terminology conflicted with the cyberpunk theme where players are fighting against corrupted AI bots. Having friendly "Bots" as equipment was confusing. "Chips" fits the cyberpunk aesthetic better (think Cyberpunk 2077's cyberware chips) and creates clearer semantic distinction between enemies and equipment.

**Key changes:**
- UI labels changed from "Bot" to "Chip"
- Variable names updated throughout codebase
- API endpoints renamed (e.g., `/equip-bot` to `/equip-chip`)

### Chip Balance Tuning

**Decision:** Rebalance chip effects to create meaningful progression tiers.

**Rationale:** Initial chip values were arbitrary. Players needed clear power progression from Common to Legendary rarities.

**Key decisions:**
- Common chips: Small flat bonuses (+3-5 damage)
- Uncommon chips: Moderate effects with low proc chances
- Rare chips: Significant effects with medium proc chances
- Epic chips: Strong effects with high proc chances
- Legendary chips: Unique powerful effects

### Chip Levels and Skills

**Decision:** Add level progression and active skills to chips.

**Rationale:** Chips needed more depth beyond passive effects. Players wanted:
1. Sense of progression within a single run
2. Active abilities to use strategically
3. Rewards for successful combat beyond just advancing floors

**Key decisions:**
- Chips gain XP from combat
- Skills unlock at level thresholds
- Skills consume "charges" that build up over correct answers
- Each chip has one active skill plus passive pipeline effects

### Graphics Overhaul

**Decision:** Move from text-based UI to visual novel style with sprites and backgrounds.

**Rationale:** The text-only interface felt dated and didn't engage players visually. Adding:
1. Enemy sprites for each enemy type
2. Ward-specific background images
3. Character portrait for the player
4. Animated damage numbers and effects

**Key decisions:**
- 64x64 pixel art style for sprites (scales well on mobile)
- Each ward has a distinct color palette
- Enemies have "possessed" (red glow) and "liberated" visual states
- Use CSS animations rather than canvas for better compatibility

### Mobile-First UI Redesign

**Decision:** Rebuild the entire frontend for mobile-first interaction.

**Rationale:** The original desktop VN-style layout didn't work on mobile:
- Panels were too small to tap
- Word cards required precise clicking
- Settings modal was inaccessible

**Key architectural decisions:**
- Single-column layout that fills viewport
- Scene area (top): Enemy sprite, HP bars, backgrounds
- Action area (middle): Context-sensitive buttons or flashcards
- Chip row (bottom): Equipped chips with tap-for-popup
- Takeover modals: Full-screen overlays for settings, shops, equip
- Touch-optimized: Large tap targets, swipe gestures

**Flashcard swipe interaction:**
- Replaced click-to-type word input with Tinder-style swipe cards
- Swipe right = "knew it" (grade 4)
- Swipe left = "didn't know" (grade 1)
- Tap to flip and reveal answer
- Dramatically improved mobile UX

---

## January 24, 2026

### Audio System

**Decision:** Add background music and sound effects.

**Rationale:** Audio creates atmosphere and provides feedback for player actions.

**Key decisions:**
- Separate BGM and SFX volume controls
- Ward-specific background tracks
- Combat has distinct BGM
- SFX for: attacks, chip activations, correct/wrong answers, victory/defeat
- Audio context created on first user interaction (browser requirement)
- Mute toggle persists to localStorage

### User Authentication

**Decision:** Add user accounts with login/registration.

**Rationale:** Players wanted to:
1. Save progress across devices
2. Appear on leaderboards with usernames
3. Sync settings between sessions

**Key decisions:**
- Simple username/password authentication
- Passwords hashed with bcrypt
- Session tokens stored in localStorage
- Guest mode remains available (local storage only)
- API keys (JPDB, AI providers) stored per-user on server
- No email verification (keep it simple)

### Shrine Room

**Decision:** Add a special "Shrine" room type for meta-progression.

**Rationale:** Players needed ways to spend accumulated essence between runs.

**Key decisions:**
- Shrine appears randomly during exploration
- Offers permanent upgrades purchasable with essence
- Upgrades include: max HP bonus, starting chip slots, essence find rate
- Shrines have mystical aesthetic distinct from combat rooms

### Quiz Master Room

**Decision:** Add grammar quiz encounters as an alternative to vocabulary combat.

**Rationale:** Pure vocabulary practice became repetitive. Grammar quizzes:
1. Add variety to gameplay
2. Test different language skills
3. Provide a break from combat tension

**Key decisions:**
- Quiz Master is a neutral NPC (not an enemy)
- 10 N5 grammar questions to start
- Three-choice format
- Correct answer gives chip reward
- Wrong answer: no penalty, just proceed
- Quiz Master speaks naturally in Japanese
- Questions cover: particles, verb forms, adjective conjugation

---

## January 25, 2026

### Leaderboard

**Decision:** Add global leaderboards for competitive element.

**Rationale:** Players wanted to compare progress with others.

**Key decisions:**
- Leaderboards for: highest floor reached, most enemies liberated, fastest run
- Show top 50 players per category
- Display username + score + date achieved
- Weekly and all-time views
- Anti-cheat: Server validates all progress (no client trust)

### iOS PWA Support

**Decision:** Optimize for iOS Safari and PWA installation.

**Rationale:** Many players use iPhones. PWA allows app-like experience without App Store.

**Key decisions:**
- Web app manifest for home screen installation
- Service worker for offline caching
- iOS-specific meta tags for status bar styling
- Touch icons at required sizes (180x180)
- Disable bounce scrolling
- Handle safe area insets for notched devices
- Test on actual iOS devices (simulator insufficient)

### Chip UI Improvements

#### Drag-and-Drop Reorder (Abandoned)

**Decision:** Originally planned drag-and-drop for chip reordering. **Abandoned** in favor of click-to-swap.

**Rationale:** Drag-and-drop on mobile had numerous issues:
- Long-press detection conflicted with tap-to-show-popup
- State corruption when drags were interrupted
- Touch vs mouse event handling complexity
- Poor UX on small screens

#### Click-to-Swap System

**Decision:** Replace drag-and-drop with simpler click-to-swap interaction.

**Rationale:** Much simpler to implement and use:
1. Tap first chip (highlights)
2. Tap second chip (swaps positions)
3. Tap same chip again (deselects)

**Key decisions:**
- Visual highlight on selected chip
- Works identically on touch and mouse
- No timing-dependent gestures
- State stored in URL-safe format for persistence

#### Lookup Mode

**Decision:** Add a "lookup mode" for dictionary lookups on any Japanese text.

**Rationale:** Players wanted to look up unfamiliar words without leaving the game.

**Key decisions:**
- Magnifying glass button in toolbar
- When active, parses visible Japanese text via JPDB API
- Clickable words show definition popup
- Popup shows: word, reading, part of speech, meanings, JPDB card state
- Game interaction blocked while lookup mode active
- Quiz answers and flashcards excluded from parsing (anti-cheat)

**Technical insight:** JPDB returns token positions in bytes, not characters. Japanese UTF-8 characters are 3 bytes each. Required byte-to-character index mapping to correctly highlight words.

### Flashcard Prefetch

**Decision:** Prefetch vocabulary words before combat starts.

**Rationale:** Network latency during combat created awkward pauses.

**Key decisions:**
- Fetch batch of words when entering a ward
- Cache locally in memory
- Replenish cache as words are reviewed
- Graceful fallback if prefetch fails

---

## Integration and Bug Fixes

### Mobile UI Integration (Jan 24-25)

Major bugs discovered during live testing of mobile UI:

**State Management:**
- `forfeitRun()` wasn't nulling `this.run`, causing stuck `run_ended` phase
- Ward API endpoints returned arrays directly, not `{ wards: [...] }`

**Combat Flow:**
- "Fight" button persisted after combat started (needed `actions.clear()`)
- `initCombatWords()` not awaited, causing flash card timing issues
- Enemy dialogue didn't resume combat after dismissal

**Data Formats:**
- Combat cycle returned `playerHp: { current, max }` object, not number
- `equippedChips` contained string IDs, not enriched chip objects

**TTS:**
- Mobile `tts.js` exports `speakText()` not `speakWord()`

### Visual Polish (Jan 24)

- Enemy sprite container needed explicit dimensions
- Chip icons changed from text initials to PNG images
- Settings icon changed from sun to gear SVG
- Swipe cards animated fully off-screen with opacity fade
- Flashcard back shows original word with furigana (ruby annotation)
- Combat math breakdown displayed in action area

---

## Architectural Patterns Established

### Module Initialization Pattern
All UI modules use an `init(callbacks)` pattern that receives dependencies:
```javascript
export function init(callbacks) {
  getGameState = callbacks.getGameState;
  updateUI = callbacks.updateUI;
  // etc.
}
```
This avoids circular imports and allows testing with mocks.

### State Flow
1. User action triggers API call
2. Server returns `{ state: {...}, ...additionalData }`
3. `updateGameState(result.state)` stores new state
4. `updateUI()` re-renders all UI based on current state

### Takeover Modal Pattern
Full-screen modals for complex interactions:
1. `takeover.open('name')` slides in from bottom
2. Content rendered into `takeover.getContent('name')`
3. `takeover.close('name')` slides out
4. Click outside or close button dismisses

### Chip Data Architecture
- Server stores `equippedChips` as string IDs
- Frontend fetches enriched chip data via `/api/game/chip-loadout`
- Enriched data cached in `chipLoadoutCache` for UI rendering
- Cache refreshed after: combat start, chip purchase, equip/unequip

---

*Consolidated from 40 archived plan documents on 2026-01-27*
