# DEF Effectiveness Reduction — Design Doc

**Date:** 2026-05-11
**Status:** Brainstorm — proposals presented, no option selected yet
**Goal:** Make defense (DEF) matter roughly half as much as it does today, via a formula change. Creature stats and other DEF sources (Defend action, item damage reduction) are out of scope for this pass.

---

## 1. Problem

DEF is too impactful in PvE and PvP. The dominant symptoms:

1. **Innate-DEF spread is too wide.** A creature with DEF 10 takes ⅓ the damage a creature with DEF 3 takes from the same attacker, before any buffs.
2. **DEF stat-stage buffs swing fights.** A +2 DEF buff turns a 2-hit KO into a 4-hit slog. +6 DEF (the cap) turns a 2-hit KO into an 8-hit grind.
3. **Combined**, a buffed tank effectively becomes invulnerable to under-leveled or low-ATK attackers.

The user has asked specifically: change the **damage formula** so DEF is **about half as effective**, leaving creature stats and other systems unchanged in this round.

---

## 2. Current Formula

Defined in `src/game/creatures.js → calculateCreatureDamage`:

```
inner = (2 · level / 5 + 2) · power · atk / def
base  = floor(inner / 10 + 2)
damage = max(1, floor(base · typeMultiplier · variance))
```

Stat stages (`src/game/combat/effects.js`) multiply DEF before it enters the formula:

```js
defenderDefense: Math.floor((target.defense ?? 5) * getDefenseMultiplier(target))
```

Stage multipliers use `max(2, 2+s) / max(2, 2-s)`, giving:

| Stage | Multiplier |
|---|---|
| +1 | 1.50× |
| +2 | 2.00× |
| +6 (cap) | 4.00× |
| −1 | 0.667× |
| −6 | 0.25× |

### Population stats (data/creatures.json, 72 creatures)

| Stat | Min | Max | Avg |
|---|---|---|---|
| baseAttack | 14 | 27 | 18 |
| baseDefense | 3 | 10 | 5 |
| baseHp | 35 | 110 | 60 |

Tight DEF range (3–10) on a `1/def` curve is what makes small DEF differences produce large damage swings.

---

## 3. What "DEF matters half as much" means quantitatively

Today, `damage ∝ 1/def`, so a 1% increase in DEF causes a 1% decrease in damage (elasticity = −1). "Half as much" means we want elasticity = −0.5, or — operationally — we want the **damage ratio between the lowest- and highest-DEF creatures in the population to be cut roughly in half**.

| Comparison | Today | Target (≈ half) |
|---|---|---|
| Tank (DEF 10) takes how much less than glass (DEF 3) | 3.33× less | ~1.5–1.9× less |

A *uniform* damage scalar (e.g. `atk / (def · 0.5)`) does **not** satisfy this — it just multiplies all damage by a constant and leaves the tank-vs-glass ratio unchanged. We need a change that compresses the *shape* of the curve, not its slope.

---

## 4. Proposals

All proposals leave HP, ATK, type matchups, Defend action, and item damage reduction untouched.

### Option A — Square-root DEF

Replace `atk / def` with `atk · √DEF_AVG / √def` (with `DEF_AVG = 5` so average creatures take the same damage as today).

Equivalent rewrite for code: `effDef = sqrt(5 · def)`, used wherever `def` enters `calculateCreatureDamage`.

- Elasticity becomes exactly −0.5 everywhere.
- Compresses both innate-DEF spread *and* stat-stage buff effectiveness, in one change.
- A +2 DEF buff stops being a damage-halver — it cuts damage by ~29% instead.

**Tradeoff:** Future flat-DEF equipment (e.g. "+5 armor") gives diminishing returns on already-tanky creatures. Tanks lose some identity — they're tankier than glass, but only ~1.8× tankier instead of 3.3×.

### Option B — Add flat baseline to DEF

Replace `atk / def` with `atk · 2 / (def + 5)`. The `2` keeps damage at average DEF (5) unchanged.

- Innate spread compressed similarly to A (~1.85× tank-vs-glass ratio).
- Buff stacking blunted, but somewhat asymmetrically — a +2 stage on DEF 3 helps relatively more than a +2 stage on DEF 10.
- Linear flat-DEF gains (future equipment) stay linear and intuitive.

**Tradeoff:** The buff-blunting curve is uneven by base DEF. Mathematically less clean than A.

### Option C — Halve only stat-stage buff effectiveness

Leave the damage formula untouched. Change the DEF stage multiplier curve from `max(2, 2+s)/max(2, 2-s)` to `max(4, 4+s)/max(4, 4-s)`. This applies to DEF only; ATK and DEX stages keep the current curve.

Resulting DEF stage multipliers:

| Stage | Old | New (Option C) |
|---|---|---|
| +1 | 1.50× | 1.25× |
| +2 | 2.00× | 1.50× |
| +6 | 4.00× | 2.50× |

- Innate DEF spread is unchanged. A 27-ATK creature still hits a DEF 3 creature for 3.33× the damage of a DEF 10 creature.
- DEF stat-stage buffs become roughly half as impactful.

**Tradeoff:** Doesn't address innate-DEF complaints. ATK/DEX vs DEF stage curves diverge, which may feel inconsistent ("why does +2 ATK do more for me than +2 DEF?").

### Option D — Single-knob linear interpolation toward population mean

Introduce a tunable `defScale ∈ [0, 1]`. Replace `def` in the formula with:

```
effDef = def · defScale + DEF_AVG · (1 - defScale)
```

with `DEF_AVG = 5`.

- `defScale = 1.0` → no change (current behavior).
- `defScale = 0.5` → DEF spread is **exactly half** of today's.
- `defScale = 0.0` → DEF stops mattering (everyone has effective DEF 5).

This is mathematically equivalent to Option B's family, but generalized to a knob. At `defScale = 0.5` the spread is identical to interpolating to mean.

| `defScale` | Glass effDef | Avg effDef | Tank effDef | Tank-vs-glass damage ratio |
|---|---|---|---|---|
| 1.0 (today) | 3 | 5 | 10 | 3.33× |
| 0.75 | 3.5 | 5 | 8.75 | 2.50× |
| 0.5 | 4.0 | 5 | 7.5 | **1.88×** |
| 0.25 | 4.5 | 5 | 6.25 | 1.39× |
| 0.0 | 5 | 5 | 5 | 1.00× |

- One number to tune. Average creatures take the same damage at any `defScale`.
- Simultaneously compresses innate spread *and* stat-stage buffs by the same factor (because stage multipliers act on raw `def` before interpolation, so the *delta* from the buff is also halved).
- Easy to roll forward/back. Easy to A/B in the balance simulator.

**Tradeoff:** Like B, the buff-blunting curve isn't a clean elasticity (it's piecewise linear in DEF, not log-linear). Visually clean as a knob, mathematically less elegant than A.

### Option E — Single-knob exponent dial

Generalization of Option A.

```
effDef = pow(def, defScale) · pow(DEF_AVG, 1 - defScale)
```

- `defScale = 1.0` → today.
- `defScale = 0.5` → exactly Option A (sqrt).
- `defScale = 0.0` → DEF doesn't matter.

Elasticity equals exactly `−defScale` at every point. Mathematically the prettiest knob. Slightly more expensive to compute, slightly harder to explain to non-math users. Behaves like Option A at the recommended setting.

---

## 5. Concrete numerical comparison

**Setup:** attacker ATK 18, level 10, neutral move power 50, mean variance. HP values shown to translate damage into hits-to-KO.

### 5.1 Innate DEF, no buffs

| Defender | HP | **Today** | **A (sqrt)** | **B (`2·atk/(def+5)`)** | **C (stages only)** | **D (`defScale=0.5`)** |
|---|---|---|---|---|---|---|
| Glass (DEF 3) | 35 | 182 (1 hit) | 141 (1) | 137 (1) | 182 (1) | 137 (1) |
| Avg (DEF 5) | 60 | 110 (1) | 110 (1) | 110 (1) | 110 (1) | 110 (1) |
| Tank (DEF 10) | 110 | 56 (2) | 78 (2) | 74 (2) | 56 (2) | 74 (2) |
| Tank-vs-glass ratio | | **3.25×** | 1.81× | 1.85× | 3.25× (no change) | 1.85× |

### 5.2 Buffed tank (110 HP, base DEF 10) — same average attacker

| DEF buff | **Today (dmg / hits)** | **A** | **B** | **C** | **D (0.5)** |
|---|---|---|---|---|---|
| none | 56 / **2** | 78 / **2** | 74 / **2** | 56 / **2** | 74 / **2** |
| +1 | 38 / **3** | 64 / **2** | 56 / **2** | 45 / **3** | 56 / **2** |
| +2 | 29 / **4** | 56 / **2** | 45 / **3** | 38 / **3** | 45 / **3** |
| +6 (cap) | 15 / **8** | 40 / **3** | 26 / **5** | 23 / **5** | 26 / **5** |

### 5.3 Glass-cannon attacker (ATK 27) into tank (DEF 10, 110 HP)

| Buff on tank | **Today** | **A** | **B** | **C** | **D (0.5)** |
|---|---|---|---|---|---|
| none | 83 / 2 | 116 / 1 | 110 / 1 | 83 / 2 | 110 / 1 |
| +2 | 42 / 3 | 83 / 2 | 66 / 2 | 56 / 2 | 66 / 2 |

---

## 6. Recommendation

**Option D with `defScale = 0.5`.**

Reasoning:

- It's the only option that satisfies the user's stated goal literally — "DEF matters half as much" — at the population level (tank-vs-glass spread halves, buff impact halves), with a single tunable knob.
- The knob is real and immediately useful: if 0.5 turns out to be too aggressive, change it to 0.6 or 0.7 without code changes elsewhere.
- Average creatures take exactly the same damage as today regardless of the knob value, so playtesting feels stable and only the extremes shift.
- It naturally subsumes Option B (D with `defScale=0.5` ≈ Option B at the population mean) and gives Option A's compression behavior at lower knob values without the log-curve weirdness around equipment.
- Implementation is one constant + one expression in `calculateCreatureDamage`. Stat stages need no change (they continue to multiply raw `def`, which is then interpolated).

**Fallback:** if playtesting at `defScale = 0.5` shows tanks have lost their identity, fall back to Option C (stages only) at `defScale = 1.0` for innate DEF.

---

## 7. Out of scope (for this change)

These were explicitly excluded by the user during brainstorming. If we later decide to weaken DEF further, these are the next levers:

- **Defend action** (`if (defendActive) damage = floor(damage * 0.5)`). Currently a flat 50% reduction stacked on top of the formula. Untouched.
- **Item-based damage reduction** (`applyDamageReduction`). Untouched.
- **Creature base stat values** — no creature gets its `baseDefense` rebalanced as part of this change.
- **ATK and DEX stat-stage curves** — unchanged. Only DEF is at issue.

If Option D ships and DEF still feels dominant, the next investigation should target the Defend action and item DR rather than touching the formula again.

---

## 8. Implementation pointers (for the eventual plan)

These are placement notes only — the actual implementation plan comes after this spec is approved.

- **Formula change:** `src/game/creatures.js → calculateCreatureDamage`. Add `DEF_SCALE` and `DEF_AVG` constants near the top of the file. Compute `effDef = def * DEF_SCALE + DEF_AVG * (1 - DEF_SCALE)` and use it in place of `def` in the existing formula.
- **Call sites that already pre-multiply DEF by stage multiplier** — leave untouched. They pass a `defenderDefense` value that is already `baseDef × stageMult`; the new interpolation runs on that value, which is correct (stage buffs scale relative to raw DEF, then get compressed alongside it).
  - `src/game/services/creature-combat-service.js` line 53 (player/NPC attack)
  - `src/game/services/creature-combat-service.js` line 719 (enemy attack)
- **Tests:** `tests/unit/creature/creatures.test.js` covers `calculateCreatureDamage`. Add cases at `defScale = 0.5` to lock in: (a) damage at `def = DEF_AVG` is unchanged, (b) tank-vs-glass damage ratio drops from 3.33× to ~1.88×, (c) ratio at `defScale = 1.0` matches legacy behavior (regression guard).
- **Balance simulator** (`docs/superpowers/specs/2026-05-05-balance-simulator-design.md` exists): re-run a representative battery before/after the change to confirm no boss becomes trivially easy or impossibly hard at `defScale = 0.5`.

---

## 9. Open questions for review

1. Is `defScale = 0.5` the right starting value, or should we start more conservatively (e.g. 0.65) and step down with playtesting?
2. Should `defScale` live as a constant in code, or be exposed via meta-progression / settings as a tunable for early playtest builds?
3. Do we want a corresponding `atkScale` knob for symmetry, or is ATK considered fine?
