# Area 2: 奥の森 (Deep Forest) — Design Spec

## Area Definition

| Field | Value |
|-------|-------|
| ID | `okunomori` |
| Name | 奥の森 |
| Name (EN) | Deep Forest |
| Reading | おくのもり |
| Particle | の |
| Modifier Word | 奥 (おく) — "inner part / depths" — Rank 600 |
| Location Word | 森 (もり) — "forest" — Rank 1400 |
| Stage | 2 |
| Structure | 30 rooms (same as Area 1) |

## Creatures (12 common + 1 boss)

All common creatures are single-word, non-compound. Boss is compound.

| ID | Name | Reading | Meaning | Rank | Rarity |
|----|------|---------|---------|------|--------|
| tsuki | 月 | つき | moon | 1100 | common |
| kage | 影 | かげ | shadow | 1400 | common |
| hoshi | 星 | ほし | star | 1500 | common |
| uma | 馬 | うま | horse | 1600 | common |
| yuki | 雪 | ゆき | snow | 1800 | common |
| oni | 鬼 | おに | ogre/demon | 2000 | common |
| koori | 氷 | こおり | ice | 2100 | common |
| kemuri | 煙 | けむり | smoke | 2400 | common |
| hebi | 蛇 | へび | snake | 3600 | common |
| kaminariookami | 雷 | かみなり | thunder | 3600 | — (boss component only) |
| ookami | 狼 | おおかみ | wolf | 3700 | common |
| kuma | 熊 | くま | bear | 4700 | common |
| buta | 豚 | ぶた | pig | 5500 | common |
| **Boss** | **雷狼** | **かみなりおおかみ** | **Thunder Wolf** | compound | uncommon |

**Note:** 雷 (thunder) is NOT a standalone creature — it only appears as part of the boss compound 雷狼. This differs from Area 1 where both boss components (火, 猫) were standalone creatures.

**Element and archetype assignments:** TBD during implementation.

## Moves (15 new + Area 1 carryovers)

### New Moves

| ID | Name | Reading | Meaning | Rank | Category (suggested) |
|----|------|---------|---------|------|---------------------|
| taberu | 食べる | たべる | eat | 200 | heal |
| aruku | 歩く | あるく | walk | 300 | buff/dodge |
| sakebu | 叫ぶ | さけぶ | shout/scream | 800 | debuff |
| osu | 押す | おす | push | 1000 | damage |
| kakureru | 隠れる | かくれる | hide | 1000 | shield |
| furu | 降る | ふる | fall (rain/snow) | 1300 | damage (AoE) |
| furueru | 震える | ふるえる | tremble/shake | 1400 | debuff |
| hikaru | 光る | ひかる | shine/glow | 1600 | buff |
| suu | 吸う | すう | suck/absorb | 1700 | drain |
| nageru | 投げる | なげる | throw | 1800 | damage |
| fuku | 吹く | ふく | blow (wind) | 2100 | damage (AoE) |
| nusumu | 盗む | ぬすむ | steal | 2400 | debuff/special |
| tokeru | 溶ける | とける | melt/thaw | 2500 | damage |
| kamu | 噛む | かむ | bite | 3500 | damage (animal basic) |
| kooru | 凍る | こおる | freeze | 4800 | debuff (stun) |

### Area 1 Carryovers (all available in creature learnsets)

All 14 Area 1 moves are available for Area 2 creature learnsets. Thematic fit and balance should dictate which creatures learn which carryovers.

- 叩く (たたく) — strike — damage (neutral)
- 炎 (ほのお) — flame — damage (fire)
- 燃える (もえる) — burn — damage (fire)
- 流す (ながす) — wash away — damage (water)
- 囲む (かこむ) — surround — damage (wood)
- 握る (にぎる) — grasp — damage (earth)
- 切る (きる) — cut — damage (metal)
- 飛ぶ (とぶ) — fly/jump — damage (neutral)
- 守る (まもる) — protect — buff (defense)
- 泣く (なく) — cry — buff (attack)
- 呼ぶ (よぶ) — call/summon — buff (haste)
- 眠る (ねむる) — sleep — heal
- 飲む (のむ) — drink — heal (water)
- 怒る (おこる) — get angry — debuff (confuse)

**Design note:** No universal basic attack. Different creature types start with different moves:
- Wolves, bears, snakes → 噛む (bite)
- Horse → TBD (maybe 走る carryover or 押す)
- Abstract/elemental creatures → varied (吹く, 降る, 光る, etc.)

**Creature learnsets (which creatures learn which moves):** TBD during implementation.

## NPCs (4)

| ID | Name | Reading | Meaning | Rank | Skill | Skill Reading | Skill Meaning | Skill Rank |
|----|------|---------|---------|------|-------|---------------|---------------|------------|
| okaasan | お母さん | おかあさん | mother | 1400 | 作る | つくる | make/create | 200 |
| otousan | お父さん | おとうさん | father | 1400 | 助ける | たすける | help/rescue | 300 |
| otouto | 弟 | おとうと | younger brother | 1600 | 読む | よむ | read | 400 |
| imouto | 妹 | いもうと | younger sister | 1400 | 笑う | わらう | laugh/smile | 500 |

**Progression from Area 1:** Area 1 taught age/gender (child, adult, boy, girl) + daily activities (play, work, run, sing). Area 2 teaches family roles (mother, father, younger brother, younger sister) + daily activities (make, help, read, laugh).

## Items

**Food:** TBD — 8 items, current candidates: 肉, パン, ご飯, 野菜, コーヒー, ケーキ, カレー, ジュース

**Equipment:** TBD — 5 items, still exploring

## Sub-Areas

TBD — the old plan had 6 sub-areas (Small Pond, Old Hut, Dark Path, Mossy Grassland, Hidden Spring, Deep Cave). These may be reused or redesigned.

## Vocabulary Summary

### New vocab taught in Area 2

| Category | Count | Words |
|----------|-------|-------|
| Area name | 2 | 奥, 森 |
| Creatures | 13 | 月, 影, 星, 馬, 雪, 鬼, 氷, 煙, 蛇, 狼, 熊, 豚, 雷 (via boss) |
| Moves | 15 | 食べる, 歩く, 叫ぶ, 押す, 隠れる, 降る, 震える, 光る, 吸う, 投げる, 吹く, 盗む, 溶ける, 噛む, 凍る |
| NPCs | 4 | お母さん, お父さん, 弟, 妹 |
| NPC skills | 4 | 作る, 助ける, 読む, 笑う |
| Food | 8 | TBD |
| Equipment | 5 | TBD |

**Total new vocab (excluding items):** ~38 words
**Estimated total with items:** ~51 words (vs Area 1's ~48)

### Design principles followed
- All creature names are single-word, non-compound (common rarity pattern)
- Boss is compound of two words (雷 + 狼), matching Area 1's 火猫 pattern
- 雷 only appears in boss name (not a standalone creature)
- Vocab is mostly unique to Area 2 with deliberate carryovers for reinforcement
- NPCs progress naturally from Area 1's social vocabulary
- Move list prioritizes everyday verbs a language learner needs
- All frequency ranks verified against JPDB API
