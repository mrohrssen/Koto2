# Bug Triage Fixes — Design Spec

**Date:** 2026-03-17
**Scope:** 8 bugs from production playtesting (A3, A4, A5, B1, B2, C1, D1, E1). A1/A2 already fixed.

---

## Execution Strategy

Five subagents grouped by file ownership to eliminate merge conflicts. Two phases:

**Phase 1 (parallel):** S1, S3, S4 — no file overlap
**Phase 2 (parallel):** S2, S5 — after S1 merges (shared `combat-loop.js`)

D1 (charge→mpRestore) is folded into S3 since both touch `post-combat-shop.js`.

| Subagent | Bugs | Files Owned | Phase |
|----------|------|-------------|-------|
| S1 | B1 | `combat-loop.js` (line 252, 2497, 2521), `game.js` (line 1302) | 1 |
| S2 | B2 + E1 | `combat-loop.js` (lines 2470–2583), `routes/game/combat.js` (lines 47–51), `data/npcs.json` | 2 |
| S3 | A3 + A4 + D1 | `game.js` (lines 241–253), `post-combat-shop.js`, `game.css` (shop styles), `data/areas.json`, `item-service.js`, `data/items.json` | 1 |
| S4 | A5 | `game.css` (lines 5123–5129 only) | 1 |
| S5 | C1 | `routes/game/combat.js` (befriend route), `combat-loop.js` (lines 507–514), `loop.js` (line 558) | 2 |

---

## S1: Bug B1 — NPC Skill Attack Card Invisible

### Symptom

NPC combat screen shows blank white box where the NPC skill attack card should appear. NPC skills fire but nothing is visible.

### Root Cause

**CSS class mismatch.** `insertNpcAttackCard()` at `combat-loop.js:252` applies class `sac-row-visible` to reveal card rows. But CSS only defines `.sac-row.sac-visible` (game.css:1234). The NPC attack card HTML is inserted into the DOM but all rows stay hidden because the class doesn't match any CSS rule.

Creature attack cards work because `insertAttackCard()` at `combat-loop.js:169` correctly uses `sac-visible`.

**Secondary issue:** `game.js:1302` defines `showNpcSprite: (name, id) => scene.showNpcTrainer(name, id)` — drops the 3rd `npc` parameter. `showNpcTrainer(npcName, npcId, npc)` at `scene.js:366` uses `npc` to render the NPC's role via `renderJpFirst()`. Without it, role display silently fails.

### Fix

1. **`combat-loop.js:252`** — Change `'sac-row-visible'` to `'sac-visible'`
2. **`game.js:1302`** — Change `(name, id) => scene.showNpcTrainer(name, id)` to `(name, id, npc) => scene.showNpcTrainer(name, id, npc)`
3. **`combat-loop.js:2497`** — Change `showNpcSprite(npcName, npcData.id)` to `showNpcSprite(npcName, npcData.id, npcData)`
4. **`combat-loop.js:2521`** — Change `showNpcSprite(npcName, npc.id)` to `showNpcSprite(npcName, npc.id, npc)`

### Verification

- `node --check public/js/ui/combat-loop.js && node --check public/game.js`
- `npm test` (no regressions)

---

## S2: Bug B2 — NPC Dialogue Shows Raw Japanese + Bug E1 — Hardcoded DM Narration

### B2 Symptom

NPC dialogue shows full unscaffolded Japanese: `実験の途中で変な光が出て…`

### B2 Root Cause

Two problems:

1. **Content:** All ~280 NPC dialogue strings in `data/npcs.json` are raw Japanese with no `{english|kanji|reading}` tags. Per NPC: `greeting` (1), `postCombat.freed` (1), `postCombat.rounds[].npcLine` (3), `postCombat.rounds[].options[].text` (9) = 14 strings × 20 NPCs.

2. **Display:** 4 locations in `combat-loop.js` pass raw text to `narration.showNarration()` without `renderEnFirst()` or `{ html: true }`:
   - Line 2502: greeting
   - Line 2528: freed narration
   - Line 2540: round npcLine
   - Line 2583: response option text

### B2 Fix

**Code changes (4 lines):**

1. `combat-loop.js:2502` — `await narration.showNarration(renderEnFirst(npcData.greeting), { speaker: npcName, html: true })`
2. `combat-loop.js:2528` — `await narration.showNarration(renderEnFirst(freed), { speaker: npcName, html: true })`
3. `combat-loop.js:2540` — `await narration.showNarration(renderEnFirst(round.npcLine), { speaker: npcName, persistent: true, html: true })`
4. `combat-loop.js:2583` — `${renderEnFirst(option.text)}`

**Content generation:**
- Rewrite all 20 NPCs' dialogue in English-first tagged format (`{english|kanji|reading}`)
- Use 10 Opus subagents, 2 NPCs each
- Each NPC's dialogue must match their personality from `npcs.json`
- Format matches `data/prologue.json` (existing tagged text standard)

**Content validation (post-merge):**
After all 10 content subagents complete, run a validation pass on the merged `npcs.json`:
1. Verify all 280 dialogue strings contain valid `{english|kanji|reading}` tag syntax (regex: `\{[^|]+\|[^|]+\|[^}]+\}`)
2. Verify no raw untagged Japanese remains outside of tags (any kanji/hiragana/katakana not inside a tag is a bug)
3. Verify `renderEnFirst()` parses each string without errors
4. Spot-check 2-3 NPCs for tone consistency with their personality data

### E1 Symptom

Combat end shows hardcoded Japanese: `敵が倒れる。「まさか...」最後の言葉が消える。勝利だ。`

### E1 Root Cause

`/combat-end-narration` endpoint at `src/routes/game/combat.js:47-51` returns hardcoded Japanese strings instead of null. Client at `combat-loop.js:2429` already handles null gracefully (`if (narrationResult.narration)` skips display). Additional hardcoded fallbacks exist in the client catch block.

### E1 Fix

1. **`routes/game/combat.js:47-51`** — Replace all three hardcoded Japanese strings with `narration = null`
2. **`combat-loop.js:2470`** — Remove `市民解放！` fallback narration (keep the flow logic, just remove the `showNarration` call)
3. **`combat-loop.js:2482`** — Remove `敗北...` fallback narration

### Verification

- `node --check public/js/ui/combat-loop.js && node --check src/routes/game/combat.js`
- `npm test`

---

## S3: Bug A3 — Area Header Not Scaffolded + Bug A4 — Shop Items Need Scaffolding

### A3 Symptom

Area header shows raw kanji `魔法の学校　高い屋上` with no bootstrap mini-cards.

### A3 Root Cause

`game.js:241,253` uses `dom.areaHeaderName.textContent = areaName` (raw text, no bootstrap). Sub-area rendering at lines 243-246 correctly uses `renderJpFirst()` — the area name was simply never converted.

Data gaps: 4/5 areas have `modifierWord` (okunomori missing). No areas have `locationWord`.

### A3 Fix

**Data (`data/areas.json`):**

Each area name is composed of modifier + particle + location (e.g. `魔法の学校` = `魔法` + `の` + `学校`). The particle varies by area (`の`, `な`, `た`).

Existing area-level `modifierWord` uses `meanings` (array) from JPDB. Sub-area `modifier` uses `meaning` (string) for `renderJpFirst()`. For consistency with the sub-area pattern, add a `meaning` string field alongside the existing `meanings` array.

Add to each area:
- `particle`: the connecting particle (`の`, `な`, `た`)
- `locationWord: { word, reading, meaning, rank }` — string `meaning`, not array

Add to `okunomori` (the one area missing it):
- `modifierWord: { word, reading, meaning, rank, meanings }` matching other areas

Add `meaning` (string) to all 5 existing `modifierWord` objects (first entry from `meanings` array).

Area word data:
| Area | Modifier | Particle | Location |
|------|----------|----------|----------|
| okunomori (奥の森) | 奥 (おく) "inner part; depths" | の | 森 (もり) "forest" |
| shizukana-kouen (静かな公園) | 静か (しずか) "quiet; peaceful" | な | 公園 (こうえん) "park" |
| himitsuno-toshokan (秘密の図書館) | 秘密 (ひみつ) "secret" | の | 図書館 (としょかん) "library" |
| kakureta-hama (隠れた浜) | 隠れた (かくれた) "hidden" | — (built into word) | 浜 (はま) "beach" |
| mahouno-gakkou (魔法の学校) | 魔法 (まほう) "magic" | の | 学校 (がっこう) "school" |

Note: `隠れた` already includes the `た` particle as part of the word form, so `particle` is empty for kakureta-hama.

**Code (`game.js`):**
- Lines 241, 253: Change `dom.areaHeaderName.textContent = areaName` to `dom.areaHeaderName.innerHTML = ...` using `renderJpFirst()` for the area's `modifierWord` + particle + `locationWord`
- Read word data from `run.currentArea.modifierWord` and `run.currentArea.locationWord`
- Insert `run.currentArea.particle` as plain text between the two mini-cards
- Fallback to raw `textContent` if word data is missing

**CSS:**
- Add `white-space: normal` on `.area-header-pill` to allow mini-cards to wrap

### A4 Symptom

Shop shows item names with bootstrap but no `?` help button, no stat summary pills. Description is inline text.

### A4 Root Cause

`post-combat-shop.js:51-67` — name uses `renderJpFirst()` (correct), description uses `renderEnFirst()` inline with no help affordance. All 33 items have `descriptionTagged` — data is ready.

### A4 Fix

**UI pattern:** Copy the existing move help button pattern from `move-select.js:75` (`.move-help-btn`) and popup from `combat-loop.js:427-488` (`onMoveHelpCb`).

**Code (`post-combat-shop.js`):**
1. Add `.shop-help-btn` (`?` circle) to each card — positioned at top-right corner
2. Replace `shop-item-effect` inline text with summary stat pills parsed from `item.effect`. Exhaustive effect key mapping from `item-service.js`:
   - `healPercent` → `💚 +N% HP`
   - `healAllPercent` → `💚 +N% all`
   - `healMostDamaged` → `💚 Full heal (weakest)`
   - `mpRestorePercent` → `🔵 +N% MP` (new D1 type, see below)
   - `field: attackMultiplier` + `value` → `⬆️ ATK +N%`
   - `field: defenseMultiplier` + `value` → `🛡️ DEF +N%`
   - `field: flatDamageReduction` + `value` → `🛡️ -N dmg`
   - `tempBoost` → `⬆️ +N ATK (N turns)`
   - `revivePercent` → `💫 Revive N% HP`
   - `xpMultiplier` → `✨ XP ×N`
   - `xpBalanceStacks` → `⚖️ XP balance +N`
3. Wire `?` tap to new `onItemHelp` callback
4. Build item help popup: name via `renderJpFirst()`, stat pills, description via `renderEnFirst(item.descriptionTagged)`

**CSS (`game.css`):**
- Add `.shop-help-btn`, `.item-help-popup`, `.item-help-backdrop` — model after `.move-help-*` styles at game.css:4601-4661

**Callback wiring (`combat-loop.js`):**
- None needed — S3 adds the popup within `post-combat-shop.js` itself using the same DOM insertion pattern as move-help. No combat-loop changes required.

### D1: Items Reference Dead "Charges" Mechanic (folded into S3)

S3 also handles bug D1 since both touch `post-combat-shop.js`.

**Symptom:** Item "水筒 water bottle" says "Grant +2 charge to one creature." Charges don't exist.

**Root cause:** `applyChargeBoost()` at `item-service.js:63-70` accesses `creature.ultimate.charges` but creatures have no `ultimate` field (0 matches in creatures.json). Throws TypeError. 4 items affected: pork-soup, water-bottle, chocolate (type: charge), strawberry-milk (hybrid heal+charge).

**Fix — replace with `mpRestore`:**

Code (`item-service.js`):
1. Remove `applyChargeBoost()` function (lines 63-70)
2. Remove `chargeBoost` handling from the `heal` type branch (lines 98-101)
3. Replace `charge` type handler (lines 125-130) with `mpRestore`:
   ```js
   if (item.type === 'mpRestore') {
     const alive = allCreatures.filter(r => r.hp > 0);
     for (const creature of alive) {
       const restore = Math.floor((creature.maxMp || 0) * (item.effect.mpRestorePercent || 0));
       creature.mp = Math.min(creature.maxMp || 0, (creature.mp || 0) + restore);
     }
     return { applied: true };
   }
   ```

Note: `applyChargeBoost` iterated ALL creatures (not just one), so `mpRestore` does the same. Item descriptions must say "all creatures" not "one creature" to match actual behavior.

Data (`data/items.json`):
- pork-soup, water-bottle, chocolate: change `type` to `mpRestore`, `effect` to `{ mpRestorePercent: 0.25 }`
- strawberry-milk: remove `chargeBoost` from effect, keep `{ healAllPercent: 0.15 }` only
- Update `description`, `descriptionTagged`, `descriptionJa` for all 4 items to reference MP restore for all creatures

UI (`post-combat-shop.js:34`):
- Replace `charge: '⚡'` with `mpRestore: '🔵'` in `TYPE_ICONS`

Test:
- Add unit test to `tests/unit/item/service.test.js`: `applyItem` with `mpRestore` type restores MP correctly
- Update any existing charge-related tests

### Verification

- `node --check public/game.js && node --check public/js/ui/post-combat-shop.js && node --check src/game/services/item-service.js`
- `npm test`
- Visual verify via Playwright: area header + shop

---

## S4: Bug A5 — Attack Card Furigana Missing on Unknown Words

### Symptom

Attack card shows furigana (はな) for known word 花 but no furigana (かこむ) for unknown word 囲む. Furigana visible on known words, missing on unknown words — the opposite of expected.

### Root Cause

CSS at `game.css:5123-5129`:
```css
.sac-vocab .bs-word:has(.bs-word-en) {
  display: inline;
  border: none;
  padding: 0;
  margin: 0;
}
.sac-vocab .bs-word-en { display: none; }
```

The `:has(.bs-word-en)` selector matches ONLY unknown words (which have a `.bs-word-en` child element). Setting `display: inline` on the `.bs-word` container disrupts `<ruby>` rendering on WebKit — the `<rt>` furigana stops displaying above the kanji.

Known words (no `.bs-word-en` child) don't match this selector, so their ruby renders normally.

The intent of this CSS is correct: suppress the mini-card box styling inside attack cards (the English meaning is already shown separately in `.sac-meaning`). But `display: inline` breaks ruby.

### Fix

Change `game.css:5123-5127` from:
```css
.sac-vocab .bs-word:has(.bs-word-en) {
  display: inline;
  border: none;
  padding: 0;
  margin: 0;
}
```
to:
```css
.sac-vocab .bs-word:has(.bs-word-en) {
  display: inline-block;
  border: none;
  padding: 0;
  margin: 0;
  vertical-align: baseline;
}
```

`inline-block` preserves ruby rendering while still suppressing the mini-card box. `vertical-align: baseline` keeps it aligned with surrounding text.

If `inline-block` still has issues on WebKit, fallback to removing the `display` override entirely and relying on the other properties (border/padding/margin: none) to suppress the visual box.

### Verification

- Visual verification via Playwright (WebKit mode, iPhone 15 Pro emulation)
- Check that: unknown words show furigana, known words show furigana, English annotations are hidden inside `.sac-vocab`

---

## S5: Bug C1 — Talk Button Loops After Failed Befriend Conversation

### Symptom

After a failed befriend conversation, the talk (はなす) button reappears. Clicking it triggers a rejection loop: RNG re-rolls, likely fails again, shows "creature refused!" + enemy counter-attack. Button reappears. Repeat. Feels unresponsive.

### Root Cause

No per-turn befriend guard. `isBefriendAvailable()` at `combat-loop.js:507-514` checks creature combat, no NPC, 1 alive enemy, ≤50% HP — but not whether a befriend attempt already happened this turn. After the server clears `combat.befriendConversation = null` (creature-combat-service.js:752), `startMoveSelection()` re-evaluates and shows the button again.

### Fix

**Server (`routes/game/combat.js` — `/befriend-talk` route, lines 217-278):**
1. After the RNG check (accepted or rejected), set `combat.befriendUsedThisTurn = true`
2. Add guard at top of route: if `combat.befriendUsedThisTurn` is true, return `{ error: 'Already attempted befriend this turn' }`
3. Include `befriendUsedThisTurn` in response state

**Server (`src/game/loop.js` — `creatureCombatCycle()` at line 558):**
- Clear `this.combat.befriendUsedThisTurn = false` at the start of `creatureCombatCycle()`, after the `swapPhase = false` line. This resets the flag when the player commits their next attack/defend action, allowing befriend on the following turn.
- Note: `processMoveTurn` in `creature-combat-service.js` is a pure function and does NOT access `combat` state — the reset must go in `loop.js`.

**Client (`combat-loop.js:507-514`):**
- Add check in `isBefriendAvailable()`: `if (state.combat?.befriendUsedThisTurn) return false`

### Verification

- Add unit test to `tests/unit/combat/creature-combat-service.test.js`: verify `befriendUsedThisTurn` flag behavior
- `node --check src/routes/game/combat.js && node --check public/js/ui/combat-loop.js && node --check src/game/loop.js`
- `npm test`

---

## Testing Strategy

Each subagent runs these checks before declaring done:

1. **Syntax:** `node --check` on every modified JS file
2. **Unit/Integration:** `npm test` (Tier 1 + 2)
3. **Visual bugs (A3, A4, A5):** Note that Playwright verification is needed but should be done as a follow-up pass after all code merges, not per-subagent

No new test files needed. New test cases are added to existing test files:
- `tests/unit/item/service.test.js` — mpRestore type (S3)
- `tests/unit/combat/creature-combat-service.test.js` — befriendUsedThisTurn flag (S5)

## Merge Order

1. **Phase 1:** S1, S3, S4 complete and merge (no conflicts)
2. **Phase 2:** S2, S5 start after Phase 1 merges (they touch `combat-loop.js` which S1 modified)
3. **Content subagents:** 10 NPC dialogue writers run during Phase 2 code work, merge into `data/npcs.json` after S2 code changes land
4. **Validation pass:** Run NPC dialogue validation after all content merges
5. **Visual pass:** Playwright verification of A3, A4, A5 after all code merges
