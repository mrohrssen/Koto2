# Fusion Boss Area Roadmap Design

**Date:** 2026-07-02
**Status:** Approved design
**Scope:** Allocate all 9 unplaced fusion bosses (and their 15 uncatchable ingredients) to 9 new themed areas, making the game content-complete for the current 72-creature set. This is the area-placement work that the 2026-05-06 boss-locked fusion roster design explicitly deferred.

## Problem

Twelve fusion recipes exist in `src/game/services/fusion-service.js`, each locked behind `requiresBossDefeatId` — the fusion creature must be defeated as an area boss before its recipe unlocks. Only 3 fusion creatures are placed as bosses (Fire Cat → Starting Meadow, Stone Giant → Wild Plains, Flower Fairy → School). The other 9 fusion bosses have no area, so their recipes are permanently locked. Worse, their 15 ingredient creatures (kage, hikari, uma, kumo, tsuki, ookami, koori, kuma, suna, hebi, kaminari, yuki, kitsune, hone, oni) spawn nowhere, and 28 more non-fusion creatures are also unassigned.

## Design Principles

1. **Learner value picks the theme (user directive).** Every area is a concrete, imageable everyday domain — the domains where high-frequency vocabulary clusters, per the theme-based content system design (2026-03-04): frequency determines the theme; thematic (not semantic) clustering; imageability × frequency. Fusion bosses garnish the theme, not vice versa.
2. **Area names teach two words** via the existing `modifierWord + の + locationWord` pattern (始まりの広場 precedent). All name words were validated against JPDB during design (ranks listed below). Single-word names (学校/野原 precedent) are allowed where no natural modifier exists.
3. **One fusion boss per area; ingredients catchable at-or-before that area.** Beating the boss unlocks the recipe via the existing `requiresBossDefeatId` path, and the player can immediately farm ingredients. No engine changes: appending areas to `data/areas.json` in order makes `hasDefeatedBoss`'s index fallback (`highestUnlocked >= bossAreaIndex + 2`) work automatically.
4. **Rarity escalates with area order.** Uncommon-boss areas (4–7) precede rare-boss areas (8–12); native spawn pools shift from common/uncommon toward 2–3 rares per pool. Enemy level scaling (`getEnemyLevel` by totalEncounters) supplies the rest of the difficulty curve.
5. **Day-and-season narrative arc:** morning → sea → evening → desert heat → night → storm → ice → snow → festival finale. Bright Saturday-morning tone throughout (WORLD.md): the oni is festival folklore, the goblin is a croquette thief, the ghost belongs to a test-of-courage trail — never horror.

## Current State (verified 2026-07-02)

- 3 areas in `data/areas.json`: hajimari-no-hiroba, wild-plains, school. All `stage: 1`. Sequential unlock by array index.
- 72 creatures in `data/creatures.json`; 20 assigned (17 spawns + 3 bosses). All 72 have static + animated sprites (`public/assets/sprites/creatures{,-animated}/`) — the boss-locked fusion pass's missing-art debt has since been paid.
- Content pattern per area (School template): theme pool file (`language/themes/<themeId>.json`) → area entry → 4–5 NPCs (`data/npcs.json`) → 12–15 items (`data/items.json`) → NPC skills (`data/npc-skills.json`) → dialogue frames (`data/dialogue/frame-sources.json` pipeline) → parallax background.
- Pre-generated but unused theme pools: airport (空港, 24 words), shopping-mall (市場, 47 words). The shopping-mall pool feeds Area 6; airport remains banked for future content.

## The Nine Areas

| # | Area ID | Name | Name teaches (JPDB rank) | Boss (fusion, rarity) | New natives | Reused spawns |
|---|---------|------|--------------------------|----------------------|-------------|---------------|
| 4 | morning-ranch | 朝の牧場 Morning Ranch | 朝 400 · 牧場 13700 | 光の馬 hikarino-uma (unc) | hikari, uma, tsuchi, ushi, buta, hitsuji, nezumi, kaeru | inu, tori, hana |
| 5 | blue-sea | 青い海 Blue Sea | 青い 1600 · 海 800 | 雲の魚 kumono-sakana (unc) | kumo, kame, tako, ika, kani, kamo, kujira (epic) | sakana, mizu |
| 6 | evening-town | 夕方の町 Evening Town | 夕方 2200 · 町 800 | 影の犬 kageno-inu (unc) | kage, suraimu, goburin | neko, inu, nezumi |
| 7 | desert | 砂漠 Desert | 砂漠 8400 (single word) | 砂の蛇 sunano-hebi (unc) | suna, hebi, tokage, suishou | ishi, hi, kaze |
| 8 | night-forest | 夜の森 Night Forest | 夜 300 · 森 1400 | 月の狼 tsukino-ookami (rare) | tsuki, hoshi, ookami, yuurei, erufu | fukurou, kage, mushi |
| 9 | thunder-mountain | 雷の山 Thunder Mountain | 雷 3600 · 山 700 | 雷の鳥 kaminarino-tori (rare) | kaminari, saru, shika, inoshishi, tora, kemono | tori, kaze, ishi, kumo |
| 10 | frozen-lake | 氷の湖 Frozen Lake | 氷 2100 · 湖 4300 | 氷の熊 koorino-kuma (rare) | koori, kuma, tsuru | kamo, sakana, mizu |
| 11 | snow-village | 雪の村 Snow Village | 雪 1800 · 村 1500 | 雪の狐 yukino-kitsune (rare) | yuki, kitsune | saru, hitsuji, koori, tsuru |
| 12 | summer-festival | 夏の祭り Summer Festival | 夏 1200 · 祭り 4300 | 骨の鬼 honeno-oni (rare) | hone, oni, akuma | yuurei, kitsune, hi |

Area IDs use the English kebab-case convention above (wild-plains/school precedent, 2 of 3 existing areas).

### Area 4 — 朝の牧場 (Morning Ranch)

- **Teaching identity:** farm animals, farm food, morning-routine verbs. Core pool candidates: 卵 egg, 牛乳 milk, 野菜 vegetables, 米 rice, 起きる wake up, 育てる raise, 働く work.
- **Boss story:** the Light Horse appears with the dawn light over the pasture. Ingredients hikari + uma both native.
- **Spawn flavor:** frogs in the rice paddies (kaeru), mice in the barn (nezumi), farm dog (inu reuse).
- **NPC concepts:** farmer, rancher kid, milk seller, shepherd, vet.
- **Item concepts:** eggs, milk, vegetables, rice, straw hat, watering can.
- **NPC-skill concepts:** 育てる raise, 起こす wake (someone), 運ぶ carry.

### Area 5 — 青い海 (Blue Sea)

- **Teaching identity:** sea life, beach objects, fishing/swimming. Candidates: 波 wave, 船 boat, 貝 shell, 塩 salt, 泳ぐ swim (2100), 釣る catch/fish.
- **Boss story:** Cloud Fish swims where clouds meet the horizon. Ingredients: kumo native, sakana from Area 1.
- **Spawn flavor:** kujira (epic) as an ultra-rare "whale watch" spawn — the area's wow moment.
- **NPC concepts:** fisherman, sailor, shell-shop keeper, lifeguard.
- **Item concepts:** shells, salt, grilled fish, seaweed, fishing rod, sunscreen.
- **NPC-skill concepts:** 泳ぐ swim, 釣る fish, 潜る dive.

### Area 6 — 夕方の町 (Evening Town)

- **Teaching identity:** shopping, errands, directions — core traveler vocabulary. Candidates: 店 shop, 道 road, 鍵 key, 地図 map, 買う buy, 売る sell, 探す look for, 曲がる turn. **Harvest the existing shopping-mall (市場) theme pool's 47 curated words.**
- **Boss story:** Shadow Dog is a loyal stray patrolling lantern-lit alleys at dusk — the evening setting motivates 影 while staying bright. Ingredients: kage native, inu from Area 1.
- **Spawn flavor:** alley cat (neko reuse), sewer slime (suraimu), goblin as mischievous croquette thief (goburin, rare).
- **NPC concepts:** shopkeeper, baker, police officer, grandma, delivery kid.
- **Item concepts:** bread, croquette, key, map, lantern, coin purse.
- **NPC-skill concepts:** 買う buy, 売る sell, 探す search, 走る run.

### Area 7 — 砂漠 (Desert)

- **Teaching identity:** heat, thirst, survival. Candidates: 暑い hot, 太陽 sun, 喉 throat, 乾く get dry, オアシス oasis, 渇く be thirsty.
- **Boss story:** Sand Snake is a dune ambusher. Ingredients suna + hebi both native.
- **Spawn flavor:** lizards sunning on rocks (tokage), desert crystals (suishou), sandstorm wind (kaze reuse). First all-uncommon native pool — the difficulty step.
- **NPC concepts:** caravan trader, oasis keeper, desert guide.
- **Item concepts:** water flask, dried fruit, turban/hat, cactus fruit, compass.
- **NPC-skill concepts:** 隠れる hide, 掘る dig, 逃げる flee.

### Area 8 — 夜の森 (Night Forest)

- **Teaching identity:** night sky + camping. Candidates: 暗い dark, 静か quiet, 光る shine (1600), テント tent, ランタン lantern, 星空 starry sky.
- **Boss story:** Moon Wolf howls from the moonlit clearing — first rare boss. Ingredients tsuki + ookami both native.
- **Spawn flavor:** the school owl comes home (fukurou reuse), fireflies (mushi reuse), ghost and elf as rare spawns (yuurei, erufu).
- **NPC concepts:** stargazer, camper, night guard, elf elder.
- **Item concepts:** lantern, tent, telescope, star candy, blanket.
- **NPC-skill concepts:** 光る shine, 眠る sleep, 隠れる hide, 数える count.

### Area 9 — 雷の山 (Thunder Mountain)

- **Teaching identity:** mountain + weather. Candidates: 登る climb, 岩 rock, 嵐 storm, 雨 rain, 頂上 summit, 靴 boots.
- **Boss story:** Thunder Bird nests on the storm-wreathed peak. Ingredients: kaminari native, tori from Area 1.
- **Spawn flavor:** mountain monkey (saru), deer (shika), boar (inoshishi), tiger (tora), beast (kemono) — heaviest rare density yet.
- **NPC concepts:** mountain guide, hiker, tea-house keeper, weather watcher.
- **Item concepts:** rope, boots, raincoat, hot tea, trail onigiri.
- **NPC-skill concepts:** 登る climb, 投げる throw, 落ちる fall.

### Area 10 — 氷の湖 (Frozen Lake)

- **Teaching identity:** ice + winter gear. Candidates: 寒い cold, 凍る freeze, 滑る slide/skate, 手袋 gloves, スープ soup.
- **Boss story:** Ice Bear guards the frozen shore. Ingredients koori + kuma both native.
- **Spawn flavor:** cranes and ducks wintering on the lake (tsuru, kamo reuse), ice fishing (sakana reuse).
- **NPC concepts:** ice fisher, skater, soup-stall keeper, winter-gear seller.
- **Item concepts:** skates, gloves, scarf, hot soup, ice-fishing catch.
- **NPC-skill concepts:** 滑る slide, 凍る freeze, 割る break.

### Area 11 — 雪の村 (Snow Village)

- **Teaching identity:** onsen village life — culturally iconic and practically useful. Candidates: 温泉 hot spring (4400), お風呂 bath, 鍋 hotpot, 休む rest, 温かい warm, 服 clothes.
- **Boss story:** Snow Fox is the village's fox spirit. Ingredients yuki + kitsune both native.
- **Spawn flavor:** snow monkeys soaking in the onsen (saru reuse — the iconic Japan moment), wool sheep (hitsuji reuse).
- **NPC concepts:** innkeeper, onsen attendant, soba chef, village elder.
- **Item concepts:** onsen egg, soba, hotpot, towel, yukata, snow boots.
- **NPC-skill concepts:** 温める warm up, 入る enter, 休む rest.

### Area 12 — 夏の祭り (Summer Festival)

- **Teaching identity:** festival culture + festival food — the celebration finale. Candidates: 花火 fireworks (4900), お面 mask, 太鼓 drum, 屋台 stall, たこ焼き takoyaki, かき氷 shaved ice, 焼きそば yakisoba, りんご飴 candy apple, 踊る dance, 並ぶ line up.
- **Boss story:** Bone Oni presides over the test-of-courage (肝試し) trail — folklore-spooky, kid-friendly. Ingredients hone + oni both native.
- **Spawn flavor:** the ghost haunts the kimodameshi trail (yuurei reuse), fox masks tie back to Snow Fox (kitsune reuse), fireworks tie back to hi. Mischievous festival demon (akuma, rare).
- **NPC concepts:** festival organizer, taiko drummer, yatai vendor, mask seller, dancer.
- **Item concepts:** takoyaki, shaved ice, yakisoba, candy apple, mask, paper fan, sparkler.
- **NPC-skill concepts:** 踊る dance, 叩く beat (drum), 驚かす startle.

## Coverage Matrix

**Fusion bosses: 9/9 placed.** Every recipe's `requiresBossDefeatId` becomes reachable.

**Ingredients: 15/15 catchable at-or-before their boss's area:**

| Recipe | Ingredients | Available from |
|--------|-------------|----------------|
| hikarino-uma | hikari + uma | Area 4 + Area 4 |
| kumono-sakana | kumo + sakana | Area 5 + Area 1 |
| kageno-inu | kage + inu | Area 6 + Area 1 |
| sunano-hebi | suna + hebi | Area 7 + Area 7 |
| tsukino-ookami | tsuki + ookami | Area 8 + Area 8 |
| kaminarino-tori | kaminari + tori | Area 9 + Area 1 |
| koorino-kuma | koori + kuma | Area 10 + Area 10 |
| yukino-kitsune | yuki + kitsune | Area 11 + Area 11 |
| honeno-oni | hone + oni | Area 12 + Area 12 |

**Creatures: 70/72 allocated.** Deliberately reserved: **ryuu (legendary)** and **tenshi (rare)** for a future endgame celestial/sky area (空, JPDB 700, is available as its name; hikari/kumo/tsuki reuse naturally there). Neither has a fusion recipe, so the "all fusion monsters assigned" goal is met without them.

## Wiring Notes

- **`stage: 1` for all nine areas**, matching all three existing areas (School's theme pool computed stage 5 yet ships as `stage: 1`). Difficulty comes from creature rarity + enemy level scaling, not curriculum tier.
- **`roomCount: 30`** per area (Wild Plains precedent for full-length areas).
- **Unlock order = array order** in `data/areas.json`. Append areas 4–12 in the order above; `getFusionState` boss gating works with zero code changes.
- **Per-area build checklist** (the definition of "content complete" for one area, School being the template):
  1. Theme pool file via the 5-method consensus process + JPDB enrichment (`language/themes/<themeId>.json`)
  2. `data/areas.json` entry (name/reading/rank fields, creatures, bossCreatureId, roomCount, background, stage)
  3. 4–5 NPCs with skills, personalities, greetings (`data/npcs.json`, character cards)
  4. 12–15 items (`data/items.json`)
  5. NPC skills (`data/npc-skills.json`)
  6. Dialogue via frames pipeline (`data/dialogue/frame-sources.json` → tokenize → validate)
  7. Parallax backgrounds (sky/battleground webp) + `BACKGROUND_VERSION` bump
  8. Validation tests (area data contract, i+1 dialogue validation)
- **Sprites:** all 72 creatures already have static + animated sprites. New art per area: backgrounds, NPC sprites, item icons only.
- **Word accuracy:** all new Japanese content words must pass JPDB frequency lookup and dictionary-accurate glossing per CLAUDE.md; any `data/dictionary.json` additions require explicit user confirmation.

## Build Order Recommendation

Build areas strictly in unlock order (4 → 12). Each area is an independent content unit; one area per implementation plan keeps plans reviewable and lets learner-facing quality gates (i+1 validation, dialogue frames) run per area rather than at the end.

## Non-Goals

- No new creatures, moves, or fusion recipes (content-complete for the current 72-creature set).
- No engine/system changes (no sub-area wiring, no new unlock mechanics, no stage-curriculum changes).
- No endgame celestial area for ryuu/tenshi (future work; noted here only as the reservation rationale).
- No Fusion Core economy changes.

## Acceptance Criteria

The roadmap is fully realized when:

- All 9 areas exist in `data/areas.json` in the specified order with the specified bosses and creature pools.
- Every fusion recipe's boss is defeatable and its ingredients catchable at-or-before that boss's area.
- Each area ships the full School-pattern content set (theme pool, NPCs, items, NPC skills, dialogue frames, backgrounds, tests).
- `npm test` passes, including area data-contract validations.
