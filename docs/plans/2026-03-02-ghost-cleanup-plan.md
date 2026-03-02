# Ghost Systems Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Execute all REMOVE + RENAME decisions from `docs/ghost-triage-decisions.md`, deleting ~4,500 lines of dead code and renaming chip→creature across the codebase.

**Architecture:** Three-phase layered deletion. Phase 1 deletes entirely-ghost files. Phase 2 surgically removes ghost code from active files and fixes broken imports. Phase 3 renames chip→creature globally. Each phase ends with passing tests and a commit.

**Tech Stack:** Node.js ES modules, Express routes, vanilla JS frontend, CSS

**Design doc:** `docs/plans/2026-03-02-ghost-cleanup-design.md`

---

## Phase 1: Delete Entirely-Ghost Files

### Task 1: Delete ghost data files

**Files:**
- Delete: `data/enemies.json` (2,456 lines)
- Delete: `data/bosses.json` (357 lines)
- Delete: `data/enemy-mappings.json` (20 lines)
- Delete: `data/levels.json` (12 lines)

**Step 1: Delete the files**

```bash
rm data/enemies.json data/bosses.json data/enemy-mappings.json data/levels.json
```

**Step 2: Verify no tests break**

```bash
npm test
```

Expected: PASS (no test files import these data files — verified)

**Step 3: Commit**

```bash
git add -A data/enemies.json data/bosses.json data/enemy-mappings.json data/levels.json
git commit -m "chore: delete ghost data files (enemies, bosses, enemy-mappings, levels)"
```

---

### Task 2: Delete ghost backend source files

**Files:**
- Delete: `src/game/enemies.js` (1,221 lines)
- Delete: `src/game/lorebook.js` (339 lines) — active lorebook is at `src/narration-engine/lorebook.js`
- Delete: `src/game/combat.js` (30 lines)
- Delete: `src/game/combat/index.js` (40 lines)
- Delete: `src/game/combat/player-actions.js` (61 lines)
- Delete: `src/game/combat/enemy.js` (434 lines)
- Delete: `src/game/combat/mechanics.js` (159 lines)
- Delete: `src/game/combat/rewards.js` (45 lines)
- Delete: `src/game/services/combat-service.js` (350 lines)

**Step 1: Verify lorebook.js is safe to delete**

```bash
grep -r "from.*game/lorebook" src/ --include="*.js"
```

Expected: Only `src/game/dm.js` imports from `src/game/lorebook.js`. The narration engine imports from `src/narration-engine/lorebook.js`. If dm.js imports `getFloorLore`, `getEnemyVoice`, or `buildWorldContext`, those are ghost functions used only in ghost prompts being removed in Phase 2.

**Step 2: Delete the files**

```bash
rm src/game/enemies.js src/game/lorebook.js src/game/combat.js
rm -r src/game/combat/
rm src/game/services/combat-service.js
```

**Step 3: Verify no tests break**

```bash
npm test
```

Expected: PASS (no test files import any of these — verified). If tests fail, it's because an active module does a dynamic import at startup — fix in Phase 2 before re-running.

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete ghost backend files (enemies, combat, lorebook, combat-service)"
```

---

### Task 3: Delete ghost frontend files

**Files:**
- Delete: `public/js/ui/hp-bar.js` (42 lines)
- Delete: `public/js/ui/economy.js` (159 lines)

**Step 1: Delete the files**

```bash
rm public/js/ui/hp-bar.js public/js/ui/economy.js
```

**Step 2: Commit (tests may fail until Phase 2 fixes imports)**

```bash
git add -A
git commit -m "chore: delete ghost frontend files (hp-bar, economy UI)"
```

---

## Phase 2: Surgical Cleanup of Active Files

### Task 4: Clean server.js imports and dead functions

**Files:**
- Modify: `server.js`

**Step 1: Read server.js and find exact ghost locations**

Find and remove these sections:
- Line ~112: `import { getLiberationTrackerData } from './src/game/enemies.js';` — dead import, file deleted
- Lines ~327-353: `enrichRewardDrops()` function — only used for boss drops (equipment type), which no longer exist
- Line ~413: `enrichRewardDrops` in route config object passed to `createRoutes` — remove this property

**KEEP:** Door-hint import (line ~129) and wrapper (lines ~642-644) — Chippy is KEEP per triage #9.

**Step 2: Verify server.js parses**

```bash
node --check server.js && echo "OK"
```

**Step 3: Verify the route config that received `enrichRewardDrops` no longer references it**

Grep for `enrichRewardDrops` across the codebase to ensure no remaining references.

**Step 4: Commit**

```bash
git add server.js
git commit -m "chore: remove ghost imports and enrichRewardDrops from server.js"
```

---

### Task 5: Clean src/game/state.js — remove essence/upgrades/ghost stats

**Files:**
- Modify: `src/game/state.js`

**Step 1: Remove META_UPGRADES constant (lines ~99-139)**

Delete the entire `META_UPGRADES` export and the `// ============ UPGRADE DEFINITIONS ============` comment.

**Step 2: Remove calculateEssenceReward function (lines ~199-219)**

Delete the `// ============ ESSENCE REWARD CALCULATION ============` section and `calculateEssenceReward` function.

**Step 3: Remove getMetaUpgradeEffects function (lines ~221-249)**

Delete the `getMetaUpgradeEffects` export.

**Step 4: Clean createMetaProgression (lines ~42-90)**

Remove these fields:
- `essence: 0` (line ~45)
- `totalEssenceEarned: 0` (line ~60)
- `liberationTracker: {}` (line ~65)
- `totalEnemiesDefeated: 0` (line ~55)
- `totalBossesDefeated: 0` (line ~56)

Keep: `totalRuns`, `runsCompleted`, `runsFailed`, `totalDamageDealt`, `totalDamageTaken`, `totalCreditsEarned`, `highestAreasCleared`, `totalPlayTime`, `firstPlayDate`, `lastPlayDate`, `unlocks`, `achievements`, `creatureCollection`, `befriendCount`, `npcBonds`, `levels`.

**Step 5: Remove `class: 'hacker'` from createNewPlayer (line ~255)**

**Step 6: Clean run stats (lines ~319-352)**

In `createNewRun()` stats object, remove:
- `enemiesDefeated: 0` (line ~320)
- `bossesDefeated: 0` (line ~321)
- `trapsDisarmed: 0` (line ~328)

In `runStats` object, remove:
- `critsLanded: 0` (line ~337)
- `dodges: 0` (line ~338)
- Entire `statusesApplied` object (lines ~342-351) — all ghost status effects

**Step 7: Clean ACHIEVEMENTS (lines ~142-197)**

Remove `reward: { essence: N }` from achievement definitions — essence no longer exists. Keep the achievements themselves (name, description, check function).

**Step 8: Remove META_UPGRADES from exports**

Check the file's export list and remove `META_UPGRADES`, `calculateEssenceReward`, `getMetaUpgradeEffects`.

**Step 9: Verify**

```bash
node --check src/game/state.js && echo "OK"
```

**Step 10: Commit**

```bash
git add src/game/state.js
git commit -m "chore: remove essence/upgrades/ghost stats from state.js"
```

---

### Task 6: Clean src/game/loop.js — remove ghost methods and imports

**Files:**
- Modify: `src/game/loop.js`

**Step 1: Remove ghost imports**

- Line ~55: Remove `META_UPGRADES` from state.js import (keep other imports like `createNewPlayer`, `createNewRun`, `createCombatState`, `ACHIEVEMENTS`, `BASE_STARTING_CREDITS`)
- Line ~60: Delete `import { generateEnemy, selectEnemyIntent } from './enemies.js';`
- Line ~61: Delete `import { determineTurnOrder } from './combat.js';`
- Line ~64: Remove `CombatService` from `import { CombatService, ExplorationService } from './services/index.js'` — keep `ExplorationService`

**Step 2: Remove ghost constructor initialization**

- Line ~84: Delete `this.combatService = new CombatService(this);` (keep `this.explorationService`)

**Step 3: Remove ghost methods**

Delete these method blocks entirely:
- `purchaseUpgrade()` (lines ~148-182)
- `awardRunEssence()` (lines ~187-200)
- `updateLifetimeStats()` — remove ghost stat lines (~218-219): `stats.totalEnemiesDefeated += ...` and `stats.totalBossesDefeated += ...`
- `checkAchievements()` — remove essence reward lines (~258-261): `if (achievement.reward?.essence) { this.meta.essence += ...; this.meta.lifetimeStats.totalEssenceEarned += ...; }`
- `applyMetaBonuses()` (lines ~279-298)
- `startEncounter()` (lines ~594-596) — delegates to ghost combatService
- `combatCycle()` (lines ~607-609) — delegates to ghost combatService
- `_handleVictory()` (lines ~613-615) — delegates to ghost combatService
- `_handleDefeat()` (lines ~617-619) — delegates to ghost combatService
- `_handleGameVictory()` (lines ~621-623) — delegates to ghost combatService
- `debugForceCombat()` (lines ~1351-1394) — uses generateEnemy, determineTurnOrder

**Step 4: Clean getState()**

- Line ~367: Remove `startingChipShop: null`
- Line ~387: Remove `essence: this.meta.essence` from meta state output

**Step 5: Also clean `getAvailableUpgrades()` method (lines ~124-143)**

This method returns META_UPGRADES info — delete it entirely.

**Step 6: Update services/index.js**

Remove the CombatService export:
- File: `src/game/services/index.js`
- Line 6: Delete `export { CombatService } from './combat-service.js';`

**Step 7: Verify**

```bash
node --check src/game/loop.js && echo "OK"
node --check src/game/services/index.js && echo "OK"
```

**Step 8: Commit**

```bash
git add src/game/loop.js src/game/services/index.js
git commit -m "chore: remove ghost combat/upgrade methods from loop.js"
```

---

### Task 7: Clean src/game/dm.js — remove ghost prompts

**Files:**
- Modify: `src/game/dm.js`

**Step 1: Remove lorebook.js import**

- Line ~30: Delete `import { getFloorLore, getEnemyVoice, buildWorldContext } from './lorebook.js';`

After deleting this import, find all call sites of `getFloorLore`, `getEnemyVoice`, `buildWorldContext` in dm.js and remove or replace them:
- If `buildWorldContext` is called to build the DM system prompt, replace with an inline fallback or remove the worldContext variable
- If `getEnemyVoice` is used in prompts being removed, it goes away naturally
- If `getFloorLore` is used in prompts being removed, it goes away naturally

**Step 2: Clean the DM system prompt**

In `buildDmSystemPrompt()` (~lines 247-348):
- Line ~315: Remove `player.rank` reference: `（${player?.rank || 'E'}ランク、Lv.${player?.level || 1}）` — remove rank, keep level if used
- Line ~316: Remove `SP：${player?.sp ?? player?.mp ?? 0}/...` — delete entire SP/MP line

**Step 3: Remove ghost event prompts from DM_PROMPTS**

Delete these prompt templates entirely:
- `playerMagic` (~444-449)
- `playerItem` (~461-467)
- `fleeSuccess` / `fleeFail` (~592-597)
- `bossAppear` / `finalBossAppear` (~607-625)
- `refineSuccess` / `refineFail` (~654-668)

**Step 4: Remove ghost fallback narrations**

In `getFallbackNarration()` (~lines 860-887), remove:
- `playerMagic` fallback (~866)
- `playerItem` fallback (~867)
- `fleeSuccess` / `fleeFail` fallbacks (~872-873)
- `bossAppear` / `finalBossAppear` fallbacks (~875-876)
- `refineSuccess` / `refineFail` fallbacks (~882-883)

**Step 5: Remove ghost helper functions**

- `getFloorNarration()` (~889-900) — hardcoded floor 1-7 text
- `getEnemyAttackNarration()` (~918-942) — old enemy attack descriptions

**Step 6: Verify**

```bash
node --check src/game/dm.js && echo "OK"
```

**Step 7: Commit**

```bash
git add src/game/dm.js
git commit -m "chore: remove ghost prompts and fallbacks from dm.js"
```

---

### Task 8: Clean src/game/phase-machine.js — remove BLACKSMITH

**Files:**
- Modify: `src/game/phase-machine.js`

**Step 1: Remove BLACKSMITH phase**

- Line ~42: Delete `BLACKSMITH: 'blacksmith',` from PHASES constant
- Remove BLACKSMITH from all `VALID_TRANSITIONS` entries (lines ~55, 74, 83, 130-134)

**Step 2: Verify**

```bash
node --check src/game/phase-machine.js && echo "OK"
```

**Step 3: Commit**

```bash
git add src/game/phase-machine.js
git commit -m "chore: remove BLACKSMITH phase from phase-machine"
```

---

### Task 9: Clean route files — remove ghost endpoints

**Files:**
- Modify: `src/routes/game/combat.js`
- Modify: `src/routes/game/economy.js`
- Modify: `src/routes/game/run.js`
- Modify: `src/routes/game/misc.js` (if debug-force-blacksmith exists)

**Step 1: Clean combat.js routes**

Remove ghost routes (lines ~30-85):
- `/combat-cycle` route (lines ~31-41) — calls `gameManager.combatCycle()` which is removed
- `/combat-end-narration` route (lines ~44-71) — has hardcoded ghost narration, review whether creature combat also uses this route. If creature combat has its own end-narration flow, delete it. If shared, keep but strip boss/enemy references.
- `/start-encounter` route (lines ~74-85) — calls `gameManager.startEncounter()` which is removed

Also update the file header comment (line ~4) to remove ghost endpoint names.

**Step 2: Clean economy.js routes**

Remove ghost routes (lines ~24-42):
- `/upgrades` GET route (lines ~25-29)
- `/purchase-upgrade` POST route (lines ~32-42)

Keep: `/shop-skip`, `/dealer-state`, `/dealer-sell`, `/dealer-buy`, `/dealer-leave`

Update file header comment (line ~4) to remove "meta-progression upgrades".

**Step 3: Clean run.js routes**

Remove ghost routes:
- `levelsPath` constant (line ~21)
- `loadLevels()` function (lines ~34-36)
- `/levels` GET endpoint (lines ~120-131)
- `/levels/select` POST endpoint (lines ~134-179)

**Step 4: Clean misc.js routes**

Search for and remove:
- `debug-force-blacksmith` route
- `/heal` endpoint (heals player HP, which no longer exists)

**Step 5: Verify all route files parse**

```bash
node --check src/routes/game/combat.js && echo "OK"
node --check src/routes/game/economy.js && echo "OK"
node --check src/routes/game/run.js && echo "OK"
node --check src/routes/game/misc.js && echo "OK"
```

**Step 6: Commit**

```bash
git add src/routes/game/combat.js src/routes/game/economy.js src/routes/game/run.js src/routes/game/misc.js
git commit -m "chore: remove ghost API routes (old combat, upgrades, levels, heal)"
```

---

### Task 10: Clean frontend JS — api.js, dom.js, game.js, ui/index.js

**Files:**
- Modify: `public/js/api.js`
- Modify: `public/js/dom.js`
- Modify: `public/game.js`
- Modify: `public/js/ui/index.js`

**Step 1: Clean api.js**

- Remove `getMetaProgression()` function (~107-117)
- Remove `purchaseUpgrade()` function (~180-192)
- Remove both from the export object at the bottom of the file

**Step 2: Clean dom.js**

- Remove player HP getters (~39-43): `playerHpContainer`, `playerHpBar`, `playerHpFill`, `playerHpText`

**Step 3: Clean game.js**

- Remove `import * as economyUI from './js/ui/economy.js';` (~82)
- Remove `import * as hpBar from './js/ui/hp-bar.js';` (~91)
- Remove all `hpBar.*` calls:
  - Lines ~303, 308, 315: `hpBar.setVisible(...)`
  - Line ~312: `hpBar.updatePlayerHP(...)`
  - Line ~313: `hpBar.setVisible(true)`
  - Line ~1129: `hpBar.updatePlayerHP(hp, ...)`
- Remove all `economyUI.*` calls:
  - Line ~346: `economyUI.renderDealerRoom(actions)`
  - Lines ~1178-1181: `economyUI.init({...})`

**Important:** For economyUI.renderDealerRoom, check if there's an alternative dealer UI module or if this functionality needs to be preserved. The dealer room is KEEP per triage — the economy.js file that's deleted is the UI module, not the route. If dealer room rendering was only in economy.js, we may need to keep economy.js. **Verify before deleting.**

**Step 4: Clean ui/index.js**

- Remove `export * as hpBar from './hp-bar.js';` (~28)
- Remove `export * as economy from './economy.js';` (~32)

**Step 5: Verify all parse**

```bash
node --check public/js/api.js && echo "OK"
node --check public/js/dom.js && echo "OK"
node --check public/game.js && echo "OK"
node --check public/js/ui/index.js && echo "OK"
```

**Step 6: Commit**

```bash
git add public/js/api.js public/js/dom.js public/game.js public/js/ui/index.js
git commit -m "chore: remove ghost frontend modules (hpBar, economyUI, upgrade API)"
```

---

### Task 11: Clean combat-loop.js — remove old player-HP references

**Files:**
- Modify: `public/js/ui/combat-loop.js`

**Step 1: Find and remove old player HP DOM manipulation**

Two duplicate blocks:
- Lines ~1546-1553: `const playerHpBar = document.getElementById('player-hp-fill'); ... await playerHitEffect(result.enemyAttack.damage, playerHpBar, chipRow); updateHpCriticalState(playerHpBar, ...);`
- Lines ~1686-1692: Same pattern duplicated

Remove the `playerHpBar` variable assignment and `playerHitEffect` / `updateHpCriticalState` calls in both blocks. Keep the surrounding logic (enemy attack results, creature HP updates).

**Step 2: Clean up "fetch chips" comments**

Search for comments mentioning "chips" and update or remove them.

**Step 3: Verify**

```bash
node --check public/js/ui/combat-loop.js && echo "OK"
```

**Step 4: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "chore: remove old player-HP references from combat-loop.js"
```

---

### Task 12: Clean CSS, i18n, audio, ai-providers

**Files:**
- Modify: `public/game.css`
- Modify: `public/js/ui/i18n.js`
- Modify: `public/js/audio.js`
- Modify: `src/ai-providers.js`
- Modify: `src/game/services/exploration-service.js`

**Step 1: Clean game.css**

Remove these ghost CSS blocks:
- `.player-hp-container` + `.player-hp-bar` styles (~558-572)
- `.ward-options` styles (~1454-1510)
- `.level-select-header` + `.level-select-list` styles (~1511-1533)

**Do NOT remove** the `#1a1a2e` dark background colors — they're used as fallback values throughout active UI components (creature popup, settings, game over screen). Only remove them from clearly-dead equipment blocks if any exist.

**Step 2: Clean i18n.js**

- Remove `equippedChips` string (~57)
- Remove `noChips` string (~59)
- Keep `charging` string (~88) — it's used for creature move charging (active feature)

**Step 3: Clean audio.js**

- Remove `boss: 'boss'` from `PHASE_TRACKS` (~37) — no boss phase exists
- In `getTrackForPhase()`, remove boss-related mapping (~51): `if (phase === 'combat' && isBossRoom) return PHASE_TRACKS.boss;`

**Step 4: Remove chat partner mode from ai-providers.js**

- Remove `buildSystemPrompt()` function (~71-104) — triage #16a chat mode REMOVE
- Remove from exports if it's listed

**Step 5: Clean exploration-service.js comments**

- Remove "Track room clears for counter chips" comments (~252, 315) — replace with plain "Track room clears" or remove entirely

**Step 6: Run full test suite**

```bash
npm test
```

Expected: ALL PASS. This is the Phase 2 verification gate.

**Step 7: Commit**

```bash
git add public/game.css public/js/ui/i18n.js public/js/audio.js src/ai-providers.js src/game/services/exploration-service.js
git commit -m "chore: clean ghost CSS, i18n, audio, and chat-partner mode"
```

---

## Phase 3: Rename chip → creature

### Task 13: Rename HTML element IDs and CSS classes

**Files:**
- Modify: `public/game.html`
- Modify: `public/game.css`

**Step 1: Rename HTML IDs**

In `public/game.html`:
- Line ~50: `<div class="chip-row" id="chip-row">` → `<div class="creature-row" id="creature-row">`
- Line ~51: Update comment about chip slots → creature slots
- Line ~183: `<div class="chip-popup" id="chip-popup">` → `<div class="creature-popup" id="creature-popup">`

**Step 2: Rename CSS classes**

In `public/game.css`, use find-replace for these patterns:
- `.chip-row` → `.creature-row` (all occurrences)
- `.chip-popup` → `.creature-popup` (all occurrences)
- `.shrine-chip-` → `.shrine-creature-` (all occurrences — covers list, option, icon, img, info, name, rarity, desc, upgrade)
- `.cc-chips` → `.cc-creature-stats`
- `.cc-chip ` → `.cc-stat ` (note trailing space to avoid matching `.cc-chip-val`)
- `.cc-chip-val` → `.cc-stat-val`
- `.cc-chip-lbl` → `.cc-stat-lbl`

**Step 3: Commit**

```bash
git add public/game.html public/game.css
git commit -m "refactor: rename chip→creature in HTML IDs and CSS classes"
```

---

### Task 14: Rename JS DOM accessors and variable references

**Files:**
- Modify: `public/js/dom.js`
- Modify: `public/game.js`
- Modify: `public/js/ui/creature-row.js`
- Modify: `public/js/ui/combat-loop.js`
- Modify: `public/js/ui/lookup.js`
- Modify: `public/js/ui/exploration.js`
- Modify: `public/js/ui/combat-effects.js`
- Modify: `public/js/ui/i18n.js`

**Step 1: Rename dom.js accessors**

- `get chipRow()` → `get creatureRow()`, element ID `'chip-row'` → `'creature-row'`
- `get chipPopup()` → `get creaturePopup()`, element ID `'chip-popup'` → `'creature-popup'`

**Step 2: Rename game.js**

- `updateChipRow()` → `updateCreatureRow()` (function definition + all call sites)
- `dom.chipRow` → `dom.creatureRow` (all occurrences)

**Step 3: Rename creature-row.js**

- All `dom.chipRow` → `dom.creatureRow` (~15 occurrences)
- All `dom.chipPopup` → `dom.creaturePopup` (~10 occurrences)
- Update JSDoc comments mentioning chipRow/chipPopup

**Step 4: Rename combat-loop.js**

- All `#chip-row` selectors → `#creature-row` (querySelector strings, ~8 occurrences)
- All `chipRow` variable names → `creatureRow`
- All `.shrine-chip-` class refs in template strings → `.shrine-creature-`
- Update comments

**Step 5: Rename lookup.js**

- `.chip-popup.visible` selector → `.creature-popup.visible` (~260)
- `chipPopup` variable → `creaturePopup` (~261)
- Update comments (~253, 259)

**Step 6: Rename exploration.js**

- All `.shrine-chip-` class refs in template strings → `.shrine-creature-` (~30 occurrences)

**Step 7: Rename combat-effects.js**

- JSDoc `#chip-row` → `#creature-row` (~379)

**Step 8: Rename i18n.js**

- `defendingChip` key → `defendingCreature`
- Comment `// ── Chip labels ──` → `// ── Creature labels ──`
- Update any callers of `defendingChip` (grep for it)

**Step 9: Verify all files parse**

```bash
for f in public/js/dom.js public/game.js public/js/ui/creature-row.js public/js/ui/combat-loop.js public/js/ui/lookup.js public/js/ui/exploration.js public/js/ui/combat-effects.js public/js/ui/i18n.js; do node --check "$f" && echo "$f OK" || echo "$f FAILED"; done
```

**Step 10: Commit**

```bash
git add public/js/ public/game.js
git commit -m "refactor: rename chip→creature in all JS references"
```

---

### Task 15: Rename audio files and references

**Files:**
- Rename: `public/assets/audio/sfx/chip-equip.mp3` → `creature-equip.mp3`
- Rename: `public/assets/audio/sfx/chip-skill.mp3` → `creature-skill.mp3`
- Rename: `public/assets/audio/sfx/chip-lift.mp3` → `creature-lift.mp3`
- Rename: `public/assets/audio/bgm/chip_shop.mp3` → `creature-shop.mp3`
- Modify: `public/js/audio.js`
- Modify: `public/js/ui/combat-loop.js`
- Modify: `public/js/ui/post-combat-shop.js`
- Modify: `public/assets/audio/LICENSES.md`

**Step 1: Rename audio files on disk**

```bash
mv public/assets/audio/sfx/chip-equip.mp3 public/assets/audio/sfx/creature-equip.mp3
mv public/assets/audio/sfx/chip-skill.mp3 public/assets/audio/sfx/creature-skill.mp3
mv public/assets/audio/sfx/chip-lift.mp3 public/assets/audio/sfx/creature-lift.mp3
mv public/assets/audio/bgm/chip_shop.mp3 public/assets/audio/bgm/creature-shop.mp3
```

**Step 2: Update audio.js SFX registry**

- `'chip-equip'` → `'creature-equip'`
- `'chip-skill'` → `'creature-skill'`
- `'chip-lift'` → `'creature-lift'` (if listed)
- BGM track: `chip_shop` → `creature-shop` (in PHASE_TRACKS or BGM config)

**Step 3: Update playSFX call sites**

- combat-loop.js: `playSFX('chip-skill')` → `playSFX('creature-skill')` (~1987, 2006)
- post-combat-shop.js: `playSFX('chip-equip')` → `playSFX('creature-equip')` (~75)

**Step 4: Update LICENSES.md**

- Update filenames in attribution list

**Step 5: Commit**

```bash
git add public/assets/audio/ public/js/audio.js public/js/ui/combat-loop.js public/js/ui/post-combat-shop.js
git commit -m "refactor: rename chip→creature audio files and references"
```

---

### Task 16: Rename generateFloorRooms and final verification

**Files:**
- Modify: `src/game/rooms.js`
- All callers of `generateFloorRooms`

**Step 1: Find all occurrences**

```bash
grep -rn "generateFloorRooms" src/ public/ --include="*.js"
```

**Step 2: Rename to generateAreaRooms**

Rename the function definition and all call sites.

**Step 3: Run full test suite**

```bash
npm test
```

Expected: ALL PASS

**Step 4: Final straggler check**

```bash
grep -ri "chip" --include="*.js" --include="*.css" --include="*.html" public/ src/ | grep -v "Chippy" | grep -v node_modules | grep -v ".test."
```

Review any remaining "chip" references. If they're in code comments about Chippy NPC, leave them. If they're remnants of the old naming, fix them.

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: rename generateFloorRooms→generateAreaRooms, final chip→creature stragglers"
```

---

## Task 17: Update documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/ghost-triage-decisions.md`

**Step 1: Update CLAUDE.md Key Directories**

Remove references to:
- `enemies.js` from src/game/ listing
- `data/enemies.json`, `data/bosses.json` from data/ listing
- `combat/` directory from src/game/ listing

**Step 2: Update ARCHITECTURE.md**

Remove references to deleted files and ghost systems.

**Step 3: Mark triage as complete**

Add a header to `docs/ghost-triage-decisions.md`:
```
> **Status: COMPLETE** — All REMOVE/RENAME decisions executed on 2026-03-02.
```

**Step 4: Commit**

```bash
git add CLAUDE.md docs/ARCHITECTURE.md docs/ghost-triage-decisions.md
git commit -m "docs: update documentation after ghost systems cleanup"
```

---

## Post-Cleanup Verification

After all tasks complete:

1. `npm test` — Tier 1 + 2 must pass
2. `npm run dev` — server starts without errors
3. Quick manual check: no console errors on page load
4. `git log --oneline -10` — verify clean commit history
