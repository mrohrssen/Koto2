# Pipeline Chips

Pipeline chips fire sequentially during combat, modifying damage as it flows through. Order matters - a ×2 multiplier after a +50 flat bonus is different from before it.

## Original 5 Chips

| Chip | Japanese | Effect | Trigger |
|------|----------|--------|---------|
| Power Cell | パワーセル | +5 damage | 100% |
| Amplifier | アンプ | ×1.5 damage | 80% |
| Crit Booster | クリットブースター | +20% crit chance | 100% |
| Overloader | オーバーロード | ×2 damage | 50% |
| Finisher | フィニッシャー | ×1.5 damage if enemy <30% HP | 100% |

## New 13 Chips

### Crazy Mechanics

| Chip | Japanese | Effect | Rarity |
|------|----------|--------|--------|
| **Recursion** | 無限再帰 | 10% chance to restart entire pipeline from chip 1. Can trigger multiple times (capped at 10). | Legendary |
| **Sacrifice** | 生贄プロトコル | ×10 damage multiplier. Chip is **permanently destroyed** - gone from your save forever. | Legendary |

### Stacking / Scaling

| Chip | Japanese | Effect | Rarity |
|------|----------|--------|--------|
| **Stack Overflow** | スタックオーバーフロー | +3 damage per hit this combat. Resets when enemy dies. 25% trigger. | Epic |
| **Bounty Hunter** | バウンティハンター | +1 damage per enemy killed this run. Stacks infinitely. | Epic |
| **Phoenix Protocol** | フェニックス | ×(1 + chips destroyed) damage multiplier. Gains +1× for every chip sacrificed this run. | Legendary |
| **Burst Cycle** | バーストサイクル | ×3 damage multiplier every 5th attack. Shows charging progress. | Rare |

### Empty Slot Synergy

| Chip | Japanese | Effect | Rarity |
|------|----------|--------|--------|
| **Minimalist** | ミニマリスト | +40 damage if weapon has 2+ empty chip slots. | Rare |
| **Lightweight** | ライトウェイト | +20 damage per empty weapon slot. | Uncommon |

### Sustain / Healing

| Chip | Japanese | Effect | Rarity |
|------|----------|--------|--------|
| **Lifelink** | ライフリンク | +5 damage, heal 5 HP. Every attack. | Uncommon |
| **Siphon** | サイフォン | -2 damage, heal 10 HP. Survival mode. | Uncommon |

### Conditional / Risky

| Chip | Japanese | Effect | Rarity |
|------|----------|--------|--------|
| **Executive Override** | エグゼクティブ | ×1.10 damage vs bosses only. No effect on normal enemies. | Rare |
| **Unstable Core** | 不安定コア | +50 damage, but 10% chance to randomly destroy one of your equipped chips. | Epic |

### Utility

| Chip | Japanese | Effect | Rarity |
|------|----------|--------|--------|
| **Copycat** | コピーキャット | Copies the previous chip's effect. No effect if first in pipeline. | Rare |

## Pipeline Execution Flow

```
Base Damage (from stats)
    ↓
[Chip 1] → trigger check → modify damage → pass to next
    ↓
[Chip 2] → trigger check → modify damage → pass to next
    ↓
  ...
    ↓
[Chip 5] → trigger check → modify damage → pass to next
    ↓
Final Damage → apply to enemy
```

## Example Combo

**Equipped (left to right):** Power Cell → Amplifier → Recursion → Overloader → Sacrifice

**Base damage:** 50

**Best case scenario:**
1. Power Cell: 50 + 5 = 55
2. Amplifier (80% triggers): 55 × 1.5 = 82
3. Recursion (10% triggers): RESTART
4. Power Cell: 82 + 5 = 87
5. Amplifier: 87 × 1.5 = 130
6. Recursion (10% triggers again): RESTART
7. Power Cell: 130 + 5 = 135
8. Amplifier: 135 × 1.5 = 202
9. Recursion (fails): pass
10. Overloader (50% triggers): 202 × 2 = 404
11. Sacrifice: 404 × 10 = **4,040 damage** (Sacrifice chip destroyed forever)

## State Tracking

| State | Scope | Used By |
|-------|-------|---------|
| `combatStacks` | Per combat (resets on enemy death) | Stack Overflow, Burst Cycle |
| `runKills` | Per run | Bounty Hunter |
| `runChipsDestroyed` | Per run | Phoenix Protocol |
| `weaponUsedSlots` | Current | Minimalist, Lightweight |
