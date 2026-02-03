# New Chips Design: Build Variety Expansion

12 new chips focused on meaningful trade-offs and build-around mechanics. Inspired by Balatro's joker design philosophy.

## Design Goals

- Force interesting decisions when picking chips
- Create distinct build archetypes
- Use downsides: HP costs, slot restrictions, degradation
- Reward commitment to a strategy

## New Chips

### HP Cost Chips

#### Needle Bot (針ボット)
- **Rarity**: Rare
- **Stats**: Power 22, Bandwidth 4
- **Effect**: Costs 5 HP per attack
- **Skill**: "Blood Price" (血の代償) - Next attack ×2.5, costs 15 HP
- **Charges**: 5

#### Adrenaline Bot (アドレナリンボット)
- **Rarity**: Epic
- **Stats**: Power 12, Bandwidth 2
- **Effect**: +1 BW per 10 HP missing
- **Skill**: "Near Death" (瀕死) - If below 20% HP, next attack ×3
- **Charges**: 5

### Slot Restriction

#### Duo Bot (二人組ボット)
- **Rarity**: Rare
- **Stats**: Power 18, Bandwidth 4
- **Effect**: Only works if exactly 2 chips equipped. Otherwise contributes nothing.
- **Skill**: "Perfect Pair" (完璧な二人) - Next attack ×2 (only if 2 chips)
- **Charges**: 5

### Degrading Chips

#### Candle Bot (蝋燭ボット)
- **Rarity**: Rare
- **Stats**: Power 16, Bandwidth 5
- **Effect**: Loses 1 BW after each combat. Destroyed at 0.
- **Skill**: "Last Light" (最後の灯) - Deal remaining BW ×8 as direct damage
- **Charges**: 5

#### Ice Cream Bot (アイスボット)
- **Rarity**: Uncommon
- **Stats**: Power 14, Bandwidth 6
- **Effect**: Loses 0.5 BW per attack. Melts fast.
- **Skill**: "Brain Freeze" (頭キーン) - Freeze degradation for this combat
- **Charges**: 5

### Rarity Build-around

#### Commoner Bot (庶民ボット)
- **Rarity**: Common
- **Stats**: Power 8, Bandwidth 1
- **Effect**: +2 BW per common chip equipped (including itself)
- **Skill**: "Strength in Numbers" (数の力) - +5 damage per common chip
- **Charges**: 5

#### Underdog Bot (弱者ボット)
- **Rarity**: Uncommon
- **Stats**: Power 10, Bandwidth 2
- **Effect**: ×1.5 BW if you have no legendary or epic chips equipped
- **Skill**: "Prove Them Wrong" (見返してやる) - Next attack ×2 (only if no legendary/epic)
- **Charges**: 5

### Position Chips

#### Anchor Bot (錨ボット)
- **Rarity**: Rare
- **Stats**: Power 12, Bandwidth 2
- **Effect**: +8 Power and ×1.5 BW if in the LAST slot
- **Skill**: "Hold the Line" (死守) - Next attack +20 damage (only if last slot)
- **Charges**: 5

#### Spark Plug Bot (点火ボット)
- **Rarity**: Rare
- **Stats**: Power 10, Bandwidth 3
- **Effect**: ×1.8 BW if in the FIRST slot
- **Skill**: "Ignition" (点火) - First attack this combat ×2
- **Charges**: 5

### Healing Synergy

#### Leech Bot (ヒルボット)
- **Rarity**: Epic
- **Stats**: Power 8, Bandwidth 2
- **Effect**: Healing you receive also deals equal damage to enemy
- **Skill**: "Drain Life" (生命吸収) - Heal 10 HP and deal 10 damage
- **Charges**: 5

#### Vampire Bot (吸血ボット)
- **Rarity**: Rare
- **Stats**: Power 14, Bandwidth 3
- **Effect**: 5% of damage dealt heals you. Disables all other healing sources.
- **Skill**: "Blood Pact" (血の契約) - Next attack heals 20% of damage dealt instead of 5%
- **Charges**: 5

### Self-Damage Tradeoff

#### Overclocked Bot (過負荷ボット)
- **Rarity**: Epic
- **Stats**: Power 25, Bandwidth 5
- **Effect**: You take 3 damage every time ANY chip in your pipeline triggers
- **Skill**: "Overclock" (限界突破) - Double all chip effects this attack, take double self-damage
- **Charges**: 5

## Build Archetypes Enabled

| Build | Core Chips | Strategy |
|-------|------------|----------|
| Glass Cannon | Needle + Adrenaline | Stay low HP, hit hard, risk death |
| Minimalist | Duo Bot + 1 strong chip | Max value from exactly 2 slots |
| Sprint Run | Candle + Ice Cream | Burn bright early, finish fast before decay |
| Common Army | Commoner + Underdog + commons | Skip rares for synergy bonuses |
| Position Master | Anchor + Spark Plug + fillers | Optimize pipeline order |
| Battle Medic | Leech + Onigiri/Straw | Healing becomes offense |
| Solo Vampire | Vampire (possibly alone) | Self-sustaining damage dealer |
| Pain Train | Overclocked + few chips | Minimize triggers to reduce self-damage |

## New Effect Types Required

These chips need new pipeline effect types:

- `hpCost` - Costs HP to trigger
- `missingHpBonus` - Scales with missing HP
- `slotCount` - Only works with exact chip count
- `degradePerCombat` - Loses value after each combat
- `degradePerAttack` - Loses value after each attack
- `rarityBonus` - Bonus per chip of specific rarity
- `rarityRestriction` - Bonus if no chips of certain rarities
- `positionBonus` - Bonus for being in specific slot
- `healingToDamage` - Healing also damages enemy
- `lifesteal` - Percentage of damage heals, disables other healing
- `selfDamagePerTrigger` - Take damage when chips trigger

## Implementation Notes

- Degrading chips need persistent state across combats
- Position effects need access to slot index during pipeline execution
- Vampire's "disables other healing" needs a flag check in heal functions
- Overclocked counts ALL chip triggers, not just its own
