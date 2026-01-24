# Integration Merge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Merge chip-balance, image assets, mobile-first-ui, and audio branches into `integration/all-features` for testing.

**Architecture:** Sequential merge of 4 feature sets into one integration branch. The integration worktree already exists at `/Users/michia/Documents/jrpg-wt-integration` but has a corrupted index that must be reset first. Merges are ordered by dependency: chip-balance (independent) → images (independent) → mobile-ui (independent) → audio (depends on mobile-ui).

**Tech Stack:** Git (worktrees, merge), Node.js, Playwright (e2e)

**Key Finding:** Despite the design doc's conflict analysis, there are **no actual file conflicts** between chip-balance and mobile-ui. They touch completely different files. The only real merge complexity is the audio branch, which patches files from mobile-ui.

---

### Task 1: Reset Integration Worktree

**Files:**
- Worktree: `/Users/michia/Documents/jrpg-wt-integration`

**Context:** The integration worktree exists but has 417 staged deletions from a prior bad state. We need to hard-reset it to master (`049bf62`) so it's clean.

**Step 1: Reset the integration branch to master**

```bash
cd /Users/michia/Documents/jrpg-wt-integration
/usr/bin/git reset --hard master
```

Expected: `HEAD is now at 049bf62 docs: add mobile-first UI redesign implementation plan`

**Step 2: Verify clean state**

```bash
cd /Users/michia/Documents/jrpg-wt-integration
/usr/bin/git status --short | wc -l
```

Expected: `0` (no changes)

**Step 3: Install dependencies**

```bash
cd /Users/michia/Documents/jrpg-wt-integration
npm install
```

Expected: packages installed successfully

---

### Task 2: Merge chip-balance-tuning

**Context:** 2 commits on `feature/chip-balance-tuning` that modify chip stats/formulas. No overlap with any other branch's files.

**Files touched by this merge:**
- `data/chip-config.json`
- `data/chips.json`
- `src/game/items/chips.js`
- `src/game/combat/player-actions.js`
- `tests/unit/chip-levels.test.js`
- `tests/unit/chip-skills.test.js`
- `tests/unit/pipeline-chips.test.js`

**Step 1: Merge chip-balance into integration**

```bash
cd /Users/michia/Documents/jrpg-wt-integration
/usr/bin/git merge feature/chip-balance-tuning --no-edit
```

Expected: `Fast-forward` or clean merge (2 commits, no conflicts since both branch from same master commit)

**Step 2: Verify merge succeeded**

```bash
cd /Users/michia/Documents/jrpg-wt-integration
/usr/bin/git log --oneline -3
```

Expected: Shows chip-balance commits on top of `049bf62`

**Step 3: Run unit tests to verify chip changes work**

```bash
cd /Users/michia/Documents/jrpg-wt-integration
npm run test:unit
```

Expected: All 49 unit tests pass (chip-balance updated the test expectations)

---

### Task 3: Commit Image Assets

**Context:** The main repo (`/Users/michia/Documents/jrpg`) has 287 unstaged image changes + 11 new scripts. These need to be committed to the integration branch. Since the integration worktree is a separate directory, we copy the changed files over.

**Categories:**
- Floor backgrounds (35 modified): `public/assets/backgrounds/floor*.png`
- Special backgrounds (11 modified): `hub.png`, `dungeon.png`, `locations/*.png`
- Enemy sprites (~50 modified, ~12 deleted): `public/assets/sprites/enemies/*.png`
- Chip icons (~150 deleted, ~15 new, 5 modified): `public/assets/icons/chips/*.png`
- Generation scripts (11 new): `scripts/*.py`
- Deleted file: `generate_location_backgrounds.py` (moved to scripts/)

**Step 1: Copy modified/new backgrounds from main repo**

```bash
cp /Users/michia/Documents/jrpg/public/assets/backgrounds/*.png /Users/michia/Documents/jrpg-wt-integration/public/assets/backgrounds/
mkdir -p /Users/michia/Documents/jrpg-wt-integration/public/assets/backgrounds/locations/
cp /Users/michia/Documents/jrpg/public/assets/backgrounds/locations/*.png /Users/michia/Documents/jrpg-wt-integration/public/assets/backgrounds/locations/
```

**Step 2: Copy modified enemy sprites and remove deleted ones**

```bash
# Copy all current sprites from main repo (includes modified ones)
cp /Users/michia/Documents/jrpg/public/assets/sprites/enemies/*.png /Users/michia/Documents/jrpg-wt-integration/public/assets/sprites/enemies/

# Remove sprites that were deleted in main repo
cd /Users/michia/Documents/jrpg
for f in $(/usr/bin/git status --short -- public/assets/sprites/enemies/ | grep '^ D' | awk '{print $2}'); do
  rm -f "/Users/michia/Documents/jrpg-wt-integration/$f"
done
```

**Step 3: Handle chip icons (many deletions, some additions)**

```bash
# Remove all existing chip icons in integration (we'll replace with current state)
rm -f /Users/michia/Documents/jrpg-wt-integration/public/assets/icons/chips/*.png

# Copy current chip icons from main repo
cp /Users/michia/Documents/jrpg/public/assets/icons/chips/*.png /Users/michia/Documents/jrpg-wt-integration/public/assets/icons/chips/
```

**Step 4: Copy generation scripts**

```bash
mkdir -p /Users/michia/Documents/jrpg-wt-integration/scripts/
cp /Users/michia/Documents/jrpg/scripts/*.py /Users/michia/Documents/jrpg-wt-integration/scripts/
```

**Step 5: Remove the old generate_location_backgrounds.py from root**

```bash
rm -f /Users/michia/Documents/jrpg-wt-integration/generate_location_backgrounds.py
```

**Step 6: Stage and commit all image/script changes**

```bash
cd /Users/michia/Documents/jrpg-wt-integration
/usr/bin/git add public/assets/ scripts/ generate_location_backgrounds.py
/usr/bin/git status --short | wc -l
```

Expected: ~300 changes staged (additions, modifications, deletions)

```bash
cd /Users/michia/Documents/jrpg-wt-integration
/usr/bin/git commit -m "$(cat <<'EOF'
art: replace all game assets with anime-style regenerated art

- Floor backgrounds: street-level perspective (35 files)
- Special backgrounds: hub, dungeon, locations (11 files)
- Enemy sprites: modern NPCs replace fantasy monsters (~50 modified, ~12 removed)
- Chip icons: simplified to 20 core icons (~150 removed, 15 added)
- Generation scripts: added to scripts/ directory
- Removed root generate_location_backgrounds.py (moved to scripts/)
EOF
)"
```

**Step 7: Verify chip icons referenced by chip-balance still exist**

```bash
cd /Users/michia/Documents/jrpg-wt-integration
node -e "
const chips = JSON.parse(require('fs').readFileSync('data/chips.json','utf8'));
const fs = require('fs');
const missing = [];
for (const chip of chips) {
  const iconPath = 'public/assets/icons/chips/' + chip.id + '.png';
  if (!fs.existsSync(iconPath)) missing.push(iconPath);
}
if (missing.length) { console.log('MISSING ICONS:', missing); process.exit(1); }
else console.log('All chip icons present (' + chips.length + ' checked)');
"
```

Expected: Either all icons present, or a list of missing icons to address.

---

### Task 4: Merge mobile-first-ui

**Context:** 23 commits on `feature/mobile-first-ui`. Complete frontend rewrite. No file overlap with chip-balance (verified — mobile-ui doesn't touch `data/chips.json`, `src/game/items/chips.js`, or `player-actions.js`).

**Files added/modified by this merge:**
- `public/game.js`, `public/game.css`, `public/game.html` (rewritten)
- `public/js/` — new module system (api.js, settings.js, background.js, dom.js, narration.js, word-practice.js)
- `public/js/ui/` — UI modules (actions.js, character.js, chip-row.js, combat-loop.js, combat.js, economy.js, exploration.js, hp-bar.js, index.js, modals.js, scene.js, takeover.js)
- `src/game/loop.js`, `src/routes/game/misc.js`, `src/routes/game/run.js`
- `tests/e2e/` — 39 new e2e tests + fixtures + config

**Step 1: Merge mobile-first-ui into integration**

```bash
cd /Users/michia/Documents/jrpg-wt-integration
/usr/bin/git merge feature/mobile-first-ui --no-edit
```

Expected: Clean merge. The only potential conflict is `public/game.js` / `public/game.css` if the image asset commit somehow touched them (it shouldn't).

**Step 2: If conflicts occur, resolve them**

The most likely conflict is in files that both master and mobile-ui modified. Since mobile-ui rewrites the frontend entirely, in any frontend file conflict take mobile-ui's version:

```bash
# Only if conflicts exist:
/usr/bin/git checkout --theirs public/game.js public/game.css public/game.html
/usr/bin/git add public/game.js public/game.css public/game.html
/usr/bin/git commit --no-edit
```

**Step 3: Verify merge result**

```bash
cd /Users/michia/Documents/jrpg-wt-integration
/usr/bin/git log --oneline -5
ls public/js/ui/ | wc -l
```

Expected: 12 files in `public/js/ui/`

**Step 4: Syntax check key frontend files**

```bash
cd /Users/michia/Documents/jrpg-wt-integration
node --check public/game.js && echo "game.js OK"
node --check public/js/ui/combat-loop.js && echo "combat-loop OK"
node --check public/js/ui/actions.js && echo "actions OK"
```

Expected: All pass (no syntax errors)

---

### Task 5: Merge mobile-ui-audio

**Context:** 15 commits on `feature/mobile-ui-audio`, branched from `feature/mobile-first-ui`. Since mobile-ui is already merged, this should apply cleanly — it patches the same files that mobile-ui introduced.

**Files added/modified by this merge (relative to mobile-ui):**
- New: `public/js/audio.js`
- New: `public/assets/audio/sfx/*.mp3` (13 files), `public/assets/audio/bgm/main.mp3`
- New: `public/assets/audio/LICENSES.md`
- Modified: `public/game.js` (adds `import * as audio`, BGM start/stop calls)
- Modified: `public/game.css` (adds `.settings-range` styles)
- Modified: `public/js/api.js`, `public/js/settings.js`
- Modified: `public/js/ui/actions.js`, `chip-row.js`, `combat-loop.js`, `economy.js`, `modals.js`, `takeover.js`
- Modified: `src/routes/game/misc.js`
- Modified: `tests/e2e/` (updated test helpers and specs)

**Step 1: Merge audio branch into integration**

```bash
cd /Users/michia/Documents/jrpg-wt-integration
/usr/bin/git merge feature/mobile-ui-audio --no-edit
```

Expected: Clean merge. The audio branch patches the exact version of files that mobile-ui created, which we just merged.

**Step 2: If conflicts occur, diagnose**

Since audio was branched FROM mobile-ui, conflicts here would mean mobile-ui's merge in Task 4 had issues. Check:

```bash
# Only if conflicts:
/usr/bin/git diff --name-only --diff-filter=U
```

For any conflicted file in `public/js/ui/`, take the audio branch version (it's the most recent):
```bash
/usr/bin/git checkout --theirs <conflicted-files>
/usr/bin/git add <conflicted-files>
/usr/bin/git commit --no-edit
```

**Step 3: Verify audio files exist**

```bash
cd /Users/michia/Documents/jrpg-wt-integration
ls public/assets/audio/sfx/ | wc -l
ls public/js/audio.js
```

Expected: 13 SFX files, `audio.js` exists

**Step 4: Syntax check audio integration points**

```bash
cd /Users/michia/Documents/jrpg-wt-integration
node --check public/js/audio.js && echo "audio.js OK"
node --check public/game.js && echo "game.js OK"
node --check public/js/ui/combat-loop.js && echo "combat-loop OK"
```

Expected: All pass

---

### Task 6: Run Unit Tests

**Step 1: Run the full unit test suite**

```bash
cd /Users/michia/Documents/jrpg-wt-integration
npm run test:unit
```

Expected: 49/49 pass. The chip-balance branch already updated test expectations, and mobile-ui/audio don't modify backend logic tested by unit tests.

**Step 2: If tests fail, diagnose**

Likely causes:
- Chip icon references in tests pointing to deleted icons → update test fixtures
- Import path issues if any backend file was modified by multiple branches

Fix any failures before proceeding.

---

### Task 7: Start Server and Smoke Test

**Step 1: Start the server**

```bash
cd /Users/michia/Documents/jrpg-wt-integration
pkill -f "node server.js" 2>/dev/null; sleep 1
node server.js &
sleep 3
echo "Server PID: $!"
```

Expected: Server starts on port 3000

**Step 2: Verify page loads**

```bash
curl -s http://localhost:3000 | head -5
```

Expected: HTML response (the game page)

**Step 3: Verify key assets load**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/assets/backgrounds/floor1.png
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/assets/audio/sfx/attack.mp3
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/js/audio.js
```

Expected: All return `200`

**Step 4: Kill the server**

```bash
pkill -f "node server.js" 2>/dev/null
```

---

### Task 8: Run E2E Tests

**Context:** The mobile-ui branch includes 39 Playwright e2e tests and a `playwright.config.ts`. The audio branch updated these tests. The test infrastructure requires `--workers=1` and stopping on first failure.

**Step 1: Install Playwright if needed**

```bash
cd /Users/michia/Documents/jrpg-wt-integration
npx playwright install chromium 2>/dev/null || true
```

**Step 2: Run e2e tests using the wrapper script**

```bash
cd /Users/michia/Documents/jrpg-wt-integration
./scripts/e2e-test.sh
```

If the wrapper script doesn't exist in the integration branch, run manually:

```bash
cd /Users/michia/Documents/jrpg-wt-integration
pkill -f "node server.js" 2>/dev/null; sleep 1
npm start &
sleep 3
cd tests/e2e && npx playwright test --workers=1 -x
pkill -f "node server.js" 2>/dev/null
```

Expected: 39/39 pass (the mobile-ui + audio test suite)

**Step 3: If tests fail, categorize failures**

- **Asset 404s** → missing image/audio files, check Task 3 and Task 5
- **Selector failures** → UI structure mismatch, check mobile-ui merge
- **API failures** → backend route issues, check chip-balance merge
- **Audio-related** → audio integration, check Task 5

Fix and re-run until passing.

---

### Task 9: Commit Integration State

**Step 1: Check for any uncommitted changes**

```bash
cd /Users/michia/Documents/jrpg-wt-integration
/usr/bin/git status --short
```

Expected: Clean working tree (all merges are committed)

**Step 2: Tag the successful integration point**

```bash
cd /Users/michia/Documents/jrpg-wt-integration
/usr/bin/git log --oneline -10
```

This shows the full merge history. The branch is now ready for manual testing.

---

## Rollback Plan

If any merge creates unrecoverable conflicts:

```bash
cd /Users/michia/Documents/jrpg-wt-integration
/usr/bin/git reset --hard master  # Start over from master
```

If a specific merge needs to be undone (after commit):

```bash
/usr/bin/git revert -m 1 <merge-commit-hash>
```

---

## Post-Integration Notes

- The integration branch should NOT be pushed to origin until manually verified
- User-auth merge is Phase 2 (see design doc)
- The old 87-test e2e suite from master does NOT apply — mobile-ui rewrote the frontend
- Chip-balance's unit tests ARE the authoritative test expectations for chip behavior
