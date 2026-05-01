# Base Creature Roster Expansion

Saved proposal for expanding Koto's base creature roster to 50 total creatures.

## Selection Rule

Use JPDB frequency as the default rarity pressure, then override rarity for semantic strength, fantasy weight, and creature appeal. This keeps frequent words broadly accessible while preventing cases like `竜` / Dragon from becoming weaker or more common than small animals only because the word is relatively frequent.

Frequency tiers:

- Very common: JPDB rank <= 1000
- Common: JPDB rank <= 2500
- Mid: JPDB rank <= 7000
- Low: JPDB rank <= 15000
- Very low: JPDB rank <= 25000
- Ultra low: JPDB rank > 25000

## Rejected Concepts

- `火猫` / Fire Cat: compound creature.
- `石の巨人` / Stone Giant: compound creature.
- `机` / Desk: item, not creature.
- `椅子` / Chair: item, not creature.
- `山` / Mountain: too abstract as a base creature.
- `空` / Sky: too abstract as a base creature.
- `森` / Forest: too abstract as a base creature.
- `雨` / Rain: too abstract as a base creature.

## How To Expand This List Later

Future roster expansions should preserve the same rule: start with JPDB frequency, then correct for whether the concept actually makes sense as a creature.

### Candidate Filter

Prefer candidates that satisfy at least one of these:

- Concrete animals: `猿` / Monkey, `鹿` / Deer, `鴨` / Duck.
- Mythic or folklore beings: `竜` / Dragon, `鬼` / Oni, `妖精` / Fairy.
- Elemental mascots with a clear creature silhouette: `火` / Fire, `水` / Water, `雲` / Cloud, `雷` / Thunder.
- Cute or visually distinct small creatures, even when lower frequency: `蛙` / Frog, `亀` / Turtle, `蝶` / Butterfly.

Reject candidates that match any of these:

- Compounds made by combining existing creature words unless the user explicitly asks for fusion/evolution creatures.
- Items or furniture, even if the word is high frequency.
- Places, habitats, or realms: mountain, sky, forest, cave, river, town, road.
- Diffuse phenomena that do not naturally become a creature. `雨` / Rain was rejected for this reason; do not re-add it without explicit user approval.
- Concepts that are hard to make cute, readable, or visually interesting as a base creature.

When uncertain, prefer a concrete animal over an abstract nature word.

### JPDB Validation Workflow

1. Ask the user for a fresh JPDB API key. Do not reuse keys from old scripts, docs, terminal history, or prior conversations.
2. Parse candidate words through JPDB before looking up frequency. Some single-kanji words have multiple readings and need context to select the intended entry.
3. Lookup `frequency_rank` and dictionary meanings from JPDB.
4. Verify the English definition is dictionary-accurate and matches the intended creature concept.
5. Record the Japanese spelling, reading, definition, JPDB rank, frequency tier, proposed rarity, and reason.

For ambiguous single-kanji words, validate with a short contextual phrase if JPDB picks the wrong reading. Example: `風` alone may resolve as `ふう`, but the creature uses `風` / `かぜ` meaning "wind; breeze".

### Rarity Override Rubric

Use the frequency tier as the starting point:

- Very common and common words usually become Common.
- Mid-frequency words usually become Uncommon.
- Low-frequency words usually become Uncommon or Rare.
- Very low and ultra-low words usually become Rare or Epic.

Then apply semantic overrides:

- Raise rarity for inherently powerful or mythic creatures: Dragon, Oni, Ghost, Fairy.
- Raise rarity for apex predators or very large creatures: Tiger, Lion, Bear, Whale.
- Keep ordinary cute animals lower than their frequency alone might imply: Rabbit, Frog, Turtle, Duck.
- Do not make a weak small animal legendary only because its JPDB rank is low.
- Do not make a legendary-feeling creature common only because its JPDB rank is relatively high.

### Expansion Checklist

Before adding a future candidate to the roster:

- It is not a compound creature, unless the task is explicitly about compounds, fusions, or evolutions.
- It is not an item, tool, furniture piece, place, or habitat.
- It can plausibly be drawn as a cute or interesting creature.
- JPDB rank, reading, and meaning were validated from the API.
- The English gloss is dictionary-accurate and not embellished.
- The rarity follows frequency by default, with any semantic override explained in the `Reason` column.
- The total roster count still matches the target count.

## JPDB-Validated Roster

| Status | Creature | Japanese | Reading | Definition | JPDB Rank | Frequency Tier | Rarity | Reason |
|---|---|---|---|---|---:|---|---|---|
| Keep | Water | 水 | みず | water | 400 | Very common | Common | Starter-grade element |
| Add | Light | 光 | ひかり | light | 600 | Very common | Common | High-frequency elemental mascot |
| Keep | Flower | 花 | はな | flower; blossom | 800 | Very common | Common | Cute nature base |
| Add | Sea | 海 | うみ | sea; ocean | 800 | Very common | Common | Core nature element |
| Keep | Wind | 風 | かぜ | wind; breeze | 800 | Very common | Common | Contextual JPDB reading |
| Keep | Tree | 木 | き | tree; wood | 900 | Very common | Common | Starter-grade nature base |
| Keep | Fire | 火 | ひ | fire; flame | 1000 | Very common | Common | Starter-grade element |
| Add | Moon | 月 | つき | moon; month | 1100 | Common | Common | Iconic but approachable |
| Add | Shadow | 影 | かげ | shadow; silhouette | 1400 | Common | Uncommon | Spooky concept override |
| Keep | Stone | 石 | いし | stone | 1500 | Common | Common | Durable simple base |
| Add | Star | 星 | ほし | star; heavenly body | 1500 | Common | Common | Cute celestial base |
| Keep | Dog | 犬 | いぬ | dog | 1500 | Common | Common | Familiar animal |
| Keep | Cat | 猫 | ねこ | cat | 1600 | Common | Common | Familiar animal |
| Add | Horse | 馬 | うま | horse | 1600 | Common | Common | Familiar strong animal |
| Keep | Bird | 鳥 | とり | bird | 1800 | Common | Common | Familiar flying animal |
| Add | Snow | 雪 | ゆき | snow; snowfall | 1800 | Common | Common | Weather creature |
| Keep | Fish | 魚 | さかな | fish | 1900 | Common | Common | Familiar water animal |
| Add | Oni | 鬼 | おに | ogre; demon; oni | 2000 | Common | Rare | Strong folklore override |
| Add | Cloud | 雲 | くも | cloud | 2200 | Common | Common | Soft weather creature |
| Add | Grass | 草 | くさ | grass; weed; herb | 2200 | Common | Common | Small nature base |
| Keep | Iron | 鉄 | てつ | iron | 2200 | Common | Common | Material elemental base |
| Keep | Bug | 虫 | むし | insect; bug | 2300 | Common | Common | Simple creature class |
| Add | Dragon | 竜 | りゅう | dragon | 3300 | Mid | Legendary | Primary semantic override |
| Add | Thunder | 雷 | かみなり | lightning; thunder | 3600 | Mid | Uncommon | Strong element, not endgame-only |
| Add | Snake | 蛇 | へび | snake; serpent | 3600 | Mid | Uncommon | Predator but common archetype |
| Add | Ghost | 幽霊 | ゆうれい | ghost; apparition | 3600 | Mid | Rare | Supernatural override |
| Add | Wolf | 狼 | おおかみ | wolf | 3700 | Mid | Uncommon | Stronger than dog, not legendary |
| Add | Cow | 牛 | うし | cattle; cow; bull; ox | 4400 | Mid | Uncommon | Ordinary animal despite lower rank |
| Add | Bear | 熊 | くま | bear | 4700 | Mid | Rare | Large-power animal override |
| Add | Monkey | 猿 | さる | monkey; ape | 5200 | Mid | Uncommon | Concrete creature replacing Mountain |
| Add | Pig | 豚 | ぶた | pig | 5500 | Mid | Uncommon | Concrete creature replacing Sky |
| Add | Tiger | 虎 | とら | tiger | 5600 | Mid | Rare | Apex predator override |
| Add | Deer | 鹿 | しか | deer | 6600 | Mid | Uncommon | Concrete creature replacing Forest |
| Add | Fairy | 妖精 | ようせい | fairy; sprite; elf | 8300 | Low | Rare | Magical creature |
| Keep | Butterfly | 蝶 | ちょう | butterfly | 8600 | Low | Uncommon | Cute low-frequency creature |
| Add | Fox | 狐 | きつね | fox | 8600 | Low | Rare | Cultural trickster appeal |
| Add | Sheep | 羊 | ひつじ | sheep | 8700 | Low | Uncommon | Ordinary cute animal |
| Add | Rabbit | 兎 | うさぎ | rabbit; hare | 8800 | Low | Uncommon | Cute animal, not power rare |
| Add | Lion | 獅子 | しし | lion | 9000 | Low | Rare | Apex predator override |
| Add | Spider | 蜘蛛 | くも | spider | 9100 | Low | Uncommon | Distinct silhouette, moderate power |
| Add | Turtle | 亀 | かめ | tortoise; turtle | 9300 | Low | Uncommon | Defensive creature |
| Add | Hawk | 鷹 | たか | hawk; falcon | 9400 | Low | Rare | Predator bird override |
| Add | Mouse/Rat | 鼠 | ねずみ | mouse; rat | 10300 | Low | Uncommon | Low frequency but small animal |
| Add | Frog | 蛙 | かえる | frog | 11800 | Low | Uncommon | Cute amphibian |
| Keep | Ant | 蟻 | あり | ant | 12100 | Low | Uncommon | Low frequency, small creature |
| Keep | Bee | 蜂 | はち | bee; wasp; hornet | 12600 | Low | Uncommon | Low frequency, small threat |
| Add | Crow | 烏 | からす | crow; raven | 16800 | Very low | Rare | Dark bird with strong theme |
| Add | Duck | 鴨 | かも | duck | 17300 | Very low | Uncommon | Concrete water-adjacent creature replacing Rain |
| Add | Whale | 鯨 | くじら | whale | 20000 | Very low | Epic | Huge creature plus low frequency |
| Keep | Owl | 梟 | ふくろう | owl | 26400 | Ultra low | Rare | Low frequency, wise/mystic but not legendary |
