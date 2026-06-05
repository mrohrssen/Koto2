# Party Skill Trees Replacement

Date: 2026-06-05
Status: Approved for implementation planning

## Goal

Replace the current individual Party Skill catalog with six clear five-level Party Skill trees. The player should understand every offer as either starting a new trait or leveling up a trait they already chose. This fully replaces the old Party Skill system; old skill IDs exist only as migration input.

Success means the system is wired through PvE, PvP, save migration, PvP team snapshots, ranked bot generation, Skill Master rooms, and NPC battle rewards, ready for playtesting.

## Current Context

The current system stores party skills as individual picked IDs, usually shaped like:

```js
run.partySkills = [{ id: 'arcStrike' }, { id: 'momentum' }]
```

The catalog lives in `src/game/party-skills.js`. Offer generation filters individual active skill IDs with prerequisite checks. Combat checks old IDs directly through `toActivePartySkillIdSet()` in `src/game/combat/party-skill-engine.js`. PvP uses the same combat engine for relevant effects, and ranked bots currently draft five old individual skills in `src/pvp/bot-generation.js`.

This design replaces that model with compact tree levels:

```js
run.partySkills = [
  { id: 'arcStrike', level: 3 },
  { id: 'counterMaster', level: 1 }
]
```

## Party Skill Trees

There are six base trees. More trees may be added later using the same model.

- `arcStrike`
- `hpMaster`
- `counterMaster`
- `buffMaster`
- `expMaster`
- `debuffMaster`

Each tree has levels 1 through 5. A tree at level 5 is maxed and no longer appears in offers.

## Player-Facing Descriptions

These descriptions should be used for Skill Master offers, NPC battle skill rewards, inventory display, and PvP team skill tags where space allows. Offer titles should use the form `Tree Name - Lvl. N`.

### Arc Strike

- `Arc Strike - Lvl. 1`: Your attacks arc to another enemy for 30% damage.
- `Arc Strike - Lvl. 2`: Arc strikes have a 50% chance to bounce one more time.
- `Arc Strike - Lvl. 3`: Arc strike bounces deal 50% more damage per bounce.
- `Arc Strike - Lvl. 4`: Arc strikes always bounce twice when possible.
- `Arc Strike - Lvl. 5`: After the second bounce, arc strikes have a 25% chance to keep bouncing.

### HP Master

- `HP Master - Lvl. 1`: All ally creatures' max HP increases by 25%.
- `HP Master - Lvl. 2`: After combat, ally creatures restore 100% more HP.
- `HP Master - Lvl. 3`: Healing actions restore 50% more HP.
- `HP Master - Lvl. 4`: Healing actions give the healed creature a random buff.
- `HP Master - Lvl. 5`: All ally creatures' max HP increases by another 100%.

### Counter Master

- `Counter Master - Lvl. 1`: When hit, ally creatures have a 50% chance to counterattack with 7 power.
- `Counter Master - Lvl. 2`: When hit, ally creatures have a 75% chance to counterattack.
- `Counter Master - Lvl. 3`: Ally creatures always counterattack when hit.
- `Counter Master - Lvl. 4`: Counterattacks deal double damage while the countering creature is below 50% HP.
- `Counter Master - Lvl. 5`: All counterattack damage is doubled.

### Buff Master

- `Buff Master - Lvl. 1`: Each turn, ally creatures have a 25% chance to gain a random buff.
- `Buff Master - Lvl. 2`: Each turn, ally creatures have a 50% chance to gain a random buff.
- `Buff Master - Lvl. 3`: Each turn, ally creatures have a 75% chance to gain a random buff.
- `Buff Master - Lvl. 4`: Each turn, ally creatures gain a random buff.
- `Buff Master - Lvl. 5`: When an ally creature acts, it has a 25% chance to give a random ally a random buff.

### Exp Master

- `Exp Master - Lvl. 1`: Ally creatures gain 25% more XP.
- `Exp Master - Lvl. 2`: Ally creatures gain 50% more XP.
- `Exp Master - Lvl. 3`: Ally creatures gain 75% more XP.
- `Exp Master - Lvl. 4`: Ally creatures gain 100% more XP.
- `Exp Master - Lvl. 5`: When an ally creature levels up, it has a 10% chance to level up again.

### Debuff Master

- `Debuff Master - Lvl. 1`: Enemies hit by your attacks have a 20% chance to receive a random debuff.
- `Debuff Master - Lvl. 2`: Enemies hit by your attacks have a 40% chance to receive a random debuff.
- `Debuff Master - Lvl. 3`: Enemies hit by your attacks have a 60% chance to receive a random debuff.
- `Debuff Master - Lvl. 4`: Enemies hit by your attacks have an 80% chance to receive a random debuff.
- `Debuff Master - Lvl. 5`: When an enemy acts, it has a 50% chance to give one of its own allies a random debuff.

## Mechanical Details

Random buffs and debuffs are stat stages only. They randomly choose one of `atk`, `def`, or `dex`.

- Random buff: apply `+1` to the selected stat stage.
- Random debuff: apply `-1` to the selected stat stage.
- Do not include poison, sleep, stun, confuse, taunt, or any other active effect in random buff/debuff rolls.

### Arc Strike Mechanics

Level 1 uses the existing Arc Strike behavior: qualifying damage attacks chain to another living enemy for 30% of the original attack damage, using the attacker's element.

Level 2 adds a 50% chance for one additional bounce.

Level 3 makes bounce damage ramp by 50% per bounce, relative to the prior bounce amount. With the 30% base bounce, this is equivalent to 30%, 45%, 60%, 75%, and so on as an additive percentage-point ramp.

Level 4 guarantees two bounces when possible.

Level 5 allows chains to continue after the second bounce. Each bounce after the second has a 25% chance to continue. The chain stops when the continuation roll fails or no living enemy target exists.

### HP Master Mechanics

Level 1 increases ally max HP by 25%.

Level 2 modifies the existing recovery hook. Current recovery happens when entering a room via `_healAllLivingCreaturesForRoomEntry()` and heals living active and reserve creatures for 5% max HP. HP Master level 2 doubles that recovery to 10% max HP. KO'd creatures still stay KO'd. Do not add a new round-start heal or move the restore into combat victory; scale the existing room-entry recovery wherever that recovery currently runs. The player-facing copy says "after combat" because room-entry recovery is primarily experienced after proceeding from a completed combat.

Level 3 increases healing actions by 50%. This includes heal moves and drain/self-healing actions that produce `healAmount` records.

Level 4 applies one random buff to the healed target whenever a healing action actually heals that creature. For drain/self-heal, the attacker is the healed target.

Level 5 adds another 100% max HP increase, stacking with level 1 for +125% total max HP.

### Counter Master Mechanics

Level 1 enables counters when a creature is hit by enemy damage. The proc chance is 50%, and the counter uses 7 power.

Level 2 raises the counter chance to 75%.

Level 3 raises the counter chance to 100%.

Level 4 doubles counter damage when the countering creature is below 50% HP.

Level 5 doubles all counter damage. This stacks with level 4, so a below-half-HP counter at level 5 deals 4x counter damage.

### Buff Master Mechanics

Levels 1 through 4 are turn-start ally buffs. Every living ally rolls independently each turn.

- Level 1: 25% chance.
- Level 2: 50% chance.
- Level 3: 75% chance.
- Level 4: 100% chance.

Level 5 adds an action hook. When an ally creature acts, it has a 25% chance to apply one random buff to one random living ally. This may target itself if it is the selected random ally.

### Exp Master Mechanics

Levels 1 through 4 modify XP awards:

- Level 1: +25% XP.
- Level 2: +50% XP.
- Level 3: +75% XP.
- Level 4: +100% XP.

Level 5 gives every level-up event a 10% chance to immediately grant one additional level-up. This applies to ally creatures in PvE reward flows. Exp Master has no battle effect in PvP, but PvP bots may still draft it to simulate real player builds.

### Debuff Master Mechanics

Levels 1 through 4 apply to enemies hit by player-side attacks. This includes primary attacks, Arc Strike bounces, and counterattacks.

- Level 1: 20% chance.
- Level 2: 40% chance.
- Level 3: 60% chance.
- Level 4: 80% chance.

Level 5 adds an enemy action hook. When an enemy acts, it has a 50% chance to apply one random debuff to one of its own living allies. In PvP, this rule applies from the perspective of the player who owns Debuff Master: when an opposing creature acts, it may debuff one of its own allies.

## Offer Rules

Every Party Skill offer screen presents up to three options. With six non-maxed trees this means a normal choice is always pick one of three.

An offer represents the next available level of a tree:

- If the player has no entry for a tree, offer `Lvl. 1`.
- If the player has `{ id: 'arcStrike', level: 2 }`, offer `Arc Strike - Lvl. 3`.
- If a tree is already level 5, exclude it from offers.

Offer IDs should be tree IDs, not level-specific old skill IDs. The offered display object should include:

```js
{
  id: 'arcStrike',
  level: 3,
  name: 'Arc Strike',
  title: 'Arc Strike - Lvl. 3',
  desc: 'Arc strike bounces deal 50% more damage per bounce.'
}
```

Choosing an offer creates or increments the compact tree entry:

- No existing entry: push `{ id, level: 1 }`.
- Existing level 1 through 4: increment `level` by 1.
- Existing level 5: reject as invalid.

The old prerequisite model should be removed. There are no cross-tree prerequisites in this replacement.

## Migration

Migration is mandatory for active runs, saved PvP teams, and bot-generated teams.

Canonical post-migration data is always compact tree entries:

```js
[{ id: 'arcStrike', level: 2 }, { id: 'buffMaster', level: 1 }]
```

Old IDs are mapped to the closest new tree. Multiple old IDs in the same tree become levels in that tree, capped at 5.

Initial mapping:

- `arcStrike`, `forkedArc`, `resonantArc`, `chainSurge`, `elementalCascade` -> `arcStrike`
- `retaliationStrike`, `hardenedRiposte`, `furyCounter`, `vengefulMark`, `lastStand` -> `counterMaster`
- `sharedVigor`, `momentum`, `diverseEmpowerment`, `overflowVitality`, `radiantAura` -> `buffMaster`
- `contagion`, `erosion`, `virulentChain`, `afflictionBurst`, `pandemic` -> `debuffMaster`
- `superEffectiveMend` -> `hpMaster`
- `guardPulse` -> `hpMaster`
- `hasteSpark` -> `buffMaster`
- `battleRhythm` -> `buffMaster`
- `finisherFeast` -> `expMaster`

Migration locations:

- Active run `partySkills` on manager load.
- `manager.meta.pvpTeams[].partySkills` on manager load.
- Any PvP team snapshot created through `savePvpTeam()`.
- Ranked bot generation should generate new tree picks directly, not old IDs.

## PvE And PvP Parity

Combat-facing effects must use the shared combat systems so PvE and PvP stay aligned.

Relevant effects in both PvE and PvP:

- Arc Strike levels.
- HP Master max HP scaling where combat snapshots are built from party data.
- Counter Master levels.
- Buff Master turn/action buffs.
- Debuff Master hit/action debuffs.

PvE-only effect:

- Exp Master XP changes and extra level-up chance.

PvP bot generation may draft Exp Master even though it has no PvP combat effect. That intentionally simulates real player builds.

## UI And Display

Skill Master and NPC battle reward cards should display:

- Title: `Tree Name - Lvl. N`
- Description: the player-facing description for that level.

Inventory and PvP team tags should show compact level-aware labels. A short tag can use `Arc Strike Lvl. 3`; a wider card can use `Arc Strike - Lvl. 3` plus the current level description.

Old display maps such as `PARTY_SKILL_NAMES` in the PvP lobby should be replaced with shared display data or updated to understand tree IDs and levels.

## Testing

Unit coverage should include:

- Offer generation returns three distinct non-maxed tree offers when at least three trees are eligible.
- Offer generation returns the next level for owned trees.
- Maxed trees do not appear.
- Choosing an offer creates `{ id, level: 1 }` for new trees.
- Choosing an offer increments existing trees.
- Choosing a maxed tree is rejected.
- Migration converts old run skill IDs into compact tree entries.
- Migration converts saved PvP team skill IDs into compact tree entries.
- Ranked bot generation creates compact tree entries and still validates.
- Arc Strike level behavior, including guaranteed two bounces and level 5 continuation.
- Counter Master chance and damage multipliers.
- Buff Master random buff chance by level.
- Debuff Master hit debuff chance and enemy self-sabotage at level 5.
- HP Master max HP scaling, post-combat recovery scaling, healing action scaling, and healed-target buff.
- Exp Master XP scaling and level 5 extra level-up chance.
- PvP parity for shared combat effects.

Manual playtest coverage should include:

- Skill Master initial pick shows three `Lvl. 1` tree options.
- Later offers show next levels for owned trees.
- NPC battle reward uses the same tree offer display.
- PvP saved team cards show skill names with levels.
- Combat visibly plays Arc Strike, counter, buff, debuff, and HP/heal behavior.
