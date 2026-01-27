# Chip Bot Retheme Design

Retheme all 18 pipeline chips from cyberpunk names to cute everyday-object bots. Each chip becomes a robot companion made from the essence of a common object that a beginner Japanese learner would recognize.

## Naming Convention

- Japanese: `[object in kanji/standard form]ボット`
- English: `[Object] Bot`
- IDs: lowercase English object name (e.g., `battery`, `mirror`)

Kanji is used wherever it's the standard written form. Katakana only for genuine loanwords (スピーカー, ストロー). Hiragana for words conventionally written that way (はさみ, おにぎり).

## Description Style

Gameplay-first with bot flavor: brief mechanical effect + one personality beat.

## Full Mapping

| Old ID | New ID | Japanese Name | English Name | Rarity | Effect Summary |
|---|---|---|---|---|---|
| powerCell | battery | 電池ボット | Battery Bot | common | flatAdd +5 |
| amplifier | speaker | スピーカーボット | Speaker Bot | uncommon | multiply ×1.5, 80% |
| critBooster | glasses | 眼鏡ボット | Glasses Bot | rare | critMod +20% |
| overloader | lightbulb | 電球ボット | Light Bulb Bot | epic | multiply ×2, 50% |
| finisher | scissors | はさみボット | Scissors Bot | rare | conditional +50% below 30% HP |
| recursion | clock | 時計ボット | Clock Bot | legendary | recursion 10% |
| sacrifice | charcoal | 炭ボット | Charcoal Bot | legendary | sacrifice ×10 |
| stackOverflow | book | 本ボット | Book Bot | epic | stacking +3, 25% |
| minimalist | eraser | 消しゴムボット | Eraser Bot | rare | emptySlots +40 if 2+ empty |
| lifelink | onigiri | おにぎりボット | Onigiri Bot | uncommon | damageAndHeal +5/heal 5 |
| bountyHunter | wallet | 財布ボット | Wallet Bot | epic | killCounter +1 |
| siphon | straw | ストローボット | Straw Bot | uncommon | damageAndHeal -2/heal 10 |
| executiveOverride | key | 鍵ボット | Key Bot | rare | vsBoss ×1.1 |
| phoenix | egg | 卵ボット | Egg Bot | legendary | destroyedMultiplier |
| unstable | fireworks | 花火ボット | Fireworks Bot | epic | riskyFlat +50, 10% destroy |
| copycat | mirror | 鏡ボット | Mirror Bot | rare | copy |
| lightweight | feather | 羽ボット | Feather Bot | uncommon | perEmptySlot +20 |
| burstCycle | drum | 太鼓ボット | Drum Bot | rare | nthAttack 5th ×3 |

## Descriptions

### battery (電池ボット)
- EN: Zaps enemies for +5 damage. Always fully charged and ready to help!
- JP: 小さな電池の相棒。攻撃に+5ダメージ。いつも元気いっぱい！

### speaker (スピーカーボット)
- EN: 80% chance to amplify damage by 1.5x. Loves turning it up to eleven!
- JP: 音を増幅する仲間。80%でダメージ1.5倍。声が大きい！

### glasses (眼鏡ボット)
- EN: +20% crit chance. Spots every weak point with scholarly precision!
- JP: 弱点を見つける目利き。CRIT率+20%。読書も得意。

### lightbulb (電球ボット)
- EN: 50% chance to double damage. Sometimes brilliantly bright, sometimes dim!
- JP: 時々まぶしく輝く。50%でダメージ2倍。ひらめき次第！

### scissors (はさみボット)
- EN: +50% damage when enemy below 30% HP. Snips them down to size!
- JP: 弱った敵をチョキン。敵HP30%以下でダメージ+50%。

### clock (時計ボット)
- EN: 10% chance to restart the pipeline from chip 1. Time is a loop!
- JP: 10%で時間を巻き戻す。パイプライン再起動。何度でも。

### charcoal (炭ボット)
- EN: x10 pipeline damage, but destroyed forever. Burns bright, then gone!
- JP: 自分を燃やして大爆発。ダメージ10倍。でも永遠にさよなら。

### book (本ボット)
- EN: 25% chance for +3 damage, stacks during combat. Knowledge is power!
- JP: 25%で+3ダメージ。戦闘中スタック。知識は力。

### eraser (消しゴムボット)
- EN: +40 damage if 2+ chip slots are empty. Loves a clean slate!
- JP: 空きスロット2つ以上で+40ダメージ。余白を愛する。

### onigiri (おにぎりボット)
- EN: +5 damage and heal 5 HP every attack. A tasty little battle buddy!
- JP: 戦いながら元気をくれる。+5ダメージ、5HP回復。

### wallet (財布ボット)
- EN: +1 damage per enemy defeated this run. Stacks forever. Cha-ching!
- JP: 敵を倒すたび+1ダメージ。無限スタック。お金持ちへの道。

### straw (ストローボット)
- EN: -2 damage but heal 10 HP. Sips your enemies' strength away!
- JP: 敵からHPをちゅーっと吸う。-2ダメージ、10HP回復。

### key (鍵ボット)
- EN: +10% damage to bosses. Unlocks their weak points!
- JP: ボスの弱点を開錠。ボスに10%追加ダメージ。

### egg (卵ボット)
- EN: x1 base, +1x for each chip destroyed this run. Cracks open stronger!
- JP: 破壊されたチップごとに+1倍。壊れるほど強くなる。

### fireworks (花火ボット)
- EN: +50 damage but 10% chance to destroy a random chip. Spectacular risk!
- JP: +50ダメージ。でも10%で仲間チップを巻き込む。

### feather (羽ボット)
- EN: +20 damage for each empty chip slot. Travel light, hit hard!
- JP: 軽いほど強い。空きスロットごとに+20ダメージ。

### mirror (鏡ボット)
- EN: Copies the previous chip's effect. The sincerest form of flattery!
- JP: 前のチップの効果をそのままコピー。真似上手。

### drum (太鼓ボット)
- EN: Every 5th attack deals x3 damage. Building to the big finale!
- JP: リズムを刻む。5回目の攻撃でダメージ3倍。ドドン！

## Files to Change

1. **`data/chips.json`** — Rename all keys/IDs, update name/nameEn/description/descriptionEn
2. **`tests/unit/pipeline-chips.test.js`** — Update chip ID references in test fixtures
3. **`tests/integration/pipeline-chip-effects.test.js`** — Update chip ID references
4. **`data/chips.old.json`** — Delete (dead file)

## Files That Need NO Changes

- `src/game/items/chips.js` — switches on `effects.pipeline.type`, not chip IDs
- `src/game/services/combat-service.js` — same, uses effect types
- No other code references chip IDs directly
