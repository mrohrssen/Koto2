# Move System Reference

**Status:** Source of truth for the move design space. Last updated 2026-05-05.

This document defines what a move can be in Koto's combat system. Any agent
authoring a move (manually or via a forge workflow) **must** conform to it.
If a section here disagrees with a skill or older doc, this document wins —
update the skill, not this file.

The combat engine lives in:

- `src/game/services/creature-combat-service.js` — `executeMove()` dispatch
- `src/game/combat/effects.js` — status effect application + stat stages
- `data/moves.json` — authored move data

---

## Mental model

A move has three things:

1. A **category** — its shape: `damage`, `drain`, `heal`, `buff`, or `debuff`.
2. A **target** — who it lands on.
3. Up to two **riders**, both optional:
   - A **status effect** (timed condition: `poison`, `sleep`, `stun`,
     `confuse`, `taunt`, or instantaneous `cleanse`).
   - A **stat-stage change** (PokéRogue-style ±1..±6 on a stat).

```
┌──────────────┐      ┌──────────┐      ┌──────────────────────┐
│  category    │  +   │  target  │  +   │  riders (0, 1, or 2) │
└──────────────┘      └──────────┘      └──────────────────────┘
```

There is one synthetic action that lives **outside** `data/moves.json`:
`rest`. It's injected at render time and is never authored.

---

## Categories

The `move.category` field. Determines which engine branch runs.

| Category | What it does | Riders allowed |
|---|---|---|
| `damage` | HP damage to target. Element + STAB multipliers, variance, crits, and dodge. Damage > 0 breaks sleep on the target. | `statusEffect`, `statChanges` |
| `drain` | Same as damage, plus the attacker is healed for 50% of damage dealt. | `statusEffect`, `statChanges` |
| `heal` | Restore HP to ally(ies): `floor((atk / 10) × power × variance)`. Skips KO'd targets. | `statusEffect`, `statChanges` |
| `buff` | Apply positive `statChanges` and/or beneficial `statusEffect` (`taunt`, `cleanse`) to ally/self. | `statusEffect`, `statChanges` |
| `debuff` | Apply negative `statChanges` and/or harmful `statusEffect` (`poison`, `sleep`, `stun`, `confuse`) to enemy. | `statusEffect`, `statChanges` |
| `rest` (synthetic) | Render-time pseudo-move. Restores `ceil(maxMp × 0.20)`. Detected via `move.isRest`; rendered as a `+20% MP` pill. **Never authored.** | — |

## Targets

The `move.target` field.

| Target | Meaning |
|---|---|
| `single_enemy` | One enemy. (Sometimes spelled `enemy` as an alias in older code paths.) |
| `all_enemies` | Every living enemy. |
| `self` | The casting creature only. |
| `single_ally` | One ally (a teammate of the caster). |
| `all_allies` | Every living ally (party-wide). |

Pairings are conventional, not engine-enforced: `damage` / `drain` /
`debuff` typically go to enemy targets, and `heal` / `buff` typically go
to ally/self targets, but a `damage` move targeting `self` is technically
authorable.

---

## Status effect riders

Attached via `move.statusEffect` + `move.statusChance` (0–100) +
`move.statusDuration` (turns). Resolved by `tryApplyStatus` and the
`applyX` helpers in `combat/effects.js`.

| Effect | Behavior | Duration model |
|---|---|---|
| `poison` | DoT each round. **Can KO** the target. Damage = `max(1, floor((atk/10) × power × 0.2))`. | decrements per turn |
| `sleep` | Skip turn until taking damage (which breaks sleep). | decrements per turn |
| `stun` | Skip the next turn. | 1 turn (fixed) |
| `confuse` | Chance to hit self/ally instead of intended target. | decrements per turn |
| `taunt` | Forces enemies to target the taunter. | decrements per turn |
| `cleanse` | Instantly removes the four negative status effects from the target: `poison`, `sleep`, `stun`, `confuse`. **Does not** remove `taunt` (treated as a role indicator, not a debuff). **Does not** reset negative stat stages. | instant (no tick) |

---

## Stat-stage riders

Attached via `move.statChanges`, e.g. `{ "atk": 1 }` or `{ "def": -2 }`.
PokéRogue-style integer stages clamped to `[-6, +6]`. Stages reset at
battle start.

**Multiplier formula:** `max(2, 2+stage) / max(2, 2-stage)`

| Stage | Multiplier |
|---|---|
| +6 | 4.0× |
| +1 | 1.5× |
| 0 | 1.0× |
| −1 | 0.667× |
| −6 | 0.25× |

### Stats

| Stat | Status | What it affects |
|---|---|---|
| `atk` | engine | Multiplies physical damage output. |
| `def` | engine | Multiplies incoming-damage resistance. Replaces the old `shield` / `team_shield` design. |
| `dex` | engine | Three things at once: turn order (higher dex acts first), critical-hit chance, and dodge chance. Same `[-6, +6]` model as atk/def. Designed for both buff and debuff use. Supersedes the old `spd` UI label. |

### Why dex unlocks new design

Today every stat move is "more damage" or "less damage." There's no way
to reshape the turn flow or trade reliability for upside. `dex` opens
three new design axes from a single stat:

- **Tempo plays** — buff dex to act before a big enemy turn; debuff
  enemy dex to steal initiative.
- **Crit-fishing builds** — stack dex on a hard hitter so its damage
  moves spike instead of grow.
- **Evasive tanks** — high dex as an alternative to def: dodge entirely
  instead of soaking. Risk/reward variant of "raise def +1."

---

## Deprecated — do not use

These names exist somewhere in the code or in older docs/skills, but are
no longer in the design space. Do not author moves that use them.

| Name | Kind | Replacement |
|---|---|---|
| `shield` | category | Use `category: "buff"` with `statChanges: { def: +N }`. |
| `shield` | status effect | Same — express as a `def` buff. |
| `team_shield` | status effect | Use `category: "buff"`, `target: "all_allies"`, `statChanges: { def: +N }`. |
| `haste` | status effect | Use `statChanges: { dex: +N }`. |
| `attack_buff` | legacy status effect name | Use `statChanges: { atk: +N }`. |
| `spd` | stat / UI label | Superseded by `dex`. |

`Call` (呼ぶ) is now a `dex +1` buff targeting `all_allies`.

---

## Open design space

Slots that are mechanically supported (or will be once their engine
gaps close) but have **zero authored moves** today:

- **Status effects with no authored moves:** `poison`, `sleep`, `taunt`,
  `cleanse`.
- **Stat stages:** every authored move is positive (`atk +1` / `def +1`).
  No negative stages, no multi-tier (±2, ±3), and no `dex` moves at all.
- **Categories:** `drain` has zero authored moves despite full engine
  support.
- **Targets:** `single_ally` is unused — every ally-targeting move is
  either `self` or `all_allies`.

When designing new moves, prefer slots from this list before adding more
of the existing patterns.

---

## Implementation status

The engine supports the current reference surface:

1. **`heal` riders** — heal moves call status and stat rider helpers.
2. **Poison can KO** — poison ticks can reduce HP to 0.
3. **`dex` stat** — implemented as a real creature stat plus battle-stage stat. It affects turn order, critical-hit chance, and dodge chance in both PvE and PvP.
4. **`cleanse` handler** — `applyCleanse(target)` removes `poison`, `sleep`, `stun`, and `confuse`.
5. **Deprecated branches removed** — shield/team shield/haste/temp flat attack helpers and engine branches have been removed from combat.
6. **`spd` label removed** — move labels use `Dex`.

---

## See also

- [`docs/superpowers/specs/2026-05-05-move-system-reference.canvas.tsx`](superpowers/specs/2026-05-05-move-system-reference.canvas.tsx)
  — the visual planning canvas this doc was derived from.
- `data/moves.json` — current authored moves.
- `src/game/services/creature-combat-service.js` — engine dispatch.
- `src/game/combat/effects.js` — status effect helpers and stat-stage helpers.
