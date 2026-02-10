# Robot Combat — Bug Report

## V1 Playtest (2026-02-10)

Branch: `feature/robot-combat`
Worktree: `/Users/michia/Documents/jrpg/.worktrees/robot-combat`

### Critical

#### BUG-5: Reserve robot doesn't auto-swap on KO

When the active robot is KO'd, the reserve robot should auto-swap in via `handleRobotKO()`. Instead, the game treats it as total defeat and shows "Defeated — Your run has ended." even though a healthy reserve exists.

**Steps to reproduce:**
1. Pick 2 starters (e.g., Fire active, Water reserve)
2. Enter combat
3. Attack until active robot reaches 0 HP

**Expected:** Reserve robot swaps into active slot, combat continues.
**Actual:** Game ends immediately with defeat screen.

**Where to look:** `src/game/services/robot-combat-service.js` → `handleRobotKO()`, and `src/game/loop.js` → `robotCombatCycle()` where KO check happens after enemy turn.

#### BUG-6: Turn count stuck at 1

`combat.turnCount` stays at 1 regardless of how many turns pass. This likely cascades into charge accumulation being wrong (BUG-7).

**Evidence:** After 8 attack turns, `window.gameState.combat.turnCount` returned `1`.

**Where to look:** `src/game/loop.js` → `robotCombatCycle()` — check if `this.combat.turnCount++` is being called.

### High

#### BUG-7: Ultimate charges accumulate too slowly

After 5 attack turns, charges were 2/5 instead of the expected 5/5 (1 charge per turn). Possibly related to BUG-6 (turnCount not incrementing).

**Evidence:** `robotParty.active[0].ultimate.charges` was 2 after 5 confirmed attack cycles.

**Where to look:** `src/game/services/robot-combat-service.js` → `processAttackTurn()` — verify `robot.ultimate.charges += 1` fires for each alive ally each turn.

#### BUG-8: No attack/defend animations

When a turn resolves, there are no visible animations:
- No element-colored orbs flying between robots
- No floating damage numbers
- No action text ("[RobotName] deals X damage")
- HP bars update silently

The spec calls for sequential ally attack animations with `fireRobotAttackEffect()`, progressive enemy HP updates, then enemy counter-attack animations.

**Where to look:** `public/js/ui/combat-loop.js` → `executeRobotPlayerAttack()` and `executeRobotDefendThenPause()`. Check if these functions are actually being called, or if combat resolves through a different code path.

### Medium

#### BUG-9: HP bar color wrong at full HP

The ally robot HP bar shows red even at 100% HP. Full HP should display green (green-to-red gradient).

**Where to look:** `public/game.css` or `public/js/ui/robot-row.js` — the `.robot-hp-fill` style.

### Low

#### BUG-10: No "Ready!" confirmation after starter selection

After picking the second starter, the game immediately advances to ward selection. The player can't change their mind. Expected flow: pick 2 → "Ready!" subtitle → confirm button → advance.

**Where to look:** `public/game.js` or `public/js/ui/exploration.js` — starter selection handler.

#### BUG-11: Starter card stats don't match server values

Starter cards display "HP: 500 | ATK: 30" but the server stores `hp: 100, attack: 10`. The cards show values with the playtest buff (HP×5, ATK×3) but combat uses unbuffed values.

**Where to look:** `GET /api/game/starters` endpoint or the frontend rendering.

### Fixed

#### BUG-12: Empty robot slots not appended to DOM (FIXED)

`robot-row.js` `render()` had `continue` before `row.appendChild(slot)` for empty slots. Fixed by moving `appendChild` before the null check.

---

## Not Yet Tested

- Befriend action (need enemy below 50% HP with party room)
- Ultimate ability (couldn't reach 5/5 charges due to BUG-7)
- Post-combat shop (never reached victory)
- Item application (depends on shop)
- Multi-encounter progression (defeated on first encounter)
- Paid swap (swap after committing to action — only tested free swap)

---

## V2 Playtest (2026-02-10)

### Bugs

#### BUG-13: Heal lowest HP item heals all 3 robots
Post-combat "heal lowest HP robot" item heals all 3 equipped robots instead of only the one with the lowest HP.

#### BUG-14: Enemy robot jumps ~50px on first attack
Enemy robot sprite jumps ~50px to a new position on its first attack animation, then stays at the new offset for the rest of combat. Happens with both 1-enemy and 2-enemy encounters.

#### BUG-15: Multi-enemy layout renders as portraits instead of sprites
2+ enemies render as small circular portraits with colored ring borders and dark backgrounds. Only 1-enemy displays correctly as a full sprite. All enemy counts should render identically — full sprites, no circles — just with adjusted positioning.

#### BUG-16: Ultimate charge timing is delayed
Ultimate charges should increment immediately when a robot attacks (both backend and frontend), not at the end of a full turn cycle.

#### BUG-17: Damage flash only covers scene area
Hit/damage flash animation only covers the combat scene area. Should flash the entire screen for more impact.

#### BUG-18: All enemies flash when one is hit
When attacking an enemy, all enemy robots flash instead of only the targeted one. Flash/animation should only apply to the specific robot that was hit.

#### BUG-19: Befriended robots linger on battlefield
Befriended robots should disappear from the battlefield immediately after the befriend action succeeds.

#### BUG-20: Robot swap UI doesn't update in real time outside combat
Swapping robots outside combat doesn't reflect immediately in the UI. The display becomes stale and confusing until a later refresh.

#### BUG-21: ボット装備 (Bot Equip) button shows nothing
The ボット装備 button on the hub screen does nothing when clicked. Should open a UI showing 3 equipped + 3 reserve robots with swap functionality.

#### BUG-24: JPDB lookup popup doesn't appear when clicking parsed words
The magnifying glass parse still works (words become clickable), but clicking a word no longer shows the lookup popup with word details. Likely z-index, missing popup code, or element not being appended to DOM.

### Features

#### FEAT-1: Animated +XP popup over each robot after combat
Show animated "+XP" text that floats up and fades out over each equipped robot, showing how much XP they received.

#### FEAT-2: Real-time XP and level-up on enemy kill
XP should be awarded immediately when each enemy is killed during combat (not post-combat). Level-ups should happen in real time if threshold is reached.

#### FEAT-3: Allow rearranging equipped robots during combat without reserves
Swap UI should allow rearranging front-line equipped robots during combat even without reserve robots. Currently swap only appears if reserves exist.

#### BUG-22: Dead enemy robots linger on battlefield
When enemy robots are killed, their sprites remain on the battlefield. They should have a death animation (fall/fade/explode) and be removed from the scene.

#### BUG-23: Dead ally robot shows full HP before new sprite loads on auto-swap
When an equipped robot dies and a reserve auto-swaps in, the HP bar immediately shows the new robot's full HP but the old robot's sprite remains until the next action. There's no visual indication of the death or swap-in. Need: death animation/icon for KO'd robot, then swap-in animation for the reserve entering battle. Sprite and HP bar should update together.

#### FEAT-4: Swap-or-release prompt when befriending with full roster
When befriending a robot with 6 bots already (3 equipped + 3 reserves), prompt the player to either:
- **Swap:** pick an existing robot to release permanently and replace with the new one
- **Release:** let the befriended robot go

#### FEAT-6: Inventory button on hub showing persistent equipped items
Add an inventory button above the ボット装備 button on the hub screen (outside combat). Should display all equipped items that provide persistent boosts — not one-time-use consumables. Lets the player see what passive bonuses are currently active.

#### FEAT-7: Intense element-themed ultimate animations
Ultimates currently have no animations. Should have big, visually impactful effects themed to the robot's element (fire explosion, water tsunami, etc.). Must feel significantly more powerful than regular attack animations — bigger effects, longer duration, more screen impact.

#### FEAT-5: Element-typed sound effects for attacks and ultimates
Each element type needs 2 sounds: one for all regular attacks of that type, one for all ultimates of that type. E.g., all fire auto-attacks share one SFX, all fire ultimates share another. Same pattern per element. Keep it simple — one attack SFX + one ultimate SFX per element type.
