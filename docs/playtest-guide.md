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
7. **Use abilities when available.** If a creature's ultimate is charged, use it. If befriend is available, try it. Test every interaction path, not just the happy path.
8. **One thing at a time.** Don't rush through multiple interactions. Do one action, verify the result, then proceed.

## Pre-Playtest Setup

**CRITICAL: Use `npm run dev` (Vite + Express), NOT `npm start` (Express only).**
Bare module imports like `animejs` only resolve through Vite. Without Vite, the entire JS module graph fails to load silently — the game appears to load but nothing works.

**Default local login:** `npm run dev` automatically seeds a real local account named `devtester` with password `test1234`. This account has completed the prologue and tutorial, owns 10 creatures, has beaten Starting Meadow, and starts in the hub with Wild Plains unlocked. Use this account for feature playtesting unless you are specifically testing registration, onboarding, tutorial, or first-run behavior.

If the account is missing or you need to repair its baseline save, run:
```bash
npm run seed:dev-user
```

```bash
# 1. Kill any stale processes on game ports
lsof -ti :3000 2>/dev/null | xargs kill -9 2>/dev/null
lsof -ti :5173 2>/dev/null | xargs kill -9 2>/dev/null

# 2. Start both servers (Express on :3000 + Vite on :5173)
cd <worktree-or-repo-path>
npm run dev > /tmp/koto-dev.log 2>&1 &
sleep 5

# 3. Verify BOTH servers are up
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173  # Vite — should be 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000  # Express — should be 200
```

**Navigate to Vite's port:** `browser_navigate` to `http://localhost:5173` (NOT `:3000`).
Vite proxies `/api` requests to Express. Loading `:3000` directly skips Vite's module resolution.

If Vite picks a different port (e.g., 5174 because 5173 is busy), check `cat /tmp/koto-dev.log | grep "Local:"` for the actual URL.

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

**Trigger:** Navigate to `http://localhost:5173`

**Expected screen:**
- Login form with username/password fields
- Login / Register tab buttons

**Auth details:**
- Default local test account: `devtester` / `test1234`
- Future agents should use `devtester` for routine feature testing instead of creating throwaway users.
- Auth token is stored in `localStorage` under key `authToken` (NOT `token`)
- Registration requires an invite code: `neo-tokyo-friends`
- To register via API: `POST /api/auth/register` with `{ username, password, inviteCode: "neo-tokyo-friends" }`
- To login via API: `POST /api/auth/login` with `{ username, password }` — returns `{ token }`
- After API login, set `localStorage.setItem('authToken', token)` and reload

**Quick login via evaluate (fastest for playtesting):**
```javascript
await page.evaluate(async () => {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'devtester', password: 'test1234' })
  });
  const { token } = await res.json();
  localStorage.setItem('authToken', token);
});
// Then reload: browser_navigate to http://localhost:5173
```

**Interactions:**
- Log in with test account, or register a new one
- After login, game loads to hub (new account) or continues existing run

**What could go wrong:**
- Login fails silently (check console for 401 on `/api/auth/me`)
- `authToken` key wrong — must be `authToken`, not `token`
- Game JS fails to load — if `window.__inspector` is undefined after login, Vite is not running (see Pre-Playtest Setup)

---

### Phase 1: Tutorial — Cid's Intro + Starter Selection

**Trigger:** New account, first run started (phase `area_selection`, tutorial step 0).

**What happens:**
1. Cid narration appears with `?????????` garbled Japanese text — this is CORRECT (player has no known words yet, i+1 renders unknowns as `?`)
2. Click **outside** the narration box (on `.scene-area`) to advance to next page
3. Cid switches to English: "Oh wait... I don't think you can understand a word I'm saying. ...Do you understand me NOW?"
4. **Response button appears:** "Yes, I understand!" — must click this button (clicking outside does nothing while response buttons are visible)
5. Cid says "Ha! I knew it — you're the new recruit. Here, take this — it's called the Translator."
6. More narration pages (click outside to advance) until Cid says "Every adventurer needs a companion. Choose yours wisely."
7. **Three starter buttons appear:** "ひ (Fire)", "みず (Water)", "き (Wood)" — pick one element

**Interactions:**
- Alternate between clicking outside narration box (to advance pages) and clicking response buttons (when they appear)
- Always screenshot before clicking — if you see buttons below the narration, click the button, not the scene

**What could go wrong:**
- Narration doesn't advance — you're clicking inside the box instead of outside
- Narration stuck — response buttons are present but not visible (scroll down)
- Starter buttons don't appear after Cid's "choose wisely" line

---

### Phase 2: Area Selection

**Trigger:** After choosing a starter creature.

**Expected screen:**
- Background image of an area
- "Area 1 / 1" label
- Area card with name and description (e.g., "Starting Meadow — A bright, open meadow where new adventurers begin their journey.")

**Interactions:** Tap the area card to enter it.

**What could go wrong:**
- No area card rendered
- Area card tap doesn't respond

---

### Phase 3: Team Select → Skill Master → First Combat

**Trigger:** After tapping area card in area selection.

**Phase 3a: Team Selection**

**Expected screen:**
- "せんたく / Your Team" header with "X / 10 pts" counter
- Grid of creature silhouettes (unowned show as dark silhouettes with `???`)
- Owned creatures show sprite, name, element, and level
- "Start Run (N monsters)" button at bottom — disabled until ≥1 creature selected

**Interactions:**
1. Tap an owned creature → stats panel appears at top (HP, ATK, DEF, MP, moves list)
2. Creature gets selected (yellow highlight), point cost deducted from budget
3. Tap "Start Run (N monsters)" when ready

**Key detail:** The creature grid uses `.collection-cell` elements. Owned creatures lack the `.unowned` class. To select a creature programmatically: `document.querySelector('.collection-cell:not(.unowned)').click()`

**Phase 3b: Initial Party Skill Pick (phase: `skillMaster`)**

**Expected screen:**
- Area background with Cid NPC visible
- Narration: "Each run you can get skills to make your party stronger."
- Three party skill cards below (e.g., Counter Master - Lvl. 1, Arc Strike - Lvl. 1, Buff Master - Lvl. 1)

**Interactions:**
1. Dismiss Cid narration (click outside)
2. Tap a skill card to select it
3. Tutorial auto-selects the first skill for you if at tutorial step 0

**Phase 3c: First Combat Entry (phase: `combat`)**

**Expected screen:**
- PixiJS battle scene: ally creature sprite on left, enemy creature sprite on right
- DOM HP/MP bars overlaid on sprites (ally: HP + MP bars, enemy: HP bar)
- Cid NPC in background center
- For normal creature combat: **Move selection cards** in action area below scene: move name in Japanese + English, element, damage, MP cost
- For Kanji Kombat after onboarding: `.kanji-kombat-intro`, `.kanji-kombat-panel`, or `.kanji-kombat-completion` in `#action-area`
- Room counter in header (e.g., "1/30")

**Battlefield layout visual check:**
- The battle scene uses a symmetric 3x2 creature grid.
- Creatures stand on the battleground layer, not floating over generic scenery.
- Labels sit above each creature.
- Only the sky layer drifts during combat; background and battleground stay locked.
- Verify 3v3 first, then 2v2 and 1v1.

**Interactions:**
- Tap a move card to select it → attack executes
- After attack: a **split-attack-card** (SAC) shows the result (attacker, move, target, damage)
- The SAC has a timed reveal animation. After animation completes, a `▼` continue indicator appears
- **Tap the action area** (not the card itself) to dismiss the SAC and continue
- Enemy turn follows automatically, then next move selection appears

**Known issue (tween crash):** If a Pixi tween runs on a null/destroyed sprite at combat start, the SAC animation gets stuck and never shows the continue indicator. Check console for `TypeError: null is not an object (evaluating 'this._position.x')`. If stuck, force-clear: `document.getElementById('action-area').innerHTML = ''`

**Inspector verification during combat:**
```javascript
// Check state-DOM-Pixi consistency
window.__inspector.fullScan()
// Expected: { ok: true, summary: { allies: { state: N, dom: N, pixi: N }, enemies: { state: M, dom: M, pixi: M } } }
```

**What could go wrong:**
- No enemy sprite appears (Pixi loading failure)
- HP bars don't match creature count
- Move cards empty or missing
- SAC animation stuck (tween crash — see known issue)
- Inspector reports DOM_GHOST (stale sprite/HP bar from previous phase)

---

### Phase 3d: Kanji Kombat First-Time Onboarding (phase: `combat`, mode: `kanjiKombat`)

**Trigger:** An account with `meta.kanjiKombatOnboarding.completed === false` clicks **Kanji Kombat**, selects an owned creature, and starts the run.

**Expected screen:**
- Battlefield is already mounted: player creature, enemy formation, HP bars, and combat background are visible.
- Cid slides in using the normal scene/NPC layer, then speaks through `.narration-box.visible`.
- `#action-area` is empty during narration pages, then shows existing `.ui-btn-list .ui-btn` response buttons.
- No `.kanji-kombat-intro`, `.kanji-kombat-panel`, move cards, or combat action buttons appear until onboarding is submitted.

**Interactions:**
1. Dismiss Cid's welcome narration by clicking outside the narration box.
2. Answer "Do you already know all hiragana?" with "Yes, I know all of them" or "No, please teach me".
3. Answer "Do you already know all katakana?" with the same two response buttons.
4. Dismiss the final Cid line. Expected final lines:
   - yes / yes: "Okay, great, we'll start by teaching you kanji. Let's jump right into it."
   - yes / no: "Great, we'll start by teaching you katakana and go from there."
   - no / no: "Great, we'll start by teaching you hiragana and go from there."
5. Verify `POST /api/game/kanji-kombat/onboarding` fires once with `knowsHiragana` and `knowsKatakana` booleans.

**State checks:**
```javascript
window.__gameState.run.mode
// "kanjiKombat"
window.__gameState.run.kanjiKombat.onboardingPending
// false after submission
window.__gameState.meta.kanjiKombatOnboarding
// { completed: true, knowsHiragana: boolean, knowsKatakana: boolean }
```

**After onboarding:**
- Cid slides out and the enemy formation remains visible.
- Action area resumes normal Kanji Kombat work:
  - yes / yes should start with kanji if kanji work is available.
  - yes / no should start with katakana.
  - no / no should start with hiragana.
- If the account has no work available or the daily deck is already complete, onboarding should still stay saved and the existing `.kanji-kombat-completion` prompt should appear.
- Saying "No, please teach me" must not reset existing `script.cards` FSRS progress for hiragana or katakana.

**What could go wrong:**
- Cid appears on the picker instead of the battlefield.
- A quiz, intro card, or completion choice appears before the two onboarding answers are submitted.
- Cid does not slide out, or the enemy DOM/Pixi formation disappears after onboarding.
- Refreshing or retrying after a failed submit traps the account in onboarding despite saved answers.
- False kana answers overwrite existing card reps, due dates, or review state.

---

### Kanji Kombat Offline Behavior

**Expected screen:**
- During ordinary connection drops, quiz, intro, and completion actions should still visibly acknowledge within ~250ms.
- Answers keep flowing while offline as long as the local runway still has prompts and pre-rolled waves available.
- If the local runway is exhausted or the unsynced log reaches the hard cap, a soft pause appears with: "Connection is spotty. Your reviews will sync when you reconnect."
- The pause should feel like a temporary hold, not a scary error or retry panel.

**Interactions:**
1. Open browser DevTools, go to the Network tab, and set the network to Offline mid-session.
2. Answer several cards while offline.
3. Set the network back to Online.

**What could go wrong:**
- Offline answers block immediately instead of continuing from the local runway.
- The spotty-connection pause appears before the runway is exhausted or the hard cap is reached.
- Reconnect causes old prompts to replay, unless the server sends a real correction.
- Sync status becomes noisy instead of draining quietly after the connection returns.

---

### Phase 3A: Speed Review Room (Run Room)

**Trigger:** In Settings, set **Force Room Type** to `Speed Review Room`, then enter/proceed to a room.

**Expected screen:**
- Existing Speed Review takeover UI opens (same visuals/audio/interaction feel as hub mode)
- Session is room-gated: close is disabled until required reviews are committed
- Up to 10 cards are reviewed from a room snapshot (fewer if due list is shorter)

**Interactions:**
1. Swipe cards normally (with optional undo window behavior)
2. Continue until the room session ends and returns to exploration
3. Verify proceed action is available only after room completion

**Checklist (must pass):**
- [ ] Room starts only when entered room type is `speedReviewRoom` (no takeover in non-speed-review rooms)
- [ ] First entry creates a server-authoritative card snapshot and `targetCards` count
- [ ] Re-entering/reloading the same room preserves card order and current `reviewedCards` progress
- [ ] Only committed reviews advance progress (undo-cancelled swipes do **not** count)
- [ ] Completion threshold is `min(targetCards, snapshot size)` and cannot exceed snapshot size
- [ ] Proceed remains blocked before completion and unlocks immediately after completion
- [ ] XP is settled exactly once per committed server review key (no duplicate XP on retry)
- [ ] Pending XP settlement retries do not block room completion or room exit

**Quick regression checks:**
1. Start run with forced `Speed Review Room`; confirm takeover opens immediately on room entry.
2. Commit 1-2 cards, then reload the page; confirm same card order and preserved progress.
3. Use undo on one card; confirm progress does not increment for the cancelled action.
4. Complete enough committed cards to hit the room threshold; verify return to room/exploration and proceed enabled.
5. Continue normal play for a few state syncs (open/close menu, move room, etc.); verify no duplicate XP popups/awards.

**What could go wrong:**
- Room opens without takeover, or uses different UI than hub speed review
- More than 10 committed cards are accepted for a room
- Undo-cancelled review increments room progress or grants XP
- Proceed becomes available before room completion
- Reloading mid-room changes card order/progress (snapshot should be stable)
- Progress endpoint retry causes duplicate XP (should be exactly-once per committed review key)

---

### Shrine Room

**Trigger:** Run enters phase `shrine`.

**Expected screen:**
- Current area parallax background remains visible.
- Shrine Fox sprite slides into the NPC layer.
- A short Japanese greeting appears in the NPC dialogue card.
- The action area shows three shrine blessing choices: heal all creatures, restore MP for all creatures to full, and level up one creature.

**Interactions:**
1. Choose heal or MP to apply the party-wide reward immediately.
2. Choose level-up to open a second target list containing living active and reserve creatures only.

**What could go wrong:**
- Old shrine background appears instead of parallax.
- Fainted creatures appear in the level-up target list.
- Refreshing the room allows a second shrine reward.

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
  - Action text: "[CreatureName] deals X damage" (may include "super effective!" for element advantage)
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

### Phase 6: Creature Swap (Free)

**Trigger:** Vocab cards are showing but you haven't swiped yet. This is the free swap window (`swapPhase: true`).

**Interactions:**
1. Tap an ally creature slot → popup appears
2. Popup shows: creature name, element, HP and ATK stats, ultimate info (name, power, charges X/5)
3. "Use Ultimate" button (greyed out if charges < 5)
4. "Swap with:" section lists reserve creatures as buttons (element icon, name, level, HP)
5. Tap a reserve creature button

**Expected after swap:**
- Swap happens immediately, no action cost (free swap)
- Popup closes
- Ally row updates — tapped creature moves to reserves, selected reserve takes its slot
- HP bars and charge bars transfer correctly

**What could go wrong:**
- Popup doesn't open on slot tap
- Swap section missing (no reserves listed)
- Tapping reserve does nothing
- Wrong creature ends up in the slot
- HP or charges reset after swap
- Popup doesn't close after swap

---

### Phase 7: Ultimate Ability

**Trigger:** A creature's charge bar reaches 5/5 (after ~5 attack/defend turns). The charge bar should glow.

**Interactions:**
1. Tap the charged creature's slot → popup opens
2. "Use Ultimate" button should be enabled (not greyed)
3. Tap "Use Ultimate"

**Expected after ultimate:**
- `POST /api/game/use-creature-ultimate` fires
- AoE attack hits ALL enemies (not just one)
- Damage numbers appear on every enemy
- Enemy HP bars all decrease
- Creature's charge bar resets to 0/5 (glow stops)
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

**Trigger:** Any enemy drops below 50% HP AND your party has room (fewer than 6 total creatures: active + reserves).

**Expected screen change:** Vocab cards now show THREE options instead of two — attack / defend / befriend.

**Interactions:** Swipe the befriend card.

**Expected after swipe:**
- Targets the lowest-HP enemy at or below 50% HP
- Success: "[CreatureName] was befriended!" message
- Captured enemy heals to full HP
- Joins your party (active slot if < 3 active, otherwise reserves)
- Ally row updates to show new creature
- If that was the last enemy, combat ends → victory

**What could go wrong:**
- Befriend card never appears despite eligible enemy below 50% HP
- Befriend targets wrong enemy (not lowest HP)
- Befriend succeeds but creature doesn't appear in ally row
- Creature joins with 0 HP instead of full
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

When new features are added on top of creature combat, replay relevant phases to verify nothing broke. Common regressions:

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

---

## Visual CSS Audit

Use this workflow when making CSS changes. Playwright runs WebKit with iPhone 15 Pro emulation (configured in `.mcp.json`), giving realistic Safari rendering at the correct viewport.

### Setup

1. Start the dev server:
```bash
npm run dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

2. Navigate Playwright to `http://localhost:3000`

3. Inject safe-area mocks (simulates Dynamic Island + home indicator):
```javascript
await page.addStyleTag({ path: 'public/dev-safe-area.css' });
```
Re-inject after every full page navigation (page.goto). In-app state changes (clicking buttons, opening overlays) do NOT require re-injection.

### Per-Screen Checklist

For each screen, take a screenshot and verify:

- [ ] No horizontal overflow (nothing extends beyond 393px width)
- [ ] No content clipped or hidden behind notch area (top 59px) or home indicator (bottom 34px)
- [ ] Text is readable — minimum 14px, Japanese text minimum 16px
- [ ] Touch targets are at least 44x44px
- [ ] No overlapping elements
- [ ] Animations play smoothly (take 2 screenshots 500ms apart if needed)
- [ ] Colors/contrast sufficient (no light text on light background)

### Screens to Audit

Navigate through these in order. Log in or register first, then start a new game.

| # | Screen | How to reach | Key things to check |
|---|--------|-------------|---------------------|
| 1 | Login/Register | Initial page load | Form fits viewport, inputs not clipped |
| 2 | Starter Selection | Start new game | 2-column grid, cards don't overflow, element icons visible |
| 3 | Level Select | After starters | Buttons fit, NEW tag visible on level 1 |
| 4 | Ward Select | After level pick | Ward cards readable, descriptions not truncated |
| 5 | Exploration | After ward pick | Branch buttons visible, Chippy narration fits |
| 6 | Combat | Enter encounter room | Enemy row + ally row + card area all visible without scroll |
| 7 | Triple Cards | When befriend available | 3 cards fit side-by-side without overlap |
| 8 | Shop | After combat victory | 3 reward cards fit, tap targets clear |
| 9 | Inventory | Tap inventory button | Overlay covers full screen, items scrollable, close button not under notch |
| 10 | Settings | Tap settings button | Header not under notch, all toggles visible, scrollable |

### Fixing Issues

When you find a visual bug:
1. Note the screen and specific issue
2. Edit `public/game.css`
3. Reload the page in Playwright (navigate to same URL)
4. Re-inject safe-area mocks
5. Screenshot and verify the fix
6. Continue to next screen

### Limitations

This workflow catches ~90-95% of iPhone visual issues. The remaining ~5% requires real device testing:
- Real `env(safe-area-inset-*)` values (mocked here)
- PWA standalone mode (Playwright runs in browser mode)
- iOS system font rendering (San Francisco)
- Scroll momentum and touch physics
