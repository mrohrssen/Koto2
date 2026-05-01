# Additional Base Creature Roster Expansion

Clean follow-on proposal for 50 more base creatures after `2026-05-01-base-creature-roster-expansion.md`.

## Source Rule

Use the original expansion spec as source of truth:

- JPDB frequency is the default rarity pressure.
- Semantic creature strength, fantasy weight, cuteness, and visual clarity override frequency when needed.
- Do not add ad hoc compound creatures, item-creatures, places, habitats, or diffuse phenomena.
- Prefer concrete animals, folklore beings, mythic beings, and visually clear creature silhouettes.

Multi-kanji lexical animal names are allowed when the word itself is the dictionary animal name. `海豚` / Dolphin and `海月` / Jellyfish are included on that basis. They are not treated like rejected ad hoc compounds such as `火猫` / Fire Cat.

## JPDB Validation Notes

The table below was validated through the JPDB API on 2026-05-01 with spelling, reading, definition, and `frequency_rank` checked. Some entries required selecting the intended creature reading from JPDB rather than the first parse result:

- `猪` uses `いのしし` / wild boar; wild pig, not the alternate `しし` beast/hunting sense.
- `海豹` uses `あざらし` / true seal; earless seal.
- `獺` uses `かわうそ` / otter.
- `蝸牛` was validated as `かたつむり` / snail, but it was not selected for this 50 because the roster had stronger visual candidates.
- `蟷螂` uses `かまきり` / praying mantis.

## Additional JPDB-Validated Roster

| Status | Creature | Japanese | Reading | Definition | JPDB Rank | Frequency Tier | Rarity | Reason |
|---|---|---|---|---|---:|---|---|---|
| Add | Beast | 獣 | けもの | beast; brute; animal | 3100 | Mid | Rare | Generic animal word, but strong enough to sit above ordinary animals |
| Add | Demon | 悪魔 | あくま | devil; demon; fiend | 3100 | Mid | Rare | Supernatural threat override |
| Add | Angel | 天使 | てんし | angel | 3300 | Mid | Rare | Mythic humanoid creature override |
| Add | Monster | 化け物 | ばけもの | goblin; apparition; monster; ghost; phantom; specter | 3600 | Mid | Rare | Broad fantasy creature with clear RPG use |
| Add | Spirit | 精霊 | せいれい | spirit; soul; ghost | 8200 | Low | Rare | Magical creature override |
| Add | Zombie | ゾンビ | ゾンビ | zombie | 8700 | Low | Rare | Undead creature override |
| Add | Chicken | 鶏 | にわとり | chicken; domestic chicken | 9100 | Low | Uncommon | Ordinary concrete animal, kept below rarity implied by rank |
| Add | Crane | 鶴 | つる | crane | 11000 | Low | Uncommon | Elegant bird silhouette, not a predator |
| Add | Eagle | 鷲 | わし | eagle | 11600 | Low | Rare | Predator bird override |
| Add | Boar | 猪 | いのしし | wild boar; wild pig | 12500 | Low | Uncommon | Strong animal, but still a familiar forest creature |
| Add | Pigeon/Dove | 鳩 | はと | pigeon; dove | 12800 | Low | Uncommon | Familiar city bird despite lower rank |
| Add | Elephant | 象 | ぞう | elephant | 14000 | Low | Epic | Huge animal override |
| Add | Tanuki | 狸 | たぬき | tanuki; raccoon dog | 14600 | Low | Rare | Concrete animal with folklore appeal |
| Add | Gorilla | ゴリラ | ゴリラ | gorilla | 15700 | Very low | Rare | Large-power animal override |
| Add | Crab | 蟹 | かに | crab | 17100 | Very low | Uncommon | Distinct silhouette, ordinary scale |
| Add | Dinosaur | 恐竜 | きょうりゅう | dinosaur | 17100 | Very low | Epic | Ancient large-creature override |
| Add | Tengu | 天狗 | てんぐ | tengu; long-nosed goblin | 17200 | Very low | Rare | Japanese folklore creature |
| Add | Sparrow | 雀 | すずめ | tree sparrow | 17600 | Very low | Uncommon | Small familiar bird, not rare just because rank is low |
| Add | Panda | パンダ | パンダ | panda | 18400 | Very low | Rare | Iconic cute animal override |
| Add | Bat | 蝙蝠 | こうもり | bat | 18500 | Very low | Rare | Spooky nocturnal silhouette |
| Add | Penguin | ペンギン | ペンギン | penguin | 19500 | Very low | Uncommon | Cute visual animal, kept approachable |
| Add | Lizard | 蜥蜴 | とかげ | lizard; skink lizard | 22100 | Very low | Uncommon | Concrete reptile, moderate strength |
| Add | Swallow | 燕 | つばめ | swallow; martin | 23300 | Very low | Uncommon | Graceful small bird |
| Add | Shark | 鮫 | さめ | shark | 24300 | Very low | Rare | Apex predator override |
| Add | Griffin | グリフォン | グリフォン | griffon; gryphon | 25800 | Ultra low | Epic | Mythic creature override |
| Add | Octopus | 蛸 | たこ | octopus | 33000 | Ultra low | Rare | Distinct body plan and strong visual clarity |
| Add | Hyena | ハイエナ | ハイエナ | hyena | 33100 | Ultra low | Rare | Predator/scavenger appeal |
| Add | Peacock/Peafowl | 孔雀 | くじゃく | peafowl, including peacock and peahen | 34200 | Ultra low | Rare | Strong visual appeal override |
| Add | Pegasus | ペガサス | ペガサス | Pegasus; winged horse in Greek mythology | 34700 | Ultra low | Epic | Mythic creature override |
| Add | Scorpion | 蠍 | さそり | scorpion | 35900 | Ultra low | Rare | Distinct threat silhouette |
| Add | Koala | コアラ | コアラ | koala | 37100 | Ultra low | Uncommon | Cute animal, not made rare solely by low frequency |
| Add | Kirin/Giraffe | 麒麟 | きりん | giraffe; qilin | 38800 | Ultra low | Rare | Works as either clear animal silhouette or mythic qilin |
| Add | Parrot | インコ | インコ | true parrot | 39600 | Ultra low | Uncommon | Bright, readable bird mascot |
| Add | Dragonfly | 蜻蛉 | とんぼ | dragonfly; damselfly | 40000 | Ultra low | Uncommon | Visually distinct small creature |
| Add | Nue | 鵺 | ぬえ | Japanese chimera; mythical creature | 40600 | Ultra low | Legendary | High fantasy weight and Japanese folklore specificity |
| Add | Crocodile/Alligator | 鰐 | わに | crocodile; alligator | 41400 | Ultra low | Rare | Large predator override |
| Add | Mantis | 蟷螂 | かまきり | praying mantis | 44500 | Ultra low | Rare | Predator insect with clear silhouette |
| Add | Sphinx | スフィンクス | スフィンクス | sphinx | 46100 | Ultra low | Epic | Mythic guardian creature |
| Add | Camel | 駱駝 | らくだ | camel | 47600 | Ultra low | Uncommon | Large but ordinary animal; visual clarity over rank |
| Add | Jellyfish | 海月 | くらげ | jellyfish; medusa | 48000 | Ultra low | Uncommon | Lexical animal word with strong cute/soft silhouette |
| Add | Squirrel | 栗鼠 | りす | squirrel | 48900 | Ultra low | Uncommon | Cute small animal, not rare just because rank is low |
| Add | Tsuchinoko | ツチノコ | ツチノコ | mythical snake-like creature with thick midsection | 49100 | Ultra low | Rare | Cryptid appeal, less globally iconic than dragon-tier myths |
| Add | Rhinoceros | 犀 | さい | rhinoceros | 50200 | Ultra low | Epic | Huge armored animal override |
| Add | Cheetah | チーター | チーター | cheetah | 50800 | Ultra low | Rare | Speed predator override |
| Add | Kangaroo | カンガルー | カンガルー | kangaroo | 52100 | Ultra low | Uncommon | Distinct silhouette, ordinary animal strength |
| Add | Jaguar | ジャガー | ジャガー | jaguar | 53400 | Ultra low | Rare | Apex cat override |
| Add | Flamingo | フラミンゴ | フラミンゴ | flamingo | 74000 | Ultra low | Rare | Strong color and silhouette override |
| Add | Otter | 獺 | かわうそ | otter; Japanese river otter | 87300 | Ultra low | Uncommon | Cute animal, kept approachable despite ultra-low rank |
| Add | Dolphin | 海豚 | いるか | dolphin; small toothed whale | 92100 | Ultra low | Rare | Lexical animal word; iconic intelligent sea creature |
| Add | Seal | 海豹 | あざらし | true seal; earless seal | 104600 | Ultra low | Uncommon | Cute animal, not rare solely because JPDB rank is low |

## Deliberately Not Selected From The Validated Pool

These were validated but left out of this 50 to keep the proposal stronger:

- `蚤` / Flea, `蛭` / Leech, `蝿` / Fly, and `蚯蚓` / Earthworm: concrete creatures, but weaker cuteness and fantasy appeal than the selected animals.
- `鮭` / Salmon, `鮪` / Tuna, `鰻` / Eel, `海老` / Shrimp, `貝` / Shellfish, and `牡蠣` / Oyster: valid animals, but more food-coded or less creature-forward for base roster slots.
- `蝸牛` / Snail and `蝗` / Grasshopper: valid cute/readable creatures, but edged out by stronger visual or fantasy candidates.

