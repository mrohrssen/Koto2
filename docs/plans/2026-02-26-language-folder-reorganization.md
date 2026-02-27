# Language Folder Reorganization Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate all language/vocabulary reference data, curation scripts, and design docs into a top-level `language/` directory without breaking any runtime code.

**Architecture:** Move static reference files (dictionaries, categories, CSV), one-shot scripts, and historical plan docs into `language/`. Update path references in moved scripts. Leave runtime dependencies (`data/jpdb-wordlist.json`, `src/` code, per-user caches) untouched. Update `.gitignore` to track the new directory.

**Tech Stack:** Shell (mv/mkdir), Node.js path updates in scripts, `.gitignore` edits

---

## Risk Assessment

**Runtime code that MUST NOT break:**
- `server.js:170` loads `data/jpdb-wordlist.json` — **DO NOT MOVE** this file
- `src/` modules (`jpdb.js`, `vocab-manager.js`, `narration-engine/`) — **NOT TOUCHED** by this plan
- `data/vocab-cache-*.json`, `data/npc-*.json`, `data/door-hints.json`, `data/character-cards/` — **stay in data/**

**Files being moved have NO runtime references:**
- `data/wanikani-vocab.json` — only referenced by `scripts/fetch-wanikani-vocab.mjs` (also moving)
- `data/bunpro-verbs-500.json` — only referenced by `scripts/enrich-bunpro-verbs.mjs` (also moving)
- `data/jpdb-wordlist.csv` — only referenced by scripts and docs (not runtime)
- `data/vocab-categories/` — only referenced by `scripts/_clean-*.mjs` (also moving)
- `scripts/jpdb-match-prefilter.py` — generated deleted files, can delete

---

### Task 1: Create directory structure

**Files:**
- Create: `language/dictionaries/`
- Create: `language/categories/`
- Create: `language/scripts/`
- Create: `language/docs/historical-plans/`
- Create: `language/docs/future-plans/`

**Step 1: Create all directories**

```bash
mkdir -p language/dictionaries language/categories language/scripts \
  language/docs/historical-plans language/docs/future-plans
```

**Step 2: Verify structure**

```bash
find language -type d | sort
```

Expected:
```
language
language/categories
language/dictionaries
language/docs
language/docs/future-plans
language/docs/historical-plans
language/scripts
```

**Step 3: Commit**

```bash
git add language/.gitkeep 2>/dev/null || true
git commit --allow-empty -m "chore: create language/ directory structure"
```

---

### Task 2: Move dictionary reference files

**Files:**
- Move: `data/wanikani-vocab.json` → `language/dictionaries/wanikani-vocab.json`
- Move: `data/jpdb-wordlist.csv` → `language/dictionaries/jpdb-wordlist.csv`
- Move: `data/bunpro-verbs-500.json` → `language/dictionaries/bunpro-verbs-500.json`

**DO NOT MOVE:** `data/jpdb-wordlist.json` (loaded by `server.js:170` at runtime)

**Step 1: Move files**

```bash
mv data/wanikani-vocab.json language/dictionaries/
mv data/jpdb-wordlist.csv language/dictionaries/
mv data/bunpro-verbs-500.json language/dictionaries/
```

**Step 2: Verify files exist at new paths**

```bash
ls -la language/dictionaries/
```

Expected: 3 files (wanikani-vocab.json ~13MB, jpdb-wordlist.csv ~2.9MB, bunpro-verbs-500.json ~76KB)

**Step 3: Verify old paths are gone**

```bash
test ! -f data/wanikani-vocab.json && echo "OK" || echo "FAIL"
test ! -f data/jpdb-wordlist.csv && echo "OK" || echo "FAIL"
test ! -f data/bunpro-verbs-500.json && echo "OK" || echo "FAIL"
```

**Step 4: Commit**

```bash
git add language/dictionaries/ data/
git commit -m "chore: move dictionary reference files to language/dictionaries/"
```

---

### Task 3: Move vocab categories

**Files:**
- Move: `data/vocab-categories/` (17 JSON files) → `language/categories/`

**Step 1: Move all category files**

```bash
mv data/vocab-categories/* language/categories/
rmdir data/vocab-categories
```

**Step 2: Verify all 17 files moved**

```bash
ls language/categories/ | wc -l
```

Expected: 17

**Step 3: Update .gitignore**

Replace the old `!data/vocab-categories/` exception with `!language/` tracking.

In `.gitignore`, remove this line:
```
!data/vocab-categories/
```

Add at the end:
```
# Language reference data
language/
```

Note: `language/` doesn't need an exclusion pattern since it's not under `data/`. Just ensure it's not matched by any existing ignore rule. The `language/` line is only needed if there's a global ignore. Since there isn't, this line is optional but makes intent clear.

**Step 4: Verify git sees the new files**

```bash
git status language/categories/
```

Expected: new files listed as untracked or staged

**Step 5: Commit**

```bash
git add language/categories/ .gitignore data/
git commit -m "chore: move vocab categories to language/categories/"
```

---

### Task 4: Move language scripts and update paths

**Files to move:**
- `scripts/fetch-wanikani-vocab.mjs` → `language/scripts/`
- `scripts/enrich-jpdb-freq.mjs` → `language/scripts/`
- `scripts/enrich-bunpro-verbs.mjs` → `language/scripts/`
- `scripts/assemble-vocab-csv.mjs` → `language/scripts/`
- `scripts/generate-wordlist.mjs` → `language/scripts/`
- `scripts/merge-vocab-categories.mjs` → `language/scripts/`
- `scripts/apply-categories.mjs` → `language/scripts/`
- `scripts/apply-outbox-merges.mjs` → `language/scripts/`
- `scripts/_check-vocab.mjs` → `language/scripts/`
- `scripts/_clean-animals.mjs` → `language/scripts/`
- `scripts/_clean-body-parts.mjs` → `language/scripts/`
- `scripts/_clean-clothing.mjs` → `language/scripts/`
- `scripts/_clean-emotions.mjs` → `language/scripts/`
- `scripts/_clean-locations.mjs` → `language/scripts/`
- `scripts/_clean-movement.mjs` → `language/scripts/`
- `scripts/_clean-social.mjs` → `language/scripts/`
- `scripts/_cleanup-objects.mjs` → `language/scripts/`
- `scripts/_fix-actions-categories.mjs` → `language/scripts/`

**Files to delete:**
- `scripts/jpdb-match-prefilter.py` (generated now-deleted match files)

**Step 1: Move all language scripts**

```bash
mv scripts/fetch-wanikani-vocab.mjs language/scripts/
mv scripts/enrich-jpdb-freq.mjs language/scripts/
mv scripts/enrich-bunpro-verbs.mjs language/scripts/
mv scripts/assemble-vocab-csv.mjs language/scripts/
mv scripts/generate-wordlist.mjs language/scripts/
mv scripts/merge-vocab-categories.mjs language/scripts/
mv scripts/apply-categories.mjs language/scripts/
mv scripts/apply-outbox-merges.mjs language/scripts/
mv scripts/_check-vocab.mjs language/scripts/
mv scripts/_clean-animals.mjs language/scripts/
mv scripts/_clean-body-parts.mjs language/scripts/
mv scripts/_clean-clothing.mjs language/scripts/
mv scripts/_clean-emotions.mjs language/scripts/
mv scripts/_clean-locations.mjs language/scripts/
mv scripts/_clean-movement.mjs language/scripts/
mv scripts/_clean-social.mjs language/scripts/
mv scripts/_cleanup-objects.mjs language/scripts/
mv scripts/_fix-actions-categories.mjs language/scripts/
```

**Step 2: Delete dead script**

```bash
rm scripts/jpdb-match-prefilter.py
```

**Step 3: Update path references in moved scripts**

Scripts that reference `data/` paths relative to `__dirname + '/..` now need `__dirname + '/../..'` since they moved one level deeper.

In `language/scripts/fetch-wanikani-vocab.mjs`, change:
```js
const OUTPUT = path.join(__dirname, '..', 'data', 'wanikani-vocab.json');
```
to:
```js
const OUTPUT = path.join(__dirname, '..', 'dictionaries', 'wanikani-vocab.json');
```

In `language/scripts/enrich-bunpro-verbs.mjs`, change:
```js
const JSON_PATH = join(__dirname, '..', 'data', 'bunpro-verbs-500.json');
```
to:
```js
const JSON_PATH = join(__dirname, '..', 'dictionaries', 'bunpro-verbs-500.json');
```

For all `_clean-*.mjs` scripts that reference `data/vocab-categories/`: update to `language/categories/`. Since these are now inside `language/scripts/`, relative paths like `join(__dirname, '..', 'categories', ...)` should work.

**Important:** For any scripts that reference `data/jpdb-wordlist.json` or `data/jpdb-wordlist.csv`, update CSV references to `language/dictionaries/jpdb-wordlist.csv` but keep JSON references pointing to `data/jpdb-wordlist.json` (runtime file that didn't move).

**Step 4: Syntax check all moved scripts**

```bash
for f in language/scripts/*.mjs; do node --check "$f" && echo "OK: $f" || echo "FAIL: $f"; done
```

Expected: all OK

**Step 5: Commit**

```bash
git add language/scripts/ scripts/
git commit -m "chore: move language scripts to language/scripts/, update paths"
```

---

### Task 5: Move documentation

**Files to move to `language/docs/historical-plans/`:**
- `docs/jpdb-rate-limiting-investigation.md`
- `docs/plans/2026-01-27-jpdb-rate-limiting-redesign.md`
- `docs/plans/2026-01-28-word-discovery-room-design.md`
- `docs/plans/2026-01-28-word-discovery-room-impl.md`
- `docs/plans/2026-01-28-word-discovery-room-status.md`
- `docs/plans/2026-01-29-word-discovery-bug-investigation.md`
- `docs/plans/2026-01-29-daily-word-limit-design.md`
- `docs/plans/2026-01-29-daily-word-limit-impl.md`
- `docs/plans/2026-02-04-bunpro-integration-design.md`
- `docs/plans/2026-02-04-bunpro-integration-impl.md`
- `docs/plans/2026-02-04-dual-card-combat-design.md`
- `docs/plans/2026-02-04-dual-card-combat-impl.md`
- `docs/plans/2026-02-05-per-user-vocab-cache.md`
- `docs/plans/2026-02-05-per-user-vocab-cache-impl.md`
- `docs/plans/2026-02-05-speed-review-design.md`
- `docs/plans/2026-02-05-speed-review-impl.md`
- `docs/plans/2026-02-05-speed-review-undo-design.md`
- `docs/plans/2026-02-05-speed-review-undo-impl.md`
- `docs/plans/2026-02-05-speed-review-refresh-fix-design.md`
- `docs/plans/2026-02-05-speed-review-refresh-fix-impl.md`
- `docs/plans/2026-02-06-chippy-door-sense.md`
- `docs/plans/2026-02-06-chippy-door-labels-design.md`
- `docs/plans/2026-02-06-word-classification-design.md`
- `docs/plans/2026-02-07-narration-rewrite-v2-plan.md`
- `docs/plans/2026-02-07-vid-based-vocab-matching-design.md`
- `docs/plans/2026-02-11-vocab-curation-design.md`
- `docs/plans/2026-02-11-vocab-curation-plan.md`
- `docs/plans/2026-02-11-vocab-curation-v2-design.md`
- `docs/plans/2026-02-11-vocab-curation-v2-plan.md`
- `docs/plans/2026-02-12-living-world-narration-design.md`
- `docs/plans/2026-02-13-jpdb-vocab-matching.md`
- `docs/plans/2026-02-13-npc-dialogue-bakeoff.md`
- `docs/plans/2026-02-13-npc-dialogue-engine-design.md`
- `docs/plans/2026-02-13-npc-dialogue-engine.md`
- `docs/plans/2026-02-13-npc-trainer-implementation.md`
- `docs/plans/2026-02-13-npc-trainer-system-mvp.md`
- `docs/plans/2026-02-14-claude-prompt-caching-design.md`
- `docs/plans/2026-02-14-claude-prompt-caching.md`
- `docs/plans/2026-02-14-csv-categorization-design.md`
- `docs/plans/2026-02-14-csv-categorization.md`
- `docs/plans/2026-02-14-japanese-vocab-csv-translation-design.md`
- `docs/plans/2026-02-18-vocab-categorization-design.md`
- `docs/plans/2026-02-18-vocab-categorization.md`
- `docs/plans/2026-02-20-befriend-dialogue-audit.md`
- `docs/plans/2026-02-20-creature-dialogue-engine-design.md`
- `docs/plans/2026-02-20-creature-dialogue-engine-impl.md`
- `docs/plans/2026-02-22-combat-vocab-reinforcement-design.md`
- `docs/plans/2026-02-22-combat-vocab-reinforcement.md`
- `docs/plans/2026-02-22-vocab-attack-card-redesign.md`
- `docs/plans/2026-02-22-vocab-attack-card-impl.md`

**Files to move to `language/docs/future-plans/`:**
- `docs/plans/Initial Language Learning.md`

**Step 1: Move historical plans**

```bash
mv docs/jpdb-rate-limiting-investigation.md language/docs/historical-plans/
mv docs/plans/2026-01-27-jpdb-rate-limiting-redesign.md language/docs/historical-plans/
mv docs/plans/2026-01-28-word-discovery-room-design.md language/docs/historical-plans/
mv docs/plans/2026-01-28-word-discovery-room-impl.md language/docs/historical-plans/
mv docs/plans/2026-01-28-word-discovery-room-status.md language/docs/historical-plans/
mv docs/plans/2026-01-29-word-discovery-bug-investigation.md language/docs/historical-plans/
mv docs/plans/2026-01-29-daily-word-limit-design.md language/docs/historical-plans/
mv docs/plans/2026-01-29-daily-word-limit-impl.md language/docs/historical-plans/
mv docs/plans/2026-02-04-bunpro-integration-design.md language/docs/historical-plans/
mv docs/plans/2026-02-04-bunpro-integration-impl.md language/docs/historical-plans/
mv docs/plans/2026-02-04-dual-card-combat-design.md language/docs/historical-plans/
mv docs/plans/2026-02-04-dual-card-combat-impl.md language/docs/historical-plans/
mv docs/plans/2026-02-05-per-user-vocab-cache.md language/docs/historical-plans/
mv docs/plans/2026-02-05-per-user-vocab-cache-impl.md language/docs/historical-plans/
mv docs/plans/2026-02-05-speed-review-design.md language/docs/historical-plans/
mv docs/plans/2026-02-05-speed-review-impl.md language/docs/historical-plans/
mv docs/plans/2026-02-05-speed-review-undo-design.md language/docs/historical-plans/
mv docs/plans/2026-02-05-speed-review-undo-impl.md language/docs/historical-plans/
mv docs/plans/2026-02-05-speed-review-refresh-fix-design.md language/docs/historical-plans/
mv docs/plans/2026-02-05-speed-review-refresh-fix-impl.md language/docs/historical-plans/
mv docs/plans/2026-02-06-chippy-door-sense.md language/docs/historical-plans/
mv docs/plans/2026-02-06-chippy-door-labels-design.md language/docs/historical-plans/
mv docs/plans/2026-02-06-word-classification-design.md language/docs/historical-plans/
mv docs/plans/2026-02-07-narration-rewrite-v2-plan.md language/docs/historical-plans/
mv docs/plans/2026-02-07-vid-based-vocab-matching-design.md language/docs/historical-plans/
mv docs/plans/2026-02-11-vocab-curation-design.md language/docs/historical-plans/
mv docs/plans/2026-02-11-vocab-curation-plan.md language/docs/historical-plans/
mv docs/plans/2026-02-11-vocab-curation-v2-design.md language/docs/historical-plans/
mv docs/plans/2026-02-11-vocab-curation-v2-plan.md language/docs/historical-plans/
mv docs/plans/2026-02-12-living-world-narration-design.md language/docs/historical-plans/
mv docs/plans/2026-02-13-jpdb-vocab-matching.md language/docs/historical-plans/
mv docs/plans/2026-02-13-npc-dialogue-bakeoff.md language/docs/historical-plans/
mv docs/plans/2026-02-13-npc-dialogue-engine-design.md language/docs/historical-plans/
mv docs/plans/2026-02-13-npc-dialogue-engine.md language/docs/historical-plans/
mv docs/plans/2026-02-13-npc-trainer-implementation.md language/docs/historical-plans/
mv docs/plans/2026-02-13-npc-trainer-system-mvp.md language/docs/historical-plans/
mv docs/plans/2026-02-14-claude-prompt-caching-design.md language/docs/historical-plans/
mv docs/plans/2026-02-14-claude-prompt-caching.md language/docs/historical-plans/
mv docs/plans/2026-02-14-csv-categorization-design.md language/docs/historical-plans/
mv docs/plans/2026-02-14-csv-categorization.md language/docs/historical-plans/
mv docs/plans/2026-02-14-japanese-vocab-csv-translation-design.md language/docs/historical-plans/
mv docs/plans/2026-02-18-vocab-categorization-design.md language/docs/historical-plans/
mv docs/plans/2026-02-18-vocab-categorization.md language/docs/historical-plans/
mv docs/plans/2026-02-20-befriend-dialogue-audit.md language/docs/historical-plans/
mv docs/plans/2026-02-20-creature-dialogue-engine-design.md language/docs/historical-plans/
mv docs/plans/2026-02-20-creature-dialogue-engine-impl.md language/docs/historical-plans/
mv docs/plans/2026-02-22-combat-vocab-reinforcement-design.md language/docs/historical-plans/
mv docs/plans/2026-02-22-combat-vocab-reinforcement.md language/docs/historical-plans/
mv docs/plans/2026-02-22-vocab-attack-card-redesign.md language/docs/historical-plans/
mv docs/plans/2026-02-22-vocab-attack-card-impl.md language/docs/historical-plans/
```

**Step 2: Move future plans**

```bash
mv "docs/plans/Initial Language Learning.md" language/docs/future-plans/
```

**Step 3: Verify counts**

```bash
echo "Historical plans:" && ls language/docs/historical-plans/ | wc -l
echo "Future plans:" && ls language/docs/future-plans/ | wc -l
```

Expected: Historical plans: 50, Future plans: 1

**Step 4: Commit**

```bash
git add language/docs/ docs/
git commit -m "chore: move language docs to language/docs/{historical,future}-plans/"
```

---

### Task 6: Verify nothing is broken

**Step 1: Syntax check server.js still loads jpdb-wordlist.json**

```bash
grep "jpdb-wordlist.json" server.js
```

Expected: `data/jpdb-wordlist.json` path still present and unchanged

**Step 2: Verify no runtime code references moved paths**

```bash
grep -r "wanikani-vocab\|bunpro-verbs\|jpdb-wordlist.csv\|vocab-categories" src/ server.js
```

Expected: only `server.js` referencing `jpdb-wordlist.json` (NOT csv, NOT wanikani, NOT bunpro, NOT vocab-categories)

**Step 3: Run unit tests**

```bash
npm run test:unit
```

Expected: same pass/fail count as before (154 tests, pre-existing failures on dual-pool-pipeline and chip stats)

**Step 4: Run integration tests**

```bash
npm run test:integration
```

Expected: same pass/fail count as before (14 tests)

**Step 5: Start server and verify it boots**

```bash
npm start &
sleep 3
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Expected: 200

**Step 6: Final commit if any fixups needed, then verify structure**

```bash
find language -type f | wc -l
find language -type f | head -20
```

Expected: ~70+ files organized in the new structure
