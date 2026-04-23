# Rest Action + "Not Enough MP" Popup — Design

**Date:** 2026-04-23
**Status:** Spec

## Problem

During combat, creatures run out of MP and get stuck — the only recovery path today is party-wide Defend (50% damage reduction + MP regen) or consuming an MP item. When a creature is dry and the party isn't under threat, Defend wastes a turn; when items are scarce, the player has no per-creature recovery move. This also lets a player spam the most powerful move every turn with no attrition cost.

Additionally, clicking an unaffordable move today does nothing — no click handler is attached when `canAfford === false`. The player receives no feedback on *why* a move won't fire.

## Goals

1. Give every creature a per-turn way to restore MP.
2. Introduce MP attrition as a real decision (spam strong moves → must rest later).
3. Replace the silent dead-click on unaffordable moves with clear visual feedback.

## Non-goals

- Changing Defend, Befriend, or the existing enemy-attack pipeline.
- Adding Rest to `data/moves.json` or the learnset / move-forge flow.
- Modifying PvP combat separately — Rest must work in PvP automatically via the shared move-select + attack-card path (PvE/PvP parity rule).

## Design

### 1. Rest as a synthetic pseudo-move

Rest is a pseudo-move object constructed at render time. It is **not** stored in `creature.moves`, **not** in `data/moves.json`, **not** in any creature's learnset. This keeps it out of the move-learn flow (it can never be swapped out) and avoids a data migration.

Canonical shape (defined once, shared between client and server):

```js
export const REST_MOVE = {
  id: 'rest',
  name: '休む',
  reading: 'やすむ',
  nameEn: 'rest',
  element: 'neutral',
  category: 'heal',
  target: 'self',
  mpCost: 0,
  isRest: true,
};
```

`entityToToken(REST_MOVE)` + `renderJpSentence` renders this like any other move — headword `休む` with furigana `やすむ`, English `rest`. Hiragana/kanji display follows the player-progress rule already handled by `renderJpSentence` (kanji rendered for Area 4+, hiragana for Areas 1–3). No special-casing required.

**Sprite:** `/assets/sprites/actions/rest.webp` — one sprite needed. If missing, the existing `onerror` fallback shows the heart icon (`category: 'heal'`).

**Effect pill (card layout):** the pill line normally reads `<mpCost> MP | <effect.text>`. For Rest: `0 MP | +20% MP` so the card advertises the swap in one glance.

### 2. Grid layout

`move-select.js` appends Rest as the 4th cell after a creature's real moves. It is always present, always visible, always a move-sized cell.

```
[ Move 1 ] [ Move 2 ]
[ Move 3 ] [ 休む   ]
```

If a creature has fewer than 3 real moves (edge case — normally creatures have 3), Rest still sits at position 4; intervening slots may be empty, which matches today's rendering.

The Split (はなす / アイテム) and Befriend cells are no longer in the grid (removed in prior work), so Rest does not interact with them.

### 3. Rest's behavior in the turn

- **Per-creature** — only the resting creature is affected. Other creatures that picked moves attack normally.
- **MP restore** — `creature.mp = min(creature.maxMp, creature.mp + ceil(creature.maxMp * 0.20))`. Applied **before** enemy attacks resolve so the creature ends the round with the bonus even if KO'd mid-round.
- **Attack skipped** — the resting creature does not attack.
- **Enemies attack at full damage** — Rest is MP recovery only. It is not a defense action. If the player wants damage mitigation, they pick Defend.
- **Not blocked by status** — silence, seal, or move-locking effects do not block Rest (it is not a move).
- **Speed / turn order** — Rest resolves in the resting creature's normal turn slot.

### 4. Full-MP interaction

Rest is **always clickable** — no `.disabled` state when at full MP. When clicked with `creature.mp >= creature.maxMp`:

- Show an event popup at the Rest cell: **"Fully rested!"** — cyan `#4FC3F7`, sized like the type-effectiveness popup.
- Do not consume the turn.
- Do not transition away from move-select — the player picks again.

Uses the existing `event-popup.js` helper for consistent styling.

### 5. Client → Server contract

Extend the existing `moveChoices` array instead of adding a new top-level `actionType`. Rest is per-creature, not party-wide, so it belongs inside the attack cycle alongside other creatures' moves.

```js
// Existing attack entry (unchanged):
{ creatureIndex, moveId, targetIndex }

// New Rest entry:
{ creatureIndex, action: 'rest' }
```

Server endpoint `POST /api/game/creature-combat-cycle` continues to accept `actionType: 'attack'` for the mixed-move turn. Inside the combat cycle service, for each `moveChoices` entry with `action === 'rest'`:

1. Compute `restore = Math.ceil(creature.maxMp * 0.20)`.
2. `creature.mp = Math.min(creature.maxMp, (creature.mp || 0) + restore)`.
3. Emit a `rest` event (see §6) so the client can animate it.
4. Skip any attack resolution for that creature (no damage, no STAB, no effectiveness, no target).

Server must validate: if `creatureIndex` is out of range or the creature is KO'd, ignore the entry (same as how invalid attack entries are handled today).

Party-wide Defend (`actionType: 'defend'`) and Befriend (`actionType: 'befriend'`) remain unchanged.

### 6. Rest animation — full parity with the attack card

Rest runs through the **same split attack card pipeline** every other move uses. The player experience is: card pops up → sound → effect → number → tap → next creature. This keeps combat pacing consistent and satisfies the PvE/PvP parity rule (the shared attack card handles both).

Card content for Rest:

- **Attacker:** the resting creature
- **Move:** `休む` (rendered via `renderJpSentence([entityToToken(REST_MOVE)], ...)`)
- **Target:** the same creature (`target: 'self'` — pattern already supported by self-targeting / `single_ally` moves)
- **Number slot:** shows `+N MP` in cyan (`#4FC3F7`) instead of damage red. Branch on `move.isRest === true` in the number-rendering path.
- **Effectiveness tag:** omitted for Rest (no STAB, no type effectiveness — it is not damage).
- **Sound:** reuse an existing healing/rest sound. If none fits, a neutral "restore" tone is fine.

The server's combat-cycle result already returns a per-creature event list that the client iterates through to drive the attack card. Add a new event type:

```js
{ type: 'rest', creatureIndex, mpGained, mpBefore, mpAfter }
```

The client orchestrator sees `type: 'rest'` and routes to the Rest attack-card branch (which swaps the damage number for the MP gain).

### 7. "Not Enough MP!" popup (for real moves)

Today, `buildMoveCell` adds the `.disabled` class when `canAfford === false` and the click handler is **only** attached when `canAfford === true`. Dead-click, no feedback.

Change:

1. Always attach a click handler to every move cell.
2. If `canAfford` → existing path (play word, call `onMoveSelect`).
3. If not → fire an event popup anchored at the cell and return without advancing:

```js
// new export in public/js/ui/event-popup.js
export const notEnoughMp = (el) => showEventPopup(el, 'Not enough MP!', {
  color: '#4FC3F7',
  particles: 0,
  size: 'large',
  duration: 1200
});
```

Same visual language as type effectiveness. No turn consumed, no move fired. The `.disabled` class stays (keeps the visual dim), it just no longer gates the click handler.

### 8. i18n

- `"Fully rested!"` and `"Not enough MP!"` strings go through the existing `t(...)` i18n layer. Add keys `combat.fullyRested` and `combat.notEnoughMp`.
- Japanese display of 休む / やすむ / rest is rendered by `renderJpSentence` — no i18n layer involvement (it IS the language being learned).

### 9. Dictionary entry

Add 休む to `data/dictionary.json` if it is not already present:

- Surface: `休む`
- Reading: `やすむ`
- Meaning: `to rest` (primary dictionary definition — intransitive)
- Follow the project's dictionary-accuracy rule: single primary meaning, no embellishment.

**Per CLAUDE.md:** the dictionary must not be modified without explicit user confirmation. The implementation plan must surface this step as a gated task — the implementer presents the proposed entry and waits for approval before writing.

## Files touched (anticipated)

- `public/js/ui/move-select.js` — append Rest cell, always-attached click handler, `notEnoughMp` popup on disabled-click
- `public/js/ui/event-popup.js` — export `notEnoughMp` helper (and `fullyRested` if we factor one out)
- `public/js/ui/attack-card.js` — branch on `move.isRest` to render `+N MP` in the number slot
- `public/js/ui/combat-loop.js` — handle `{ action: 'rest' }` in `handleMoveSelected`; route `type: 'rest'` events through the attack-card orchestrator
- `public/js/ui/combat-vfx.js` — Rest card branch if needed for number-slot rendering
- `src/game/services/creature-combat-service.js` — process `action: 'rest'` entries in the moveChoices loop; emit `rest` events
- `src/game/moves.js` (or equivalent) — export `REST_MOVE` shared constant
- `public/js/ui/bootstrap-client.js` — no change expected; `entityToToken` already handles the shape
- `public/assets/sprites/actions/rest.webp` — new sprite (fallback handles absence)
- `data/dictionary.json` — add 休む entry (gated on user approval)
- `src/locales/en.json` (and other locale files) — add `combat.fullyRested`, `combat.notEnoughMp` keys

## Testing

### Unit (Tier 1)

- `creatureCombatService.applyRest(creature)` — restores `ceil(maxMp * 0.20)`, clamps at `maxMp`.
- `creatureCombatCycle('attack', moveChoices)` with mixed entries (2 attacks + 1 rest) — 2 attacks resolve, 1 rest restores MP, enemy counter still fires.
- `creatureCombatCycle('attack', [{ creatureIndex: 0, action: 'rest' }])` on a creature already at `maxMp` — MP stays at `maxMp`, no error, `rest` event still emitted with `mpGained: 0` so the client can decide what to show (though the client won't reach this path — it shows "Fully rested!" before dispatching).
- Rest entry with invalid `creatureIndex` — ignored, no crash.
- Rest entry for a KO'd creature — ignored.

### Integration (Tier 2)

- Full turn: POST `/api/game/creature-combat-cycle` with `actionType: 'attack'` and mixed moveChoices including rest → response contains attack events, rest event, enemy attack events in correct order.
- State snapshot after the turn reflects correct MP values.

### Manual / Playwright

- Visual screenshot of the 4-cell move grid (3 moves + Rest).
- Click Rest card flow — card animates, `+N MP` number pops, creature MP bar updates.
- Click unaffordable move → "Not enough MP!" popup appears; creature has not moved; player can re-pick.
- Click Rest when at full MP → "Fully rested!" popup; turn not consumed; player re-picks.
- Run in PvP (shared attack-card path) — Rest works identically.

## Risks & open questions

- **Balance:** 20% of maxMp per turn is a round number. If playtesting shows spam-resting is optimal (e.g., rest every other turn is better than attacking), we may need to gate Rest (once per combat, cooldown, or partial heal). Spec ships the 20% number; balance tuning happens post-implementation.
- **Status interaction:** if a future status effect needs to block Rest (e.g., a hypothetical "exhausted" status), we add a single check. Out of scope now.
- **Attack-card number slot branching:** the current card likely assumes a damage number. The plan must audit `attack-card.js` carefully for assumptions (damage color, effectiveness tag, damage particles) and cleanly branch on `isRest`. If the branching is invasive, it's a signal to refactor the card's number-slot into a small helper.
- **Sound asset:** a rest/heal sound may already exist for healing moves. Implementation should reuse it; if none exists, a minor placeholder is acceptable (not a blocker).

## Out of scope

- Rest as a learnable move or a move-forge candidate.
- Party-wide rest (use Defend for that class of action).
- Replacing Defend.
- Changes to MP regen from skills or items.
- Balancing Rest's 20% against specific creatures or elements.
