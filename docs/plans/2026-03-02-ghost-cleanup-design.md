# Ghost Systems Cleanup Design

Executes all REMOVE + RENAME decisions from `docs/ghost-triage-decisions.md` using a layered deletion approach.

**Estimated removal:** ~4,500+ lines of dead code across ~14 deletable files + surgical cleanup in ~20 active files + ~136 chip→creature renames.

## Phase 1: Delete Entirely-Ghost Files

Files with zero live callers outside the ghost system. Deleting them breaks imports in active files, which Phase 2 fixes.

### Files to delete

| File | Est. Lines | Triage # |
|------|-----------|----------|
| `data/enemies.json` | data | #1 |
| `data/bosses.json` | data | #5 |
| `data/enemy-mappings.json` | data | #1 |
| `data/levels.json` | data | #6 |
| `src/game/enemies.js` | ~1,222 | #1 |
| `src/game/combat.js` | ~31 | #2 |
| `src/game/combat/index.js` | ~40 | #2 |
| `src/game/combat/player-actions.js` | ~61 | #2 |
| `src/game/combat/enemy.js` | ~434 | #2 |
| `src/game/combat/mechanics.js` | ~159 | #2 |
| `src/game/combat/rewards.js` | ~45 | #2 |
| `src/game/services/combat-service.js` | ~350 | #2 |
| `public/js/ui/hp-bar.js` | ~60 | #4 |
| `public/js/ui/economy.js` | ~90 | #8 |

### Verify before deleting

- `src/game/lorebook.js` — audit says ghost, but `src/narration-engine/lorebook.js` may be the active copy. Only delete the `src/game/` copy if it's truly unused.

### Explicitly KEPT per triage

- `public/js/word-practice.js` — #3, reusable for mini-games
- `src/game/services/door-hint-service.js` + `data/door-hints.json` — #9, Chippy repurpose
- `src/bunpro.js` — #15, intentional

### Phase 1 verification

- `npm test` passes (expect import errors in tests that reference deleted files — fix those too)
- No runtime crashes on `npm run dev`

---

## Phase 2: Surgical Cleanup of Active Files

Remove broken imports, dead code, and ghost features from files that remain.

### server.js

- Remove `import { getLiberationTrackerData }` (line ~112, dead import)
- Remove stale endpoint docs mentioning `/start-boss`, `/combat-cycle` (lines ~22-23)
- Remove or strip `enrichRewardDrops()` bossDrop/equipment branch (lines ~327-353)
- Verify door-hint wiring: keep if needed for Chippy (#9), remove if orphaned

### src/game/state.js

- Remove `essence: 0` from `createMetaProgression()` (lines ~42-90)
- Remove `META_UPGRADES` export (lines ~99-139)
- Remove `calculateEssenceReward()` (lines ~204-219)
- Remove `liberationTracker: {}` from lifetimeStats (line ~65)
- Remove `class: 'hacker'` from `createNewPlayer()` (line ~255)
- Remove dead status effects: `defrag`, `lag`, `bufferOverflow`, `corrupted`, `glitched` (lines ~342-352)
- Remove ghost run stats: `enemiesDefeated`, `bossesDefeated`, `trapsDisarmed`, `critsLanded`, `dodges` (#16e)

### src/game/loop.js

- Remove `import { generateEnemy, selectEnemyIntent }` (line ~60)
- Remove `CombatService` from import, keep `ExplorationService` (line ~64)
- Remove `this.combatService = new CombatService(this)` (line ~84)
- Remove `purchaseUpgrade()` method (lines ~148-182)
- Remove `awardRunEssence()` method (lines ~187-202)
- Remove `applyMetaBonuses()` method (lines ~279-290)
- Remove `startingChipShop: null` (line ~367)

### src/game/dm.js

- Remove `player.rank` reference (line ~315)
- Remove `player.sp`/`player.mp` references (line ~316)
- Remove prompts: `playerMagic` (~444-458), `playerItem` (~461-471), `fleeSuccess`/`fleeFail` (~592-597), `bossAppear`/`finalBossAppear` (~607-623), `refineSuccess`/`refineFail` (~654-667), room type hints (~676-687)
- Remove corresponding fallback strings (~872-883)

### src/game/phase-machine.js

- Remove `BLACKSMITH` phase constant (line ~42)
- Remove all BLACKSMITH transition entries (lines ~55, 74, 83, 130-134)

### src/routes/game/

- `economy.js`: Remove `/upgrades` GET + `/purchase-upgrade` POST (lines ~25-42). Delete file if empty.
- `run.js`: Remove `levelsPath` + `loadLevels()` (lines ~21, 34-35), `/levels` GET (~120-127), `/levels/select` POST (~134-145)
- `misc.js`: Remove `debug-force-blacksmith` route (~55-95), `/api/game/heal` endpoint (~281-293)
- `combat.js`: Verify `/start-encounter` is creature-combat only. Remove any old player-vs-enemy branches.

### public/js/api.js

- Remove `getMetaProgression()` (~107-117)
- Remove `purchaseUpgrade()` (~180-192)
- Remove both from export list

### public/js/dom.js

- Remove `playerHpContainer`, `playerHpBar`, `playerHpFill`, `playerHpText` getters (~39-43)

### public/game.js

- Remove `import * as hpBar` + `import * as economyUI`
- Remove any calls to these modules

### public/js/ui/index.js

- Remove `export * as hpBar` + `export * as economy`

### public/js/ui/combat-loop.js

- Remove old player-HP combat branches (~1546-1692)
- Remove `playerHpBar` references
- Clean up "fetch chips" comments

### public/game.css

- Remove `.player-hp-container` / `.player-hp-bar` styles (~558-572)
- Remove `.ward-options` styles (~1454-1510)
- Remove `.level-select-*` styles (~1511-1533)
- Remove dark equipment UI `#1a1a2e` blocks (~3059-3117)

### public/js/ui/i18n.js

- Remove `equippedChips` / `noChips` strings (~57-59)
- Remove charge mechanic strings if unused

### public/js/audio.js

- Remove `boss: 'boss'` from `PHASE_TRACKS` (~37)
- Remove `floorComplete`, `runComplete` if they map to dead phases

### src/ai-providers.js

- Remove `buildSystemPrompt()` chat partner mode (~71-103, triage #16a)

### src/game/services/exploration-service.js

- Remove "counter chips" comments (~252, 315)

### Phase 2 verification

- `node --check` on every modified JS file
- `npm test` passes (Tier 1 + 2)
- `npm run dev` starts without errors

---

## Phase 3: Rename chip → creature

Global rename after Phases 1-2 leave a clean codebase. ~136 occurrences.

### HTML element IDs

| File | Old | New |
|------|-----|-----|
| `public/game.html:50` | `id="chip-row"` class `chip-row` | `id="creature-row"` class `creature-row` |
| `public/game.html:183` | `id="chip-popup"` class `chip-popup` | `id="creature-popup"` class `creature-popup` |

### CSS classes (~24 selectors in `public/game.css`)

- `.chip-row` → `.creature-row`
- `.chip-popup` / `.chip-popup.visible` → `.creature-popup` / `.creature-popup.visible`
- `.shrine-chip-*` (list, option, icon, img, info, name, rarity, desc, upgrade) → `.shrine-creature-*`
- `.cc-chips` / `.cc-chip` / `.cc-chip-val` / `.cc-chip-lbl` → `.cc-creature-stats` / `.cc-stat` / `.cc-stat-val` / `.cc-stat-lbl`
- `.chip-row:has(.creature-slot)` → `.creature-row:has(.creature-slot)`

### DOM accessors (`public/js/dom.js`)

- `get chipRow()` → `get creatureRow()`, element `'chip-row'` → `'creature-row'`
- `get chipPopup()` → `get creaturePopup()`, element `'chip-popup'` → `'creature-popup'`

### JS references (~50 occurrences)

- `public/game.js` — `updateChipRow()` → `updateCreatureRow()`, `dom.chipRow` → `dom.creatureRow`
- `public/js/ui/creature-row.js` — ~15 refs to `dom.chipRow`/`dom.chipPopup`
- `public/js/ui/combat-loop.js` — ~8 `querySelector('#chip-row ...')`, `chipRow` variables
- `public/js/ui/lookup.js` — `.chip-popup.visible` selector + variable
- `public/js/ui/exploration.js` — ~30 `.shrine-chip-*` class refs in template strings
- `public/js/ui/combat-effects.js` — JSDoc `#chip-row` → `#creature-row`

### i18n strings (`public/js/ui/i18n.js`)

- `defendingChip` → `defendingCreature`
- Comment `// ── Chip labels ──` → `// ── Creature labels ──`

### Audio files (rename on disk + update references)

| Old | New |
|-----|-----|
| `sfx/chip-equip.mp3` | `sfx/creature-equip.mp3` |
| `sfx/chip-skill.mp3` | `sfx/creature-skill.mp3` |
| `sfx/chip-lift.mp3` | `sfx/creature-lift.mp3` |
| `bgm/chip_shop.mp3` | `bgm/creature-shop.mp3` |

Update references in:
- `public/js/audio.js` SFX registry
- `public/js/ui/combat-loop.js` `playSFX()` calls
- `public/js/ui/post-combat-shop.js` `playSFX()` call
- `public/assets/audio/LICENSES.md`

### Rooms.js function rename (Triage #6)

- `generateFloorRooms` → `generateAreaRooms` in `src/game/rooms.js` + all call sites

### Excluded from rename

- "Chippy" (NPC name) — KEPT per triage #9
- `victory` phase key in PHASE_TRACKS stays (but its BGM file `chip_shop.mp3` → `creature-shop.mp3`)

### Phase 3 verification

- `node --check` on all modified JS files
- `npm test` passes
- `grep -ri "chip" --include="*.js" --include="*.css" --include="*.html" public/ src/` to catch stragglers (excluding Chippy)
- Bump `SPRITE_VERSION` in `public/js/ui/sprite-utils.js` if any sprite paths changed

---

## Documentation updates after cleanup

- Update `CLAUDE.md` Key Directories section (remove `enemies.js`, `data/enemies.json`, `data/bosses.json`, `combat/` directory)
- Update `docs/ARCHITECTURE.md` references to deleted files
- Mark `docs/ghost-systems-audit.md` as historical (cleanup executed)
- Update `docs/ghost-triage-decisions.md` with completion status
