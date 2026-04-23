# Top HUD Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bottom `.mini-toolbar` with a three-chip top HUD (Room N/M · Monsters · Menu), styled as translucent-black capsules over the scene. Lookup becomes a menu-sheet item.

**Architecture:** Repurpose the existing `#area-header-pill` container (currently hidden TODO block) as a transparent row of flex children. Each child is a `.hud-chip` — one shared CSS class for the room badge and the two icon buttons. The area-name / sub-area text and the floor/essence status bar are untouched at the data layer but removed from the visible HUD.

**Tech Stack:** HTML + CSS (`public/index.html`, `public/game.css`), vanilla JS (`public/game.js`, `public/js/dom.js`, `public/js/ui/lookup.js`).

**Spec:** [`docs/superpowers/specs/2026-04-23-top-hud-redesign-design.md`](../specs/2026-04-23-top-hud-redesign-design.md)

**Branch:** `feature/top-hud-redesign` (already created and holds the spec commit)

---

## Before you start

Run these once to verify your working state:

```bash
/usr/bin/git rev-parse --abbrev-ref HEAD       # should print: feature/top-hud-redesign
/usr/bin/git status --short                    # spec already committed; expect only unrelated untracked
npm install                                    # if node_modules is stale
```

---

## Task 1: Restructure the HTML — top HUD chips + remove bottom toolbar + add Lookup to menu

**Files:**
- Modify: `public/index.html` (lines 31–99)

- [ ] **Step 1: Replace the `#area-header-pill` contents**

Find this block (around lines 31–38):

```html
<!-- Area header pill -->
<div class="area-header-pill" id="area-header-pill">
  <div class="area-header-main">
    <span class="area-header-name" id="area-header-name"></span>
    <span class="area-header-sep"> · </span>
    <span class="area-header-sub" id="area-header-sub"></span>
  </div>
  <span class="room-progress-badge" id="room-progress-badge" aria-label="Room progress"></span>
</div>
```

Replace it with:

```html
<!-- Top HUD -->
<div class="area-header-pill" id="area-header-pill">
  <span class="hud-chip room-progress-badge" id="room-progress-badge" aria-label="Room progress"></span>
  <div class="top-hud-right">
    <button class="hud-chip hud-btn" id="bots-btn" aria-label="Monsters">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
      </svg>
    </button>
    <button class="hud-chip hud-btn" id="menu-btn" aria-label="Menu">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    </button>
  </div>
</div>
```

- [ ] **Step 2: Delete the `.mini-toolbar` block**

Find this entire block (around lines 71–88):

```html
<!-- Mini Toolbar -->
<div class="mini-toolbar" id="mini-toolbar">
  <button class="toolbar-btn" id="lookup-btn" aria-label="Lookup">
    <svg width="22" height="22" viewBox="0 0 24 24" ...>
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  </button>
  <button class="toolbar-btn" id="bots-btn" aria-label="Monsters">
    <svg width="22" height="22" viewBox="0 0 24 24" ...>
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
    </svg>
  </button>
  <button class="toolbar-btn" id="menu-btn" aria-label="Menu">
    <svg width="22" height="22" viewBox="0 0 24 24" ...>
      <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  </button>
</div>
```

Delete the whole `<div class="mini-toolbar" …></div>` including all three buttons inside it.

- [ ] **Step 3: Add `Lookup` menu item to the menu sheet**

Find the `.menu-sheet` block (around lines 92–99). Insert a new `<button>` as the **first** menu item (above Settings):

```html
<button class="menu-item" id="lookup-menu-btn"><span class="menu-icon">&#128269;</span> Lookup</button>
```

Result:

```html
<div class="menu-sheet" id="menu-sheet">
  <div class="menu-handle"></div>
  <button class="menu-item" id="lookup-menu-btn"><span class="menu-icon">&#128269;</span> Lookup</button>
  <button class="menu-item" id="settings-btn"><span class="menu-icon">&#9881;</span> Settings</button>
  <button class="menu-item" id="leaderboard-btn"><span class="menu-icon">&#127942;</span> Leaderboard</button>
  <button class="menu-item" id="reset-run-btn"><span class="menu-icon">&#10005;</span> Reset Run</button>
  <button class="menu-item" id="bug-report-btn"><span class="menu-icon">&#128027;</span> Bug Report</button>
  <button class="menu-item menu-item-danger" id="logout-btn"><span class="menu-icon">&#8594;</span> Logout</button>
</div>
```

- [ ] **Step 4: Verify no stale references remain in index.html**

Run:

```bash
grep -n "mini-toolbar\|lookup-btn\|area-header-name\|area-header-sub\|area-header-sep\|area-header-main" public/index.html
```

Expected output: **empty** (no matches). If any remain, delete them.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add public/index.html
/usr/bin/git commit -m "refactor(ui): restructure top HUD markup, drop mini-toolbar"
```

---

## Task 2: Add the `.hud-chip` styles and repurpose `.area-header-pill` as a transparent container

**Files:**
- Modify: `public/game.css` (around lines 177–240 for `.area-header-pill`; add new rules)

- [ ] **Step 1: Rewrite `.area-header-pill` block**

Find the current `.area-header-pill { ... }` rule at `public/game.css:178` (starts with `position: absolute; top: 0;`). Replace that rule AND its immediate siblings (`.area-header-main`, `.area-header-name`, `.area-header-sep`, `.area-header-sub`, `.area-header-pill.visible`, and any other `.area-header-*` rules that follow) with:

```css
/* ===== TOP HUD (replaces .mini-toolbar + old area-header-pill) ===== */
.area-header-pill {
  position: absolute;
  top: env(safe-area-inset-top, 0);
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  padding-left: max(12px, env(safe-area-inset-left, 0));
  padding-right: max(12px, env(safe-area-inset-right, 0));
  z-index: 10;
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  pointer-events: none; /* children re-enable */
}
.area-header-pill > * { pointer-events: auto; }

.top-hud-right {
  display: flex;
  gap: 8px;
}

.hud-chip {
  background: rgba(0, 0, 0, 0.68);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.03em;
  padding: 8px 12px;
  line-height: 1;
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}

button.hud-chip {
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.hud-chip.hud-btn {
  padding: 8px;
  min-width: 38px;
}
.hud-chip.hud-btn svg {
  width: 20px;
  height: 20px;
  display: block;
}

.hud-chip.hud-btn:active {
  background: rgba(0, 0, 0, 0.85);
}
```

- [ ] **Step 2: Update `.room-progress-badge` to compose with `.hud-chip` (not duplicate)**

Find the `.room-progress-badge { ... }` block around `public/game.css:620–640`. Replace it with a minimal override that defers to `.hud-chip` for background/typography:

```css
/* Room index within current area (e.g. 7/30) — composes with .hud-chip */
.room-progress-badge {
  display: none;            /* hidden until JS fills it */
  flex-shrink: 0;
}
.room-progress-badge:not(:empty) {
  display: inline-flex;     /* overrides :not(:empty) → show when populated */
}
```

Delete the old `font-size`, `background`, `padding`, `border`, `text-shadow`, and `margin-right` declarations on `.room-progress-badge` — `.hud-chip` handles all of that now.

- [ ] **Step 3: Syntax-check the CSS**

```bash
node -e "const fs=require('fs');const s=fs.readFileSync('public/game.css','utf8');let d=0,l=1,c=0;for(const ch of s){if(ch==='{')d++;else if(ch==='}'){d--;if(d<0){console.error('unbalanced at line',l);process.exit(1)}}if(ch==='\n')l++}if(d!==0){console.error('unclosed braces:',d);process.exit(1)}console.log('CSS braces balanced')"
```

Expected: `CSS braces balanced`

- [ ] **Step 4: Commit**

```bash
/usr/bin/git add public/game.css
/usr/bin/git commit -m "feat(ui): add .hud-chip and repurpose .area-header-pill as top HUD"
```

---

## Task 3: Remove the old `.mini-toolbar` / `.toolbar-btn` CSS rules

**Files:**
- Modify: `public/game.css` (around lines 1374–1495)

- [ ] **Step 1: Delete `.mini-toolbar` and related rules**

Find and delete these blocks (around `public/game.css:1374–1495`):

- `.mini-toolbar { ... }` (around line 1375)
- `.toolbar-btn { ... }` (around line 1386)
- `.toolbar-btn:active { ... }` (around line 1401)
- `.toolbar-btn.active { ... }` (around line 1405)
- `.toolbar-btn.lookup-active { ... }` (around line 1486)
- `.toolbar-btn.lookup-loading { ... }` (around line 1491)

Also delete any `@keyframes` that are only referenced by the `lookup-loading` rule (grep the keyframes name in the file to confirm no other callers before deleting).

- [ ] **Step 2: Check for any remaining references**

```bash
grep -n "mini-toolbar\|toolbar-btn" public/game.css
```

Expected: **empty**.

Also check for any reference elsewhere:

```bash
grep -rn "mini-toolbar\|toolbar-btn" public/ server.js 2>/dev/null | grep -v node_modules
```

Expected: only the lookup.js reference in `BLOCKED_SELECTORS` (handled in Task 6), plus any stale references which should be reported.

- [ ] **Step 3: Check `--toolbar-height` var usage**

```bash
grep -n "--toolbar-height\|toolbar-height" public/game.css
```

If the var is defined but no longer used (only the removed `.mini-toolbar` referenced it), delete the `--toolbar-height: ...` definition from `:root`. If other rules still use it, leave it.

- [ ] **Step 4: Commit**

```bash
/usr/bin/git add public/game.css
/usr/bin/git commit -m "refactor(ui): remove .mini-toolbar and .toolbar-btn styles"
```

---

## Task 4: Update `dom.js` — drop `lookupBtn`, add `lookupMenuBtn`

**Files:**
- Modify: `public/js/dom.js` (lines 13–46)

- [ ] **Step 1: Replace `lookupBtn` with `lookupMenuBtn`**

Find in `public/js/dom.js`:

```javascript
  get lookupBtn() { return el('lookup-btn'); },
```

Replace with:

```javascript
  get lookupMenuBtn() { return el('lookup-menu-btn'); },
```

- [ ] **Step 2: Confirm `areaHeaderName` and `areaHeaderSub` can go (they'll be unused after Task 5)**

Find:

```javascript
  get areaHeaderName() { return el('area-header-name'); },
  get areaHeaderSub() { return el('area-header-sub'); },
```

Leave them for now — Task 5 deletes their only caller, after which these two getters can be removed in a small cleanup step (same task).

- [ ] **Step 3: Syntax check**

```bash
node --check public/js/dom.js && echo "OK"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
/usr/bin/git add public/js/dom.js
/usr/bin/git commit -m "refactor(dom): rename lookupBtn getter to lookupMenuBtn"
```

---

## Task 5: Simplify `updateStatusBar()` — drop area-name rendering from the HUD

**Files:**
- Modify: `public/game.js` (lines 425–473)
- Modify: `public/js/dom.js` (lines 17–19)

- [ ] **Step 1: Simplify `updateStatusBar()`**

Find the `updateStatusBar()` function in `public/game.js` (starts at line 425). Replace its body with:

```javascript
function updateStatusBar() {
  const run = gameState.run;
  if (run) {
    const currentRoomIdx = run.currentRoom || 0;
    const currentRoom = run.rooms?.[currentRoomIdx];
    const activeRoom = Array.isArray(currentRoom) ? currentRoom[0] : currentRoom;
    const subAreaNameEn = activeRoom?.subArea?.nameEn;
    dom.floorIndicator.textContent = subAreaNameEn || `Area ${(run.areasCompleted || 0) + 1}`;
  } else {
    dom.floorIndicator.textContent = 'Hub';
  }
  dom.essenceDisplay.textContent = gameState.meta?.essence || gameState.player?.essence || 0;

  // Room X / total in current area (fixed 30-room layout)
  const rpb = dom.roomProgressBadge;
  if (rpb) {
    const r = gameState.run;
    if (r?.active && Array.isArray(r.rooms) && r.rooms.length > 0) {
      const total = r.totalRooms || r.rooms.length;
      const idx = Number.isInteger(r.currentRoom) ? r.currentRoom : 0;
      const current = Math.min(idx + 1, total);
      rpb.textContent = `${current}/${total}`;
    } else {
      rpb.textContent = '';
    }
  }
}
```

This removes:
- All `dom.areaHeaderName.innerHTML = ...` writes
- All `dom.areaHeaderSub.textContent = ...` writes
- The `.area-header-sep` lookup and style mutation
- The `dom.areaHeaderPill.classList.add/remove('visible')` calls — the pill is now always visible (CSS default)

- [ ] **Step 2: Remove unused `areaHeaderName` / `areaHeaderSub` getters in dom.js**

In `public/js/dom.js`, delete these two lines:

```javascript
  get areaHeaderName() { return el('area-header-name'); },
  get areaHeaderSub() { return el('area-header-sub'); },
```

Keep `areaHeaderPill` — other code may still reference it for visibility toggles (verify with grep, see Step 3).

- [ ] **Step 3: Confirm no other callers of removed getters / elements**

```bash
grep -rn "areaHeaderName\|areaHeaderSub\|area-header-name\|area-header-sub\|area-header-sep\|area-header-main" public/ 2>/dev/null | grep -v node_modules
```

Expected: **empty**. If hits appear, update those callers in the same commit.

- [ ] **Step 4: Syntax check**

```bash
node --check public/game.js && node --check public/js/dom.js && echo "OK"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add public/game.js public/js/dom.js
/usr/bin/git commit -m "refactor(ui): simplify updateStatusBar, drop area-name HUD rendering"
```

---

## Task 6: Update `lookup.js` — move trigger to menu item, drop button state classes

**Files:**
- Modify: `public/js/ui/lookup.js` (lines 15–24, 32–74, 105–175)

- [ ] **Step 1: Remove `.mini-toolbar` from `BLOCKED_SELECTORS`**

Find (around line 15–24):

```javascript
const BLOCKED_SELECTORS = [
  '.quiz-answer-option',  // Quiz answers - no cheating!
  '.flash-card',          // Flashcards - no cheating!
  '.mini-toolbar',        // Toolbar buttons
  '.lookup-popup',        // The lookup popup itself
  'button',               // All buttons
  'script',               // Script tags
  'style',                // Style tags
];
```

Replace with:

```javascript
const BLOCKED_SELECTORS = [
  '.quiz-answer-option',  // Quiz answers - no cheating!
  '.flash-card',          // Flashcards - no cheating!
  '.lookup-popup',        // The lookup popup itself
  'button',               // All buttons
  'script',               // Script tags
  'style',                // Style tags
];
```

(`button` already covers the old toolbar buttons and the new `.hud-chip.hud-btn`.)

- [ ] **Step 2: Simplify `blockGameClicks` — drop the activation-via-button branch**

Find (around lines 32–56):

```javascript
function blockGameClicks(e) {
  // Special case: clicking lookup button to ACTIVATE
  if (!isActive && !isLoading && dom.lookupBtn?.contains(e.target)) {
    e.stopImmediatePropagation();
    e.preventDefault();
    toggle();
    return;
  }

  if (!isActive) return;

  if (dom.lookupBtn?.contains(e.target)) return;
  if (dom.lookupPopup?.contains(e.target)) return;

  if (e.target.classList.contains('lookup-word')) return;

  e.stopImmediatePropagation();
  e.preventDefault();
}
```

Replace with:

```javascript
function blockGameClicks(e) {
  if (!isActive) return;

  // Allow clicks on: popup, popup close, lookup words
  if (dom.lookupPopup?.contains(e.target)) return;
  if (e.target.classList.contains('lookup-word')) return;

  // Block everything else so the underlying game doesn't receive the click
  e.stopImmediatePropagation();
  e.preventDefault();
}
```

- [ ] **Step 3: Rewire the menu-item click in `init()`**

Find (around lines 68–74):

```javascript
  // Button click to DEACTIVATE (activation is handled in blockGameClicks)
  dom.lookupBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isActive) {
      toggle(); // Deactivate
    }
  });
```

Replace with:

```javascript
  // Menu-sheet item toggles lookup mode on/off
  dom.lookupMenuBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle();
  });
```

- [ ] **Step 4: Drop the `.lookup-loading` / `.lookup-active` class mutations**

Find in `activate()` (around lines 113, 131, 159, 160, 166) and in `deactivate()` (around line 175). Delete every line that mutates `dom.lookupBtn?.classList`:

```javascript
// DELETE these lines:
dom.lookupBtn?.classList.add('lookup-loading');
dom.lookupBtn?.classList.remove('lookup-loading');
dom.lookupBtn?.classList.add('lookup-active');
dom.lookupBtn?.classList.remove('lookup-active');
```

The feedback now comes from the popup itself (decision recorded in the spec). `isLoading` and `isActive` module-level flags stay — only the DOM class mutations go away.

- [ ] **Step 5: Verify no remaining `lookupBtn` references**

```bash
grep -n "lookupBtn" public/js/ui/lookup.js
```

Expected: **empty**.

- [ ] **Step 6: Syntax check**

```bash
node --check public/js/ui/lookup.js && echo "OK"
```

Expected: `OK`

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add public/js/ui/lookup.js
/usr/bin/git commit -m "refactor(lookup): move trigger from toolbar button to menu-sheet item"
```

---

## Task 7: Wire the `Lookup` menu item to close the sheet when tapped

The menu sheet uses a delegated click handler in `modals.js` (`initMenu`) that auto-closes the sheet when any `.menu-item` is clicked. Verify the new `#lookup-menu-btn` inherits that behavior.

**Files:**
- Verify: `public/js/ui/modals.js`
- Verify: `public/index.html`

- [ ] **Step 1: Inspect `initMenu` in modals.js**

Run:

```bash
grep -n "initMenu\|menu-item\|menu-sheet" public/js/ui/modals.js | head -20
```

Confirm that the click handler is attached to `.menu-item` by class (delegated on `#menu-sheet` or similar), not by individual id. If it IS attached by id, add an equivalent wire-up for `#lookup-menu-btn` in `modals.js:initMenu`.

- [ ] **Step 2: If needed, add the handler**

Only if Step 1 showed hard-coded ids (no `.menu-item` delegation): inside `initMenu`, add:

```javascript
document.getElementById('lookup-menu-btn')?.addEventListener('click', () => {
  closeMenu(); // or whatever the local close function is named
  // lookup.toggle() is wired by lookup.js itself; no need to invoke here
});
```

If Step 1 already showed class-based delegation on `.menu-item`, skip this step — the new button will Just Work.

- [ ] **Step 3: Syntax check + commit if changed**

```bash
node --check public/js/ui/modals.js && echo "OK"
```

If changed:

```bash
/usr/bin/git add public/js/ui/modals.js
/usr/bin/git commit -m "fix(menu): auto-close sheet when Lookup item is tapped"
```

If no change was needed, no commit. Move on.

---

## Task 8: Run the test suite and a final grep sweep

**Files:** none modified

- [ ] **Step 1: Run tests**

```bash
npm test
```

Expected: all tier-1 + tier-2 tests pass. If any fail, the failure message should point you at the regression. Common cause: a test references `#lookup-btn` or `.mini-toolbar` in a DOM snapshot. Fix the test (not by re-adding the markup) and re-run.

- [ ] **Step 2: Global grep for dead refs**

```bash
grep -rn "lookup-btn\|mini-toolbar\|toolbar-btn\|area-header-name\|area-header-sub\|area-header-sep\|area-header-main" public/ src/ tests/ 2>/dev/null | grep -v node_modules
```

Expected: **empty**. Any remaining hits are either:
- Dead code → delete
- A test asserting old markup → update the test

Fix any hits in the appropriate file(s) and commit with `chore: clean up stale HUD references`.

- [ ] **Step 3: JS syntax sweep**

```bash
for f in public/index.html public/game.css public/game.js public/js/dom.js public/js/ui/lookup.js public/js/ui/modals.js; do
  [ -f "$f" ] || continue
  case "$f" in
    *.js) node --check "$f" && echo "OK: $f" ;;
    *) echo "skip (not js): $f" ;;
  esac
done
```

Expected: `OK: ...` for every js file; no errors.

---

## Task 9: Visual verification in the browser

**Files:** none modified

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Wait ~5s, then:

```bash
until curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ | grep -q "200\|304"; do sleep 1; done && echo "ready"
```

Expected: `ready`.

- [ ] **Step 2: Ask the user before launching Playwright**

Per `CLAUDE.md`: *Don't launch Playwright without asking first.* Confirm with the user before opening a Playwright session.

- [ ] **Step 3: Open Playwright and log in**

Follow [`docs/playtest-guide.md`](../../playtest-guide.md) to reach the combat screen. Summary:

1. `browser_navigate` to `http://localhost:5173/`
2. Log in / pick a run that has an active area
3. Navigate into combat (or any scene where `#area-header-pill` is visible)

- [ ] **Step 4: Screenshot the top-left and top-right corners**

```javascript
// in Playwright
await page.evaluate(() => window.__gameState?.phase);  // confirm you're in combat/exploration
```

Take a screenshot. Verify by eye:

- **Top-left:** One chip showing e.g. `7/30` — black translucent background, white bold digits, rounded 12px corners.
- **Top-right:** Two square chips side-by-side — grid icon (Monsters), then hamburger (Menu). Same style as the room chip. 8px gap between them.
- **No bar across the top:** the scene background shows between and around the chips.
- **No bar at the bottom:** `.mini-toolbar` is gone; the `.action-area` runs to the bottom of the screen.

- [ ] **Step 5: Click Menu and verify the sheet**

Click `#menu-btn`. The sheet slides up. First item is **🔍 Lookup**. Tap it → lookup mode activates (background text becomes tappable; tapping a word opens the lookup popup).

Tap Menu again (or backdrop) to close. Repeat with the Monsters button (`#bots-btn`) — confirm it opens the creature equip view if you have an active party.

- [ ] **Step 6: PvP spot-check**

If time allows, navigate to a PvP battle. Confirm the same top HUD renders (or explicitly note in the PR description that PvP has its own header and is untouched by this change).

- [ ] **Step 7: Delete screenshots**

Per `CLAUDE.md`: *Delete screenshots immediately.* For each screenshot you took during this task, `rm <exact-filename>`. Do **not** run `rm *.png` — there may be unrelated PNGs in the cwd.

- [ ] **Step 8: Stop the dev server when done**

If you started `npm run dev` in the background, let the user decide whether to leave it running; otherwise stop it.

---

## Task 10: Open a PR

**Files:** none modified beyond commit metadata

- [ ] **Step 1: Push the branch**

```bash
/usr/bin/git push -u origin feature/top-hud-redesign
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --base master --title "feat(ui): minimal top HUD — Room · Monsters · Menu" --body "$(cat <<'EOF'
## Summary
- Replaces the bottom `.mini-toolbar` with a three-chip top HUD: `Room N/M` (left), Monsters + Menu (right).
- Shared `.hud-chip` style (translucent black, backdrop blur, rounded 12px).
- Lookup is no longer a top-level button; it's the first item in the menu sheet.
- Drops area-name / sub-area rendering from the visible HUD.

Spec: `docs/superpowers/specs/2026-04-23-top-hud-redesign-design.md`

## Test plan
- [ ] `npm test` passes
- [ ] `grep` sweep returns no dead refs to `lookup-btn` / `mini-toolbar` / `toolbar-btn` / `area-header-name|sub|sep|main`
- [ ] Dev server loads; combat screen shows three chips on the scene, nothing at the bottom
- [ ] Menu sheet opens, `Lookup` is the first item, it toggles lookup mode
- [ ] Monsters button opens the creature equip view
- [ ] PvP battle spot-checked (or noted as out-of-scope)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Print the PR URL**

The PR URL is in the output of `gh pr create`. Paste it in the session so the user can review.

---

## Rollback

If something goes wrong mid-implementation:

```bash
/usr/bin/git status                              # see what's staged/modified
/usr/bin/git reset --hard HEAD                   # discard un-committed changes on this branch
/usr/bin/git log --oneline feature/top-hud-redesign  # see commit history on this branch
/usr/bin/git reset --hard <commit-before-break>  # reset to a known-good commit
```

Do **not** rebase or force-push without confirming with the user.
