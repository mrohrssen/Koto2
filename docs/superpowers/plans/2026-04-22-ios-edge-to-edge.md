# iOS Edge-to-Edge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the ~10% top/bottom gaps on the Capacitor iOS build so background art reaches the top pixel of the screen and the mini-toolbar sits flush with the bottom edge.

**Architecture:** Two-layer fix. Native: flip `ios.contentInset: 'automatic' → 'never'` and add `StatusBar.hide()` + `setOverlaysWebView({ overlay: true })` to `initNative()`. CSS: remove `padding-top: env(safe-area-inset-top, …)` from `.game-app` and zero the `env(safe-area-inset-bottom, …)` contribution from `.mini-toolbar`. Leave safe-area usage in takeover views (settings/auth/speed-review) intact so utility text still clears the notch.

**Tech Stack:** Capacitor 8 (iOS), WKWebView, `@capacitor/status-bar`, vanilla CSS with `env(safe-area-inset-*)`, Node built-in test runner, Playwright (WebKit, iPhone 15 Pro emulation).

**Spec:** `docs/superpowers/specs/2026-04-22-ios-edge-to-edge-design.md`

---

## Preflight

- [ ] **Preflight 1: Confirm you're on `dev` with a clean tree**

Run:
```bash
cd "/Users/michia/Documents/Claude Projects/Koto2"
/usr/bin/git status
/usr/bin/git rev-parse --abbrev-ref HEAD
```
Expected: branch is `dev`; only untracked files in `tmp/`, `output/`, or other gitignored locations. If you have uncommitted tracked changes unrelated to this plan, stop and ask the user.

- [ ] **Preflight 2: Pull latest master and dev**

Run:
```bash
/usr/bin/git fetch origin
/usr/bin/git pull origin dev --ff-only || /usr/bin/git pull origin master --ff-only
```
Expected: no merge conflicts. If there are, stop and resolve with the user.

---

## Task 1: Create an isolated worktree

**Files:**
- No code changes; this sets up the isolated working directory per `CLAUDE.md` conventions.

- [ ] **Step 1.1: Create the worktree**

Run:
```bash
cd "/Users/michia/Documents/Claude Projects/Koto2"
PROJECT_ROOT=$(/usr/bin/git rev-parse --show-toplevel)
/usr/bin/git worktree add "$PROJECT_ROOT/../koto-wt-ios-edge-to-edge" -b feature/ios-edge-to-edge
```
Expected: new directory `../koto-wt-ios-edge-to-edge` with a fresh checkout of `feature/ios-edge-to-edge` branched from `dev`.

- [ ] **Step 1.2: Change into the worktree and install deps if needed**

Run:
```bash
cd "/Users/michia/Documents/Claude Projects/Koto2/../koto-wt-ios-edge-to-edge"
pwd
ls node_modules 2>/dev/null | head -3 || npm install
```
Expected: `pwd` prints the worktree path. If `node_modules` already exists (symlinked or copied), skip install; otherwise `npm install` completes cleanly.

- [ ] **Step 1.3: Copy the spec into the worktree view**

The spec was committed on `dev` before the worktree was branched, so it should already be present. Verify:
```bash
ls docs/superpowers/specs/2026-04-22-ios-edge-to-edge-design.md
```
Expected: file exists. If not, stop — the branch base is wrong.

**All subsequent tasks run inside `../koto-wt-ios-edge-to-edge`.**

---

## Task 2: Flip `ios.contentInset` to `'never'`

**Files:**
- Modify: `capacitor.config.ts` (line 8)
- Create: `tests/unit/ios-edge-to-edge-config.test.js`

- [ ] **Step 2.1: Write the failing test**

Create `tests/unit/ios-edge-to-edge-config.test.js`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

test('capacitor.config.ts sets ios.contentInset to never', () => {
  const src = readFileSync(resolve(repoRoot, 'capacitor.config.ts'), 'utf8');
  assert.match(
    src,
    /contentInset:\s*['"]never['"]/,
    'expected ios.contentInset to be "never" — see docs/superpowers/specs/2026-04-22-ios-edge-to-edge-design.md'
  );
});
```

- [ ] **Step 2.2: Run the test — it should fail**

Run:
```bash
node --test tests/unit/ios-edge-to-edge-config.test.js
```
Expected: 1 failing assertion — the regex does not match because the config still contains `contentInset: 'automatic'`.

- [ ] **Step 2.3: Edit `capacitor.config.ts`**

Open `capacitor.config.ts` and change line 8:
```typescript
  ios: {
    contentInset: 'never',
    allowsLinkPreview: false,
    scrollEnabled: false,
  },
```
(Only `contentInset` changes — keep `allowsLinkPreview` and `scrollEnabled` as they are.)

- [ ] **Step 2.4: Run the test — it should pass**

Run:
```bash
node --test tests/unit/ios-edge-to-edge-config.test.js
```
Expected: 1 passing test.

- [ ] **Step 2.5: Run the full test suite to confirm no regression**

Run:
```bash
npm test
```
Expected: all existing tests continue to pass alongside the new one.

- [ ] **Step 2.6: Commit**

Run:
```bash
/usr/bin/git add capacitor.config.ts tests/unit/ios-edge-to-edge-config.test.js
/usr/bin/git commit -m "fix(ios): set contentInset to 'never' for edge-to-edge WKWebView"
```

---

## Task 3: Hide the native status bar and overlay the webview

**Files:**
- Modify: `public/js/native/index.js` (inside `initNative`, around lines 15–17)
- Create: `tests/unit/ios-edge-to-edge-native.test.js`

- [ ] **Step 3.1: Write the failing test**

Create `tests/unit/ios-edge-to-edge-native.test.js`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const nativeSrc = readFileSync(
  resolve(repoRoot, 'public/js/native/index.js'),
  'utf8'
);

test('initNative calls StatusBar.hide()', () => {
  assert.match(
    nativeSrc,
    /StatusBar\.hide\s*\(\s*\)/,
    'expected StatusBar.hide() in initNative — see spec section "Layer 1 — Native"'
  );
});

test('initNative calls StatusBar.setOverlaysWebView({ overlay: true })', () => {
  assert.match(
    nativeSrc,
    /setOverlaysWebView\s*\(\s*\{\s*overlay:\s*true\s*\}\s*\)/,
    'expected StatusBar.setOverlaysWebView({ overlay: true }) as a safety net'
  );
});

test('initNative no longer calls StatusBar.setBackgroundColor', () => {
  assert.doesNotMatch(
    nativeSrc,
    /StatusBar\.setBackgroundColor/,
    'setBackgroundColor is moot once the status bar is hidden; remove it'
  );
});
```

- [ ] **Step 3.2: Run the test — it should fail**

Run:
```bash
node --test tests/unit/ios-edge-to-edge-native.test.js
```
Expected: three failing assertions.

- [ ] **Step 3.3: Edit `public/js/native/index.js`**

Replace the status-bar block inside `initNative` (currently lines 15–17):

**Before:**
```javascript
    // Status bar: match app background
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: '#e8edf3' });
```

**After:**
```javascript
    // Status bar: hide entirely; overlay as safety net if OS re-shows it.
    try { await StatusBar.hide(); } catch {}
    try { await StatusBar.setOverlaysWebView({ overlay: true }); } catch {}
    try { await StatusBar.setStyle({ style: Style.Light }); } catch {}
```

Keep the rest of `initNative` (imports, keyboard listeners, `console.log`) untouched.

- [ ] **Step 3.4: Syntax-check the file**

Run:
```bash
node --check public/js/native/index.js && echo OK
```
Expected: prints `OK`.

- [ ] **Step 3.5: Run the test — it should pass**

Run:
```bash
node --test tests/unit/ios-edge-to-edge-native.test.js
```
Expected: all three tests pass.

- [ ] **Step 3.6: Run the full test suite**

Run:
```bash
npm test
```
Expected: all tests still pass.

- [ ] **Step 3.7: Commit**

Run:
```bash
/usr/bin/git add public/js/native/index.js tests/unit/ios-edge-to-edge-native.test.js
/usr/bin/git commit -m "fix(ios): hide status bar and overlay webview on native init"
```

---

## Task 4: Remove `padding-top` from `.game-app`

**Files:**
- Modify: `public/game.css` (around line 144)
- Create: `tests/unit/ios-edge-to-edge-css.test.js` (used in this task and Task 5)

- [ ] **Step 4.1: Write the failing test**

Create `tests/unit/ios-edge-to-edge-css.test.js`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const css = readFileSync(resolve(repoRoot, 'public/game.css'), 'utf8');

// Extract a CSS rule body by selector. Returns the text between the matching
// `{` and its `}` or null if the selector is not present.
function ruleBody(source, selector) {
  const idx = source.indexOf(selector);
  if (idx === -1) return null;
  const open = source.indexOf('{', idx);
  if (open === -1) return null;
  let depth = 1;
  let i = open + 1;
  while (i < source.length && depth > 0) {
    const c = source[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  return source.slice(open + 1, i - 1);
}

test('.game-app does not apply safe-area-inset-top padding', () => {
  const body = ruleBody(css, '.game-app {');
  assert.ok(body, '.game-app rule not found');
  assert.doesNotMatch(
    body,
    /padding-top:\s*env\(\s*safe-area-inset-top/,
    '.game-app should not pad for the top safe area — content must reach y=0'
  );
});
```

- [ ] **Step 4.2: Run the test — it should fail**

Run:
```bash
node --test tests/unit/ios-edge-to-edge-css.test.js
```
Expected: one failing assertion — the `.game-app` rule still contains `padding-top: env(safe-area-inset-top, …)`.

- [ ] **Step 4.3: Edit `public/game.css`**

Find the `.game-app` block (starts around line 119, ends around line 145). Delete the final declaration inside the rule:

**Before (last 4 lines of the rule):**
```css
  animation: action-area-gradient 12s ease infinite;
  overflow: hidden;
  /* iOS safe areas for notch and home indicator */
  padding-top: env(safe-area-inset-top, var(--safe-area-inset-top, 0px));
}
```

**After:**
```css
  animation: action-area-gradient 12s ease infinite;
  overflow: hidden;
}
```

Also delete the now-stale comment `/* iOS safe areas for notch and home indicator */`.

- [ ] **Step 4.4: Run the test — it should pass**

Run:
```bash
node --test tests/unit/ios-edge-to-edge-css.test.js
```
Expected: the `.game-app` test passes.

- [ ] **Step 4.5: Run the full test suite**

Run:
```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 4.6: Commit**

Run:
```bash
/usr/bin/git add public/game.css tests/unit/ios-edge-to-edge-css.test.js
/usr/bin/git commit -m "fix(css): remove safe-area padding-top from .game-app"
```

---

## Task 5: Zero the bottom safe-area inset on `.mini-toolbar`

**Files:**
- Modify: `public/game.css` (around lines 1455 and 1511)
- Modify: `tests/unit/ios-edge-to-edge-css.test.js`

- [ ] **Step 5.1: Add failing tests to the existing CSS test file**

Append the following to `tests/unit/ios-edge-to-edge-css.test.js`:
```javascript
test('.mini-toolbar base rule does not add safe-area-inset-bottom', () => {
  const body = ruleBody(css, '.mini-toolbar {');
  assert.ok(body, '.mini-toolbar rule not found');
  assert.doesNotMatch(
    body,
    /env\(\s*safe-area-inset-bottom/,
    '.mini-toolbar should be flush with the bottom edge'
  );
});

test('.mini-toolbar.keyboard-avoid variant does not add safe-area-inset-bottom', () => {
  const body = ruleBody(css, '.mini-toolbar.keyboard-avoid {');
  assert.ok(body, '.mini-toolbar.keyboard-avoid rule not found');
  assert.doesNotMatch(
    body,
    /env\(\s*safe-area-inset-bottom/,
    '.mini-toolbar.keyboard-avoid should also be flush at the bottom'
  );
});
```

- [ ] **Step 5.2: Run the tests — both new ones should fail**

Run:
```bash
node --test tests/unit/ios-edge-to-edge-css.test.js
```
Expected: two new failures (the `.game-app` test from Task 4 still passes).

- [ ] **Step 5.3: Edit the `.mini-toolbar` base rule (line ~1455)**

Find the base `.mini-toolbar { … }` block in `public/game.css`. Change its `padding` declaration:

**Before:**
```css
  padding: 4px 0 env(safe-area-inset-bottom, var(--safe-area-inset-bottom, 0px));
```

**After:**
```css
  padding: 4px 0;
```

- [ ] **Step 5.4: Edit the `.mini-toolbar.keyboard-avoid` variant (line ~1511)**

Find the `.mini-toolbar.keyboard-avoid { … }` block. Change its `padding` declaration:

**Before:**
```css
  padding: 4px 0 calc(4px + env(safe-area-inset-bottom, var(--safe-area-inset-bottom, 0px)));
```

**After:**
```css
  padding: 4px 0 4px;
```

- [ ] **Step 5.5: Run the tests — they should all pass**

Run:
```bash
node --test tests/unit/ios-edge-to-edge-css.test.js
```
Expected: all three CSS tests pass.

- [ ] **Step 5.6: Run the full test suite**

Run:
```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 5.7: Commit**

Run:
```bash
/usr/bin/git add public/game.css tests/unit/ios-edge-to-edge-css.test.js
/usr/bin/git commit -m "fix(css): make .mini-toolbar flush with bottom edge"
```

---

## Task 6: Visual verification in Playwright (simulator)

This task verifies the CSS changes render correctly with mocked safe-area insets before the user runs a real-device build.

**Files:**
- No code changes — a manual Playwright walk-through using the existing `public/dev-safe-area.css` mock.

- [ ] **Step 6.1: Ask the user to confirm before opening Playwright**

Per `CLAUDE.md` ("Don't launch Playwright without asking first"): before opening a browser session, tell the user what you're about to do and wait for approval. Example message:
> "Ready to run the visual verification step. I'll start `npm run dev` and drive a Playwright (WebKit, iPhone 15 Pro) session to screenshot the gameplay, auth, and settings takeover screens with safe-area insets mocked. OK to proceed?"

If the user declines or defers, stop this task; resume later.

- [ ] **Step 6.2: Start the dev server (if not already running)**

Run:
```bash
npm run dev
```
This runs Vite on `:5173` and Express on `:3000`. Leave it running in a background terminal. Wait ~5 s, then confirm:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
```
Expected: `200`.

- [ ] **Step 6.3: Open Playwright (WebKit, iPhone 15 Pro emulation)**

Use Playwright MCP to `browser_navigate` to `http://localhost:5173`. After the page loads, inject the safe-area mock (per `CLAUDE.md` playtest rules):
```javascript
await page.addStyleTag({ path: 'public/dev-safe-area.css' });
```

- [ ] **Step 6.4: Verify `.game-app` has no top padding**

In the Playwright page, run:
```javascript
const padTop = await page.evaluate(() =>
  getComputedStyle(document.querySelector('.game-app')).paddingTop
);
console.log('game-app padding-top:', padTop);
```
Expected: `0px`. If not, re-check Task 4's edit.

- [ ] **Step 6.5: Verify `.mini-toolbar` bottom padding is 4px**

Run:
```javascript
const padBottom = await page.evaluate(() =>
  getComputedStyle(document.querySelector('.mini-toolbar')).paddingBottom
);
console.log('mini-toolbar padding-bottom:', padBottom);
```
Expected: `4px`. If the element is not on the current screen, navigate to gameplay first (log in with the test user per `docs/playtest-guide.md`).

- [ ] **Step 6.6: Screenshot the gameplay screen**

Take a full-page screenshot with `browser_take_screenshot`. Confirm visually:
- No light grey band at the top of the screen above the scene-area.
- The mini-toolbar icons sit at the very bottom with only 4 px of internal padding below them.

Delete the screenshot immediately after review (`rm <filename>`), per `CLAUDE.md` cleanup rules.

- [ ] **Step 6.7: Screenshot a takeover view (Settings)**

Tap the menu → Settings to open the Settings takeover. Screenshot it. Confirm:
- Top content does not collide with the mocked 59 px notch inset (safe-area padding inside `.takeover` should still apply).
- Bottom content does not run under the mocked home-indicator area (text still has the safe-area padding).

Delete the screenshot after review.

- [ ] **Step 6.8: Screenshot the auth screen**

Log out (menu → Logout) and screenshot the auth screen. Confirm title/form do not collide with the mocked notch.

Delete the screenshot after review.

- [ ] **Step 6.9: Close the browser and stop the dev server**

Close Playwright. Kill `npm run dev`.

- [ ] **Step 6.10: Record results in the PR description draft**

Write a short note in `docs/superpowers/plans/2026-04-22-ios-edge-to-edge.md` under a new `## Visual Verification Log` section at the end, listing which screens were checked and the observed results. (Use the Edit tool.)

- [ ] **Step 6.11: Commit the verification log**

Run:
```bash
/usr/bin/git add docs/superpowers/plans/2026-04-22-ios-edge-to-edge.md
/usr/bin/git commit -m "docs(plan): record visual verification results"
```

---

## Task 7: Capacitor sync and real-device handoff

The plan cannot itself run a real-iPhone build. This task prepares everything and hands off to the user.

**Files:**
- No code changes.

- [ ] **Step 7.1: Sync Capacitor**

Run:
```bash
npx cap sync ios
```
Expected: Capacitor copies `dist/` into the iOS project and updates native plugins. No errors.

- [ ] **Step 7.2: Summarize what the user needs to do**

Post a message to the user with:
1. The branch name (`feature/ios-edge-to-edge`) and worktree path.
2. An ordered list of screens to screenshot on a notch or dynamic-island iPhone:
   - Main gameplay — confirm no visible status bar, background reaches top pixel, toolbar flush bottom.
   - Auth screen — text clears notch.
   - Settings takeover — safe-area padding still respected.
   - Speed-review takeover — header clears notch.
3. Keyboard test: open the bug-report textarea; confirm keyboard opens, layout reflows, and the status bar does not re-appear.
4. Android smoke: build once on Android; expect no regression.

Stop and wait for the user's results before proceeding to Task 8.

---

## Task 8: Merge to `dev`

Only run this after the user confirms real-device verification passed.

**Files:**
- No code changes.

- [ ] **Step 8.1: Verify no uncommitted changes**

Run:
```bash
/usr/bin/git status
```
Expected: tree is clean.

- [ ] **Step 8.2: Merge into `dev`**

Run:
```bash
cd "/Users/michia/Documents/Claude Projects/Koto2"
/usr/bin/git checkout dev
/usr/bin/git pull origin dev --ff-only
/usr/bin/git merge feature/ios-edge-to-edge --no-ff -m "Merge feature/ios-edge-to-edge into dev"
```
Expected: clean merge (no conflicts). If there are conflicts, stop and ask the user.

- [ ] **Step 8.3: Push `dev`**

Before pushing, confirm with the user (pushing is a shared-state action per the standing guidance). Then:
```bash
/usr/bin/git push origin dev
```

- [ ] **Step 8.4: Remove the worktree and delete the local branch**

Run:
```bash
/usr/bin/git worktree remove ../koto-wt-ios-edge-to-edge
/usr/bin/git branch -d feature/ios-edge-to-edge
```
Expected: both succeed. If `branch -d` complains about unmerged changes, stop — something in Task 8.2 went wrong.

---

## Self-Review Checklist (for the implementer)

Before handing the PR to the user, confirm:

- [ ] `capacitor.config.ts` has `contentInset: 'never'`.
- [ ] `public/js/native/index.js` calls `StatusBar.hide()` and `StatusBar.setOverlaysWebView({ overlay: true })`, and no longer calls `StatusBar.setBackgroundColor`.
- [ ] `.game-app` in `public/game.css` has no `padding-top: env(safe-area-inset-top, …)` declaration.
- [ ] `.mini-toolbar` and `.mini-toolbar.keyboard-avoid` in `public/game.css` have no `env(safe-area-inset-bottom, …)` in their padding.
- [ ] All three new unit test files pass under `npm test`.
- [ ] No unrelated `env(safe-area-inset-*)` usages were removed. Takeover views, auth screen, speed-review header, narration box, lookup popup, and similar utility surfaces still respect safe areas.
- [ ] Playwright simulator screenshots confirm the top gap is gone and the mini-toolbar is flush.
- [ ] (Out-of-band) User confirms the real-device build matches the expected visuals.
