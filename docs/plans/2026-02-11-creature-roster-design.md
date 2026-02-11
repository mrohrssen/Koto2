# Creature Roster Design

## Vision

Replace the 25 generic element+rarity robots (e.g. "Moku Bot," "Hino Bot") with 46+ unique, object-inspired creatures. Each creature teaches three Japanese vocabulary words: its identity, its auto attack, and its ultimate ability.

Think Pokemon, not Gundam. These are cute collectible monsters, not mechanical robots. A flower creature is a cheerful petal sprite, not a flower-shaped mech.

---

## Design Rules

### 1. Every creature teaches three words

| Slot | Purpose | Example (Petalia) |
|------|---------|-------------------|
| **Base word** | The creature's identity. Players learn this word by encountering it. | 花 (はな) "flower" r677 |
| **Auto attack** | A common verb or noun related to the creature's theme. | 刺す (さす) "Pierce" r1933 |
| **Ultimate** | Another common word, thematically linked. | 包む (つつむ) "Envelop" r931 |

### 2. Prefer common words (low JPDB rank)

Common words help learners more than obscure ones. Target rank <2000 for abilities. Rank <1000 is ideal. A rank-200 verb that loosely fits the creature beats a rank-15000 verb that fits perfectly.

**Good:** Whiskit uses 切る (きる) "Cut" r354 — common, useful, and a cat slashing with claws makes it memorable.

**Bad:** Whiskit uses 猫背 (ねこぜ) "Hunchback" r20426 — thematically on-the-nose but useless vocabulary.

### 3. Translations must be accurate

The English ability name is the real dictionary meaning of the Japanese word. No creative reinterpretation. Players learn from seeing the word paired with its meaning.

**Good:** 包む (つつむ) → "Envelop"

**Bad:** 包む (つつむ) → "Petal Wrap" (包む does not mean "petal wrap")

The creature's theme provides context. When Petalia uses "Envelop," players picture a flower wrapping them in petals. The word sticks because the creature makes it vivid — but the translation stays honest.

### 4. No duplicate ability words across the roster

Every ability word appears exactly once. If 切る is Whiskit's auto attack, no other creature uses 切る. This maximizes vocabulary coverage — 46 creatures with 2 abilities each = 92 unique words taught.

**Track all used words** when adding new creatures. The current roster uses 92 words listed in the appendix.

### 5. Names are English-first, Pokemon-style

Names are English portmanteaus or wordplay. They should be:
- **Cute and memorable** — pronounceable, 2-3 syllables
- **Evocative of the creature** — Drizzlet (drizzle + droplet), Timbark (timber + bark)
- **Not real words** — "Crumble," "Whisper," "Nugget" are real words; avoid them
- **Not existing Pokemon** — check before using
- **Not too close to real words** — "Chairiot" is too close to "chariot"

The Japanese name field (katakana) is the transliteration of the English name.

**Good names:** Petalia, Drizzlet, Ripplash, Barkley, Glitchi, Spindel, Orblix

**Naming patterns that work:**
- Object + diminutive suffix: Drizzl*et*, Sproutl*ing*, Forml*ing*
- Object + cute ending: Gloop*y*, Sizzl*it*, Cripp*y*
- Blended portmanteau: Rippl*ash*, Timb*ark*, Peek*yx*
- Sound-based: Buzzle, Giggli, Chirplet

### 6. Descriptions are family-friendly and toyetic

Write descriptions as if pitching a plush toy line. Every creature should be something a child would want on their backpack.

**Do:**
- Emphasize cute physical features (oversized eyes, fluffy tails, tiny legs)
- Mention charming behaviors (bounces when happy, hums constantly, waves hello)
- Keep it 2-3 sentences max

**Don't:**
- Dark or scary imagery ("lures prey," "petrifying gaze," "eerie movement")
- Violence-adjacent language ("slashes enemies," "devours foes")
- Abstract or vague descriptions ("an embodiment of sorrow")

### 7. Rarity is game-balanced, not vocab-based

Distribute rarity for good gameplay, not strictly by JPDB rank. Target distribution for the full roster:

| Rarity | % of Roster | Current (of 46) | Target (of 90+) |
|--------|-------------|-----------------|-----------------|
| Common | ~33% | 15 | ~30 |
| Uncommon | ~27% | 13 | ~24 |
| Rare | ~20% | 10 | ~18 |
| Epic | ~15% | 8 | ~13 |
| Legendary | ~5% | 2 | ~5-7 |

Use JPDB rank as a starting point, then override for thematic reasons. The sun (太陽 r1747) is legendary because the sun is iconic, not because the word is rare. Gold (金 r715) is legendary because gold is precious.

### 8. Opposite-pair abilities are memorable

When two ability words form a natural pair, assign them to the same creature. Players learn both words together through contrast.

| Creature | Auto | Ultimate | Pattern |
|----------|------|----------|---------|
| Deskid | 開く "Open" | 閉じる "Close" | Opposites |
| Reelyx | 暗い "Dark" | 明るい "Bright" | Opposites |
| Spindel | 結ぶ "Tie" | 解く "Untie" | Opposites |

---

## What to Cut

When evaluating a candidate creature from a word list, cut it if:

1. **Too abstract** — The word describes a category, not a thing. "動物 (animal)," "生き物 (living thing)," "クラス (class)" cannot be visualized as a single creature.

2. **Overlaps an existing creature** — 字 (character) overlaps 文字 (letter). 丸 (circle) overlaps 玉 (ball). 笑み (smile) overlaps 笑顔 (smiling face). Keep the more common or more visually distinct one.

3. **Is a location** — 学校 (school), 教室 (classroom), 学園 (academy) are places, not creatures.

4. **Word already used as an ability** — If 音 (sound) is another creature's ability, don't make a creature whose base word is 音. Learners would encounter the same word in two different contexts — confusing.

5. **Not family-friendly** — 肉体 (flesh/body) is hard to make cute. 苦笑 (bitter smile) is too negative.

---

## Complete Roster (46 Creatures)

### Enchanted Wilderness (16)

| # | ID Word | Rank | Name | Element | Rarity | Auto Attack (word, meaning, rank) | Ultimate (word, meaning, rank) | Description |
|---|---------|------|------|---------|--------|-----------------------------------|-------------------------------|-------------|
| 1 | 花 (はな) flower | 677 | Petalia | Wood | Common | 刺す (さす) "Pierce" r1933 | 包む (つつむ) "Envelop" r931 | A tiny round creature with colorful petals fanning out from its head like a crown. Big cheerful eyes and leaf-arms that wave when excited. |
| 2 | 木 (き) tree | 751 | Timbark | Wood | Common | 伸びる (のびる) "Stretch" r1037 | 叩く (たたく) "Strike" r1264 | A stout little creature with bark-patterned skin and small branches sprouting from its head. Stands on stubby root-feet with a gentle smile. |
| 3 | 雨 (あめ) rain | 894 | Drizzlet | Water | Common | 落ちる (おちる) "Fall" r254 | 流れる (ながれる) "Flow" r665 | A teardrop-shaped creature made of shimmering water with a tiny cloud hat on its head. Leaves sparkly droplets wherever it bounces. |
| 4 | 川 (かわ) river | 942 | Ripplash | Water | Common | 泳ぐ (およぐ) "Swim" r1950 | 巻く (まく) "Coil" r1949 | A sleek serpentine creature that flows like a living river. Playful fish-like face with fins of rushing water and a spiraling tail. |
| 5 | 森 (もり) forest | 1245 | Groval | Wood | Common | 絡む (からむ) "Entangle" r2221 | 夢 (ゆめ) "Dream" r275 | A small mossy creature with tiny trees and mushrooms growing on its back. Woodland flowers peek out from its leafy body as it waddles along. |
| 6 | 草 (くさ) grass | 2020 | Sproutling | Wood | Common | 育つ (そだつ) "Grow" r1859 | 種 (たね) "Seed" r2382 | A tiny green creature no bigger than a blade of grass with a single bouncing sprout on its head. Always found in groups, peeking out from meadows. |
| 7 | 犬 (いぬ) dog | 1351 | Barkley | Earth | Uncommon | 走る (はしる) "Run" r247 | 守る (まもる) "Protect" r228 | A loyal round-bodied pup with oversized floppy ears and a fluffy tail that never stops wagging. Bright curious eyes, patches of earthy brown. |
| 8 | 猫 (ねこ) cat | 1394 | Whiskit | Wood | Uncommon | 切る (きる) "Cut" r354 | 飛ぶ (とぶ) "Jump" r607 | A sleek feline with long whiskers that glow softly. Curled tail with a leaf-shaped tip, moves through the canopy with effortless grace. |
| 9 | 馬 (うま) horse | 1455 | Trottar | Earth | Uncommon | 踏む (ふむ) "Stomp" r1661 | 揺れる (ゆれる) "Shake" r1370 | A spirited little horse with a bouncy fluffy mane. Always prancing, always ready to race across the open wilderness. |
| 10 | 雪 (ゆき) snow | 1587 | Frostelle | Water | Uncommon | 回る (まわる) "Spin" r820 | 氷 (こおり) "Ice" r1884 | A fluffy living snowball with sparkling crystal eyes. Tiny ice-crystal antennae twinkle on its head, and it leaves a trail of fresh snowflakes wherever it hops. |
| 11 | 鳥 (とり) bird | 1581 | Chirplet | Wood | Rare | 吹く (ふく) "Blow" r1871 | 光る (ひかる) "Shine" r1433 | A small round bird with oversized colorful wings and a tiny beak. Puffs up to twice its size when startled. |
| 12 | 雲 (くも) cloud | 1957 | Cumulon | Water | Rare | 影 (かげ) "Shadow" r1280 | 風 (かぜ) "Wind" r663 | A pillowy creature of soft cloud fluff that constantly shifts shape. Sleepy content expression, floats lazily above the ground. Tiny raindrops sometimes fall from its underside. |
| 13 | 虫 (むし) insect | 2061 | Buzzle | Wood | Rare | 毒 (どく) "Poison" r1688 | 掴む (つかむ) "Grab" r2842 | A colorful bug with iridescent wings that shimmer in sunlight. Oversized round eyes and stubby little legs that wiggle adorably when it flies. |
| 14 | 波 (なみ) wave | 2122 | Tidalin | Water | Epic | 投げる (なげる) "Throw" r1574 | 潰す (つぶす) "Crush" r1797 | A graceful creature riding on a cresting wave. Translucent blue-green body with flowing fins that trail behind like ribbons of sea foam. |
| 15 | 根 (ね) root | 2469 | Rooten | Earth | Epic | 握る (にぎる) "Grip" r653 | 引く (ひく) "Pull" r641 | A round earthy creature that burrows underground with gnarled root-tentacles. Cheerful face peeking from a tangle of roots, with small gems embedded in its body. |
| 16 | 太陽 (たいよう) sun | 1747 | Solarie | Fire | Legendary | 燃える (もえる) "Burn" r1756 | 星 (ほし) "Star" r1365 | A radiant creature wreathed in warm golden light. Its mane flows like dancing sunbeams, and small solar flares orbit around it like playful companions. |

### School District (9)

| # | ID Word | Rank | Name | Element | Rarity | Auto Attack (word, meaning, rank) | Ultimate (word, meaning, rank) | Description |
|---|---------|------|------|---------|--------|-----------------------------------|-------------------------------|-------------|
| 17 | 生徒 (せいと) pupil | 1297 | Sachel | Wood | Common | 学ぶ (まなぶ) "Learn" r1178 | 見つける (みつける) "Discover" r284 | A small eager creature always carrying a backpack twice its size. Round glasses perched on its nose, pencil behind one ear, constantly scribbling notes. |
| 18 | テーブル table | 1304 | Tablette | Metal | Common | 支える (ささえる) "Support" r1043 | 壊す (こわす) "Break" r1603 | A sturdy four-legged creature with a perfectly flat back. Things placed on it bounce off with surprising force. Its polished surface reflects light cheerfully. |
| 19 | 電話 (でんわ) telephone | 1308 | Dialyn | Metal | Common | 鳴る (なる) "Ring" r1432 | 呼ぶ (よぶ) "Call" r111 | A round creature shaped like a rotary phone with a curly cord for a tail. Big dial eyes spin when excited, and it makes cheerful ringing sounds to greet friends. |
| 20 | 椅子 (いす) chair | 1322 | Swivyl | Metal | Uncommon | 動く (うごく) "Move" r151 | 止まる (とまる) "Stop" r577 | A bouncy chair creature that hops around on four springy legs. Cushioned arms wave hello and its seat back puffs up proudly. |
| 21 | 机 (つくえ) desk | 1354 | Deskid | Metal | Uncommon | 開く (ひらく) "Open" r198 | 閉じる (とじる) "Close" r1442 | A boxy creature with a hinged lid that opens and closes like a mouth. Stores treasures inside its drawer-belly and gets grumpy if you try to peek. |
| 22 | ゲーム game | 1359 | Glitchi | Fire | Uncommon | 変える (かえる) "Change" r297 | 消す (けす) "Erase" r971 | A pixelated creature that flickers between different shapes. Has a screen-like face with ever-changing expressions and leaves a trail of colorful pixels. |
| 23 | 文字 (もじ) letter | 1490 | Scribbit | Metal | Rare | 書く (かく) "Write" r210 | 読む (よむ) "Read" r253 | A floating ink creature that reshapes itself into different kanji. Has brushstroke arms and leaves beautiful calligraphy trails in the air. |
| 24 | テレビ television | 1870 | Statik | Metal | Rare | 送る (おくる) "Send" r305 | 音 (おと) "Sound" r126 | A boxy creature with antenna ears and an animated face on its screen. Broadcasts different channels through its belly and crackles with static when startled. |
| 25 | 棚 (たな) shelf | 2536 | Shelvyn | Wood | Epic | 並ぶ (ならぶ) "Line Up" r716 | 集める (あつめる) "Collect" r832 | A tall rectangular creature lined with tiny shelves full of books. Wobbles when it walks and occasionally drops a book on someone's head. |

### Market District & Grand Kitchen (5)

| # | ID Word | Rank | Name | Element | Rarity | Auto Attack (word, meaning, rank) | Ultimate (word, meaning, rank) | Description |
|---|---------|------|------|---------|--------|-----------------------------------|-------------------------------|-------------|
| 26 | 肉 (にく) meat | 1262 | Sizzlit | Fire | Common | 当たる (あたる) "Hit" r838 | 重い (おもい) "Heavy" r369 | A chunk of grilled meat with stubby legs and a sizzling surface that pops and crackles. Has a juicy friendly face and leaves a delicious aroma trail wherever it waddles. |
| 27 | 魚 (さかな) fish | 1751 | Gulpy | Water | Uncommon | 外す (はずす) "Dodge" r950 | 跳ねる (はねる) "Leap" r3122 | A round bubbly fish with oversized cheeks puffed full of water. Tiny fins flutter like wings and big glistening eyes always look surprised. |
| 28 | パン bread | 1775 | Loafie | Earth | Uncommon | 転がる (ころがる) "Roll" r1622 | 固い (かたい) "Hard" r1831 | A golden-brown bread loaf with a warm crusty exterior and a soft doughy smile. Rolls around instead of walking and gets puffier when happy. |
| 29 | 野菜 (やさい) vegetable | 2333 | Croppy | Wood | Rare | 立つ (たつ) "Stand" r174 | 色 (いろ) "Color" r544 | A bundle of colorful vegetables stacked into a cheerful creature. Carrot legs, lettuce wings, and a tomato nose. Different veggies peek out from all directions. |
| 30 | お菓子 (おかし) sweets | 2972 | Sweetle | Earth | Epic | 隠す (かくす) "Hide" r496 | 溶ける (とける) "Melt" r2285 | A sparkling candy creature wrapped in shiny foil with a bow on top. Gummy bear paws, lollipop antennae, and a trail of sugar sparkles. |

### Family Village (10)

| # | ID Word | Rank | Name | Element | Rarity | Auto Attack (word, meaning, rank) | Ultimate (word, meaning, rank) | Description |
|---|---------|------|------|---------|--------|-----------------------------------|-------------------------------|-------------|
| 31 | 姿 (すがた) figure | 117 | Shimra | Earth | Common | 覚える (おぼえる) "Memorize" r220 | 返す (かえす) "Return" r488 | A graceful translucent creature that shifts between different silhouettes. Its body shimmers like a mirage, mimicking the outline of whatever stands near it. |
| 32 | 形 (かたち) form | 304 | Formling | Earth | Common | 受ける (うける) "Receive" r168 | 直す (なおす) "Fix" r1071 | A squishy clay-like creature that molds itself into new shapes. Curious face with stretchy limbs that can flatten, stretch, or ball up at will. |
| 33 | 表情 (ひょうじょう) expression | 440 | Moodlet | Wood | Common | 声 (こえ) "Voice" r67 | 教える (おしえる) "Teach" r170 | A round-faced creature whose features cycle through emotions — happy, surprised, thoughtful, excited. A ring of tiny emotive symbols orbits its head. |
| 34 | 笑顔 (えがお) smile | 503 | Grinnix | Wood | Uncommon | 軽い (かるい) "Light" r504 | 力 (ちから) "Power" r140 | An irresistibly cheerful creature with an enormous warm smile. Rosy cheeks glow softly, and its happiness is so contagious that even grumpy creatures smile back. |
| 35 | 笑い (わらい) laugh | 1793 | Giggli | Wood | Uncommon | 弾く (はじく) "Flick" r2976 | 崩す (くずす) "Crumble" r1930 | A round jiggly creature that bounces around in fits of giggles. Its belly ripples with laughter, and its infectious chuckles make flowers bloom. |
| 36 | 絵 (え) picture | 1510 | Sketchi | Wood | Uncommon | 浮かぶ (うかぶ) "Float" r1286 | 染まる (そまる) "Dye" r1976 | A flat papery creature that looks like a living watercolor painting. New drawings appear on its body as it moves, and it can peel sketches off to bring them to life. |
| 37 | 人形 (にんぎょう) doll | 1610 | Puppette | Metal | Rare | 抜く (ぬく) "Pull" r1022 | 挟む (はさむ) "Pinch" r1816 | A charming wooden doll with jointed limbs and painted rosy cheeks. Moves with a springy marionette bounce, though no strings are visible. |
| 38 | 歌 (うた) song | 1708 | Melodia | Wood | Rare | 光 (ひかり) "Light" r459 | 全力 (ぜんりょく) "Full Power" r1514 | A graceful creature shaped like a musical note. Hums constantly, and tiny floating music notes trail behind wherever it goes. |
| 39 | 玉 (たま) ball | 2411 | Orblix | Earth | Epic | 石 (いし) "Stone" r1316 | 一撃 (いちげき) "One Strike" r2892 | A perfectly spherical creature with swirling mystical patterns across its surface. Hovers slightly off the ground and pulses with stored energy. |
| 40 | 模様 (もよう) pattern | 2656 | Kaleidon | Fire | Epic | 炎 (ほのお) "Flame" r1405 | 積む (つむ) "Stack" r2146 | A dazzling creature covered in ever-shifting geometric patterns. Its body is a living kaleidoscope, with colors and shapes flowing across its surface in mesmerizing waves. |

### Crossroads Inn (6)

| # | ID Word | Rank | Name | Element | Rarity | Auto Attack (word, meaning, rank) | Ultimate (word, meaning, rank) | Description |
|---|---------|------|------|---------|--------|-----------------------------------|-------------------------------|-------------|
| 41 | 空気 (くうき) air | 592 | Breezle | Wood | Common | 通る (とおる) "Pass Through" r886 | 広がる (ひろがる) "Spread" r825 | A nearly invisible wispy creature made of swirling air currents. Its cheerful face is outlined by tiny sparkles of dust caught in its breeze. Loves to playfully ruffle hair. |
| 42 | 視線 (しせん) gaze | 1203 | Peekyx | Fire | Uncommon | 見つめる (みつめる) "Stare" r1208 | 鋭い (するどい) "Sharp" r1363 | A floating eye-shaped creature surrounded by a ring of smaller orbiting eyes. Each eye blinks independently, and its main iris shifts colors with its mood. |
| 43 | 映画 (えいが) movie | 1993 | Reelyx | Fire | Rare | 暗い (くらい) "Dark" r790 | 明るい (あかるい) "Bright" r842 | A boxy projector-shaped creature with film reels for ears that spin constantly. Projects colorful scenes from its lens-eye and makes classic movie sound effects. |
| 44 | 糸 (いと) thread | 2035 | Spindel | Metal | Rare | 結ぶ (むすぶ) "Tie" r1095 | 解く (とく) "Untie" r1646 | A graceful silk creature with delicate thread limbs and a spindle-shaped body. Weaves intricate patterns in the air and leaves behind beautiful web trails. |
| 45 | 塊 (かたまり) lump | 2955 | Gloopy | Earth | Epic | 合う (あう) "Merge" r350 | 深い (ふかい) "Deep" r282 | An amorphous blob that constantly shifts shape, with a happy face that stays put no matter how much it morphs. Translucent and loves to absorb small objects. |
| 46 | 金 (きん) gold | 715 | Gilden | Metal | Legendary | 輝く (かがやく) "Sparkle" r907 | 高い (たかい) "Expensive" r207 | A magnificent creature with a gleaming golden body that reflects light in every direction. Regal but friendly, with nugget-shaped paws and a crown of natural gold crystals. |

---

## How to Add New Creatures

Follow this checklist for each new creature:

### Step 1: Pick the base word

Choose a concrete Japanese noun from the JPDB wordlist. Prefer words that are:
- **Visualizable** — Can you picture a creature based on this object? 犬 (dog) yes. 状況 (situation) no.
- **Not already in the roster** — Check the roster table above.
- **Not already used as an ability** — Check the used-words appendix below.
- **Family-friendly** — Would a parent buy this as a toy?

### Step 2: Choose two ability words

Search `data/jpdb-wordlist.csv` for common words (low rank number) related to the creature's theme.

Priorities in order:
1. **Accurate translation** — The English meaning must be the real dictionary definition.
2. **Common (low rank)** — Rank <1000 ideal, <2000 acceptable, <3000 maximum.
3. **Thematically related** — The word should feel natural for this creature to use.
4. **Not already used** — Check the used-words appendix.
5. **Opposite pairs are a bonus** — Open/Close, Dark/Bright, Tie/Untie.

Search strategy:
```bash
# Find words related to a theme in the JPDB wordlist
grep -i "cut\|slash\|chop\|slice" data/jpdb-wordlist.csv
```

### Step 3: Name the creature

Create an English portmanteau (2-3 syllables). Test it:
- [ ] Not a real English word
- [ ] Not an existing Pokemon name
- [ ] Not too close to a real word (Chairiot ≈ chariot — bad)
- [ ] Evokes the creature's identity
- [ ] Fun to say out loud

### Step 4: Assign element and rarity

**Element:** Use the element from the source material (seed list, area theme) as a starting point. Override only if the object strongly suggests a different element (a candle creature should be fire regardless of what area it's in).

**Rarity:** Check the current distribution table and assign based on gameplay needs, not word frequency. Keep the distribution roughly:
- Common ~33%, Uncommon ~27%, Rare ~20%, Epic ~15%, Legendary ~5%

### Step 5: Write the description

Two to three sentences. Describe what the creature looks like and one charming behavior. Imagine pitching it as a plush toy.

### Step 6: Update the appendix

Add the two new ability words to the used-words list. Add the base word to the roster.

---

## Appendix: All Used Ability Words (92)

These words are taken. Do not reuse them for new creatures.

| Rank | Word | Reading | Meaning | Used By |
|------|------|---------|---------|---------|
| 67 | 声 | こえ | Voice | Moodlet |
| 111 | 呼ぶ | よぶ | Call | Dialyn |
| 126 | 音 | おと | Sound | Statik |
| 140 | 力 | ちから | Power | Grinnix |
| 151 | 動く | うごく | Move | Swivyl |
| 168 | 受ける | うける | Receive | Formling |
| 170 | 教える | おしえる | Teach | Moodlet |
| 174 | 立つ | たつ | Stand | Croppy |
| 198 | 開く | ひらく | Open | Deskid |
| 207 | 高い | たかい | Expensive | Gilden |
| 210 | 書く | かく | Write | Scribbit |
| 220 | 覚える | おぼえる | Memorize | Shimra |
| 228 | 守る | まもる | Protect | Barkley |
| 247 | 走る | はしる | Run | Barkley |
| 253 | 読む | よむ | Read | Scribbit |
| 254 | 落ちる | おちる | Fall | Drizzlet |
| 275 | 夢 | ゆめ | Dream | Groval |
| 276 | 選ぶ | えらぶ | Choose | (available) |
| 282 | 深い | ふかい | Deep | Gloopy |
| 284 | 見つける | みつける | Discover | Sachel |
| 297 | 変える | かえる | Change | Glitchi |
| 305 | 送る | おくる | Send | Statik |
| 350 | 合う | あう | Merge | Gloopy |
| 354 | 切る | きる | Cut | Whiskit |
| 369 | 重い | おもい | Heavy | Sizzlit |
| 459 | 光 | ひかり | Light | Melodia |
| 488 | 返す | かえす | Return | Shimra |
| 496 | 隠す | かくす | Hide | Sweetle |
| 504 | 軽い | かるい | Light (weight) | Grinnix |
| 544 | 色 | いろ | Color | Croppy |
| 577 | 止まる | とまる | Stop | Swivyl |
| 607 | 飛ぶ | とぶ | Jump | Whiskit |
| 641 | 引く | ひく | Pull | Rooten |
| 653 | 握る | にぎる | Grip | Rooten |
| 663 | 風 | かぜ | Wind | Cumulon |
| 665 | 流れる | ながれる | Flow | Drizzlet |
| 716 | 並ぶ | ならぶ | Line Up | Shelvyn |
| 790 | 暗い | くらい | Dark | Reelyx |
| 820 | 回る | まわる | Spin | Frostelle |
| 825 | 広がる | ひろがる | Spread | Breezle |
| 832 | 集める | あつめる | Collect | Shelvyn |
| 836 | 振る | ふる | Swing | (available) |
| 838 | 当たる | あたる | Hit | Sizzlit |
| 842 | 明るい | あかるい | Bright | Reelyx |
| 865 | 押す | おす | Push | Ripplash |
| 886 | 通る | とおる | Pass Through | Breezle |
| 907 | 輝く | かがやく | Sparkle | Gilden |
| 931 | 包む | つつむ | Envelop | Petalia |
| 950 | 外す | はずす | Dodge | Gulpy |
| 971 | 消す | けす | Erase | Glitchi |
| 1022 | 抜く | ぬく | Pull | Puppette |
| 1037 | 伸びる | のびる | Stretch | Timbark |
| 1043 | 支える | ささえる | Support | Tablette |
| 1071 | 直す | なおす | Fix | Formling |
| 1095 | 結ぶ | むすぶ | Tie | Spindel |
| 1178 | 学ぶ | まなぶ | Learn | Sachel |
| 1208 | 見つめる | みつめる | Stare | Peekyx |
| 1264 | 叩く | たたく | Strike | Timbark |
| 1280 | 影 | かげ | Shadow | Cumulon |
| 1286 | 浮かぶ | うかぶ | Float | Sketchi |
| 1316 | 石 | いし | Stone | Orblix |
| 1363 | 鋭い | するどい | Sharp | Peekyx |
| 1365 | 星 | ほし | Star | Solarie |
| 1370 | 揺れる | ゆれる | Shake | Trottar |
| 1405 | 炎 | ほのお | Flame | Kaleidon |
| 1432 | 鳴る | なる | Ring | Dialyn |
| 1433 | 光る | ひかる | Shine | Chirplet |
| 1442 | 閉じる | とじる | Close | Deskid |
| 1514 | 全力 | ぜんりょく | Full Power | Melodia |
| 1574 | 投げる | なげる | Throw | Tidalin |
| 1603 | 壊す | こわす | Break | Tablette |
| 1622 | 転がる | ころがる | Roll | Loafie |
| 1646 | 解く | とく | Untie | Spindel |
| 1661 | 踏む | ふむ | Stomp | Trottar |
| 1688 | 毒 | どく | Poison | Buzzle |
| 1756 | 燃える | もえる | Burn | Solarie |
| 1797 | 潰す | つぶす | Crush | Tidalin |
| 1816 | 挟む | はさむ | Pinch | Puppette |
| 1831 | 固い | かたい | Hard | Loafie |
| 1859 | 育つ | そだつ | Grow | Sproutling |
| 1871 | 吹く | ふく | Blow | Chirplet |
| 1884 | 氷 | こおり | Ice | Frostelle |
| 1930 | 崩す | くずす | Crumble | Giggli |
| 1933 | 刺す | さす | Pierce | Petalia |
| 1949 | 巻く | まく | Coil | Ripplash |
| 1950 | 泳ぐ | およぐ | Swim | Ripplash |
| 1976 | 染まる | そまる | Dye | Sketchi |
| 2146 | 積む | つむ | Stack | Kaleidon |
| 2221 | 絡む | からむ | Entangle | Groval |
| 2285 | 溶ける | とける | Melt | Sweetle |
| 2382 | 種 | たね | Seed | Sproutling |
| 2842 | 掴む | つかむ | Grab | Buzzle |
| 2892 | 一撃 | いちげき | One Strike | Orblix |
| 2976 | 弾く | はじく | Flick | Giggli |
| 3122 | 跳ねる | はねる | Leap | Gulpy |

### Available High-Value Words (confirmed in JPDB, not yet used)

These common words are available for future creatures:

| Rank | Word | Reading | Meaning |
|------|------|---------|---------|
| 45 | 出る | でる | Exit/Appear |
| 66 | 持つ | もつ | Hold |
| 69 | 入る | はいる | Enter |
| 87 | 使う | つかう | Use |
| 100 | 出す | だす | Take Out |
| 107 | 作る | つくる | Make |
| 118 | 強い | つよい | Strong |
| 213 | 入れる | いれる | Put In |
| 224 | 長い | ながい | Long |
| 260 | 続く | つづく | Continue |
| 276 | 選ぶ | えらぶ | Choose |
| 550 | 上がる | あがる | Rise |
| 629 | 遅い | おそい | Slow |
| 720 | 向く | むく | Face |
| 819 | 弱い | よわい | Weak |
| 836 | 振る | ふる | Swing |
| 844 | 抱える | かかえる | Carry |
| 901 | 短い | みじかい | Short |
| 944 | 薄い | うすい | Thin |
| 1017 | 速い | はやい | Fast |
| 1040 | 下がる | さがる | Lower |
| 1095 | 結ぶ | むすぶ | Tie |
| 1147 | 狭い | せまい | Narrow |
| 1288 | 放つ | はなつ | Fire/Release |
| 1321 | 触る | さわる | Touch |
| 1414 | 細い | ほそい | Thin/Slender |
| 1441 | 伸ばす | のばす | Extend |
| 1489 | 付く | つく | Attach |
| 1561 | 柔らかい | やわらかい | Soft |
| 1595 | 映る | うつる | Reflect |
| 1911 | 掛ける | かける | Hang |
| 2042 | 濃い | こい | Dense/Rich |
| 2050 | 突く | つく | Poke/Thrust |
| 2067 | 太い | ふとい | Thick |
| 2304 | 放す | はなす | Release |
| 2853 | 撃つ | うつ | Shoot |
| 2868 | 睨む | にらむ | Glare |

---

## Expansion Roadmap

The current roster has 46 creatures. To reach 90+, consider:

1. **New areas** — Each new game area introduces 5-15 new creatures with themed vocabulary. A city area might add traffic/building/weather creatures. An ocean area adds sea life.

2. **Evolutions** — Some creatures could evolve into stronger forms (like Pokemon). Petalia → Bloomora. This teaches a fourth word (the evolution's name) without creating an entirely new concept.

3. **Seasonal/event creatures** — Limited-time creatures tied to Japanese cultural events (hanami, tanabata, obon) teach cultural vocabulary.

4. **More food creatures** — The Market District has only 5. Japanese cuisine vocabulary (寿司, 餅, 豆腐, 抹茶, 醤油) would expand it naturally.

5. **Weather and celestial** — Beyond rain/snow/cloud/sun, consider: 雷 (thunder), 虹 (rainbow), 霧 (fog — currently an ability; could become a creature if freed), 嵐 (storm).

6. **Body/sense creatures** — Family-friendly body parts: 目 (eye), 耳 (ear), 手 (hand) could become cute sense-themed creatures.
