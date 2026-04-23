# Attack Result card redesign

**Date:** 2026-04-23
**Owner:** michia

## Problem

The split attack card (`.split-attack-card` in `public/js/ui/attack-card.js` and `public/game.css`) still shows a "BASE" row derived from the creature's base word (`attackerBaseWord` / `attackerBaseReading` / `attackerBaseMeaning`). That base-word concept has been dropped from the game's vocab model. The card also crams three vocab elements into a horizontal strip, which reads as dense and decorative rather than informational.

The new card must surface only the three facts that matter after an attack:

1. **Who attacked** (attacker)
2. **What they attacked with** (move)
3. **What happened to whom** (target + result)

Each of those words is a vocab teaching opportunity and must render through `renderJpSentence` so the player sees hiragana reading, romaji (via ruby `rt`), and the English gloss.

## Goal

Replace the innards of the existing card with a 3-block vertical layout that maps 1:1 to attacker / move / target, plus a right-aligned result (HP number + effectiveness line) on the target row. Keep the exported JS API and the existing animation / tap-to-dismiss behavior so callers in `combat-loop.js`, `combat-vfx.js`, and any future PvP paths don't move.

## Non-goals

- No changes to the attack payload shape. The server already sends everything the new card needs (`damage`, `healAmount`, `effectApplied`, `statChangesApplied`, `elementMultiplier`, attacker / move / target name triples).
- No cleanup of `attackerBaseWord` / `attackerBaseReading` / `attackerBaseMeaning` server-side or in TTS. Other code paths still read those fields; removing them is a separate task.
- No critical-hit rendering (crits don't exist in this game).
- No STAB rendering (passive math bonus; not a surprise the player needs to understand).
- No change to effect VFX, sprite shake, screen-shake, sounds, or damage-number overlays.

## Visual layout

```
┌──────────────────────────────────────┐
│ [sprite 64×64]  ひ                   │
│                hi                    │
│                fire                  │
│                               »      │ ← chevron, absolute,
│ ──────────────────────────────────── │   pinned right
│ [sprite 64×64]  ほのお               │
│                honoo                 │
│                flame                 │
│                               »      │
│ ──────────────────────────────────── │
│ [sprite 64×64]  き          -18 HP   │
│                ki    (Super effective!)│
│                tree                  │
│ ──────────────────────────────────── │
│          tap to continue             │ ← tinted strip, ~22px
└──────────────────────────────────────┘
```

Concrete sizing, decided during visual iteration:

- Card width: ~300px, rounded corners, 1px border colored by attacker element (existing `ELEMENT_THEME` map).
- Sprite tile: 64×64 with 60×60 image, `var(--sac-bg)` background, element-accent border.
- Hiragana reading: 24px, weight 600. `ruby-align: start` + `rt { text-align: left }` so romaji left-aligns over the reading.
- Ruby `rt` (romaji): 11px, weight 400, entity-blue.
- English gloss (`jp-stack-en`): 11px, weight 500, entity-blue.
- In this card only, the real renderer's absolute positioning for `.jp-stack-en` is overridden: the gloss flows in a vertical flex column under the ruby so the word group has an honest height that centers with the sprite tile.
- Down arrow: `»` rotated 90°, 28px, weight 300, accent color, letter-spacing -4px so the two chevrons tighten. `text-shadow: 0 1px 2px rgba(0,0,0,0.08)`. Positioned `right: 24px; bottom: -14px` on rows 1 and 2, hidden on row 3. Small white padding behind the glyph so it reads cleanly over the divider.
- Tap-to-continue strip: 22px tall, flex-centered, divider above, tinted background `rgba(49,183,224,0.08)`, 10px text, the existing `▼` glyph (sized down to 8px via `::before` so it optically centers with the text).
- The left-column sprite split (`.sac-left` / `.sac-right`) from the old card is deleted entirely — the new card is a single column of rows.

## Component structure

Rendered HTML (simplified):

```html
<div class="split-attack-card" style="--sac-border:...; --sac-bg:...; --sac-accent:...;">
  <div class="sac-row" data-row="0">
    <div class="sac-sprite-tile"><img src="{attacker sprite}"></div>
    <div class="sac-body">{renderJpSentence attacker}</div>
    <span class="sac-down-arrow">»</span>
  </div>
  <div class="sac-row" data-row="1">
    <div class="sac-sprite-tile"><img src="{move action icon}"></div>
    <div class="sac-body">{renderJpSentence move}</div>
    <span class="sac-down-arrow">»</span>
  </div>
  <div class="sac-row" data-row="2">
    <div class="sac-sprite-tile"><img src="{target sprite}"></div>
    <div class="sac-body">
      {renderJpSentence target}
      <div class="sac-result">
        <span class="sac-result-value {tone}">{value}</span>
        <span class="sac-effectiveness {tone}">{effectiveness}</span>
      </div>
    </div>
  </div>
  <div class="sac-continue-strip">
    <span class="sac-continue">tap to continue</span>
  </div>
</div>
```

Class names keep the `sac-` prefix so existing selectors / tests that reference `.split-attack-card` and `.sac-row` continue to work for the row-stagger animation. Other old classes (`.sac-left`, `.sac-right`, `.sac-tag`, `.sac-tag-base`, `.sac-tag-atk`, `.sac-impact`, `.sac-impact-arrow`, `.sac-impact-name`, `.sac-impact-text`, `.sac-attacker-name`, `.sac-action-icon`, `.sac-meaning`, `.sac-sprite`, `.sac-text-sprite`, `.sac-damage`, `.sac-heal`) are removed.

## Word rendering

Each of the three blocks renders its word via `renderJpSentence([entityToToken(entity)], getKnownWords(), new Map())` — identical to the call the current card already uses for the skill-name row. Tokens:

- **Attacker:** `{ name: attackerNameJp, reading: attackerNameReading, nameEn: attackerName }` — creatures have readings already on them; fall back to existing fields if a reading is missing.
- **Move:** `{ name: attackerSkillName || moveName, reading: attackerSkillReading, nameEn: attackerSkillEn || moveNameEn }`.
- **Target:** `{ name: targetNameJp, reading: targetNameReading, nameEn: targetName }`.

For known words, `renderJpSentence` drops the English gloss automatically — the card doesn't need a branch for that. For unknown entity words, the blue entity-tinted gloss appears.

Attacker reading field currently isn't on the payload as a top-level `attackerReading` — it's only on the creature object server-side. If that's missing for a given attack payload, the card will pass `reading: undefined` and `renderJpSentence` falls back to the surface. We'll verify during implementation whether we need to extend the server payload with `attackerReading` / `targetReading`; if so, it's a small addition in `buildAttackRecord()` at `src/game/services/creature-combat-service.js`.

## Result block

The result sits inside the target row's `.sac-body`, flex-aligned to the right. It's a two-line column: value on top, effectiveness on bottom. Both columns (word and result) are vertically centered in `.sac-body` with `align-items: center`, which naturally puts the big value (`-18 HP`) at the same line as the big hiragana (`き`).

Category mapping (dispatched client-side from `atk.category` + payload fields):

| Category | Value | Tone class | Effectiveness line |
|---|---|---|---|
| `damage` | `-{damage} HP` | `sac-tone-damage` (red) | see effectiveness table |
| `heal` | `+{healAmount} HP` | `sac-tone-heal` (green) | hidden |
| `buff` | first stat key as `{STAT} +{n}` (e.g. `DEF +1`) | `sac-tone-buff` (blue) | hidden |
| `shield` | `{STAT} +{n}` if statChangesApplied, else `Shielded!` | `sac-tone-buff` (blue) | hidden |
| `debuff` | `{STAT} {±n}` if statChangesApplied, else capitalized `effectApplied` (e.g. `Confused!`) | `sac-tone-debuff` (purple) | hidden |
| `drain` | `-{damage} HP` with secondary small line `+{healAmount} HP self` | `sac-tone-damage` (red) | see effectiveness table |

Stat key display uses the existing `SC_NAMES` map from `public/js/ui/combat-ui-utils.js` that the current card already imports. Multi-stat debuffs (rare) show only the first key — we already do this client-side today via `Object.entries(...).map(...).join(' ')`, but in the new card we keep it to one to fit the space.

## Effectiveness line (damage / drain only)

Derived client-side from `atk.elementMultiplier`:

| `elementMultiplier` | Text | Class |
|---|---|---|
| `> 1` | `(Super effective!)` | `sac-fx-super` — accent red |
| `=== 1` | not rendered | — |
| `> 0 && < 1` | `(Not very effective…)` | `sac-fx-weak` — muted gray |
| `=== 0` | `(No effect!)` | `sac-fx-none` — muted gray |

STAB (`atk.stab`) has no visible effect on this card. Critical hits don't exist.

## Self-targeting moves

For heal / buff / shield on self (and any future self-targeting `debuff`), the target row's sprite and word tokens come from the attacker's own fields. Sprite is **not** flipped. The 3-block structure is preserved; attacker and target rows visually match.

Condition: `atk.targetId === atk.attackerId` and `atk.targetIndex === atk.attackerIndex` — this is the server's signal that target = self. (The existing payload already populates target fields for self-targeting moves identically to the attacker.)

## NPC attacks (`insertNpcAttackCard`)

The existing `options.leftHtml` hook in `buildSplitAttackCard` injects NPC sprite HTML into the old left column. With the left column gone, we rename the hook to `options.attackerHtml` — when provided, it replaces the default sprite-tile + attacker-word render for the attacker row. `insertNpcAttackCard` builds `attackerHtml` as:

```html
<div class="sac-sprite-tile">
  <img src="{npc sprite}" alt="">
</div>
<div class="sac-body">
  {renderJpSentence npc name}
</div>
```

— same shape as a creature row, just with NPC sprite URL. The category tag override (`tagLabelsByCategory`, `defaultCategoryTagLabel`) used today for NPC hits disappears because there are no visible category tags in the new card — NPC vs creature reads from the sprite and word, not a label pill.

## Animation & interaction

Unchanged in spirit:

- `ATTACK_CARD_TIMING.ROW_STAGGER` (50ms), `ROW_ANIM_DURATION` (100ms), `FADE_OUT_DURATION` (100ms) kept as-is.
- `.sac-row` elements get `.sac-visible` added on a stagger; the existing transitions fade-in + translate-X.
- Continue strip appears without stagger, after the last row.
- Tap-to-continue: `waitForCardTap` unchanged — click anywhere on the card → fade out → resolve.
- TTS: `prefetchWord` + `playWordPair(baseWord, skillName)` in `insertAttackCard` / `insertNpcAttackCard` is left alone for this change. The card stops displaying the base word, but the audio still pronounces it. A follow-up task can swap TTS to play the attacker/move/target triple that the card actually shows — out of scope here to keep the blast radius presentation-only.

## Files changed

- **`public/js/ui/attack-card.js`** — rewrite `buildSplitAttackCard()` body. Drop `attackerBaseWord` / `attackerBaseReading` / `attackerBaseMeaning` reads from the card (TTS prefetch keeps its reads). Rename `options.leftHtml` → `options.attackerHtml` and update `insertNpcAttackCard` accordingly. Delete the `actionIconPath` call for `attackerBaseMeaning` (keep it for `attackerSkillEn`). Add `KNOWN_STAT_NAMES`, effectiveness text helper, category → tone mapping helpers (small functions colocated in the same file).
- **`public/game.css`** — replace the block at lines 1199–1437 with the new `.sac-*` rules. Remove dead classes listed in the "Component structure" section.
- **`tests/unit/combat/`** — if any test asserts on the old card DOM (unlikely based on grep; to verify in implementation), update to the new shape. Not aware of any integration test that snapshots this HTML.

## Testing

- **Unit:** update any test that asserts on `.sac-left`, `.sac-tag-*`, `.sac-impact-*`, or the 3-row/base-word markup. If none exist, skip.
- **Manual via Playwright** (following the repo's visual-verification rule for CSS changes):
  - Fire creature vs wood creature damage — expect `-X HP` + `(Super effective!)`.
  - Neutral-matchup damage — expect `-X HP` alone.
  - Resisted matchup — expect `(Not very effective…)`.
  - Self-heal — expect `+X HP` on the target row, target sprite = attacker sprite, not flipped.
  - Self-buff (e.g. Guard) — expect `DEF +1`.
  - Debuff on enemy (e.g. Rage → confuse) — expect `Confused!` or stat line.
  - NPC attack path — expect NPC sprite in attacker row, creature sprite in target row.
- **Screenshots** taken at each state, cleaned up per session-cleanup rules.

## Open questions / to verify during implementation

- Whether the attack payload carries a top-level `attackerReading` and `targetReading`. If not, `renderJpSentence` renders with `reading: undefined`, which falls back to surface (hiragana). We'll grep the payload construction in `creature-combat-service.js` and extend `buildAttackRecord()` if needed — small additive change, no migration.
- Whether PvP payloads (built separately in PvP service code) match the same field shape. If PvP uses a different payload, we may need a thin normalizer. Worth checking before the PR since PvE/PvP parity is a CLAUDE.md invariant.

## Rollout

Single PR. No feature flag — this is a pure visual + client-layout change, fully backward-compatible at the network layer.
