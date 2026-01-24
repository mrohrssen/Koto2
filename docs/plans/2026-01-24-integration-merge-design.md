# Integration Merge Design

**Goal:** Merge all active feature worktrees into a single integration branch for testing.
**Target branch:** `integration/all-features`
**Worktree:** `/Users/michia/Documents/jrpg-wt-integration`
**Date:** 2026-01-24

---

## Branches to Merge

| Branch | Worktree | Base | Commits Ahead | Summary |
|--------|----------|------|---------------|---------|
| `feature/chip-balance-tuning` | `jrpg-wt-chip-balance` | master | 2 | Chip balance + 3 new pipeline types |
| (unstaged images) | main `jrpg` repo | master | N/A | All regenerated assets (backgrounds, sprites, chip icons) |
| `feature/mobile-first-ui` | `jrpg-wt-mobile-ui` | master | ~30 | Full mobile-first UI rewrite + 39 new e2e tests |
| `feature/mobile-ui-audio` | `jrpg-wt-mobile-ui-audio` | mobile-first-ui | ~15 | Audio system: 13 SFX + BGM with Web Audio API |

### Deferred (merge after integration is stable)

| Branch | Worktree | Reason |
|--------|----------|--------|
| `feature/user-auth` | `jrpg-wt-user-auth` | Requires all game endpoints to use JWT. Merge after mobile-ui + audio + chips are stable. Will need auth bypass for debug/test mode. |

### Not included (stale/superseded)

- `feature/crazy-pipeline-chips` — older chip experiments
- `fix/reset-bug` — older fix
- `feature/simple-turn-based` — design exploration
- `feature/turn-based-review` — design exploration
- `refactor/chip-cleanup` — may be superseded by chip-balance
- `refactor/phase2-server-routes` — older refactor
- `refactor/monolith-split` — older refactor
- `feature/simplify-attack-system` — older design
- `fix/include-kanji-in-reviews` — independent fix, merge separately

---

## Merge Order

Order matters due to branch dependencies:

1. **Create `integration/all-features` from master** (`049bf62`)
2. **Merge `feature/chip-balance-tuning`** — independent from master, 2 commits, low conflict risk
3. **Commit all image assets** — everything under `public/assets/` that's new/modified/deleted in the main repo (backgrounds, sprites, chip icons). This is much more than 30 files — the entire art style was replaced.
4. **Merge `feature/mobile-first-ui`** — the large frontend rewrite. Potential conflicts with chip-balance in `chips.js` and `data/chips.json`.
5. **Merge `feature/mobile-ui-audio`** — branches from mobile-first-ui, should apply cleanly on top of step 4.
6. **Resolve conflicts** as they arise (see Conflict Hotspots below).
7. **Smoke test** — run server, verify page loads, run e2e tests.

---

## Conflict Hotspots

| File | Touched By | Risk | Resolution Strategy |
|------|-----------|------|---------------------|
| `data/chips.json` | chip-balance, mobile-ui | **High** | Keep chip-balance's stat values, mobile-ui's structural additions |
| `src/game/items/chips.js` | chip-balance, mobile-ui | **High** | Keep chip-balance formulas, mobile-ui's new exports/references |
| `public/game.js` | mobile-ui, audio | **Medium** | Audio adds imports + hooks to mobile-ui's version — take both |
| `public/game.css` | mobile-ui, audio | **Low** | Audio adds `.settings-range` styles — append |
| `public/assets/icons/chips/*` | images (delete old + add new), chip-balance | **Medium** | Take image deletions/additions; verify chip-balance doesn't reference deleted icon filenames |
| `tests/unit/chip-*.test.js` | chip-balance | **Low** | Chip-balance has the latest test expectations |
| `tests/unit/pipeline-chips.test.js` | chip-balance | **Low** | Same as above |

---

## Image Assets Scope

The main repo has these categories of image changes to commit:

- **Floor backgrounds** (`public/assets/backgrounds/floor*.png`) — 35 files, all replaced with street-level anime-style art
- **Special backgrounds** (`public/assets/backgrounds/hub.png`, `dungeon.png`, `locations/*.png`) — 11 files
- **Enemy sprites** (`public/assets/sprites/enemies/*.png`) — ~50 files modified, ~12 deleted (old fantasy enemies removed)
- **Chip icons** (`public/assets/icons/chips/*.png`) — ~150 deleted (old icons), ~15 new icons, 5 modified
- **Generation scripts** (`scripts/*.py`) — new/modified generation scripts

---

## What Each Feature Adds

### Chip Balance (2 commits)
- Rebalanced stat multipliers in `data/chips.json`
- Added 3 new pipeline chip types
- Updated `src/game/items/chips.js` with new formulas
- Updated combat player-actions for new chip effects
- Updated unit tests

### Mobile-First UI (~30 commits)
- Complete frontend rewrite: takeover views, swipeable flash cards, action-area buttons
- New files: `public/js/ui/` module system (actions.js, combat-loop.js, economy.js, chip-row.js, takeover.js, modals.js)
- New `public/js/settings.js`, `public/js/api.js` modules
- Rewrote `public/game.js`, `public/game.css`, `public/game.html`
- 39 new Playwright e2e tests in `tests/e2e/`
- New test infrastructure: fixtures, helpers, selectors, global setup/teardown
- New debug endpoints in `src/routes/game/misc.js`
- `playwright.config.ts` for test configuration

### Audio System (~15 commits)
- `public/js/audio.js` — Web Audio API SFX engine + HTMLAudioElement BGM
- 13 SFX files in `public/assets/audio/sfx/` (~100KB total)
- `public/assets/audio/bgm/.gitkeep` placeholder
- Integrated SFX triggers into: combat-loop, actions, economy, chip-row, takeover, game.js
- Volume sliders + mute checkbox in settings modal
- BGM start/stop/pause/resume lifecycle

### Image Regeneration (unstaged)
- All floor backgrounds regenerated (street-level perspective fix)
- 11 enemy sprites regenerated (wrong concept/background fix)
- Old chip icons removed, new simplified icons added
- Generation scripts added to `scripts/`

---

## Post-Merge Testing

### Quick validation
```bash
cd /Users/michia/Documents/jrpg-wt-integration
node --check public/js/audio.js
node --check public/game.js
node --check public/js/ui/combat-loop.js
npm start  # verify server starts and page loads
```

### Unit tests
```bash
npm run test:unit
```

### E2E tests (mobile-first UI suite)
```bash
./scripts/e2e-test.sh
# Expected: 39/39 pass (mobile-first UI tests)
# Old 87-test suite may not apply — mobile-ui rewrote the frontend
```

### Manual checks
- Open in mobile viewport (375px width)
- Start a run, encounter enemy, swipe cards
- Check audio plays (SFX on attack, swipe, etc.)
- Check chip shop, equip flow
- Verify new backgrounds display correctly
- Verify enemy sprites render (no broken images)

---

## User Auth (Deferred — Phase 2)

After integration is stable, merge `feature/user-auth`:

1. Merge `feature/user-auth` into integration branch
2. Add auth bypass: skip `requireAuth` middleware when `NODE_ENV=test` or debug mode enabled
3. Install new dependencies: `bcrypt`, `jsonwebtoken`
4. Set environment variables: `JWT_SECRET`, `ENCRYPTION_KEY`, `ADMIN_SECRET`
5. Re-run e2e tests to verify bypass works
6. Test auth flow manually (register, login, API key storage)

---

## Execution Checklist

- [x] Create `integration/all-features` branch from master
- [x] Create worktree at `jrpg-wt-integration`
- [x] Merge `feature/chip-balance-tuning`
- [x] Commit image assets (backgrounds, sprites, icons, scripts)
- [x] Merge `feature/mobile-first-ui`
- [x] Resolve chip-balance vs mobile-ui conflicts
- [x] Merge `feature/mobile-ui-audio`
- [x] Resolve any audio vs mobile-ui conflicts
- [x] Syntax check key JS files
- [x] Run unit tests
- [x] Start server and verify page loads
- [x] Run e2e tests
- [x] Fix integration issues (see Post-Merge Bug Fixes below)
- [ ] (Phase 2) Merge `feature/user-auth` with auth bypass

---

## Post-Merge Bug Fixes

After the integration merge, manual testing revealed numerous issues. All fixes were committed to `integration/all-features` (commit `23a1afb`). Changes span 8 files with 318 insertions and 103 deletions.

### Chip Pipeline Display (Critical)

**Problem:** Chip activations were invisible during combat — no math, no animations, no sound.

**Root cause:** Frontend checked `pa.chipEffects` which is always empty for normal pipeline chips. The actual data lives in `pa.pipelineResult.firedChips`.

**Fix (`public/js/ui/combat-loop.js`):**
- Rewrote `showChipActivationSequence()` to read `pipelineResult.firedChips` filtered to `triggered: true`
- Each fired chip provides `previousDamage`/`newDamage` for delta calculation, `healPlayer` for heals, `displayText` for buffs
- Sequential 500ms delay between chip activations with progressive math display
- Floating tooltip (`showChipTooltip()`) above each chip slot showing name and effect
- `findChipSlotIndex()` maps `chipId` to slot position via `cache.equipment.weapon.equippedChips`

### Chip Skill HP Bar Desync (Critical)

**Problem:** Using a damage chip skill (e.g., "Big Sip") caused the enemy HP bar to visually fill to 100%.

**Root cause:** `handleUseChipSkill` in `game.js` called `updateUI()` without first syncing `gameState.combat.enemy.hp` from the API response.

**Fix (`public/game.js`):**
- Sync `gameState.combat.enemy.hp = result.enemyHp.current` before calling `updateUI()`
- Added combat math display showing skill name, damage, heal, or buff status

### Chip Shop Icons Missing

**Problem:** Chip icons showed in combat/navigation but not in the post-combat shop.

**Root cause:** Shop items from `generatePostCombatShop` use `itemId` field, not `id`.

**Fix (`public/js/ui/economy.js`):**
- Changed icon path lookup from `chip.id` to `chip.itemId || chip.id`
- Changed layout to horizontal flex (56px icon left, text right)

### BGM Not Playing for Existing Runs

**Problem:** Music only started on `startNewRun()`, not when resuming a saved run.

**Fix (`public/game.js`):**
- Added `playBGM('main')` call in `ensureAudio()` when game phase is active

### Enemy Damage Display

**Problem:** No visual feedback when enemies hit the player.

**Fix (`public/js/ui/combat-loop.js`, `public/game.css`):**
- Added `showEnemyDamageDisplay()` — big 48px red text with pop animation
- Combat flow now: chip math → enemy damage display → flash cards
- Added 1200ms delay before flash cards to let damage register

### Healing in Combat Math

**Problem:** Chip healing effects weren't shown in the math display (they used to be).

**Fix (`public/js/ui/combat-loop.js`):**
- Added `.math-heal` class (green) for heal lines
- Healing chips show `+N HP` in the progressive math display

### Chips Clickable Outside Combat

**Problem:** Equipped chips could only be tapped during combat to see abilities.

**Fix (`public/js/ui/chip-row.js`):**
- Changed click handler from `if (chip && inCombat)` to `if (chip)`
- `showPopup` hides charge bar and Use Skill button when not in combat

### Flash Card Overflow

**Problem:** Long definitions were cut off when cards were flipped.

**Fix (`public/js/ui/actions.js`):**
- Added `formatMeanings()` — truncates to first 3 meanings with "..."
- Flash card meaning: 18px font, max-height 120px, overflow-y auto

### TTS Volume Control

**Problem:** No way to adjust TTS volume in settings.

**Fix (`public/js/ui/modals.js`):**
- Added TTS volume slider to settings modal
- Saves/loads from `localStorage('jrpg_ttsVolume')`

### Enemy Sprite Positioning

**Problem:** Enemy dialogue overlapped the sprite's face.

**Fix (`public/game.css`):**
- `.enemy-sprite-container`: `align-items: flex-end`, `padding-top: 40px`
- Enemy sprite: `max-height: 256px`, `max-width: 100%`
- Sprite now anchored to bottom of container; dialogue appears above head

### Dead Code Cleanup

Removed orphaned code from the old chip display approach:
- `showChipEffect` callback (unused after pipeline rewrite)
- `animateChipPipeline` callback (unused)
- Orphaned JSDoc comments referencing removed functions
