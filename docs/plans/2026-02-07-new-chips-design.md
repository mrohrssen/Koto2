# New Chips Design Plan

**Date:** 2026-02-07
**Goal:** Add chip variety — fill common gaps, add economy/synergy tricksters, new tanks & strikers.
**Status:** Design phase (not yet approved for implementation)

## Current Gaps

| Archetype | Existing Commons | Target | Gap |
|-----------|-----------------|--------|-----|
| Striker | 1 (Battery) | 5 | **4 needed** |
| Tank | 0 | 5 | **5 needed** |
| Healer | 2 (Onigiri, Straw) | 5 | **3 needed** |
| Amplifier | 0 | 5 | **5 needed** |
| Trickster | 1 (Gold Star) | — | covered by new designs |

## Implementation Complexity Key

- **EXISTING** — uses current pipeline types and skill types, zero new code
- **MINOR** — small extension to existing type (new condition, new target)
- **NEW** — requires new pipeline type, event hook, or skill effect

---

## Economy Tricksters

### 1. コップボット / Cup Bot — "Steal gold"
- **Rarity:** Uncommon | **Archetype:** Trickster
- **Stats:** PWR 12, BW 0, HP 35
- **Passive:** `conditional` (enemyLowHp 50%) — +8 power when enemy below half HP
- **Active (5 charges):** *Pickpocket* — Instant: earn 15 credits
- **Complexity:** Passive EXISTING (new threshold), Active **NEW** (earn-credits skill type)

### 2. 貯金箱ボット / Piggy Bank Bot — "Skills grant credits"
- **Rarity:** Uncommon | **Archetype:** Trickster
- **Stats:** PWR 9, BW 0, HP 45
- **Passive:** Whenever any equipped chip uses its active skill, earn +5 credits
- **Active (5 charges):** *Smash Open* — Instant: deal damage equal to credits held (cap 50)
- **Complexity:** Passive **NEW** (on-skill-use credit trigger), Active **NEW** (damageFromCredits)

### 3. そろばんボット / Abacus Bot — "+5 power per 10 credits"
- **Rarity:** Rare | **Archetype:** Trickster
- **Stats:** PWR 6, BW 0, HP 40
- **Passive:** +5 power per 10 credits currently held
- **Active (5 charges):** *Double Down* — POST_PIPELINE buff: x1.5 multiplier
- **Complexity:** Passive **NEW** (creditBonus pipeline type), Active EXISTING

### 4. クレジットカードボット / Credit Card Bot — "Go into debt"
- **Rarity:** Epic | **Archetype:** Trickster
- **Stats:** PWR 10, BW 0, HP 30
- **Passive:** Credit floor becomes -20 instead of 0 (can spend into debt)
- **Active (5 charges):** *Cash Advance* — Instant: earn 25 credits
- **Complexity:** Passive **NEW** (meta/shop mechanic), Active **NEW** (earn-credits skill type)

### 5. 茶碗ボット / Rice Bowl Bot — "Bonus credits if 3+ tricksters"
- **Rarity:** Rare | **Archetype:** Trickster
- **Stats:** PWR 10, BW 0, HP 35
- **Passive:** +20% credit rewards from combat if 3+ tricksters equipped
- **Active (5 charges):** *Full Course* — Instant: deal 8 damage per trickster equipped
- **Complexity:** Passive **NEW** (archetype-count credit bonus), Active **NEW** (damagePerArchetype)

### 6. 電卓ボット / Calculator Bot — "Credits from chip levels"
- **Rarity:** Rare | **Archetype:** Trickster
- **Stats:** PWR 8, BW 0, HP 40
- **Passive:** End of combat, earn 1 credit x (sum of all equipped chip levels)
- **Active (5 charges):** *Compute* — POST_PIPELINE buff: x1.4 multiplier
- **Complexity:** Passive **NEW** (post-combat event hook), Active EXISTING

### 7. サイコロボット / Dice Bot — "Free shop reroll"
- **Rarity:** Uncommon | **Archetype:** Trickster
- **Stats:** PWR 11, BW 0, HP 35
- **Passive:** One additional free shop reroll per visit (normally first is free, this gives a second)
- **Active (5 charges):** *Lucky Roll* — Instant: deal 25 damage
- **Complexity:** Passive **NEW** (shop meta-mechanic), Active EXISTING

### 8. 鉛筆ボット / Pencil Bot — "Level up a chip"
- **Rarity:** Rare | **Archetype:** Trickster
- **Stats:** PWR 10, BW 0, HP 35
- **Passive:** `rampingMultiply` — +2 power per consecutive hit
- **Active (5 charges):** *Study* — Level up a random equipped chip by +1
- **Complexity:** Passive EXISTING, Active **NEW** (level-up skill effect)

### 9. スポンジボット / Sponge Bot — "+2 power per fight"
- **Rarity:** Uncommon | **Archetype:** Trickster
- **Stats:** PWR 8, BW 0, HP 45
- **Passive:** Gain +2 permanent power after each combat (persists through run)
- **Active (5 charges):** *Squeeze* — POST_PIPELINE buff: x1.5 multiplier
- **Complexity:** Passive **NEW** (post-combat stat growth), Active EXISTING

### 10. レシートボット / Receipt Bot — "+10 power on chip sold"
- **Rarity:** Rare | **Archetype:** Trickster
- **Stats:** PWR 8, BW 0, HP 35
- **Passive:** Gain +10 permanent power whenever any chip is sold
- **Active (5 charges):** *Liquidate* — Instant: deal 25 damage
- **Complexity:** Passive **NEW** (on-sell event hook), Active EXISTING

### 11. 万年筆ボット / Fountain Pen Bot — "Skills trigger twice"
- **Rarity:** Legendary | **Archetype:** Trickster
- **Stats:** PWR 14, BW 0, HP 30
- **Passive:** All equipped chips' active skills fire their effects twice when used
- **Active (5 charges):** *Encore* — POST_PIPELINE buff: x1.8 multiplier
- **Complexity:** Passive **NEW** (global skill modifier), Active EXISTING

---

## Synergy Tricksters

### 12. 箸ボット / Chopsticks Bot — "+2 BW if all others are strikers"
- **Rarity:** Rare | **Archetype:** Trickster
- **Stats:** PWR 10, BW 0, HP 30
- **Passive:** +2 bandwidth if every other equipped chip is a striker
- **Active (5 charges):** *Precision Strike* — POST_PIPELINE buff: x1.6 multiplier
- **Complexity:** Passive **NEW** (archetype-restriction BW bonus), Active EXISTING

### 13. 座布団ボット / Cushion Bot — "2x HP if all others are tanks"
- **Rarity:** Rare | **Archetype:** Trickster
- **Stats:** PWR 8, BW 0, HP 50
- **Passive:** Double this chip's HP contribution if every other equipped chip is a tank
- **Active (5 charges):** *Fortify* — DEFENSIVE buff: survive lethal with 1 HP
- **Complexity:** Passive **NEW** (archetype-check HP modifier), Active EXISTING

### 14. 湯呑みボット / Tea Cup Bot — "+BW per grammar answer"
- **Rarity:** Uncommon | **Archetype:** Trickster
- **Stats:** PWR 9, BW 0, HP 40
- **Passive:** +0.1 bandwidth each time a grammar question is answered correctly this combat
- **Active (5 charges):** *Tea Time* — PRE_PIPELINE buff: +12 flat damage
- **Complexity:** Passive **NEW** (grammar event hook), Active EXISTING

### 15. 急須ボット / Teapot Bot — "+BW per chip level-up"
- **Rarity:** Uncommon | **Archetype:** Trickster
- **Stats:** PWR 9, BW 0, HP 40
- **Passive:** +0.1 bandwidth each time any chip is leveled (persists through run)
- **Active (5 charges):** *Boiling Point* — POST_PIPELINE buff: x1.5 multiplier
- **Complexity:** Passive **NEW** (on-level event hook), Active EXISTING

### 16. リモコンボット / Remote Bot — "+3 power to all on skill use"
- **Rarity:** Epic | **Archetype:** Trickster
- **Stats:** PWR 12, BW 0, HP 30
- **Passive:** Whenever any chip uses its active skill, ALL chips gain +3 permanent power
- **Active (5 charges):** *Channel Surf* — PIPELINE_MODIFIER: run pipeline twice
- **Complexity:** Passive **NEW** (on-skill-use power trigger), Active EXISTING

---

## Archetype-Bonus Chips

### 17. フライパンボット / Frying Pan Bot — "Extra damage with 3+ strikers"
- **Rarity:** Rare | **Archetype:** Striker
- **Stats:** PWR 14, BW 0, HP 40
- **Passive:** +8 power if 3+ strikers equipped
- **Active (5 charges):** *Searing Blow* — POST_PIPELINE buff: x1.5 multiplier
- **Complexity:** Passive **NEW** (archetype-count power bonus), Active EXISTING

### 18. 畳ボット / Tatami Bot — "Extra HP with 3+ tanks"
- **Rarity:** Rare | **Archetype:** Tank
- **Stats:** PWR 7, BW 0, HP 90
- **Passive:** +30 HP if 3+ tanks equipped
- **Active (5 charges):** *Brace* — DEFENSIVE buff: survive lethal with 1 HP
- **Complexity:** Passive **NEW** (archetype-count HP bonus), Active EXISTING

---

## Special Chips

### 19. ライターボット / Lighter Bot — "Glass cannon, may self-destruct"
- **Rarity:** Epic | **Archetype:** Striker
- **Stats:** PWR 30, BW 0, HP 20
- **Passive:** 10% chance to be destroyed at end of each combat
- **Active (5 charges):** *Blaze* — POST_PIPELINE buff: x2.0 multiplier
- **Complexity:** Passive **NEW** (post-combat self-destruct chance), Active EXISTING

### 20. 盾ボット / Shield Bot — "Defending charges 2x"
- **Rarity:** Rare | **Archetype:** Tank
- **Stats:** PWR 5, BW 0, HP 85
- **Passive:** When player defends (skips attack), all chips gain 2x charges that turn
- **Active (5 charges):** *Hunker Down* — DEFENSIVE buff: survive lethal with 1 HP
- **Complexity:** Passive **NEW** (defend-action modifier — NOTE: defend action may not exist yet), Active EXISTING

### 21. 湯たんぽボット / Hot Water Bottle Bot — "+25% healing"
- **Rarity:** Uncommon | **Archetype:** Tank
- **Stats:** PWR 6, BW 0, HP 80
- **Passive:** All healing received is increased by 25%
- **Active (5 charges):** *Warm Up* — PRE_PIPELINE buff: +10 flat damage
- **Complexity:** Passive **NEW** (healing modifier), Active EXISTING

---

## Common Strikers (filling gap: 4 needed)

### 22. ハンマーボット / Hammer Bot — "Burst hitter"
- **Stats:** PWR 9, BW 0, HP 40
- **Passive:** `nthAttack` (interval 4) x1.5 power — weak most turns, huge spike every 4th
- **Active (5 charges):** *Slam* — POST_PIPELINE buff: x1.5 (time it with the 4th hit)
- **Complexity:** EXISTING

### 23. 爪切りボット / Nail Clipper Bot — "Risky sharp edge"
- **Stats:** PWR 13, BW 0, HP 40
- **Passive:** `riskyFlat` — 5% chance to destroy a random chip per attack. High base power payoff.
- **Active (5 charges):** *Precision Cut* — Instant: deal 20 damage
- **Complexity:** EXISTING

### 24. 栓抜きボット / Bottle Opener Bot — "Opens up the pipeline"
- **Stats:** PWR 11, BW 0, HP 35
- **Passive:** `amplifyNext` x1.15 — a striker that boosts the chip after it. Slot order matters.
- **Active (5 charges):** *Pop Off* — POST_PIPELINE buff: x1.3 multiplier
- **Complexity:** EXISTING

### 25. 輪ゴムボット / Rubber Band Bot — "Tension builder"
- **Stats:** PWR 8, BW 0, HP 50
- **Passive:** `stacking` +2 power, 40% chance — builds tension over the fight
- **Active (5 charges):** *Snap* — Instant: deal stacks x2 as damage (damageFromStacks)
- **Complexity:** EXISTING

---

## Common Tanks (filling gap: 5 needed)

### 26. 枕ボット / Pillow Bot — "Rewards staying healthy"
- **Stats:** PWR 6, BW 0, HP 80
- **Passive:** `conditional` (playerHighHp 75%) — +5 power when above threshold
- **Active (5 charges):** *Smother* — POST_PIPELINE buff: x1.3
- **Complexity:** **MINOR** — new `playerHighHp` condition for existing `conditional` type

### 27. 傘ボット / Umbrella Bot — "Protects the next chip"
- **Stats:** PWR 5, BW 0, HP 78
- **Passive:** `amplifyNext` x1.1 — a tank that supports the chip after it
- **Active (5 charges):** *Windbreak* — PRE_PIPELINE buff: +10 flat damage
- **Complexity:** EXISTING

### 28. バケツボット / Bucket Bot — "Bandwidth from a tank"
- **Stats:** PWR 5, BW 0, HP 85
- **Passive:** `perEquipped` +0.1 BW per equipped chip — unusual tank contributing bandwidth
- **Active (5 charges):** *Splash* — Instant: deal 12 damage
- **Complexity:** **MINOR** — add bandwidth target to existing `perEquipped` type

### 29. タオルボット / Towel Bot — "Patient stacker"
- **Stats:** PWR 7, BW 0, HP 75
- **Passive:** `stacking` +1 power, 30% chance — slow accumulation
- **Active (5 charges):** *Wrap Up* — Instant: deal stacks x2 as damage (damageFromStacks)
- **Complexity:** EXISTING

### 30. スリッパボット / Slippers Bot — "Thrives in chaos"
- **Stats:** PWR 6, BW 0, HP 78
- **Passive:** `destroyedMultiplier` +3 power per destroyed chip — synergizes with Fireworks/Egg Bot
- **Active (5 charges):** *Kick* — PRE_PIPELINE buff: +8 flat damage
- **Complexity:** **MINOR** — add power target to existing `destroyedMultiplier` type

---

## Still Needed (not yet designed)

- **3 common healers**
- **5 common amplifiers**

---

## Implementation Priority Suggestion

1. **Phase 1 — Existing mechanics only (chips 22-25, 27, 29):** Ship 6 commons immediately with zero new code
2. **Phase 2 — Minor extensions (chips 26, 28, 30):** Ship 3 more commons with small tweaks to existing pipeline types
3. **Phase 3 — New mechanic groups:** Implement by feature cluster:
   - **Archetype-count checks** (Chopsticks, Cushion, Frying Pan, Tatami, Rice Bowl)
   - **Credit interaction** (Abacus, Cup, Credit Card, Calculator, Piggy Bank)
   - **Event hooks** (Sponge, Receipt, Remote, Piggy Bank, Tea Cup, Teapot)
   - **New skill effects** (Pencil level-up, Fountain Pen double-trigger, earn-credits skills)
   - **Meta/shop effects** (Dice Bot reroll, Credit Card debt)
4. **Phase 4 — Design remaining commons** (3 healers, 5 amplifiers)

---

## Taken Household Item Names

Already in game: 電池, スピーカー, 眼鏡, 電球, はさみ, 時計, 炭, 本, 消しゴム, おにぎり, 財布, ストロー, 鍵, 卵, 花火, 鏡, 羽, 太鼓, 虫眼鏡, 工具箱, 針, アドレナリン, 二人組, アイス, 蝋燭, 金星, 弱者, 錨, 点火, ヒル, 吸血, 過負荷

Used in this plan: コップ, 貯金箱, そろばん, クレジットカード, 茶碗, 電卓, サイコロ, 鉛筆, スポンジ, レシート, 万年筆, 箸, 座布団, 湯呑み, 急須, リモコン, フライパン, 畳, ライター, 盾, 湯たんぽ, ハンマー, 爪切り, 栓抜き, 輪ゴム, 枕, 傘, バケツ, タオル, スリッパ
