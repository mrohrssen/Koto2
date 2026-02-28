# Creature Combat Rewrite Roadmap (MVP -> V1 -> V2)

## Summary
Replace current chip-based combat with creature-vs-creature combat on a dedicated worktree, ship in three releases, and instrument gameplay so we can quickly decide whether the mode is fun or needs redesign.

Chosen constraints:
- Full replacement (not a feature flag), but isolated in a new worktree.
- Chips are fully removed from gameplay.
- Runs start fresh every time with a random starter creature.
- Up to 3 active allied creatures if equipped; up to 6 total in-run (active + reserves).
- Keep vocab review as the combat gate.
- Archetypes deferred to V2, and only: `Striker`, `Tank`, `Trickster`.

## Worktree Setup
1. Create isolated branch/worktree before implementation.
2. Use:
   - `cd /Users/michia/Documents/jrpg`
   - `/usr/bin/git fetch origin`
   - `/usr/bin/git worktree add /Users/michia/Documents/jrpg/.worktrees/codex-creature-combat -b codex/creature-combat`

## Architecture Changes (Decision-Complete)

### Data Model
1. Add creature catalog and combat definitions.
   - `/Users/michia/Documents/jrpg/data/creatures.json`
   - `/Users/michia/Documents/jrpg/data/creature-abilities.json`
   - `/Users/michia/Documents/jrpg/data/element-relations.json`
2. Add run-scoped creature state (no persistence across runs).
   - `run.creatureParty.active` (0-3 creatures)
   - `run.creatureParty.reserves` (0-3 creatures)
   - `run.creatureParty.maxTotal = 6`
   - `run.creatureBuffs` (carry-over buffs with remaining turns)
3. Replace combat state enemy singleton with future-proof arrays.
   - `combat.allies[]`
   - `combat.enemies[]` (MVP uses 1)
   - keep `combat.enemy` alias in MVP for transition safety where needed

### Combat Formula
`Damage = attack * abilityPower * elementMult * variance(0.8-1.2) * skillBuffMult * itemBuffMult`

Defaults:
- `elementMult`: `1.5` super effective, `0.67` resisted, `1.0` neutral
- `itemBuffMult = 1.0` in MVP (no chip/item system)
- Wuxing counter cycle:
  - `Wood > Earth > Water > Fire > Metal > Wood`

### Enemy Targeting AI
On enemy action:
1. Target ally where enemy has type advantage.
2. If multiple, pick ally with greatest missing HP%.
3. Else target neutral matchup.
4. Else target lowest remaining HP%.

## API / Interface Changes

### Keep and repurpose existing endpoints
- `POST /api/game/combat-cycle`
  - request supports: `attackerType`, `actionType` (`attack`/`defend`)
  - response returns creature-combat result payloads

### New endpoints
1. `POST /api/game/use-creature-ultimate`
   - body: `{ creatureId, targetId? }`
2. `POST /api/game/befriend`
   - available only when enemy HP <= 30% and party total < 6
3. `POST /api/game/swap-creature` (V1)
   - body: `{ outCreatureId, inCreatureId }`
4. `GET /api/game/creature-party`
   - returns active/reserve/bench state for UI

### Deprecated/removed behavior
- Chip loadout/equip/use routes removed from active UI flow.
- Chip row UI replaced by creature team panel.

## Release Plan

## MVP (Playable Core)
1. Replace current combat backend with creature combat engine.
2. Run start gives 1 random starter from 3 generic common creatures.
3. Battle format: up to 3 active allies (if owned) vs exactly 1 enemy creature.
4. Each creature has:
   - auto attack
   - ultimate (manual trigger with skill bar)
5. Keep vocab dual-card loop as combat gate.
   - `attack`: team auto-attacks
   - `defend`: team takes reduced incoming damage this enemy phase
6. Elements and statuses:
   - auto attacks apply element effectiveness only
   - ultimates apply element status (MVP minimal set)
   - include at least one synergy combo: `Burn + Water -> Steam Explosion`
7. Befriend:
   - show third action when enemy <=30% HP
   - success is automatic in MVP
   - captured creature added to reserves (up to 6 total)
8. Remove chips from combat/economy UI.
9. Enemy generation uses creature templates + level scaling (no separate enemy file dependency for MVP path).

MVP acceptance:
- Start run, receive random starter, enter combat, complete turns via vocab.
- Use at least one ultimate in combat.
- Befriend works at <=30% HP and adds creature to run party.
- Party never exceeds 6.

## V1 (System Depth)
1. Add enemy team sizes: 1-3 creatures.
2. Add in-combat swapping between active and reserves.
3. Expand element statuses + synergy matrix for all five elements.
4. Add EXP distribution and level-up:
   - active creatures receive bonus share
   - reserves receive reduced share
5. Improve encounter scaling to match player team power and level.
6. Add reusable generic content tiers common->legendary with stat/skill scaling.

V1 acceptance:
- Multi-enemy encounters resolve correctly.
- Swap action is legal/illegal based on battle state and party state.
- EXP and level progression visible and balanced across active/reserve usage.

## V2 (Identity + Capture Depth)
1. Add archetypes (only):
   - `Striker`
   - `Tank`
   - `Trickster`
2. Implement archetype passives and ult identity.
3. Replace auto-befriend with negotiation/dialogue capture flow.
4. Add non-damage ultimate utilities (buff, heal, economy utility).
5. Content balancing pass for long-run viability.

V2 acceptance:
- Archetypes are mechanically distinct.
- Negotiation capture can succeed/fail based on dialogue outcomes.
- Late-run team building has meaningful strategic tradeoffs.

## "Is It Fun?" Validation Plan

### Instrumentation (MVP onward)
Track per combat:
- turns to win/lose
- damage variance by element matchup
- ultimate usage rate
- defend usage rate
- befriend attempt rate and success
- rage quit/forfeit frequency shortly after combat start

### Playtest gates
1. Internal 20-run pass before V1:
   - target median combat length: 4-8 rounds
   - ultimate used in >=40% combats
   - defend used in >=20% combats
2. If below thresholds:
   - adjust energy gain, ult power, or element multipliers before adding complexity
3. V1 gate:
   - multi-enemy encounters must not spike failure rate by >20% vs single-enemy baseline
4. V2 gate:
   - negotiation capture must be chosen often enough to justify UX complexity

## Test Plan

### Unit tests
- element effectiveness matrix
- damage formula (seeded/random-window checks)
- status duration and synergy trigger rules
- enemy targeting priority algorithm

### Integration tests
- combat cycle with 1-3 allies
- ultimate charge/use lifecycle
- befriend flow and party cap enforcement
- run reset behavior (party resets each new run)

### E2E tests
- run start -> random starter assigned
- vocab card loop advances combat actions
- use ultimate from UI
- befriend appears at <=30% HP and updates team
- no chip UI/routes in active flow

### Commands
- syntax check before e2e:
  - `node --check <changed-js-files>`
- project tests:
  - `npm run test:unit`
  - `npm run test:integration`
  - `./scripts/e2e-test.sh`

## Key File Targets
- `/Users/michia/Documents/jrpg/src/game/state.js`
- `/Users/michia/Documents/jrpg/src/game/loop.js`
- `/Users/michia/Documents/jrpg/src/game/services/combat-service.js`
- `/Users/michia/Documents/jrpg/src/routes/game/combat.js`
- `/Users/michia/Documents/jrpg/src/routes/game/run.js`
- `/Users/michia/Documents/jrpg/public/game.js`
- `/Users/michia/Documents/jrpg/public/js/ui/combat-loop.js`
- `/Users/michia/Documents/jrpg/public/js/ui/scene.js`
- `/Users/michia/Documents/jrpg/public/js/dom.js`
- `/Users/michia/Documents/jrpg/public/game.html`
- `/Users/michia/Documents/jrpg/tests/e2e/fixtures/game-helpers.ts`
- `/Users/michia/Documents/jrpg/tests/e2e/specs/rooms/encounter.spec.ts`

## Assumptions and Defaults
- Full replacement occurs only on new worktree branch; `master` remains untouched.
- Chips are removed from gameplay entirely.
- Party/collection is run-scoped only, resets each run.
- MVP enemies are always single-creature; multi-enemy starts in V1.
- Archetypes are V2 only, limited to three classes.
- Befriend is instant success in MVP; negotiation deferred to V2.
