# Area Content Ledger — NPCs, NPC Skills, Items (Areas 4–12)

**Date:** 2026-07-02
**Status:** Approved design (companion to `2026-07-02-fusion-boss-area-roadmap-design.md`)
**Scope:** Word-level content for all 9 roadmap areas: every NPC, NPC skill, and item as an actual Japanese word with verified reading, JPDB frequency rank, and dictionary-accurate gloss. This ledger supersedes the concept-level NPC/item/skill lists in the roadmap doc. Stats (power, MP, prices, effects, tiers) belong to per-area implementation plans.

All ranks below were validated live against the JPDB API on 2026-07-02, including context-sentence re-parses for reading-ambiguous words (米→こめ 6700 not べい, 網→あみ 6400, 浴衣→ゆかた 8900, 女将→おかみ, 描く→えがく 900). Notable trap caught: kana そば ranks 1600 only because of the "beside" homograph — noodle-sense 蕎麦 is 20000, so Snow Village uses うどん 11800 instead.

## Validation Policy

- **Core budget:** rank ≤ 12,000 for most words.
- **Iconic band (12,000–20,000), flagged `†`:** allowed sparingly for culturally-essential, highly imageable words (太鼓, 金魚, 提灯, 天狗, 饅頭…). Justified by the imageability×frequency research already cited in the theme-based content system design. 35 of 167 fresh words (~21%) sit here, deliberately concentrated in the Summer Festival finale, where festival words *are* the teaching content.
- **One documented exception > 20,000:** かき氷 20,400 (shaved ice) — 2% over cap, festival-defining.
- **Rejected during design** (never ship): 獣医 33300, 雪女 38100, お巡りさん 25000, 神主 28500, 登山家 61900, ガイド 22000, ナン 160800, ぶどう 30400, スケート 36000, こたつ 25900, ソリ 34800, 神輿 32000, ヨーヨー 45500, わたあめ 48600, りんご飴 55400, 焼き芋 44700, 豚汁 39200, and ~25 more candidates that failed the cap.
- **Collision rules:** no new word may duplicate an already-taught item/NPC/skill word (existing inventory: 27 item words, 8 NPC words, 8 skill words). NPC-skill words *may* share a word with a creature move (読む precedent) — used twice, deliberately: 潜る (mermaid) and 踊る (dancer). One existing skill is *reused outright*: 歌う/utau for the festival singer (asobu-style cross-area reuse precedent).
- **Dictionary gate:** every word here must exist in `data/dictionary.json` before shipping; the frames validator catches gaps. Per CLAUDE.md, any dictionary additions require explicit user confirmation at implementation time — implementation plans must surface the missing-entry list for approval.
- **Review-item padding:** areas with fewer than 12 fresh items may pad shops with review items from earlier areas (Meadow/Plains share one item set wholesale, so partial reuse is precedented). Fresh-word counts per area are listed honestly below; padding is an implementation choice, not a ledger requirement.

## Area 4 — 朝の牧場 Morning Ranch

NPCs (family farm):

| NPC | Reading | Rank | Gloss | Skill |
|---|---|---|---|---|
| 農家 | のうか | 8100 | farmer / farm family | 育てる |
| お母さん | おかあさん | 1400 | mother / mom | 起こす |
| 娘 | むすめ | 600 | daughter / (young) girl | 運ぶ |
| おじいさん | おじいさん | 9000 | grandfather / elderly man | 手伝う |

Skills: 育てる そだてる 1300 "to raise / to bring up" (buff) · 起こす おこす 800 "to wake (someone) / to raise" (damage — the wake-up call) · 運ぶ はこぶ 900 "to carry / to transport" · 手伝う てつだう 900 "to help / to assist" (heal).

Items (12): 牛乳 ぎゅうにゅう 6200 milk · 野菜 やさい 2600 vegetable · 米 こめ 6700 (uncooked) rice · チーズ 6300 cheese · バター 9800 butter · トマト 9600 tomato · ジャム 13800† jam · 蜂蜜 はちみつ 14000† honey || バケツ 10400 bucket · 鈴 すず 5000 (small) bell · 籠 かご 6000 basket · エプロン 8500 apron.

## Area 5 — 青い海 Blue Sea

| NPC | Reading | Rank | Gloss | Skill |
|---|---|---|---|---|
| 漁師 | りょうし | 12700† | fisherman | 釣る |
| 船長 | せんちょう | 11000 | (ship's) captain | 助ける |
| 人魚 | にんぎょ | 14500† | mermaid | 潜る |
| 海賊 | かいぞく | 10200 | pirate | 泳ぐ |

Skills: 釣る つる 4500 "to fish / to catch (with a line)" · 助ける たすける 300 "to help / to save" (heal) · 潜る もぐる 4700 "to dive / to go underwater" (shares word with creature move — 読む precedent) · 泳ぐ およぐ 2100 "to swim".

Items (11): 塩 しお 4300 salt · スイカ 15800† watermelon · 刺身 さしみ 17300† sashimi · ジュース 5000 juice · アイス 8500 ice cream || 水着 みずぎ 8200 swimsuit · サングラス 10900 sunglasses · 貝 かい 10400 shellfish / shell · 宝 たから 5300 treasure (pirate hook) · 網 あみ 6400 net · ボート 10600 boat.

## Area 6 — 夕方の町 Evening Town

| NPC | Reading | Rank | Gloss | Skill |
|---|---|---|---|---|
| 店員 | てんいん | 3400 | shop assistant / clerk | 売る |
| パン屋 | パンや | 14600† | bakery / baker | 包む |
| 警察官 | けいさつかん | 7300 | police officer | 探す |
| おばあさん | おばあさん | 10500 | grandmother / elderly woman | 買う |

Skills: 売る うる 1100 "to sell" · 包む つつむ 1100 "to wrap / to pack" (baker wrapping bread) · 探す さがす 600 "to search for / to look for" · 買う かう 400 "to buy / to purchase".

Items (12): ケーキ 3500 cake · クッキー 8400 cookie · コーヒー 3300 coffee · プリン 10100 custard pudding || 鍵 かぎ 1600 key · 地図 ちず 3300 map · 財布 さいふ 4100 wallet · 傘 かさ 4700 umbrella · 新聞 しんぶん 2800 newspaper · お土産 おみやげ 4900 souvenir · 花束 はなたば 9600 bouquet · ポスト 12700† postbox / mailbox.

The shopping-mall (市場) theme pool's 47 curated words feed this area's theme pool file; the items above take priority where they overlap.

## Area 7 — 砂漠 Desert

| NPC | Reading | Rank | Gloss | Skill |
|---|---|---|---|---|
| 商人 | しょうにん | 3700 | merchant / trader | 交換 |
| 学者 | がくしゃ | 6500 | scholar | 見つける |
| 旅人 | たびびと | 8900 | traveler | 休む |
| 姫 | ひめ | 3200 | princess | 案内 |

Skills: 交換 こうかん 2600 "exchange / swap" (suru-noun, 勉強 precedent) · 見つける みつける 400 "to discover / to find" · 休む やすむ 900 "to rest / to take a break" (heal — oasis rest) · 案内 あんない 1200 "guidance / showing around" (suru-noun).

Items (10): カレー 4600 curry · バナナ 13400† banana (oasis palms) · スパイス 15900† spice || 水筒 すいとう 13700† water flask / canteen · 宝石 ほうせき 3500 gem / jewel · ランプ 8600 lamp · 絨毯 じゅうたん 8500 carpet / rug · 壺 つぼ 8800 jar / pot · 香水 こうすい 9400 perfume · マント 8300 cloak / mantle.

## Area 8 — 夜の森 Night Forest

| NPC | Reading | Rank | Gloss | Skill |
|---|---|---|---|---|
| 博士 | はかせ | 4400 | expert / doctor (learned person) | 見上げる |
| 魔女 | まじょ | 8200 | witch (friendly, Kiki-style) | 占う |
| 詩人 | しじん | 12200† | poet | 語る |
| 冒険者 | ぼうけんしゃ | 8300 | adventurer | 探検 |

Skills: 見上げる みあげる 1400 "to look up at" (stargazing) · 占う うらなう 14700† "to tell (someone's) fortune / to divine" · 語る かたる 900 "to talk about / to tell / to narrate" · 探検 たんけん 13300† "exploration / expedition" (suru-noun).

Items (10): キノコ 10400 mushroom · チョコレート 8600 chocolate · 栗 くり 14200† chestnut || テント 8400 tent · 毛布 もうふ 5300 blanket · 薬草 やくそう 8500 medicinal herb (witch's stock) · 笛 ふえ 8800 flute / whistle · 薪 たきぎ 9100 firewood · 蝋燭 ろうそく 13400† candle · 望遠鏡 ぼうえんきょう 19000† telescope.

## Area 9 — 雷の山 Thunder Mountain

| NPC | Reading | Rank | Gloss | Skill |
|---|---|---|---|---|
| 僧侶 | そうりょ | 13900† | (Buddhist) monk | 祈る |
| 鍛冶屋 | かじや | 19600† | blacksmith | 鍛える |
| 天狗 | てんぐ | 17200† | tengu (long-nosed goblin) | 導く |
| 医者 | いしゃ | 2500 | doctor / physician (mountain rescue) | 治す |

Skills: 祈る いのる 2000 "to pray / to wish" · 鍛える きたえる 3300 "to forge / to train / to discipline" · 導く みちびく 2300 "to guide / to lead" (tengu guide lost travelers — folklore-accurate) · 治す なおす 3700 "to cure / to heal" (transitive — heal).

Items (12): 餅 もち 12600† mochi (rice cake) · 味噌汁 みそしる 10500 miso soup · 芋 いも 10800 potato / tuber || ロープ 8400 rope · 杖 つえ 3600 staff / cane · 鐘 かね 5900 bell (large; temple bell) · ハンマー 11000 hammer · お守り おまもり 6100 amulet / charm · ヘルメット 11300 helmet · 旗 はた 6200 flag (summit flag) · 鎧 よろい 3400 armor · 盾 たて 3200 shield.

鈴 5000 (Ranch, small bell) vs 鐘 5900 (Mountain, large bell) is a deliberate contrast pair, like おじさん/おじいさん below.

## Area 10 — 氷の湖 Frozen Lake

| NPC | Reading | Rank | Gloss | Skill |
|---|---|---|---|---|
| 選手 | せんしゅ | 3600 | athlete / player (the skater) | 滑る |
| 料理人 | りょうりにん | 8600 | cook / chef (soup stall) | 混ぜる |
| 画家 | がか | 10800 | painter / artist | 描く |
| 漁師 | *(reuse from Blue Sea)* | — | the sea fisherman visits to ice-fish | 待つ |

Skills: 滑る すべる 3500 "to slide / to glide / to slip" · 混ぜる まぜる 4200 "to mix / to stir" · 描く えがく 900 "to draw / to paint / to depict" · 待つ まつ 200 "to wait" (ice fishing *is* waiting).

NPC reuse across areas is precedented (kodomo/otona appear in both Meadow and Plains); the traveling fisherman gives narrative continuity and a fresh skill word instead of a fresh name word (釣り人 rejected at 52100).

Items (9): スープ 4400 soup · シチュー 12800† stew || 手袋 てぶくろ 5500 glove(s) · マフラー 11000 scarf / muffler · コート 4500 coat · セーター 18000† sweater · ブーツ 10500 boots · 竿 さお 11300 rod / pole · 絵 え 1700 picture / painting (the painter sells them).

## Area 11 — 雪の村 Snow Village

| NPC | Reading | Rank | Gloss | Skill |
|---|---|---|---|---|
| 女将 | おかみ | 13000† | proprietress / landlady (ryokan) | 迎える |
| 村長 | そんちょう | 9400 | village chief | 集まる |
| 職人 | しょくにん | 4300 | craftsman / artisan | 作る |
| お客さん | おきゃくさん | 2400 | customer / guest | 入る |

Skills: 迎える むかえる 1100 "to welcome / to go out to meet" · 集まる あつまる 500 "to gather / to assemble" (chief rallies the village) · 作る つくる 200 "to make / to create" · 入る はいる 200 "to enter / to go in" (the guest enters the bath).

Items (11): うどん 11800 udon (thick wheat noodles) · 鍋 なべ 4100 pot / hotpot dish · 饅頭 まんじゅう 17900† manjū (steamed bun) · お湯 おゆ 4200 hot water || タオル 4200 towel · 浴衣 ゆかた 8900 yukata (light cotton kimono) · 石鹸 せっけん 16000† soap · 枕 まくら 4300 pillow · 布団 ふとん 3300 futon / bedding · 桶 おけ 11000 (wooden) bucket / tub · 下駄 げた 19400† geta (wooden clogs).

## Area 12 — 夏の祭り Summer Festival

| NPC | Reading | Rank | Gloss | Skill |
|---|---|---|---|---|
| おじさん | おじさん | 3200 | uncle / middle-aged man (yatai uncle) | 祝う |
| 巫女 | みこ | 8400 | shrine maiden | 願う |
| お姉さん | おねえさん | 3200 | older sister / young woman (the dancer) | 踊る |
| 歌手 | かしゅ | 17600† | singer | 歌う *(reuse of existing skill utau)* |

Skills: 祝う いわう 5400 "to celebrate / to congratulate" · 願う ねがう 1100 "to wish / to hope for" · 踊る おどる 2200 "to dance" (shares word with creature move — deliberate) · 歌う = existing `utau` skill reused (asobu precedent).

おじさん 3200 here vs おじいさん 9000 at the Ranch is a deliberate minimal pair — the game teaches the uncle/grandfather distinction learners always trip on.

Items (10): たこ焼き 14500† takoyaki (octopus dumplings) · 焼きそば 15300† yakisoba (fried noodles) · かき氷 かきごおり 20400 **(documented exception)** shaved ice || 花火 はなび 4900 fireworks · 太鼓 たいこ 12600† drum / taiko · 面 めん 1300 face / mask (festival mask sense; polysemy noted for dictionary care) · 金魚 きんぎょ 15500† goldfish (goldfish scooping) · くじ 16400† lot / lottery / raffle · 扇子 せんす 17300† folding fan · 提灯 ちょうちん 16000† paper lantern.

## Totals & Cross-Checks

- **Fresh validated words: 167** (35 NPC + 35 skill + 97 item), plus 2 deliberate reuses (漁師 NPC, 歌う skill) and 2 move-word shares (潜る, 踊る).
- **No collisions** with the 27 existing item words, 8 existing NPC words, or 8 existing NPC skills.
- **Flag distribution:** Ranch 2 · Sea 4 · Town 2 · Desert 3 · Forest 6 · Mountain 4 · Lake 2 · Village 4 · Festival 8+1 exception — rising toward the finale, matching the area difficulty curve.
- Every gloss above is primary-sense-first per CLAUDE.md translation rules; transitivity checked (起こす/治す/育てる transitive, 集まる intransitive, etc.).

## Acceptance Criteria

- Implementation plans consume this ledger verbatim: NPC/skill/item words, readings, ranks, and glosses are not to be re-invented downstream.
- Any word swap during implementation requires a JPDB re-validation and a ledger update in the same PR.
- Missing `data/dictionary.json` entries are listed and user-approved before any area ships.
