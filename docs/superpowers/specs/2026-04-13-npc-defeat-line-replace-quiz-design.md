# NPC Defeat Line — Replace Post-Combat Quiz

**Date:** 2026-04-13
**Status:** Approved

## Problem

The post-combat NPC dialogue quiz (3 rounds of tone-scored responses) is painful UX friction between winning and getting the skill reward. The quiz content isn't doing meaningful language teaching — it's either AI-generated cached dialogue or hardcoded English defaults, neither of which go through the i+1 frames pipeline.

## Solution

Replace the post-combat quiz with a single i+1-validated defeat line from a new shared `npcDefeat` frame pool. The line is shown in the existing narration box, player taps to dismiss, then goes straight to skill selection. The quiz system stays intact (dormant) for future reintroduction when players graduate to AI dialogue.

## Design

### Content: Shared npcDefeat Frame Pool

~18 authored frames in `data/dialogue/frame-sources.json` under category `npcDefeat`. No `group` field — shared across all NPCs (like `shopGreeting`).

**Scaling by content word count:**
- **1 content word (3-4 lines):** Pure reinforcement for early players
- **2 content words (4-5 lines):** Simple combinations
- **3-4 content words (5-6 lines):** Glue words connect ideas
- **5-6 content words (4-5 lines):** Near-sentences for advanced players

**Authoring rules:**
- All content words in dictionary form (base/lemma). No conjugated content words.
- Minimal basic glue allowed (て, です, は, が, を, に, etc.) to connect content words.
- Raw text written in kanji for Sudachi tokenization.
- Every content word must exist in `data/dictionary.json`.
- `{randomPlayerCreature}` slot available but not required on every line — used in maybe 5-6 of 18 lines.

**Slot: `{randomPlayerCreature}`**
- Picks a random creature from the player's **active party** (not reserve).
- Resolved at assembly time via `assembleFrame()` + `entityToToken()`, same as `{item}` in shopPurchase.
- Entity words get the +1 allowance (2 unknowns instead of 1 per sentence).

The i+1 filter automatically selects the right complexity per player. Early players see 1-word lines; as vocab grows, longer lines become eligible.

### Route: `/api/game/npc-dialogue-start` — The Gateway

This route stays as the post-combat entry point. Its behavior changes now but is designed for future quiz graduation.

**Current behavior (v1 — defeat line):**

1. Load shared `npcDefeat` pool via new `getNpcDefeatFrames()` accessor in dialogue-loader.
2. Get player's known words from FSRS.
3. Pick a random creature from the player's active party (not reserve) for `{randomPlayerCreature}` slot.
4. For each frame in the pool: call `assembleFrame(frame, { randomPlayerCreature: creatureEntity })`. Frames without the slot pass through unchanged (assembleFrame skips unfilled slots). Spread the source frame's `raw` and `id` onto the assembled result so filtering/dedup works.
5. Filter assembled candidates using `isEligible(candidate.tokens, knownWords)` — the same pattern used by the shop flow in `run.js:707-718`. Score eligible candidates with `scoreCandidate()`. Pick from top-scoring candidates randomly.
6. **Do NOT set `gameManager.run.npcDialogue`.** The defeat line bypasses the npcDialogue state entirely. Setting it would trap the phase machine in `NPC_DIALOGUE` (phase-machine.js:190 checks `run.npcDialogue?.active` before `skillSelectionPending`).
7. Set `currentRoom.npcBattle.skillSelectionPending = true` directly.
8. Return response:
```json
{
  "mode": "defeat_line",
  "npc": { "id": "...", "name": "...", "nameEn": "...", "speakerId": "..." },
  "line": { "tokens": [...], "raw": "..." }
}
```

**New imports needed in combat.js:**
- `getNpcDefeatFrames` from `dialogue-loader.js`
- `assembleFrame`, `isEligible`, `scoreCandidate` from `token-format.js`

**Future behavior (v2 — quiz graduation):**

1. Same route checks if player qualifies for AI dialogue.
2. If yes: set `run.npcDialogue` as before, return `{ mode: 'quiz', rounds: [...] }` (reactivate current quiz system).
3. If no: return defeat line as v1.

**Bond system note:** Bond changes are deferred until quiz graduation. NPC defeats with v1 defeat lines do not modify bond values or record encounters.

### Frontend: `runNpcDialogue()` in combat-loop.js

Branches on `response.mode`:

- `'defeat_line'`: Show the line in the existing narration box. Player taps to dismiss. Phase transitions to `npc_skill_selection`. No calls to `/npc-dialogue-respond`.
- `'quiz'` (future): Run the current multi-round quiz flow. Dormant code reactivated.

### Dialogue Loader Changes

In `src/game/dialogue-loader.js`:
- New partition: `_npcDefeatFrames = _frames.filter(f => f.category === 'npcDefeat')`
- New accessor: `getNpcDefeatFrames()` — returns the array (same pattern as `getShopGreetingFrames()`).

### Phase Machine

No changes needed. By NOT setting `run.npcDialogue`, the phase machine skips the `NPC_DIALOGUE` check (phase-machine.js:190) and falls through to the `NPC_SKILL_SELECTION` check (phase-machine.js:209) which triggers on `skillSelectionPending = true`.

### What Stays Dormant (Not Deleted)

- `POST /api/game/npc-dialogue-respond` route — not called but kept for future quiz.
- `handleNpcDialogueResponse()` in npc-service.js — bond calculation logic preserved.
- `shuffleOptions()` in npc-service.js — quiz option shuffling preserved.
- Bond system (`updateBond`, `recordEncounter`) — not called but kept.
- All AI dialogue cache infrastructure — untouched.

### What Doesn't Change

- Skill selection screen and routes (`/npc-battle-skill-offers`, `/npc-battle-skill-choose`).
- Pre-combat fightStart/defeatLine bootstrap in `/start-creature-encounter` (separate system).
- Phase machine logic.
- Per-NPC frame-sources entries (fightStart, defeatLine slots in existing NPC frames).
- Friendly NPC / shop greeting flow.
- Frame pipeline tools (tokenize-static.js, validate-dialogue.js).

## File Changes

| File | Change |
|------|--------|
| `data/dialogue/frame-sources.json` | Add ~18 `npcDefeat` category frames |
| `data/dialogue/frames.json` | Regenerated via `node scripts/tokenize-static.js` |
| `src/game/dialogue-loader.js` | Add `_npcDefeatFrames` partition + `getNpcDefeatFrames()` accessor |
| `src/routes/game/combat.js` | Rewrite `/npc-dialogue-start` to load shared pool, assemble, filter, return single line with `mode: 'defeat_line'` |
| `public/js/ui/combat-loop.js` | Update `runNpcDialogue()` to branch on `response.mode`, show single narration for `defeat_line` |
| `scripts/validate-dialogue.js` | May need update if npcDefeat has different word-count rules than barks |

## Testing

- Run `node scripts/tokenize-static.js` after authoring frames.
- Run `node scripts/validate-dialogue.js` to verify all content words in dictionary.
- Run `npm test` for unit + integration.
- Manual playtest: defeat an NPC, verify defeat line shows in narration, tap to dismiss, skill selection appears.
