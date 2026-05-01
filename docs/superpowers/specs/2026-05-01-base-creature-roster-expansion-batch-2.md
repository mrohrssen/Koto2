# Base Creature Roster Expansion — Batch 2

Saved proposal for the second 50-creature batch, taking the roster from 50 → 100.
Continues from `docs/superpowers/specs/2026-05-01-base-creature-roster-expansion.md`
and follows the same selection rule, candidate filter, JPDB validation workflow,
rarity override rubric, and expansion checklist.

## Selection Rule (Recap)

JPDB frequency is the default rarity pressure, then semantic creature strength,
fantasy weight, cuteness, and visual clarity override frequency where needed.
Frequency tiers are the same as batch 1:

- Very common: rank ≤ 1,000
- Common: rank ≤ 2,500
- Mid: rank ≤ 7,000
- Low: rank ≤ 15,000
- Very low: rank ≤ 25,000
- Ultra low: rank > 25,000

## Rejected Concepts (This Batch)

These were considered but rejected per the existing rules. Listed here so the
next expansion has visibility into what has already been turned down.

- `鶏` / Chicken: JPDB collapses this into the same vid as `鳥` / Bird (which is
  already in the roster), with `鳥/とり` rank 1,800 as the most common form.
  Adding `鶏` would either duplicate `鳥` or pretend it is a separate dictionary
  word, neither of which is acceptable. Replaced this slot with `鳩` / Pigeon.
- `霧` / Mist, `嵐` / Storm, `虹` / Rainbow, `雷` already in batch 1: rejected
  for the same reason as `雨` / Rain — diffuse weather phenomena that do not
  cleanly become a single base creature. Re-add only with explicit user
  approval.
- `山羊` / Goat: literal kanji is `山` (mountain — already rejected as a habitat)
  + `羊` (sheep — already in batch 1). Even though `山羊` is a single dictionary
  word, the kanji surface looks like a "stone giant" style compound creature.
  Skip until the user explicitly opts it in (or use `ヤギ` katakana if so).
- `卵` / Egg, `種` / Seed: items, not creatures. The cute "egg-with-a-face"
  archetype is tempting but it is item-shaped, not creature-shaped.
- `菓子` / `お菓子` / Sweets, `飴` / Candy: items.
- `川` / River, `湖` / Lake, `池` / Pond, `滝` / Waterfall, `谷` / Valley,
  `島` / Island: places / habitats.
- `骨` / Bone (alone): body part, not a creature. `骸骨` / Skeleton kept because
  the dictionary entry is the full skeleton creature concept, not a body part.

## Compound Words That Are NOT Compound Creatures

The user clarified that single dictionary words like `海月` / Jellyfish and
`海豚` / Dolphin do not count as compound creatures (they are not "Fire Cat"
style derivatives — they are headwords with their own JPDB entry, vid, and
gloss). Same status applies to:

- `人魚` / Mermaid — single word for a distinct mythic creature.
- `骸骨` / Skeleton — single word for the undead creature.
- `河童` / Kappa, `天狗` / Tengu, `麒麟` / Kirin, `鳳凰` / Phoenix — folkloric
  beings that happen to be written with two kanji.
- `天使` / Angel, `悪魔` / Devil, `魔女` / Witch, `巨人` / Giant — supernatural
  beings whose multi-kanji spelling is just orthography, not a derived compound.
- `太陽` / Sun — single word for the celestial body, peer of `月` / Moon.

The `火猫` / Fire Cat rejection still stands: that pattern is "existing creature
word + existing creature word, glued by the user", which is not a JPDB headword
and would create derivative content rather than a base creature.

## JPDB Disambiguation Notes

Single-kanji words sometimes resolve to a non-creature sense if you parse them
in isolation. Notes for the ambiguous cases in this batch (validated 2026-05-01
via JPDB `parse` + `lookup-vocabulary`):

- `土`: bare `土` parses as `ど` (Saturday short form). Parse `土の中` /
  `柔らかい土` to land on the noun entry vid 1445270 (`つち`), rank **2,100**,
  meanings "earth; soil; dirt; clay; mud / the earth / low-quality torinoko-gami".
  The creature uses the soil sense.
- `葉`: bare `葉` parses as the counter `よう` (rank 16,700), not the noun
  "leaf". JPDB does not appear to expose a standalone `葉/は` headword; the
  nearest dictionary-accurate entry for "leaf" is **`葉っぱ`** (はっぱ),
  rank **10,300**, meanings "leaf; blade (of grass); (pine) needle / marijuana".
  Use `葉っぱ` for the creature, not bare `葉`.
- `麒麟`: JPDB returns a single merged entry covering both senses
  ("giraffe (Giraffa camelopardalis) / qilin (Chinese unicorn)"). The kanji
  form `麒麟` is rank 38,800; the katakana `キリン` is rank 32,100. The
  modern primary sense is **giraffe**, so the dictionary-accurate gloss is
  "giraffe / qilin (Chinese unicorn)". The creature design can lean either
  way without breaking translation accuracy.
- `海老`: best form by frequency is `エビ` (katakana, rank 14,300); the kanji
  `海老` is rank 21,900.
- `蟹` vs `カニ`: katakana `カニ` (rank 12,700) is more common than kanji `蟹`
  (17,100). Both are JPDB headwords for the same vid.
- `蝙蝠` vs `コウモリ`: ranks 18,500 vs 17,900 — effectively tied. Used
  `コウモリ` to follow the JPDB primary form.
- `鯰` / Catfish: also has the folkloric "earthquake catfish" (namazu) sense
  per JPDB, which earns it a rarity override despite an ultra-low rank.

For every entry below, both the displayed Japanese form and the JPDB rank were
pulled from the API in the same call (no manual fudging across forms).

## JPDB-Validated Roster

Rows are sorted by ascending JPDB rank (most common first). Numbers continue
from batch 1's count (so this batch is #51 → #100 in the combined roster).

| # | Status | Creature | Japanese | Reading | Definition | JPDB Rank | Frequency Tier | Rarity | Reason |
|---:|---|---|---|---|---|---:|---|---|---|
| 51 | Add | Sun | 太陽 | たいよう | sun | 1,900 | Common | Common | Celestial peer of Moon |
| 52 | Add | Ice | 氷 | こおり | ice | 2,100 | Common | Common | Starter-grade element |
| 53 | Add | Earth | 土 | つち | earth; soil; dirt; clay; mud | 2,100 | Common | Common | Starter-grade element (soil sense, vid 1445270) |
| 54 | Add | Devil | 悪魔 | あくま | devil; demon; fiend | 3,100 | Mid | Rare | Supernatural override on Mid frequency |
| 55 | Add | Angel | 天使 | てんし | angel | 3,300 | Mid | Rare | Supernatural override on Mid frequency |
| 56 | Add | Sand | 砂 | すな | sand; grit | 3,400 | Mid | Uncommon | Default Mid → Uncommon, basic granular element |
| 57 | Add | Cherry blossom | 桜 | さくら | cherry tree; cherry blossom | 3,500 | Mid | Uncommon | Iconic plant, no semantic power override |
| 58 | Add | Giant | 巨人 | きょじん | giant; great man | 4,900 | Mid | Rare | Large humanoid mythic override |
| 59 | Add | Bamboo | 竹 | たけ | bamboo (any grass of subfamily Bambusoideae) | 6,500 | Mid | Uncommon | Sturdy plant, default Mid → Uncommon |
| 60 | Add | Witch | 魔女 | まじょ | witch | 8,200 | Low | Rare | Magical humanoid override |
| 61 | Add | Octopus | タコ | たこ | octopus | 9,800 | Low | Uncommon | Ordinary marine animal |
| 62 | Add | Leaf | 葉っぱ | はっぱ | leaf; blade (of grass); (pine) needle | 10,300 | Low | Uncommon | Cute plant base; bare 葉 was the wrong (counter) sense |
| 63 | Add | Mushroom | キノコ | きのこ | mushroom | 10,400 | Low | Uncommon | Cute classic creature concept |
| 64 | Add | Crane | 鶴 | つる | crane (any bird of family Gruidae, esp. Grus japonensis) | 11,000 | Low | Rare | Symbolic longevity bird, mild folklore override |
| 65 | Add | Eagle | 鷲 | わし | eagle (Accipitridae family) | 11,600 | Low | Rare | Apex predator override |
| 66 | Add | Lizard | トカゲ | とかげ | lizard | 11,700 | Low | Uncommon | Small reptile, ordinary |
| 67 | Add | Squid | イカ | いか | cuttlefish; squid | 11,900 | Low | Uncommon | Ordinary marine animal |
| 68 | Add | Boar | 猪 | いのしし | wild boar; wild pig | 12,500 | Low | Rare | Powerful charging mammal override |
| 69 | Add | Crab | カニ | かに | crab | 12,700 | Low | Uncommon | Ordinary marine animal |
| 70 | Add | Pigeon-Dove | 鳩 | はと | pigeon; dove | 12,800 | Low | Uncommon | Ordinary common bird, replaces rejected Chicken slot |
| 71 | Add | Squirrel | リス | りす | squirrel (any mammal of family Sciuridae) | 13,600 | Low | Uncommon | Cute small mammal |
| 72 | Add | Elephant | 象 | ぞう | elephant (Elephantidae spp.) | 14,000 | Low | Rare | Very large mammal override |
| 73 | Add | Shrimp | エビ | えび | prawn; shrimp; lobster; crayfish | 14,300 | Low | Uncommon | Ordinary marine animal |
| 74 | Add | Skeleton | 骸骨 | がいこつ | skeleton | 14,400 | Low | Rare | Undead mythic creature override |
| 75 | Add | Mermaid | 人魚 | にんぎょ | mermaid; merman | 14,500 | Low | Rare | Mythic aquatic humanoid override |
| 76 | Add | Tanuki | 狸 | たぬき | tanuki (Nyctereutes procyonoides); raccoon dog; sly trickster | 14,600 | Low | Rare | Folklore shape-shifter override |
| 77 | Add | Firefly | 蛍 | ほたる | firefly (Luciola cruciata); lightning bug; glowworm | 15,000 | Low | Uncommon | Cute glowing insect |
| 78 | Add | Tengu | 天狗 | てんぐ | tengu; long-nosed goblin | 17,200 | Very low | Rare | Folklore yokai override (down from default Rare/Epic) |
| 79 | Add | Moss | 苔 | こけ | moss; short plants resembling moss | 17,400 | Very low | Uncommon | Small simple plant, override down from Rare |
| 80 | Add | Sparrow | 雀 | すずめ | tree sparrow (Passer montanus) | 17,600 | Very low | Uncommon | Tiny ordinary bird, cute-animal override down |
| 81 | Add | Bat | コウモリ | こうもり | bat (Chiroptera spp.) | 17,900 | Very low | Uncommon | Small flying mammal, override down from Rare |
| 82 | Add | Dolphin | イルカ | いるか | dolphin (or other small toothed whales) | 19,500 | Very low | Rare | Large intelligent marine mammal; not a compound creature |
| 83 | Add | Shark | サメ | さめ | shark | 19,700 | Very low | Rare | Apex predator override |
| 84 | Add | Carp | 鯉 | こい | common carp (Cyprinus carpio); koi carp | 20,300 | Very low | Uncommon | Ordinary fish, override down from Rare |
| 85 | Add | Crocodile | ワニ | わに | crocodile; alligator | 20,700 | Very low | Rare | Apex predator override |
| 86 | Add | Jellyfish | クラゲ | くらげ | jellyfish; medusa | 21,200 | Very low | Uncommon | Drifting marine creature, no power; not a compound |
| 87 | Add | Cicada | 蝉 | せみ | cicada; locust | 21,700 | Very low | Uncommon | Ordinary summer insect, override down from Rare |
| 88 | Add | Dragonfly | トンボ | とんぼ | dragonfly; damselfly | 27,000 | Ultra low | Uncommon | Small ordinary insect, override down from Rare/Epic |
| 89 | Add | Phoenix | 鳳凰 | ほうおう | Chinese firebird; Chinese phoenix | 27,700 | Ultra low | Epic | Mythic apex bird, peer of Whale; below Dragon (Legendary) |
| 90 | Add | Eel | ウナギ | うなぎ | eel (esp. Japanese eel, Anguilla japonica) | 28,100 | Ultra low | Uncommon | Ordinary long fish, override down from Rare/Epic |
| 91 | Add | Beetle | カブトムシ | かぶとむし | rhinoceros beetle (esp. Japanese rhinoceros beetle, Trypoxylus dichotomus) | 28,300 | Ultra low | Rare | Iconic Japanese kid-favorite insect |
| 92 | Add | Kappa | 河童 | かっぱ | kappa; mythical water-dwelling creature | 29,400 | Ultra low | Rare | Folklore yokai override (down from default Rare/Epic) |
| 93 | Add | Kirin / Giraffe | キリン | きりん | giraffe (Giraffa camelopardalis); qilin (Chinese unicorn) | 32,100 | Ultra low | Rare | Large mammal + mythic override; one merged JPDB entry |
| 94 | Add | Mantis | カマキリ | かまきり | praying mantis (esp. narrow-winged mantis, Tenodera angustipennis) | 32,700 | Ultra low | Rare | Predator insect override |
| 95 | Add | Weasel | イタチ | いたち | weasel (esp. Japanese weasel, Mustela itatsi); mustelid | 36,300 | Ultra low | Uncommon | Small mammal, override down from Rare/Epic |
| 96 | Add | Camel | ラクダ | らくだ | camel | 36,700 | Ultra low | Rare | Large desert mammal override |
| 97 | Add | Snail | カタツムリ | かたつむり | snail | 37,000 | Ultra low | Uncommon | Small slow critter, override down from Rare/Epic |
| 98 | Add | Starfish | ヒトデ | ひとで | starfish; sea star; any echinoderm of class Asteroidea | 40,600 | Ultra low | Uncommon | Tiny marine invertebrate, override down from Rare/Epic |
| 99 | Add | Gecko | ヤモリ | やもり | gecko; house lizard | 46,500 | Ultra low | Uncommon | Small reptile, override down from Rare/Epic |
| 100 | Add | Catfish | ナマズ | なまず | catfish (esp. Amur catfish, Silurus asotus); earthquake | 48,200 | Ultra low | Rare | Folkloric earthquake fish (namazu), mild override up |

## Category Distribution (Batch 2)

| Category | Count | Examples |
|---|---:|---|
| Elements / nature mascots | 4 | Sun, Ice, Earth, Sand |
| Plants | 5 | Leaf, Cherry blossom, Bamboo, Mushroom, Moss |
| Insects / small critters | 6 | Firefly, Cicada, Dragonfly, Beetle, Mantis, Snail |
| Marine | 11 | Octopus, Squid, Crab, Shrimp, Shark, Carp, Eel, Jellyfish, Starfish, Dolphin, Catfish |
| Reptile / amphibian | 3 | Crocodile, Lizard, Gecko |
| Birds | 4 | Eagle, Crane, Sparrow, Pigeon-Dove |
| Mammals | 7 | Elephant, Bat, Squirrel, Tanuki, Weasel, Camel, Boar |
| Mythic / folklore | 10 | Kappa, Tengu, Kirin, Phoenix, Angel, Devil, Giant, Mermaid, Witch, Skeleton |

## Rarity Distribution (Batch 2)

| Rarity | Count |
|---|---:|
| Common | 3 |
| Uncommon | 25 |
| Rare | 21 |
| Epic | 1 |
| Legendary | 0 |

Combined with batch 1, this would put the 100-creature roster roughly at
~23 Common, ~38 Uncommon, ~30 Rare, ~2 Epic (Whale, Phoenix), and 1 Legendary
(Dragon), preserving the existing shape: most slots are Common/Uncommon, with
Rare reserved for predators and folklore beings, and the legendary tier
unique to Dragon.

## Open Questions for the User

1. Phoenix (`鳳凰`) is set to **Epic** here, on the same tier as Whale (rank
   20,000, Epic in batch 1). Promote to Legendary if you want a paired apex
   alongside Dragon; demote to Rare if Whale should remain the only
   non-Dragon Epic.
2. Kirin (`キリン`) currently glosses as "giraffe / qilin (Chinese unicorn)"
   to stay dictionary-accurate. Confirm whether the creature design should
   lean **giraffe** (modern primary sense, large-mammal silhouette) or
   **qilin** (mythic chimera). Either reading is supported by the same JPDB
   entry.
3. Leaf is added as **`葉っぱ`** (はっぱ) rather than bare `葉`, because JPDB
   has no standalone "leaf" headword for `葉` alone — the bare entry is the
   counter sense `よう`. Confirm `葉っぱ` is acceptable, or drop the slot and
   replace.
4. Batch size is fixed at **50** per the user brief. If you want a different
   size (e.g. 30 or 75), the bottom of the table (Snail, Starfish, Gecko,
   Catfish — all ultra-low frequency override-downs) is the easiest place to
   trim. Reverse-side, easy-to-add candidates that were considered but not
   chosen this round include `燕` / Swallow (rank 23,300), `ペンギン` / Penguin
   (rank 19,500), and `蓮` / Lotus.
