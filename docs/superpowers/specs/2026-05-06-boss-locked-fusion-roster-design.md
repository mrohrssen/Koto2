# Boss-Locked Fusion Roster Design

**Date:** 2026-05-06  
**Status:** Approved design, awaiting implementation plan  
**Scope:** Add 10 stronger fusion creatures and 10 two-creature recipes, all locked behind future boss defeats.

## Goal

Koto should gain 10 new fusion creatures that sit above normal creatures in strength, similar to Fire Cat and Stone Giant. Each fusion has a simple two-creature recipe, but the recipe should not be freely available. The player unlocks the fusion data by defeating that fusion creature as a boss in future content.

This pass should add the creature and recipe data contract without placing the bosses in areas yet.

## Source Context

Use the recent creature/move expansion as the content-design pattern:

- Creature templates use name-centric fields where available: `name`, `nameEn`, `reading`, `meaning`, and `rank`.
- Learnsets are manually authored creature-by-creature.
- Each new creature has exactly one legal level-1 move.
- New learnsets are capped at 6 authored entries.
- Validation may catch illegal data, but scripts must not choose movesets.

Use existing fusion behavior from `src/game/services/fusion-service.js`:

- Recipes live in `FUSION_RECIPES`.
- Ingredient requirements are expressed as `ingredientIds`.
- Recipes consume creature copies and 1 Fusion Core.
- Boss-gated recipes can use `requiresBossDefeatId`, as Stone Giant already does.

Local `dev` already contains the creature/move expansion roster. Several recipe ingredients come from that expansion, including `kage`, `hikari`, `kumo`, `tsuki`, `ookami`, `koori`, `kuma`, `suna`, `hebi`, `kaminari`, `yuki`, `kitsune`, `yousei`, `hone`, and `oni`. Implementation should reuse those existing creature templates rather than creating duplicate ingredient templates.

## Fusion Roster

These 10 rows are the source of truth for names, readings, rarity, element, and recipe ingredients.

| Result ID | Japanese | Reading | English | Rarity | Element | Ingredients | Design note |
|---|---|---|---|---|---|---|---|
| `kageno-inu` | 影の犬 | かげのいぬ | Shadow Dog | uncommon | water | `kage` + `inu` | Loyal scout that slips through silhouettes; beginner-friendly component ranks and clean stealth role. |
| `hikarino-uma` | 光の馬 | ひかりのうま | Light Horse | uncommon | metal | `hikari` + `uma` | Radiant charger that gives the metal/light family a fast physical body instead of another caster. |
| `kumono-sakana` | 雲の魚 | くものさかな | Cloud Fish | uncommon | water | `kumo` + `sakana` | Fish that swims through mist and rainclouds, bridging weather vocabulary with water combat. |
| `tsukino-ookami` | 月の狼 | つきのおおかみ | Moon Wolf | rare | metal | `tsuki` + `ookami` | Folklore-adjacent predator; moon keeps word value high while wolf supplies rare fantasy. |
| `koorino-kuma` | 氷の熊 | こおりのくま | Ice Bear | rare | water | `koori` + `kuma` | Sturdy cold-weather guardian with obvious tank hooks and useful component vocabulary. |
| `sunano-hebi` | 砂の蛇 | すなのへび | Sand Snake | uncommon | earth | `suna` + `hebi` | Desert ambusher with bind, poison, burrow, and blind-style move hooks. |
| `kaminarino-tori` | 雷の鳥 | かみなりのとり | Thunder Bird | rare | metal | `kaminari` + `tori` | Classic storm-bird silhouette with speed, stun, and ranged lightning hooks. |
| `yukino-kitsune` | 雪の狐 | ゆきのきつね | Snow Fox | rare | water | `yuki` + `kitsune` | Sleek winter trickster; snow anchors vocabulary while fox adds cultural flavor. |
| `hanano-yousei` | 花の妖精 | はなのようせい | Flower Fairy | rare | wood | `hana` + `yousei` | Gentle support caster with strong world fit and approachable plant vocabulary. |
| `honeno-oni` | 骨の鬼 | ほねのおに | Bone Oni | rare | earth | `hone` + `oni` | Rare bruiser with unusually strong frequency value; scary without becoming endgame demon content. |

The ninth fusion is Thunder Bird (`雷の鳥`), not Thunder Fox.

## Creature Template Design

Each fusion creature should be authored as a stronger fusion result rather than a normal encounter creature.

Template rules:

- `isStarter: false`.
- `stage: 1`.
- `createdAt: "2026-05-06"`.
- `rank: null`, because each fusion name is a phrase rather than a dictionary headword.
- `meaning` should be a phrase gloss, for example `shadow dog (phrase: 影 shadow + の + 犬 dog)`.
- `name`, `nameEn`, `reading`, `meaning`, and `rank` should be present for new templates.
- Do not author `baseWord`, `baseReading`, `baseMeaning`, or `baseRank` for these new templates unless implementation is forced to preserve an older data shape.

Stats should be manually authored from the two ingredients and then nudged upward so each fusion feels stronger than ordinary creatures:

- Uncommon fusions should sit above their ingredient baselines, roughly comparable to Fire Cat or stronger.
- Rare fusions should be noticeably boss-worthy, but not legendary.
- The stat shape should express the fantasy rather than averaging blindly.
- Avoid making every fusion a raw attacker; preserve role variety across Fighter, Mage, Trickster, and Tank/Healer.

## Learnset Design

Each fusion learnset should follow the manual-authoring rules from the creature/move expansion:

- Author each kit by hand, with a short design reason for every move.
- Use 5 or 6 moves per fusion.
- Exactly one move must be available at level 1.
- Level 1 must be a single-target `damage` move, tier 1 or 2.
- No level 1 `buff`, `debuff`, `heal`, `drain`, cleanse, or multi-target move.
- Prefer moves from the two ingredient creatures where they remain thematic.
- Add stronger late moves from the broader move pool when the fusion fantasy earns them.
- Use off-element moves only when the ingredient identity clearly justifies them.

Recommended identity reads:

- Shadow Dog: water Trickster or Fighter/Trickster hybrid focused on stealth, chase, and control.
- Light Horse: metal Fighter focused on speed, charge, and radiant impact.
- Cloud Fish: water Mage/Tank support focused on rain, mist, floating, and cleansing.
- Moon Wolf: metal Fighter/Trickster focused on pursuit, howl, moonlight, and control.
- Ice Bear: water Tank/Healer focused on cold pressure, endurance, and heavy body attacks.
- Sand Snake: earth Trickster focused on ambush, bind, venom, and dex control.
- Thunder Bird: metal Mage/Fighter focused on flight, flash, stun, and storm pressure.
- Snow Fox: water Trickster focused on cold, evasive fox magic, and soft control.
- Flower Fairy: wood Mage or Tank/Healer focused on plant support, sleep, healing, and sparkle.
- Bone Oni: earth Fighter/Tank focused on bones, brute force, fear, and durability.

The implementation should include a small fusion learnset ledger before or alongside data edits, following the pattern of the expansion learnset ledger. The ledger is the design source of truth for the JSON edits.

## Recipe and Unlock Model

Each new fusion recipe should be a two-creature recipe that costs 1 Fusion Core.

Every recipe should be locked behind defeating its matching future boss:

```js
{
  id: 'shadow-dog',
  name: '影の犬',
  nameEn: 'Shadow Dog',
  ingredientIds: ['kage', 'inu'],
  resultId: 'kageno-inu',
  requiresBossDefeatId: 'kageno-inu',
  cost: { fusionCores: 1 }
}
```

Design rules:

- Do not make these recipes visible by default before boss defeat.
- Do not add separate fusion-data state for this pass.
- Reuse the existing `requiresBossDefeatId` unlock path.
- Do not place the bosses in `data/areas.json` yet.
- Future boss implementation should use each fusion creature as the boss ID so the recipe unlocks automatically after defeat.

## Validation

Add or update automated checks so mistakes are caught early:

- All 10 fusion creatures exist in `data/creatures.json`.
- All 10 fusion recipes exist in `FUSION_RECIPES`.
- Every new recipe has exactly two ingredient IDs.
- Every new recipe costs exactly 1 Fusion Core.
- Every new recipe has `requiresBossDefeatId` equal to its `resultId`.
- Every recipe ingredient ID exists as a creature template.
- Every recipe result ID exists as a creature template.
- Every fusion creature has the approved rarity, element, Japanese name, reading, and English name.
- Every fusion creature has 5-6 learnset entries.
- Every fusion creature has exactly one legal level-1 move.
- Required ingredient creatures from the creature/move expansion are reused, not duplicated.
- No new fusion creature is placed in `data/areas.json` in this pass.

Focused tests should cover the fusion data contract and the existing fusion service behavior. If the current Stone Giant test assumes only one boss-gated recipe shape, update it to allow the new boss-locked recipes while preserving its intent.

## Non-Goals

This pass should not:

- Add boss encounters or area placement.
- Add sprites or generated art.
- Add new combat mechanics.
- Add a new fusion-data unlock state separate from boss defeats.
- Change Fusion Core drop rates or economy.
- Modify dictionary entries.

## Acceptance Criteria

The work is complete when:

- The 10 approved fusion creatures are present with the approved names, readings, rarity, elements, and ingredients.
- Each fusion has a manually authored stronger-than-normal stat profile and learnset.
- The 10 recipes exist and are boss-defeat locked through `requiresBossDefeatId`.
- Recipes are unavailable until the matching boss is defeated.
- No new boss placement or area encounter is added.
- Relevant unit/integration tests pass.
