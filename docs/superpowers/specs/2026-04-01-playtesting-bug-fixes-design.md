# Playtesting Bug Fixes — March 31 Dev Build

**Date:** 2026-04-01
**Source:** 11 bug reports from dev Railway (March 31 playtest session)
**Scope:** 10 fixes (Bug 1 already fixed, Bug 11 deferred to separate perf investigation)

## Bug Inventory

| # | Summary | Type | Severity |
|---|---------|------|----------|
| 2 | Start button renders raw HTML tags as text | Bug fix | High |
| 3 | Friendly NPC shows no dialogue, uses static header | Small feature | Medium |
| 4 | Action buttons persist after NPC item target selection | Bug fix | Medium |
| 5 | Old NPC skill text announcement shows before attack card | Dead code removal | Medium |
| 6 | Dead enemies shrink instead of fully disappearing | CSS fix | Medium |
| 7 | Target selection uses non-standard layout | Layout fix | Medium |
| 8 | STAB indicator too subtle + counter attack needs slam animation | UX improvement | Low |
| 9 | Befriend options don't match last killed creature | Logic fix | High |
| 10 | Dead creature still takes combat turns | Logic fix | Critical |
| 12 | Dead creatures gain XP in non-combat rooms and revive on level-up | Logic fix | High |

## Fix Order

Ordered from quickest/safest to most complex. One commit per fix.

---

### Fix 1: Bug 6 — Dead enemies disappear instead of shrinking

**File:** `public/game.css`

**Root cause:** `.enemy-formation .formation-slot.defeated` uses `opacity: 0; transform: scale(0.5)` transition, but the element stays in layout at reduced scale — visible as a tiny remnant.

**Fix:** After the opacity/transform transition completes, set `display: none` or `visibility: hidden`. Either use a CSS animation with `forwards` fill that ends at `display: none`, or add a `transitionend` listener in JS. Simplest approach: switch to a keyframe animation ending with `display: none`.

---

### Fix 2: Bug 2 — Start button renders raw HTML

**File:** `public/js/ui/exploration.js` (area selection rendering)

**Root cause:** The "Start Run" button label contains `<span class="bs-word"><ruby>...</ruby></span>` HTML markup, but somewhere in the rendering path it's being assigned via `textContent` instead of `innerHTML`. The standard `renderButtons()` in ui-components.js uses `innerHTML` correctly — so the issue is likely in how the label string is constructed or passed.

**Fix:** Trace the exact rendering path for the start button on the area_selection / team selection screen. Ensure the label HTML is rendered via `innerHTML`, not `textContent`.

---

### Fix 3: Bug 5 — Remove old NPC skill text announcement

**File:** `public/js/ui/combat-loop.js` lines 1868-1871

**Root cause:** `showNpcSkillAttacksAnimated()` explicitly shows an old-style text announcement (`"NPC uses Skill!"`) in the action area with a 600ms delay, THEN shows the proper split attack card via `insertNpcAttackCard()`. Regular creature attacks don't have this — only NPC skill attacks.

**Fix:** Remove lines 1868-1871 (the text announcement + delay). The split attack card already contains all the information (NPC name, skill name, target, damage).

---

### Fix 4: Bug 4 — Clear action buttons after NPC item target selection

**File:** `public/js/ui/exploration.js` lines 1134-1152

**Root cause:** After selecting a creature to receive the NPC item, the `apiChooseFriendlyNpcItem` call completes and calls `updateUI()`, but the creature selection cards can persist if the phase transition doesn't fully re-render the action area.

**Fix:** Explicitly clear the action area (`actions.clear()` or `dom.actionArea.innerHTML = ''`) before calling `updateUI()` in the success path after the API call.

---

### Fix 5: Bug 7 — Target selection uses standard cards, full width

**File:** `public/js/ui/target-select.js`

**Root cause:** target-select.js already uses the standard `renderChoices()`, but wraps it with a custom `.target-header` div and separate `btnContainer` for the Back button. No other screen does this pattern. The header creates visual inconsistency.

**Fix:** Remove the custom `.target-header`. Use the narration box (or a subtle label within the card context) for the move name. Ensure cards render full-width matching other `renderChoices()` usage (friendly NPC items, post-combat shop, etc.). Keep the Back button but render it consistently via `renderButtons()` without a separate container div.

---

### Fix 6: Bug 3 — NPC shop greeting + remove static header

**Files:** `public/js/ui/exploration.js`, NPC data files

**Root cause:** `renderFriendlyNpc()` shows a static header "フレンドリーNPC / Choose a gift." but no actual NPC dialogue. The NPC sprite appears on screen silently.

**Design:**
1. Add a `shopGreetings` array to NPC data — each NPC can have multiple greetings, one is picked randomly. Default fallback: `["こんにちは！"]`
2. Before showing item cards, display the greeting via `narrationBox.show()` with the NPC's name as speaker (same pattern as NPC battle greeting in `room-transition.js:243`)
3. Remove the static "フレンドリーNPC / Choose a gift" header text entirely — all communication should be through dialogue
4. After greeting is dismissed, show item cards directly

---

### Fix 7: Bug 10 — Dead creature still takes combat turns

**File:** `src/game/services/creature-combat-service.js`

**Root cause:** The enemy turn loop checks `if (enemy.hp <= 0) continue;` but a creature can die mid-turn (from counter-attacks, status effects, or other damage) while the loop already iterated past the HP check. The stale state allows a dead creature to execute its attack.

**Fix:** Add a defensive `hp <= 0` check immediately before attack execution, not just at loop entry. Also re-check after effects/counters resolve within the same turn.

---

### Fix 8: Bug 9 — Befriend options match last killed creature

**File:** `src/game/services/creature-combat-service.js` (generateBefriendQuiz)

**Root cause:** The befriend quiz may trigger on a creature other than the one the player just killed. The quiz generates wrong-answer options from the global creature catalog, and the target creature may not match the player's expectation.

**Fix:** Ensure the befriend quiz always targets the creature that was just killed. The kill event should pass the killed creature's ID/reference directly to the quiz generator. Wrong-answer options should come from other creatures in the current encounter (not the global catalog), so options are contextually relevant.

---

### Fix 9: Bug 8 — "Super effective!" center screen + counter slam

**Files:** `public/js/ui/combat-loop.js`, `public/js/ui/combat-effects.js`, `public/game.css`

**STAB redesign:**
- Remove the current `.stab-indicator` (tiny gold text in corner)
- Show **"Super effective!"** as a large center-screen announcement
- Animation: scale in from 1.5x to 1x, hold briefly, fade out
- Position: centered over the battle scene, above the action area
- Style: bold, bright color (gold or element-matched), text shadow for readability

**Counter slam animation:**
- When a counter-attack fires, animate the defending creature sprite forward toward the enemy
- Sequence: defender pops forward (translateX toward enemy) -> damage number on target -> defender returns to position
- Use existing animation infrastructure: `recoil()` pattern but in reverse direction
- Add to `showCounterAttacks()` before the damage number display

---

### Fix 10: Bug 12 — Dead creatures excluded from XP, alive get more

**Files:** `src/game/services/exploration-service.js`, `src/game/creatures.js`

**Root cause:** Three XP award locations skip the alive check:
- `completeWhackAMole()` — awards XP to all creatures (active + reserves) without HP check
- `useShrine()` — no HP check before leveling selected creature
- `useQuizReward('levelup')` — no HP check before leveling

`addXpToCreature()` line 198 does `creature.hp += hpDiff` on level-up, which resurrects dead creatures (0 + 10 = 10).

**Fix:**
1. **Whack-a-Mole:** Filter dead creatures (`hp <= 0`) before XP distribution. Total XP stays the same — alive creatures each get more since the pool is split among fewer recipients.
2. **Shrine:** Add `hp <= 0` guard — don't allow selecting a dead creature for shrine bonus. Show error or skip dead creatures in the selection UI.
3. **Quiz reward (levelup):** Same guard — don't allow selecting dead creatures.
4. **Defensive guard in `addXpToCreature`:** If `creature.hp <= 0`, still accumulate XP and level up (so they don't fall behind permanently), but skip the `creature.hp += hpDiff` line — dead creatures stay dead regardless of stat changes.

---

## Out of Scope

- **Bug 1 (flickering):** Already fixed in recent build
- **Bug 11 (performance lag):** Deferred to separate deep-dive profiling session
- **Full NPC dialogue system for friendly NPCs:** Deferred — using simple `shopGreetings` array for now
