# Playwright MCP Playtest Guide

Instructions for Claude Opus 4.6 when playtesting the game via Playwright MCP browser automation.

## Why This Exists

Playtesting with Playwright MCP fails when you improvise. You lose track of what screen you're on, click wrong elements, miss bugs because you don't know what "correct" looks like, and waste time recovering from browser crashes. This guide fixes that.

## Rules

1. **Read the relevant sections of this guide BEFORE opening the browser.** Know what you expect to see at every phase.
2. **Fresh browser per phase.** Close the browser between phases. Game state persists server-side, so reloading picks up where you left off. This avoids accumulated browser state corruption.
3. **Snapshot before interacting.** Always take `browser_snapshot` before clicking or swiping anything. Identify the exact `ref` for each element. Never guess refs from memory.
4. **Screenshot at checkpoints.** Take a screenshot after each phase completes. Name it descriptively: `playtest-{phase}.png`.
5. **Compare against expectations.** Every phase below lists what you SHOULD see. If reality doesn't match, that's a bug. Report it immediately.
6. **Swipe, don't click, for cards.** Vocab flashcards require swiping (drag gesture), not clicking.
7. **Use abilities when available.** If a robot's ultimate is charged, use it. If befriend is available, try it. Test every interaction path, not just the happy path.
8. **One thing at a time.** Don't rush through multiple interactions. Do one action, verify the result, then proceed.

## Pre-Playtest Setup

```bash
# 1. Start the server (use the correct worktree/directory)
cd <worktree-or-repo-path>
pkill -f "node server.js" 2>/dev/null
npm start &
sleep 3

# 2. Verify server is up
curl -s http://localhost:3000 | head -c 100
```

Then open browser: `browser_navigate` to `http://localhost:3000`.

## How to Swipe Cards

Cards require a drag gesture. Use `browser_run_code` with Playwright's `page.locator().dragTo()` or manual mouse moves:

```javascript
async (page) => {
  const card = page.locator('.card-selector');  // adjust selector
  const box = await card.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 100, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
}
```

Adjust selectors based on what `browser_snapshot` shows. The key point: you need mouse down → mouse move → mouse up, not a click.

## How to Add New Phases

When a new feature is added:
1. Add a new phase section below following the same format
2. List: trigger, expected screen elements, interactions, what could go wrong
3. Keep it factual — reference actual CSS classes, API endpoints, and element structures from the code
4. Update the phase flow diagram if the order changes

---

## Game Flow Phases

### Phase 0: Login / New Game

**Trigger:** Navigate to `http://localhost:3000`

**Expected screen:**
- Login form with username/password fields
- Register option

**Interactions:**
- Log in with test account, or register a new one
- Start a new game (or continue existing)

**What could go wrong:**
- Login fails silently
- New game button missing or unresponsive

---

### Phase 1: Starter Selection (Robot Combat)

**Trigger:** Starting a new robot combat run.

**Expected screen:**
- Title: "Choose 2 Starters"
- Subtitle: "Pick your active robot, then a reserve"
- Grid of robot cards (subset of 25 templates from `data/robots.json`)
- Each card: robot name, element icon (wood/fire/earth/metal/water), HP, ATK stats

**Interactions:**
1. Tap first robot card → highlights, subtitle changes to "Now pick a reserve robot"
2. Tap second robot card → highlights, subtitle changes to "Ready!"
3. Confirm button appears → tap it

**What could go wrong:**
- Empty grid (no robot cards rendered)
- Subtitle doesn't update after each pick
- Can pick the same robot twice
- Confirm button doesn't appear after two picks
- Element icons or color coding missing
- Stats show NaN or 0

---

### Phase 2: Level Select and Ward Select

**Trigger:** After confirming starters.

**Expected screen — Level Select:**
- 10 level buttons
- Level 1 unlocked with "NEW" tag
- Levels 2-10 locked/greyed

**Interactions:** Tap Level 1.

**Expected screen — Ward Select:**
- Ward options displayed (e.g., Nerima / Setagaya)
- Each ward shows name and description

**Interactions:** Tap any ward. Exploration map loads.

**What could go wrong:**
- No levels shown, or all locked
- Level 1 tap doesn't respond
- Ward select doesn't appear after level pick
- Exploration map fails to load

---

### Phase 3: Exploration → Encounter Start

**Trigger:** Exploration map loaded after ward selection.

**Expected screen:**
- Branch selection or room navigation UI
- Rooms may include: encounter, shrine, quiz, wordDiscovery, shop

**Interactions:** Navigate until reaching a robot encounter room. Select it.

**Expected screen — Combat Start:**
- **Top area:** 1-3 enemy robots in a horizontal row. Each enemy shows: element icon (56px colored circle), name, level badge, HP bar. If only 1 enemy, shows single sprite instead of row.
- **Bottom area:** 3 ally robot slots. Each shows: element icon with colored border, HP bar (green-to-red gradient), charge bar (5 empty segments), level badge. Empty slots (if party < 3) should be visually distinct.
- **Middle area:** Vocab flashcards should appear shortly — dual cards (attack / defend).

**What could go wrong:**
- 0 enemies generated (empty top area)
- Enemy count exceeds 3
- Ally slots don't match starter picks (wrong robots)
- HP bars show wrong values or are missing
- Charge bars pre-filled instead of empty
- Multi-enemy layout overlapping or broken
- Vocab cards never appear

---

### Phase 4: Combat Turn (Attack)

**Trigger:** Dual vocab cards visible (attack / defend).

**Expected screen — Cards:**
- Two flashcards side by side
- Each has a Japanese word, English meaning, and action label (attack/defend)
- Cards may need to flip first (tap to reveal)

**Interactions:**
1. Wait for cards to fully render
2. Swipe the attack card (drag gesture — see "How to Swipe Cards" above)

**Expected after swipe:**
- Word gets graded
- Attack animation plays:
  - Each alive ally fires an element-colored orb toward their targeted enemy
  - Action text: "[RobotName] deals X damage" (may include "super effective!" for element advantage)
  - Floating damage numbers appear on enemies
  - Enemy HP bars decrease progressively
- Enemy counter-attack:
  - Enemy orbs fly toward allies
  - Ally HP bars decrease
  - Floating damage numbers on allies
- After ~1.4s pause, next vocab cards appear
- Charge bars increment by 1 segment for each ally

**What could go wrong:**
- Swipe doesn't register (cards stuck)
- No animation plays (HP changes instantly or not at all)
- Damage numbers don't appear
- HP bars don't update
- "super effective" shown when elements don't have advantage (or missing when they do)
- Enemy attacks don't animate
- Next cards never appear (combat stuck after turn)
- Charge bars don't increment

---

### Phase 5: Combat Turn (Defend)

**Trigger:** Dual vocab cards visible.

**Interactions:** Swipe the defend card.

**Expected after swipe:**
- "DEFENDING - 50% damage" indicator shown
- No ally attacks (allies are defending)
- Enemy attacks animate but deal reduced damage
- Ally HP bars decrease by less than a normal turn
- Charge bars still increment by 1
- Next vocab cards appear

**What could go wrong:**
- Defend doesn't reduce damage (same HP loss as attack turn)
- Defend indicator doesn't show
- Ally attacks still fire (shouldn't during defend)

---

### Phase 6: Robot Swap (Free)

**Trigger:** Vocab cards are showing but you haven't swiped yet. This is the free swap window (`swapPhase: true`).

**Interactions:**
1. Tap an ally robot slot → popup appears
2. Popup shows: robot name, element, HP and ATK stats, ultimate info (name, power, charges X/5)
3. "Use Ultimate" button (greyed out if charges < 5)
4. "Swap with:" section lists reserve robots as buttons (element icon, name, level, HP)
5. Tap a reserve robot button

**Expected after swap:**
- Swap happens immediately, no action cost (free swap)
- Popup closes
- Ally row updates — tapped robot moves to reserves, selected reserve takes its slot
- HP bars and charge bars transfer correctly

**What could go wrong:**
- Popup doesn't open on slot tap
- Swap section missing (no reserves listed)
- Tapping reserve does nothing
- Wrong robot ends up in the slot
- HP or charges reset after swap
- Popup doesn't close after swap

---

### Phase 7: Ultimate Ability

**Trigger:** A robot's charge bar reaches 5/5 (after ~5 attack/defend turns). The charge bar should glow.

**Interactions:**
1. Tap the charged robot's slot → popup opens
2. "Use Ultimate" button should be enabled (not greyed)
3. Tap "Use Ultimate"

**Expected after ultimate:**
- `POST /api/game/use-robot-ultimate` fires
- AoE attack hits ALL enemies (not just one)
- Damage numbers appear on every enemy
- Enemy HP bars all decrease
- Robot's charge bar resets to 0/5 (glow stops)
- Action text shows ultimate name and damage

**What could go wrong:**
- Charge bar never fills (charges not incrementing each turn)
- Glow animation doesn't trigger at 5/5
- "Use Ultimate" stays greyed despite full charges
- AoE only hits one enemy
- Charges don't reset after use
- Damage seems too low (item buffs not applied to ultimate)

---

### Phase 8: Befriend

**Trigger:** Any enemy drops below 50% HP AND your party has room (fewer than 6 total robots: active + reserves).

**Expected screen change:** Vocab cards now show THREE options instead of two — attack / defend / befriend.

**Interactions:** Swipe the befriend card.

**Expected after swipe:**
- Targets the lowest-HP enemy at or below 50% HP
- Success: "[RobotName] was befriended!" message
- Captured enemy heals to full HP
- Joins your party (active slot if < 3 active, otherwise reserves)
- Ally row updates to show new robot
- If that was the last enemy, combat ends → victory

**What could go wrong:**
- Befriend card never appears despite eligible enemy below 50% HP
- Befriend targets wrong enemy (not lowest HP)
- Befriend succeeds but robot doesn't appear in ally row
- Robot joins with 0 HP instead of full
- Party display doesn't update
- Triple card layout broken (overlapping or cut off)

---

### Phase 9: Victory and Post-Combat Shop

**Trigger:** All enemies defeated (0 HP or befriended).

**Expected screen — Victory:**
- AI narration text (victory flavor text)
- TTS plays if narration toggle is on
- After narration: post-combat shop appears in middle/action area

**Expected screen — Shop:**
- Title: "Choose a Reward" (or similar)
- 3 item cards from the 10-item pool (`data/items.json`)
- Each card: emoji icon, item name, description
- Items include stat boosts (ATK +2%, HP +2%, etc.), heals (Team Heal, Patch Up, Revive), and utility (Quick Charge)

**Interactions:** Tap one item card.

**Expected after selection:**
- Selected card highlights
- Other two cards disable (can't pick multiple)
- Item effect applies:
  - Stat boosts: stacked in `itemBuffs` for rest of run
  - Heals: immediate HP change visible on ally HP bars
  - Utility: charge bars increment immediately
- Victory modal appears: XP gained, continue button

**Interactions:** Tap continue.

**Expected:** Return to exploration/ward map. Encounter room marked complete.

**What could go wrong:**
- Shop shows 0 cards or wrong count
- Cards have missing text, icons, or descriptions
- Tap doesn't select (no highlight)
- Can select multiple cards
- Heal items don't visibly change HP bars
- Victory modal never appears
- Continue button doesn't return to exploration
- Game stuck after shop

---

## Regression Checks

When new features are added on top of robot combat, replay relevant phases to verify nothing broke. Common regressions:

- **New UI elements overlapping** existing combat layout
- **API response shape changes** breaking frontend expectations (missing fields, renamed keys)
- **State not resetting** between encounters (stale enemies, wrong party composition)
- **Item buffs not persisting** across multiple encounters in the same run
- **Charge bars carrying over** when they shouldn't (or resetting when they shouldn't)

## Notes

- The game uses VOICEVOX for TTS. If TTS isn't configured, narration should still display as text.
- Element cycle: wood → earth → water → fire → metal → wood. Each beats the next, weak to the previous.
- Damage formula: `max(1, floor((atk/10) * power * elemMult * variance))`. If damage seems off, check element multiplier (1.5x advantage, 0.67x disadvantage, 1.0x neutral).
- Enemy auto-targeting prioritizes element advantage first, then lowest HP%.
