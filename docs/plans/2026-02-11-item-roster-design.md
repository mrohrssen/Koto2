# Item Roster Design

## Vision

Replace the 10 generic stat-buff items (e.g. "ATK Boost," "HP Boost") with 46 vocabulary-teaching items. Each item teaches one Japanese word. The item's name IS the word — no Pokemon-style portmanteaus needed.

When a player sees an item in the post-combat shop, they see:

> **水** (みず) — water
> Heal the lowest HP robot for 20%

The word sticks because they chose it, used it, and felt its effect.

---

## Design Rules

### 1. Every item teaches one word

The item's identity is a Japanese noun. The English name is the accurate dictionary translation. That's it.

| Field | Example |
|-------|---------|
| **Word** | 水 |
| **Reading** | みず |
| **Meaning** | water |
| **Rank** | 327 |

### 2. Prefer common words (low JPDB rank)

Same principle as creatures. Rank <1000 is ideal, <2000 is acceptable, <2500 is the maximum. A rank-300 word with a loose thematic fit beats a rank-5000 word that fits perfectly.

### 3. No overlap with creature vocabulary

Every word in the game should appear exactly once — as either a creature base word, a creature ability, or an item. This maximizes vocabulary coverage. 46 creatures teach 138 words (46 base + 92 abilities). 46 items teach 46 more words. Total: 184 unique words.

Check the creature roster appendix before adding any new item.

### 4. Names are the dictionary meaning

Item names are straightforward English translations. No wordplay, no creativity needed.

- **Good:** 水 → "Water", 薬 → "Medicine", お茶 → "Tea"
- **Bad:** 水 → "Aqua Splash", 薬 → "Healing Draught"

### 5. Effects should be thematically intuitive

A player should be able to guess roughly what an item does from its name:

- 水 (water) → healing
- 山 (mountain) → defense
- 友達 (friend) → team buff
- 時間 (time) → charges

This creates a secondary learning pathway: the word's meaning reinforces the game effect.

### 6. Items are area-themed

Items belong to the area where they're found. The post-combat shop draws from the current area's item pool. This groups related vocabulary — nature words in the forest, food words in the market, relationship words in the village.

---

## What to Cut

When evaluating a word from the seed list, cut it if:

1. **Overlaps another item** — 店/お店 (both "store"), 友達/友人 (both "friend"), ご飯/飯 (both "rice"), 書類/資料 (both "documents"). Keep the more common one.

2. **Is a location** — 学校, 教室, 大学, 高校, 小学校, 病院 are places. Items are things you pick up.

3. **Is a suffix or grammar word** — 屋 (shop suffix), 市 (market), 座 (seat counter). These don't work as standalone items.

4. **Too abstract or too specialized** — 季節 (season-as-category), 商品 (commodity), 環境 (environment). If you can't picture holding it, cut it.

5. **Already used by a creature** — Check the creature roster's base words and ability words appendix.

---

## Item Roster (46 Items)

### Enchanted Wilderness (10)

| # | Word | Reading | Meaning | Rank | Rarity | Type | Effect |
|---|------|---------|---------|------|--------|------|--------|
| 1 | 水 | みず | water | 327 | Common | heal | Heal 20% (lowest HP robot) |
| 2 | 山 | やま | mountain | 468 | Common | stat | Damage reduction +1 |
| 3 | 空 | そら | sky | 610 | Uncommon | utility | Charge +2 |
| 4 | 自然 | しぜん | nature | 690 | Rare | heal | Team heal 15% all robots |
| 5 | 海 | うみ | sea | 869 | Common | stat | HP +2% |
| 6 | 夏 | なつ | summer | 1079 | Uncommon | stat | Attack +3% |
| 7 | 匂い | におい | smell | 1337 | Uncommon | stat | Auto power +3% |
| 8 | 春 | はる | spring | 1695 | Common | stat | Element edge +0.05 |
| 9 | 冬 | ふゆ | winter | 1855 | Uncommon | stat | Damage reduction +1 |
| 10 | 秋 | あき | autumn | 2351 | Rare | heal | Heal to full (most damaged) |

**Source:** 自然, 春, 夏, 秋, 冬, 匂い from seed list. 水, 山, 空, 海 added as essential nature vocabulary.

**Cut from seed list:** 季節 (abstract category r2576), 香り (overlaps 匂い conceptually).

---

### School District (9)

| # | Word | Reading | Meaning | Rank | Rarity | Type | Effect |
|---|------|---------|---------|------|--------|------|--------|
| 11 | 時間 | じかん | time | 40 | Legendary | utility | Charge +3 and all stats +1% |
| 12 | 言葉 | ことば | words | 113 | Common | stat | Auto power +3% |
| 13 | 写真 | しゃしん | photograph | 902 | Common | stat | Attack +2% |
| 14 | 先輩 | せんぱい | senior | 1217 | Uncommon | stat | Ultimate power +5% |
| 15 | 紙 | かみ | paper | 1234 | Common | stat | Auto power +3% |
| 16 | 時計 | とけい | clock | 1281 | Uncommon | utility | Charge +2 |
| 17 | 手紙 | てがみ | letter | 1301 | Common | heal | Team heal 10% all robots |
| 18 | 物語 | ものがたり | story | 1737 | Rare | stat | Ultimate power +5% |
| 19 | 音楽 | おんがく | music | 1987 | Rare | heal | Team heal 15% all robots |

**Source:** 写真, 先輩, 手紙, 物語, 音楽 from seed list. 時間, 言葉, 紙, 時計 added as essential school/learning vocabulary.

**Cut from seed list:** 大学 (location), 学生 (overlaps 生徒 creature), 高校 (location), 小学校 (location r2712), 書類 (overlaps 資料), 資料 (abstract), 新聞 (r2581), 作品 (abstract).

---

### Market District & Grand Kitchen (8)

| # | Word | Reading | Meaning | Rank | Rarity | Type | Effect |
|---|------|---------|---------|------|--------|------|--------|
| 20 | お金 | おかね | money | 467 | Uncommon | stat | Random stat +2% |
| 21 | 料理 | りょうり | cooking | 682 | Common | heal | Heal 25% (lowest HP robot) |
| 22 | 食事 | しょくじ | meal | 712 | Uncommon | heal | Team heal 15% all robots |
| 23 | 味 | あじ | flavor | 924 | Common | stat | Attack +2% |
| 24 | 薬 | くすり | medicine | 1034 | Rare | heal | Heal to full (most damaged) |
| 25 | 酒 | さけ | sake | 1390 | Epic | stat | Attack +5%, HP −3% |
| 26 | お茶 | おちゃ | tea | 1410 | Common | heal | Heal 15% all robots |
| 27 | ご飯 | ごはん | cooked rice | 1879 | Common | heal | Heal 20% (lowest HP robot) |

**Source:** 料理, 食事, 味, 酒, お茶, ご飯 from seed list. お金, 薬 added as essential market vocabulary.

**Cut from seed list:** 店 (location-like), 屋 (suffix), お店 (overlaps 店), 市 (location), 飯 (overlaps ご飯), 食べ物 (overlaps 食事), 材料 (abstract), 商品 (abstract).

---

### Family Village (8)

| # | Word | Reading | Meaning | Rank | Rarity | Type | Effect |
|---|------|---------|---------|------|--------|------|--------|
| 28 | 気持ち | きもち | feeling | 71 | Epic | stat | Auto power +5% |
| 29 | 心 | こころ | heart | 82 | Epic | stat | HP +5% |
| 30 | 家族 | かぞく | family | 341 | Uncommon | stat | HP +3% |
| 31 | 友達 | ともだち | friend | 584 | Common | stat | Attack +2% |
| 32 | 味方 | みかた | ally | 1407 | Uncommon | stat | Damage reduction +1 |
| 33 | 両親 | りょうしん | parents | 1417 | Epic | stat | HP +3% and damage reduction +1 |
| 34 | 恋人 | こいびと | lover | 1469 | Legendary | heal | Revive KO'd robot at 50% HP |
| 35 | 兄弟 | きょうだい | siblings | 2440 | Rare | stat | Attack +3% |

**Source:** 家族, 友達, 味方, 両親, 恋人, 兄弟 from seed list. 気持ち, 心 added as essential emotion/relationship vocabulary.

**Cut from seed list:** 友人 (overlaps 友達), 夫婦 (too specific r2103), 大声 (odd as item), 拍手 (odd as item), 親子 (overlaps 両親).

---

### Crossroads Inn (11)

| # | Word | Reading | Meaning | Rank | Rarity | Type | Effect |
|---|------|---------|---------|------|--------|------|--------|
| 36 | 名前 | なまえ | name | 85 | Common | stat | Auto power +3% |
| 37 | 本 | ほん | book | 302 | Common | stat | Ultimate power +3% |
| 38 | 物 | もの | thing | 522 | Common | utility | Random effect |
| 39 | 約束 | やくそく | promise | 538 | Uncommon | utility | Charge +2 |
| 40 | 服 | ふく | clothes | 837 | Uncommon | stat | Damage reduction +1 |
| 41 | 鍵 | かぎ | key | 1087 | Rare | utility | Charge +3 |
| 42 | 謎 | なぞ | riddle | 1607 | Rare | utility | Random large buff |
| 43 | 旅 | たび | travel | 1628 | Uncommon | stat | Element edge +0.05 |
| 44 | 地図 | ちず | map | 1638 | Rare | stat | Element edge +0.10 |
| 45 | 道具 | どうぐ | tool | 1665 | Epic | stat | Attack +3% and auto power +3% |
| 46 | プレゼント | プレゼント | present | 2006 | Epic | utility | Random epic-tier buff |

**Source:** 本, 物, 約束, 謎, 旅, 道具, プレゼント from seed list. 名前, 服, 鍵, 地図 added as essential travel/object vocabulary.

**Cut from seed list:** 席, 役, 型, 面, 額, 格好 (too abstract as standalone items), 本物, 空間, 穴, 見た目, 現場, 底, 片手, 環境, 宿, 表, 台, 足元, 品, 服装, 表面, 座, 社 (abstract, specialized, or redundant).

---

## Rarity Distribution

| Rarity | Count | % | Target |
|--------|-------|---|--------|
| Common | 16 | 35% | ~33% |
| Uncommon | 13 | 28% | ~27% |
| Rare | 9 | 20% | ~20% |
| Epic | 6 | 13% | ~15% |
| Legendary | 2 | 4% | ~5% |

---

## Effect Type Reference

Items use the existing effect system from `item-service.js`. No new effect types needed — just more variety in assignments.

| Type | Fields | Example |
|------|--------|---------|
| `stat` | `attackMult`, `hpMult`, `autoPowerMult`, `ultimatePowerMult`, `elementEdge`, `flatDamageReduction` | `{ "field": "attackMult", "value": 0.03 }` |
| `heal` | `healPercent`, `healMostDamaged`, `revivePercent`, `healAllPercent` | `{ "healPercent": 0.20 }` |
| `utility` | `chargeBoost` | `{ "chargeBoost": 2 }` |

**New sub-fields needed:**
- `healAllPercent` — heals ALL robots by X% (currently only heals lowest or most damaged)
- Compound effects — items like 酒 (sake) that buff one stat and debuff another need `{ "field": "attackMult", "value": 0.05, "penalty": { "field": "hpMult", "value": -0.03 } }`
- Random effects — items like 物 (thing) and お金 (money) need a `random` flag to pick from a pool at application time

---

## JSON Structure

Each item in `data/items.json`:

```json
{
  "id": "water",
  "word": "水",
  "reading": "みず",
  "meaning": "water",
  "rank": 327,
  "area": "Enchanted Wilderness",
  "rarity": "common",
  "type": "heal",
  "effect": { "healPercent": 0.20 },
  "description": "Heal the lowest HP robot for 20% of max HP"
}
```

The shop UI displays `word`, `reading`, `meaning`, and `description`. Players learn the vocabulary word every time they see the item offered.

---

## Implementation Notes

### Shop Rolling

Currently `rollShopItems()` picks 3 random items from a flat pool of 10. With 46 area-themed items:

1. **Filter by current area** — only offer items from the area the player is exploring
2. **Rarity weighting** — common items appear more often, legendary items are rare finds
3. **No-repeat within a run** — optionally track which items have been offered to maximize vocabulary exposure

### Vocabulary Display

The post-combat shop UI (`public/js/ui/post-combat-shop.js`) needs to show:
- The Japanese word in large text
- The reading (furigana) above or below
- The English meaning
- The game effect description

This mirrors how creature vocabulary is displayed — word + reading + meaning — creating a consistent learning experience.

---

## Appendix: All Item Words (46)

Sorted by rank. These words are taken — do not reuse for new creatures or items.

| Rank | Word | Reading | Meaning | Area |
|------|------|---------|---------|------|
| 40 | 時間 | じかん | time | School District |
| 71 | 気持ち | きもち | feeling | Family Village |
| 82 | 心 | こころ | heart | Family Village |
| 85 | 名前 | なまえ | name | Crossroads Inn |
| 113 | 言葉 | ことば | words | School District |
| 302 | 本 | ほん | book | Crossroads Inn |
| 327 | 水 | みず | water | Enchanted Wilderness |
| 341 | 家族 | かぞく | family | Family Village |
| 467 | お金 | おかね | money | Market District |
| 468 | 山 | やま | mountain | Enchanted Wilderness |
| 522 | 物 | もの | thing | Crossroads Inn |
| 538 | 約束 | やくそく | promise | Crossroads Inn |
| 584 | 友達 | ともだち | friend | Family Village |
| 610 | 空 | そら | sky | Enchanted Wilderness |
| 682 | 料理 | りょうり | cooking | Market District |
| 690 | 自然 | しぜん | nature | Enchanted Wilderness |
| 712 | 食事 | しょくじ | meal | Market District |
| 837 | 服 | ふく | clothes | Crossroads Inn |
| 869 | 海 | うみ | sea | Enchanted Wilderness |
| 902 | 写真 | しゃしん | photograph | School District |
| 924 | 味 | あじ | flavor | Market District |
| 1034 | 薬 | くすり | medicine | Market District |
| 1079 | 夏 | なつ | summer | Enchanted Wilderness |
| 1087 | 鍵 | かぎ | key | Crossroads Inn |
| 1217 | 先輩 | せんぱい | senior | School District |
| 1234 | 紙 | かみ | paper | School District |
| 1281 | 時計 | とけい | clock | School District |
| 1301 | 手紙 | てがみ | letter | School District |
| 1337 | 匂い | におい | smell | Enchanted Wilderness |
| 1390 | 酒 | さけ | sake | Market District |
| 1407 | 味方 | みかた | ally | Family Village |
| 1410 | お茶 | おちゃ | tea | Market District |
| 1417 | 両親 | りょうしん | parents | Family Village |
| 1469 | 恋人 | こいびと | lover | Family Village |
| 1607 | 謎 | なぞ | riddle | Crossroads Inn |
| 1628 | 旅 | たび | travel | Crossroads Inn |
| 1638 | 地図 | ちず | map | Crossroads Inn |
| 1665 | 道具 | どうぐ | tool | Crossroads Inn |
| 1695 | 春 | はる | spring | Enchanted Wilderness |
| 1737 | 物語 | ものがたり | story | School District |
| 1855 | 冬 | ふゆ | winter | Enchanted Wilderness |
| 1879 | ご飯 | ごはん | cooked rice | Market District |
| 1987 | 音楽 | おんがく | music | School District |
| 2006 | プレゼント | プレゼント | present | Crossroads Inn |
| 2351 | 秋 | あき | autumn | Enchanted Wilderness |
| 2440 | 兄弟 | きょうだい | siblings | Family Village |
