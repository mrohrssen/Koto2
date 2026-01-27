# Repository Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove ~129MB of test assets and clutter, organize remaining files, consolidate archived docs.

**Architecture:** Delete unneeded directories and files, move useful files to proper locations, consolidate 40+ archived design docs into a single history document.

**Tech Stack:** Bash (rm, mv), Git

---

## Task 1: Delete Large Test Asset Directories

**Files:**
- Delete: `test-sprites-OLD DELETE/` (17MB)
- Delete: `test-sprites/` (105MB)
- Delete: `test-results/` (1.7MB)
- Delete: `tmp/` (4.6MB)

**Step 1: Verify directories exist**

Run:
```bash
ls -d "test-sprites-OLD DELETE" test-sprites test-results tmp
```
Expected: All four directories listed

**Step 2: Delete the directories**

Run:
```bash
rm -rf "test-sprites-OLD DELETE" test-sprites test-results tmp
```
Expected: No output (success)

**Step 3: Verify deletion**

Run:
```bash
ls -d "test-sprites-OLD DELETE" test-sprites test-results tmp 2>&1
```
Expected: "No such file or directory" for each

**Step 4: Commit**

Run:
```bash
git add -A && git commit -m "chore: delete test asset directories (~128MB)"
```

---

## Task 2: Delete Root-Level Python Scripts (Keep v6)

**Files:**
- Delete: `fix_chip_icons.py`
- Delete: `fix_chip_icons_v3.py`
- Delete: `fix_chip_icons_v4.py`
- Delete: `fix_chip_icons_v5.py`
- Keep: `fix_chip_icons_v6.py` (moved in Task 4)

**Step 1: Delete superseded Python scripts**

Run:
```bash
rm fix_chip_icons.py fix_chip_icons_v3.py fix_chip_icons_v4.py fix_chip_icons_v5.py
```
Expected: No output (success)

**Step 2: Verify only v6 remains**

Run:
```bash
ls fix_chip_icons*.py
```
Expected: Only `fix_chip_icons_v6.py`

**Step 3: Commit**

Run:
```bash
git add -A && git commit -m "chore: remove superseded Python scripts"
```

---

## Task 3: Delete Root-Level Clutter Files

**Files:**
- Delete: `chip-review.csv`
- Delete: `vocab-reference.csv`
- Delete: `simulate.js`
- Delete: `test-phases-7-12.js`
- Delete: `test-gameplay.js`
- Delete: `generate_assets.log`
- Delete: `.jrpg-save.json`
- Delete: `.jrpg-save-test-user.json`
- Delete: `.jrpg-save-u_430e6fe2f37e1b4d.json`
- Delete: `.jrpg-users.json`
- Delete: `.jrpg-settings.json`
- Delete: `.jrpg-vocab-cache.json`
- Delete: `.jchat-game-stats.json`
- Delete: `.jchat-vocab-suggestions.json`

**Step 1: Delete CSV and JS files**

Run:
```bash
rm chip-review.csv vocab-reference.csv simulate.js test-phases-7-12.js test-gameplay.js generate_assets.log
```
Expected: No output (success)

**Step 2: Delete save/cache files**

Run:
```bash
rm .jrpg-save.json .jrpg-save-test-user.json ".jrpg-save-u_430e6fe2f37e1b4d.json" .jrpg-users.json .jrpg-settings.json .jrpg-vocab-cache.json .jchat-game-stats.json .jchat-vocab-suggestions.json
```
Expected: No output (success)

**Step 3: Verify root is clean**

Run:
```bash
ls *.csv *.log .jrpg-* .jchat-* 2>&1
```
Expected: "No such file or directory" errors

**Step 4: Commit**

Run:
```bash
git add -A && git commit -m "chore: remove root-level clutter files"
```

---

## Task 4: Move Useful Files to Proper Locations

**Files:**
- Move: `fix_chip_icons_v6.py` → `scripts/fix_chip_icons.py`
- Move: `Neo Tokyo Item Description.pdf` → `docs/`
- Move: `NEO TOKYO_ System Liberation (1).pdf` → `docs/`

**Step 1: Move Python script to scripts/**

Run:
```bash
mv fix_chip_icons_v6.py scripts/fix_chip_icons.py
```
Expected: No output (success)

**Step 2: Move PDFs to docs/**

Run:
```bash
mv "Neo Tokyo Item Description.pdf" docs/
mv "NEO TOKYO_ System Liberation (1).pdf" docs/
```
Expected: No output (success)

**Step 3: Verify moves**

Run:
```bash
ls scripts/fix_chip_icons.py docs/*.pdf
```
Expected: All three files listed in new locations

**Step 4: Commit**

Run:
```bash
git add -A && git commit -m "chore: organize files into proper directories"
```

---

## Task 5: Consolidate Archived Plans into Design History

**Files:**
- Read: All 40 files in `docs/plans/archive/`
- Create: `docs/DESIGN-HISTORY.md`
- Delete: `docs/plans/archive/` (after consolidation)

**Step 1: Read all archived plans**

Read each file in `docs/plans/archive/` and extract:
- Feature name and date
- Key decisions made
- Notable trade-offs or rationale

**Step 2: Create DESIGN-HISTORY.md**

Create `docs/DESIGN-HISTORY.md` with this structure:

```markdown
# Design History

Summary of design decisions for NEO TOKYO: System Liberation.

## January 2026

### Chip System Evolution (Jan 23)
- Rethemed chips with cyberpunk aesthetic
- Added chip levels and skills system
- Balanced chip stats for progression

### Graphics Overhaul (Jan 23)
- Mobile-first UI redesign
- New sprite generation pipeline
- Background and enemy art refresh

### Audio System (Jan 24)
- Web Audio API integration
- Background music and SFX
- Volume controls in settings

### User Authentication (Jan 24)
- Login/register flow
- Session persistence
- API key management

### Shrine Room (Jan 24)
- Rest mechanic between combat
- Healing and buff options

### Quiz Master Room (Jan 24)
- Vocabulary quiz encounters
- Question generation system

### Leaderboard (Jan 25)
- Score tracking
- Global rankings

### iOS PWA (Jan 25)
- Progressive web app support
- iOS-specific optimizations

### Chip UI Improvements (Jan 25)
- Drag-to-reorder chips
- Chip swap mechanic
- Lookup mode for vocabulary

---

*Consolidated from 40 archived design documents on 2026-01-27*
```

**Step 3: Delete archive directory**

Run:
```bash
rm -rf docs/plans/archive
```
Expected: No output (success)

**Step 4: Commit**

Run:
```bash
git add -A && git commit -m "docs: consolidate archived plans into DESIGN-HISTORY.md"
```

---

## Task 6: Review and Clean Up Bug Reports

**Files:**
- Review: 15 files in `docs/bugs/`
- Delete resolved bugs, keep open ones

**Step 1: Review each bug file**

Check each bug against current codebase to determine if resolved:

| Bug File | Check | Action |
|----------|-------|--------|
| `audio-not-working.md` | Does audio work? Test in browser | Delete if fixed |
| `backgrounds-enemies-not-rendering.md` | Do backgrounds/enemies render? | Delete if fixed |
| `chip-circles-too-small.md` | Check chip circle size | Delete if fixed |
| `chip-description-overflow.md` | Check chip descriptions | Delete if fixed |
| `chip-icons-not-displayed.md` | Do chip icons show? | Delete if fixed |
| `chip-modal-show-base-and-skill.md` | Check chip modal content | Delete if fixed |
| `chip-modal-spacing-tight.md` | Check modal spacing | Delete if fixed |
| `chip-purchase-no-immediate-refresh.md` | Test chip purchase | Delete if fixed |
| `chip-row-persists-after-death.md` | Test death flow | Delete if fixed |
| `chip-skill-chipid-required.md` | Check chip skill system | Delete if fixed |
| `combat-math-display-missing.md` | Check combat math UI | Delete if fixed |
| `enemy-narration-no-tts.md` | Test enemy narration | Delete if fixed |
| `flashcard-original-word-disappears.md` | Test flashcards | Delete if fixed |
| `settings-icon-not-gear.md` | Check settings icon | Delete if fixed |
| `swipe-animation-sticking.md` | Test swipe animation | Delete if fixed |

**Step 2: Delete resolved bugs**

For each resolved bug:
```bash
rm docs/bugs/<filename>.md
```

**Step 3: Report remaining bugs**

List any bugs that remain open for user awareness.

**Step 4: Commit**

Run:
```bash
git add -A && git commit -m "chore: remove resolved bug reports"
```

---

## Task 7: Final Verification

**Step 1: Check repo size reduction**

Run:
```bash
du -sh .
```
Expected: Significantly smaller than before (~129MB reduction)

**Step 2: Verify clean root directory**

Run:
```bash
ls -la
```
Expected: Only essential files (server.js, package.json, README.md, CLAUDE.md, and directories)

**Step 3: Verify docs organization**

Run:
```bash
ls docs/
```
Expected: ARCHITECTURE.md, DESIGN-HISTORY.md, bugs/, plans/, and PDFs

**Step 4: Run tests to ensure nothing broke**

Run:
```bash
./scripts/e2e-test.sh
```
Expected: Tests pass (80+/87 acceptable)

---

## Summary

| Task | Description | Commit Message |
|------|-------------|----------------|
| 1 | Delete test asset directories | `chore: delete test asset directories (~128MB)` |
| 2 | Delete superseded Python scripts | `chore: remove superseded Python scripts` |
| 3 | Delete root-level clutter | `chore: remove root-level clutter files` |
| 4 | Move files to proper locations | `chore: organize files into proper directories` |
| 5 | Consolidate archived plans | `docs: consolidate archived plans into DESIGN-HISTORY.md` |
| 6 | Clean up resolved bugs | `chore: remove resolved bug reports` |
| 7 | Verify cleanup | (no commit) |
