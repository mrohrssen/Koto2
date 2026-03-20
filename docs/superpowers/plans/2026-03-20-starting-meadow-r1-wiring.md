# Starting Meadow R1 Content Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire R1 CSV content into Koto2 as the "Starting Meadow" area, making the full gameplay loop playable end-to-end.

**Architecture:** Archive existing data files, replace with R1 content transformed to match existing JSON schemas. Two code changes: rename "weapon" category to "equipment" and update item filtering to use `category` field; add creature targeting step to friendly NPC item flow. Update test fixtures to use R1 IDs.

**Tech Stack:** Node.js, ES6 modules, Mocha/Chai tests

**Spec:** `docs/superpowers/specs/2026-03-20-starting-meadow-r1-wiring-design.md`

---

### Task 1: Archive Old Data Files

**Files:**
- Move: `data/creatures.json` → `archive/data/creatures.json`
- Move: `data/moves.json` → `archive/data/moves.json`
- Move: `data/items.json` → `archive/data/items.json`
- Move: `data/npcs.json` → `archive/data/npcs.json`
- Move: `data/npc-skills.json` → `archive/data/npc-skills.json`
- Move: `data/areas.json` → `archive/data/areas.json`

- [ ] **Step 1: Create archive directory and copy old data**

```bash
mkdir -p archive/data
cp data/creatures.json archive/data/creatures.json
cp data/moves.json archive/data/moves.json
cp data/items.json archive/data/items.json
cp data/npcs.json archive/data/npcs.json
cp data/npc-skills.json archive/data/npc-skills.json
cp data/areas.json archive/data/areas.json
```

- [ ] **Step 2: Commit archive**

```bash
git add archive/data/
git commit -m "chore: archive old game data before R1 content wiring"
```

---

### Task 2: Write R1 Creatures Data

**Files:**
- Create: `data/creatures.json`

- [ ] **Step 1: Write R1 creatures.json**

Replace `data/creatures.json` with exactly 5 creatures. All stats 50/10/50 as specified in R1 CSV. IDs derived from readings. Fire starter has 3 moves in learnset; all others have only `tataku`.

```json
[
  {
    "id": "hi",
    "name": "火",
    "nameEn": "Fire",
    "element": "fire",
    "rarity": "common",
    "baseHp": 50,
    "baseAttack": 10,
    "baseMp": 50,
    "baseWord": "火",
    "baseReading": "ひ",
    "baseMeaning": "fire",
    "baseRank": 574,
    "archetype": "Fighter",
    "isStarter": true,
    "learnset": [
      { "moveId": "tataku", "level": 1 },
      { "moveId": "honoo", "level": 7 },
      { "moveId": "moeru", "level": 12 }
    ],
    "stage": 1,
    "createdAt": "2026-03-20"
  },
  {
    "id": "mizu",
    "name": "水",
    "nameEn": "Water",
    "element": "water",
    "rarity": "common",
    "baseHp": 50,
    "baseAttack": 10,
    "baseMp": 50,
    "baseWord": "水",
    "baseReading": "みず",
    "baseMeaning": "water",
    "baseRank": 479,
    "archetype": "Fighter",
    "isStarter": true,
    "learnset": [
      { "moveId": "tataku", "level": 1 }
    ],
    "stage": 1,
    "createdAt": "2026-03-20"
  },
  {
    "id": "ki",
    "name": "木",
    "nameEn": "Tree",
    "element": "wood",
    "rarity": "common",
    "baseHp": 50,
    "baseAttack": 10,
    "baseMp": 50,
    "baseWord": "木",
    "baseReading": "き",
    "baseMeaning": "tree / wood",
    "baseRank": 634,
    "archetype": "Fighter",
    "isStarter": true,
    "learnset": [
      { "moveId": "tataku", "level": 1 }
    ],
    "stage": 1,
    "createdAt": "2026-03-20"
  },
  {
    "id": "ishi",
    "name": "石",
    "nameEn": "Stone",
    "element": "earth",
    "rarity": "common",
    "baseHp": 50,
    "baseAttack": 10,
    "baseMp": 50,
    "baseWord": "石",
    "baseReading": "いし",
    "baseMeaning": "stone",
    "baseRank": 1373,
    "archetype": "Fighter",
    "isStarter": false,
    "learnset": [
      { "moveId": "tataku", "level": 1 }
    ],
    "stage": 1,
    "createdAt": "2026-03-20"
  },
  {
    "id": "tetsu",
    "name": "鉄",
    "nameEn": "Iron",
    "element": "metal",
    "rarity": "common",
    "baseHp": 50,
    "baseAttack": 10,
    "baseMp": 50,
    "baseWord": "鉄",
    "baseReading": "てつ",
    "baseMeaning": "iron",
    "baseRank": 2085,
    "archetype": "Fighter",
    "isStarter": false,
    "learnset": [
      { "moveId": "tataku", "level": 1 }
    ],
    "stage": 1,
    "createdAt": "2026-03-20"
  }
]
```

- [ ] **Step 2: Verify file parses correctly**

Run: `node -e "console.log(JSON.parse(require('fs').readFileSync('data/creatures.json','utf8')).length)"`
Expected: `5`

- [ ] **Step 3: Commit**

```bash
git add data/creatures.json
git commit -m "feat: add R1 creatures (5 Starting Meadow creatures)"
```

---

### Task 3: Write R1 Moves Data

**Files:**
- Create: `data/moves.json`

- [ ] **Step 1: Write R1 moves.json**

3 moves. Map CSV fields: `type: attack` → `category: damage`, `target: single` → `target: single_enemy`. Add dictionary meanings.

```json
[
  {
    "id": "tataku",
    "name": "叩く",
    "nameEn": "Strike",
    "reading": "たたく",
    "meaning": "to strike / to hit / to knock",
    "rank": 1400,
    "element": "neutral",
    "category": "damage",
    "target": "single_enemy",
    "power": 10,
    "mpCost": 5,
    "statusEffect": null,
    "statusChance": 0,
    "statusDuration": 0,
    "tier": 1,
    "description": "A basic strike.",
    "stage": 1,
    "createdAt": "2026-03-20"
  },
  {
    "id": "honoo",
    "name": "炎",
    "nameEn": "Flame",
    "reading": "ほのお",
    "meaning": "flame / blaze",
    "rank": 1600,
    "element": "fire",
    "category": "damage",
    "target": "single_enemy",
    "power": 15,
    "mpCost": 12,
    "statusEffect": null,
    "statusChance": 0,
    "statusDuration": 0,
    "tier": 1,
    "description": "A burst of flame.",
    "stage": 1,
    "createdAt": "2026-03-20"
  },
  {
    "id": "moeru",
    "name": "燃える",
    "nameEn": "Burn",
    "reading": "もえる",
    "meaning": "to burn / to be on fire",
    "rank": 1900,
    "element": "fire",
    "category": "damage",
    "target": "single_enemy",
    "power": 25,
    "mpCost": 20,
    "statusEffect": null,
    "statusChance": 0,
    "statusDuration": 0,
    "tier": 1,
    "description": "An intense blaze that scorches the target.",
    "stage": 1,
    "createdAt": "2026-03-20"
  }
]
```

- [ ] **Step 2: Verify file parses correctly**

Run: `node -e "console.log(JSON.parse(require('fs').readFileSync('data/moves.json','utf8')).length)"`
Expected: `3`

- [ ] **Step 3: Commit**

```bash
git add data/moves.json
git commit -m "feat: add R1 moves (3 Starting Meadow moves)"
```

---

### Task 4: Write R1 Items Data

**Files:**
- Create: `data/items.json`

- [ ] **Step 1: Write R1 items.json**

9 items. Each has a `category` field (`"food"` or `"equipment"`). Effect shapes match `applyItem()` in `item-service.js`. Key mappings from CSV:
- `healPercent: 15` → `{ type: "heal", effect: { healPercent: 0.15 } }`
- `mpRestore: 20` → `{ type: "mpRestore", effect: { mpRestorePercent: 0.20 } }`
- `attackMult: N` → `{ type: "boost", effect: { field: "attackMult", value: N * 0.01 } }` (applyStat adds to itemBuffs.attackMult which starts at 1.0)
- `hpMult: N` → `{ type: "boost", effect: { field: "hpMult", value: N * 0.01 } }`
- `mpMult: N` → not currently in `createItemBuffs()` — **use closest available**: boost MP by restoring it (or skip for R1)
- `Revive: 1` → `{ type: "revive", effect: { revivePercent: 1.0 } }`

**Important:** `applyStat()` in `item-service.js:55-61` adds `value` to `itemBuffs[field]`. The `field` must match a key in `createItemBuffs()`: `attackMult`, `hpMult`, `autoPowerMult`, `ultimatePowerMult`, `elementEdge`, `flatDamageReduction`, `xpMultiplier`. So Tofu's `attackMult: 2` means +0.02 to attackMult (1.0 → 1.02 = +2%). Katana's `attackMult: 10` means +0.10 (1.0 → 1.10 = +10%).

For Shoes (`mpMult`): `itemBuffs` doesn't have `mpMult` field, but `applyStat` has a guard `itemBuffs[field] !== undefined` — it would silently fail. For R1, map Shoes to a different boost or use `mpRestore` type. Safest: make Shoes an mpRestore item.

```json
[
  {
    "id": "ocha",
    "word": "お茶",
    "reading": "おちゃ",
    "meaning": "tea",
    "category": "food",
    "rarity": "common",
    "type": "mpRestore",
    "effect": { "mpRestorePercent": 0.20 },
    "description": "Restores 20% MP to all creatures.",
    "stage": 1,
    "createdAt": "2026-03-20"
  },
  {
    "id": "toufu",
    "word": "豆腐",
    "reading": "とうふ",
    "meaning": "tofu",
    "category": "food",
    "rarity": "common",
    "type": "boost",
    "effect": { "field": "attackMult", "value": 0.02 },
    "description": "Boosts party attack by 2%.",
    "stage": 1,
    "createdAt": "2026-03-20"
  },
  {
    "id": "ringo",
    "word": "りんご",
    "reading": "りんご",
    "meaning": "apple",
    "category": "food",
    "rarity": "common",
    "type": "heal",
    "effect": { "healPercent": 0.15 },
    "description": "Heals the most damaged creature for 15% of max HP.",
    "stage": 1,
    "createdAt": "2026-03-20"
  },
  {
    "id": "tamago",
    "word": "卵",
    "reading": "たまご",
    "meaning": "egg",
    "category": "food",
    "rarity": "common",
    "type": "boost",
    "effect": { "field": "attackMult", "value": 0.05 },
    "description": "Boosts party attack by 5%.",
    "stage": 1,
    "createdAt": "2026-03-20"
  },
  {
    "id": "ichigo",
    "word": "いちご",
    "reading": "いちご",
    "meaning": "strawberry",
    "category": "food",
    "rarity": "uncommon",
    "type": "revive",
    "effect": { "revivePercent": 1.0 },
    "description": "Revives a fallen creature at full HP.",
    "stage": 1,
    "createdAt": "2026-03-20"
  },
  {
    "id": "katana",
    "word": "刀",
    "reading": "かたな",
    "meaning": "katana / sword",
    "category": "equipment",
    "rarity": "uncommon",
    "type": "boost",
    "effect": { "field": "attackMult", "value": 0.10 },
    "description": "Boosts party attack by 10%.",
    "stage": 1,
    "createdAt": "2026-03-20"
  },
  {
    "id": "hon",
    "word": "本",
    "reading": "ほん",
    "meaning": "book",
    "category": "equipment",
    "rarity": "common",
    "type": "boost",
    "effect": { "field": "hpMult", "value": 0.10 },
    "description": "Boosts party HP by 10%.",
    "stage": 1,
    "createdAt": "2026-03-20"
  },
  {
    "id": "kutsu",
    "word": "靴",
    "reading": "くつ",
    "meaning": "shoes",
    "category": "equipment",
    "rarity": "common",
    "type": "mpRestore",
    "effect": { "mpRestorePercent": 0.10 },
    "description": "Restores 10% MP to all creatures.",
    "stage": 1,
    "createdAt": "2026-03-20"
  },
  {
    "id": "boushi",
    "word": "帽子",
    "reading": "ぼうし",
    "meaning": "hat / cap",
    "category": "equipment",
    "rarity": "common",
    "type": "boost",
    "effect": { "field": "hpMult", "value": 0.05 },
    "description": "Boosts party HP by 5%.",
    "stage": 1,
    "createdAt": "2026-03-20"
  }
]
```

**Note:** Shoes (靴) was mapped to `mpRestore` instead of a boost because `itemBuffs` has no `mpMult` field. If a persistent mpMult boost is desired later, add the field to `createItemBuffs()` in `item-service.js`.

- [ ] **Step 2: Verify file parses correctly**

Run: `node -e "console.log(JSON.parse(require('fs').readFileSync('data/items.json','utf8')).length)"`
Expected: `9`

- [ ] **Step 3: Commit**

```bash
git add data/items.json
git commit -m "feat: add R1 items (5 food + 4 equipment)"
```

---

### Task 5: Write R1 NPCs and NPC Skills Data

**Files:**
- Create: `data/npcs.json`
- Create: `data/npc-skills.json`

- [ ] **Step 1: Write R1 npc-skills.json**

4 NPC skills. Match existing schema from `npc-service.js` (`loadNpcSkills()` expects an array). Category `damage` for attacks, `heal` for heals.

```json
[
  {
    "id": "asobu",
    "name": "遊ぶ",
    "nameEn": "Play",
    "reading": "あそぶ",
    "meaning": "to play / to have fun",
    "element": "neutral",
    "category": "damage",
    "target": "all_enemies",
    "power": 10,
    "mpCost": 0,
    "description": "Attacks all enemies with playful energy.",
    "statusEffect": null,
    "statusChance": 0,
    "statusDuration": 0
  },
  {
    "id": "hataraku",
    "name": "働く",
    "nameEn": "Work",
    "reading": "はたらく",
    "meaning": "to work / to labor",
    "element": "neutral",
    "category": "damage",
    "target": "all_enemies",
    "power": 10,
    "mpCost": 0,
    "description": "Attacks all enemies with disciplined effort.",
    "statusEffect": null,
    "statusChance": 0,
    "statusDuration": 0
  },
  {
    "id": "hashiru",
    "name": "走る",
    "nameEn": "Run",
    "reading": "はしる",
    "meaning": "to run",
    "element": "neutral",
    "category": "heal",
    "target": "all_allies",
    "power": 10,
    "mpCost": 0,
    "description": "Heals all NPC creatures for 10% HP.",
    "statusEffect": null,
    "statusChance": 0,
    "statusDuration": 0
  },
  {
    "id": "utau",
    "name": "歌う",
    "nameEn": "Sing",
    "reading": "うたう",
    "meaning": "to sing",
    "element": "neutral",
    "category": "heal",
    "target": "all_allies",
    "power": 10,
    "mpCost": 0,
    "description": "Heals all NPC creatures for 10% HP.",
    "statusEffect": null,
    "statusChance": 0,
    "statusDuration": 0
  }
]
```

- [ ] **Step 2: Write R1 npcs.json**

4 NPCs. Match existing schema (object keyed by NPC ID, not array). Each NPC has a `skills` array referencing IDs from `npc-skills.json`. Greetings/defeatLines used as-is from CSV. Area set to `hajimari-no-hiroba`.

```json
{
  "kodomo": {
    "id": "kodomo",
    "name": "子供",
    "nameEn": "Child",
    "speakerId": 3,
    "area": "hajimari-no-hiroba",
    "tier": 1,
    "baseWord": "子供",
    "baseReading": "こども",
    "baseMeaning": "child",
    "baseRank": 836,
    "attack": 10,
    "skills": ["asobu"],
    "personality": {
      "traits": ["fun-loving", "curious"],
      "speechStyle": "Cheerful and playful.",
      "quirk": "Always looking for a game."
    },
    "greeting": "こんにちわ!",
    "defeatLine": "いいね!",
    "createdAt": "2026-03-20"
  },
  "otona": {
    "id": "otona",
    "name": "大人",
    "nameEn": "Adult",
    "speakerId": 13,
    "area": "hajimari-no-hiroba",
    "tier": 1,
    "baseWord": "大人",
    "baseReading": "おとな",
    "baseMeaning": "adult",
    "baseRank": 1263,
    "attack": 10,
    "skills": ["hataraku"],
    "personality": {
      "traits": ["mature", "composed"],
      "speechStyle": "Calm and measured.",
      "quirk": "Always busy with something."
    },
    "greeting": "こんにちわ!",
    "defeatLine": "いいね!",
    "createdAt": "2026-03-20"
  },
  "otokonoko": {
    "id": "otokonoko",
    "name": "男の子",
    "nameEn": "Boy",
    "speakerId": 47,
    "area": "hajimari-no-hiroba",
    "tier": 1,
    "baseWord": "男の子",
    "baseReading": "おとこのこ",
    "baseMeaning": "boy",
    "baseRank": 2500,
    "attack": 10,
    "skills": ["hashiru"],
    "personality": {
      "traits": ["energetic", "restless"],
      "speechStyle": "Fast-talking and excited.",
      "quirk": "Can never stand still."
    },
    "greeting": "こんにちわ!",
    "defeatLine": "いいね!",
    "createdAt": "2026-03-20"
  },
  "onnanoko": {
    "id": "onnanoko",
    "name": "女の子",
    "nameEn": "Girl",
    "speakerId": 9,
    "area": "hajimari-no-hiroba",
    "tier": 1,
    "baseWord": "女の子",
    "baseReading": "おんなのこ",
    "baseMeaning": "girl",
    "baseRank": 2300,
    "attack": 10,
    "skills": ["utau"],
    "personality": {
      "traits": ["shy", "gentle"],
      "speechStyle": "Soft-spoken and careful.",
      "quirk": "Hums to herself."
    },
    "greeting": "こんにちわ!",
    "defeatLine": "いいね!",
    "createdAt": "2026-03-20"
  }
}
```

- [ ] **Step 3: Verify both files parse correctly**

Run: `node -e "const s=JSON.parse(require('fs').readFileSync('data/npc-skills.json','utf8')); const n=JSON.parse(require('fs').readFileSync('data/npcs.json','utf8')); console.log('skills:',s.length,'npcs:',Object.keys(n).length)"`
Expected: `skills: 4 npcs: 4`

- [ ] **Step 4: Commit**

```bash
git add data/npcs.json data/npc-skills.json
git commit -m "feat: add R1 NPCs (4) and NPC skills (4)"
```

---

### Task 6: Write R1 Area Data

**Files:**
- Create: `data/areas.json`

- [ ] **Step 1: Write R1 areas.json**

Single area, no sub-areas, boss is `tetsu`. Uses existing `floor1.webp` as placeholder background.

```json
[
  {
    "id": "hajimari-no-hiroba",
    "name": "始まりの広場",
    "nameEn": "Starting Meadow",
    "reading": "はじまりのひろば",
    "rank": 2100,
    "particle": "の",
    "modifierWord": {
      "word": "始まり",
      "reading": "はじまり",
      "meaning": "beginning / start",
      "rank": 2100
    },
    "locationWord": {
      "word": "広場",
      "reading": "ひろば",
      "meaning": "plaza / open space",
      "rank": 4200
    },
    "theme": "A bright, open meadow where new adventurers begin their journey.",
    "creatures": ["hi", "mizu", "ki", "ishi", "tetsu"],
    "bossCreatureId": "tetsu",
    "description": "A peaceful meadow at the edge of town, where creatures roam freely.",
    "tags": ["meadow", "starter", "open"],
    "subAreas": [],
    "background": "backgrounds/floor1.webp",
    "stage": 1,
    "createdAt": "2026-03-20"
  }
]
```

- [ ] **Step 2: Verify file parses correctly**

Run: `node -e "console.log(JSON.parse(require('fs').readFileSync('data/areas.json','utf8'))[0].id)"`
Expected: `hajimari-no-hiroba`

- [ ] **Step 3: Commit**

```bash
git add data/areas.json
git commit -m "feat: add R1 Starting Meadow area definition"
```

---

### Task 7: Update Starter Mapping and Area ID

**Files:**
- Modify: `src/routes/game/misc.js:417-421` (starterMap)
- Modify: `src/game/rooms.js:81-83` (area lock)

- [ ] **Step 1: Update starterMap in misc.js**

In `src/routes/game/misc.js`, change lines 417-421:

```js
// Old:
const starterMap = {
  'starter-fire': 'fire-starter',
  'starter-water': 'water-starter',
  'starter-wood': 'wood-starter'
};

// New:
const starterMap = {
  'starter-fire': 'hi',
  'starter-water': 'mizu',
  'starter-wood': 'ki'
};
```

- [ ] **Step 2: Update area lock in rooms.js**

In `src/game/rooms.js`, change lines 81-83:

```js
// Old:
const school = AREAS.find(a => a.id === 'mahouno-gakkou');

// New:
const meadow = AREAS.find(a => a.id === 'hajimari-no-hiroba');
return meadow ? [meadow] : [];
```

Remove the old `return school ? [school] : [];` line.

- [ ] **Step 3: Verify prologue.json needs no changes**

The spec mentions updating `data/prologue.json`, but the starter choices already use `starter-fire`, `starter-water`, `starter-wood` as IDs with labels `ひ (Fire)`, `みず (Water)`, `き (Wood)` — these match R1 content. The creature-to-ID mapping is handled entirely in `misc.js`'s `starterMap`. No prologue.json changes needed.

Run: `node -e "const p=JSON.parse(require('fs').readFileSync('data/prologue.json','utf8')); const s=p.find(x=>x.id==='prologue-starter-selection'); console.log(s.choices.map(c=>c.id))"`
Expected: `[ 'starter-fire', 'starter-water', 'starter-wood' ]`

- [ ] **Step 4: Syntax check**

Run: `node --check src/routes/game/misc.js && node --check src/game/rooms.js && echo "OK"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add src/routes/game/misc.js src/game/rooms.js
git commit -m "feat: wire R1 starter mapping and Starting Meadow area lock"
```

---

### Task 8: Rename "weapon" to "equipment" and Fix Item Filtering

**Files:**
- Modify: `src/game/rooms.js:313` (offerCategory)
- Modify: `src/game/services/exploration-service.js:47-58` (rollFriendlyNpcOffers)
- Modify: `public/js/ui/exploration.js:1200` (UI label)

- [ ] **Step 1: Write failing test for equipment category**

In `tests/unit/game/rooms-koto2.test.js`, find the test that checks `offerCategory === 'food' || offerCategory === 'weapon'` (line 64) and update to expect `'equipment'` instead of `'weapon'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --grep "friendlyNpc" 2>&1 | tail -5`
Expected: FAIL (rooms still generate `'weapon'`)

- [ ] **Step 3: Update rooms.js offerCategory**

In `src/game/rooms.js`, line 313, change:

```js
// Old:
const offerCategory = Math.random() < 0.5 ? 'food' : 'weapon';

// New:
const offerCategory = Math.random() < 0.5 ? 'food' : 'equipment';
```

- [ ] **Step 4: Update rollFriendlyNpcOffers to filter by category field**

In `src/game/services/exploration-service.js`, replace `rollFriendlyNpcOffers` (lines 47-63):

```js
// Old:
export function rollFriendlyNpcOffers(category, itemPool = null) {
  if (!itemPool) {
    try {
      itemPool = JSON.parse(readFileSync(DEFAULT_ITEMS_PATH, 'utf8'));
    } catch (e) {
      itemPool = [];
    }
  }

  // Map category to item type
  const typeFilter = category === 'food' ? 'heal' : 'boost';
  const eligible = itemPool.filter(item => item.type === typeFilter);

  // Randomly select up to 3 without duplicates
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3).map(item => ({ ...item }));
}

// New:
export function rollFriendlyNpcOffers(category, itemPool = null) {
  if (!itemPool) {
    try {
      itemPool = JSON.parse(readFileSync(DEFAULT_ITEMS_PATH, 'utf8'));
    } catch (e) {
      itemPool = [];
    }
  }

  // Filter by item category field (food or equipment)
  const eligible = itemPool.filter(item => item.category === category);

  // Randomly select up to 3 without duplicates
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3).map(item => ({ ...item }));
}
```

Also update the JSDoc on lines 42-45 to reflect the new parameter:
```js
/**
 * Roll 3 item offers for a friendly NPC room.
 * @param {'food'|'equipment'} category - Filters items by their category field
 * @param {Array} [itemPool] - Optional override item pool (defaults to data/items.json)
 * @returns {Array} Up to 3 item objects matching the category
 */
```

- [ ] **Step 5: Update frontend label**

In `public/js/ui/exploration.js`, line 1200, change:

```js
// Old:
Choose a gift. (${room?.friendlyNpc?.offerCategory === 'food' ? '🍱 Food' : '⚔️ Weapon'})

// New:
Choose a gift. (${room?.friendlyNpc?.offerCategory === 'food' ? '🍱 Food' : '🛡️ Equipment'})
```

- [ ] **Step 6: Syntax check**

Run: `node --check src/game/rooms.js && node --check src/game/services/exploration-service.js && echo "OK"`
Expected: `OK`

- [ ] **Step 7: Run test to verify it passes**

Run: `npm run test:unit -- --grep "friendlyNpc" 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/game/rooms.js src/game/services/exploration-service.js public/js/ui/exploration.js tests/unit/game/rooms-koto2.test.js
git commit -m "feat: rename weapon to equipment, filter items by category field"
```

---

### Task 9: Handle Missing Sub-Areas in Room Generation

**Files:**
- Modify: `src/game/rooms.js:209` (subArea assignment)
- Test: `tests/unit/game/sub-areas.test.js`

- [ ] **Step 1: Check current sub-area handling**

Line 209 of `rooms.js` already has: `if (subAreas.length > 0) room.subArea = subAreas[i % subAreas.length];`

This already handles empty sub-areas (the `if` guard skips assignment). No code change needed.

- [ ] **Step 2: Check background fallback**

`getBackgroundForRoom` (line 74-77) returns `activeRoom?.subArea?.background || randomAreaBg(areaId)`. When subArea is missing, it falls back to `randomAreaBg()` which builds a path like `areas/hajimari-no-hiroba/hajimari-no-hiroba_01.webp`. These files won't exist for R1.

The area JSON has a `background` field (`backgrounds/floor1.webp`). Add a fallback to use the area's background field when sub-area and area-specific backgrounds are unavailable.

- [ ] **Step 3: Update getBackgroundForRoom to use area background fallback**

In `src/game/services/exploration-service.js` (lines 74-77), update `getBackgroundForRoom`:

```js
// Old:
function getBackgroundForRoom(room, areaId) {
  const activeRoom = Array.isArray(room) ? room[0] : room;
  return activeRoom?.subArea?.background || randomAreaBg(areaId);
}

// New:
function getBackgroundForRoom(room, areaId) {
  const activeRoom = Array.isArray(room) ? room[0] : room;
  if (activeRoom?.subArea?.background) return activeRoom.subArea.background;
  // Fall back to area-level background if available
  const area = getAreaById(areaId);
  if (area?.background) return area.background;
  return randomAreaBg(areaId);
}
```

This requires importing `getAreaById` which is already imported at line 25.

- [ ] **Step 4: Syntax check**

Run: `node --check src/game/services/exploration-service.js && echo "OK"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add src/game/services/exploration-service.js
git commit -m "fix: fall back to area background when no sub-areas exist"
```

---

### Task 10: Update Test Fixtures

**Files:**
- Modify: `tests/helpers/fixtures.js`
- Modify: `tests/helpers/mocks.js` (if it references old area IDs)

- [ ] **Step 1: Update fixtures.js**

```js
// Old:
export const TEST_CREATURES = {
  KAZENOKO: 'kazenoko',
  KAMEDOR: 'kamedor',
  HIKARIBON: 'hikaribon',
  KAMINARION: 'kaminarion',
};

export const TEST_NPCS = {
  NAGI: 'nagi',
  MAKOTO: 'makoto',
  SORA: 'sora',
  KATSURO: 'katsuro',
  YUKIE: 'yukie',
};

export const TEST_AREA = 'okunomori';

// New:
export const TEST_CREATURES = {
  HI: 'hi',
  MIZU: 'mizu',
  KI: 'ki',
  ISHI: 'ishi',
  TETSU: 'tetsu',
};

export const TEST_NPCS = {
  KODOMO: 'kodomo',
  OTONA: 'otona',
  OTOKONOKO: 'otokonoko',
  ONNANOKO: 'onnanoko',
};

export const TEST_AREA = 'hajimari-no-hiroba';
```

- [ ] **Step 2: Run all tests to find failures**

Run: `npm run test:unit 2>&1 | tail -20`

This will show which tests break due to the ID changes. Fix each test file that imports from fixtures.js — they'll now use the new constant names.

- [ ] **Step 3: Fix test files that reference old fixture constants**

For each test file that fails:
- Replace `TEST_CREATURES.KAZENOKO` → `TEST_CREATURES.HI` (or whichever R1 creature is appropriate)
- Replace `TEST_CREATURES.HIKARIBON` → `TEST_CREATURES.HI`
- Replace `TEST_NPCS.NAGI` → `TEST_NPCS.KODOMO`
- Replace `TEST_NPCS.MAKOTO` → `TEST_NPCS.KODOMO`
- Replace `'okunomori'` → `'hajimari-no-hiroba'` in test files
- Replace `'mahouno-gakkou'` → `'hajimari-no-hiroba'` in test files
- Replace `'weapon'` → `'equipment'` in test assertions

Many tests also reference old creature/move IDs directly (e.g., `'hikaribon'`, `'hanatsu'`). These need to be updated to R1 IDs (`'hi'`, `'tataku'`).

**This is the largest step and may require reading individual test files to understand what IDs they use.** Work through test failures one file at a time.

- [ ] **Step 4: Run all tests to verify**

Run: `npm run test:unit 2>&1 | tail -5`
Expected: All tests pass

- [ ] **Step 5: Run integration tests**

Run: `npm run test:integration 2>&1 | tail -5`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add tests/
git commit -m "test: update all test fixtures and assertions for R1 content"
```

---

### Task 11: Add Creature Targeting to Friendly NPC Item Flow

**Files:**
- Modify: `src/routes/game/run.js:628-659` (friendly-npc-choose route)
- Modify: `src/game/services/item-service.js:64` (applyItem — add target creature param)
- Modify: `public/js/ui/exploration.js:1206-1240` (renderFriendlyNpc — add creature selector)

- [ ] **Step 1: Write failing test for targetCreatureIndex**

Create test in a new file or add to an existing test:

```js
// In tests/unit/item/service.test.js, add:
it('applyItem with targetIndex applies heal to specific creature', () => {
  const party = {
    active: [
      { id: 'hi', hp: 30, maxHp: 50, mp: 50, maxMp: 50 },
      { id: 'mizu', hp: 50, maxHp: 50, mp: 50, maxMp: 50 },
      null
    ],
    reserves: []
  };
  const itemBuffs = createItemBuffs();
  const item = { type: 'heal', effect: { healPercent: 0.5 } };
  applyItem(item, party, itemBuffs, 0);
  expect(party.active[0].hp).to.equal(50); // 30 + floor(50*0.5) = 55, capped at 50
  expect(party.active[1].hp).to.equal(50); // untouched
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --grep "targetIndex" 2>&1 | tail -5`
Expected: FAIL (applyItem doesn't accept targetIndex yet)

- [ ] **Step 3: Update applyItem to accept optional targetIndex**

In `src/game/services/item-service.js`, replace the full `applyItem` function (lines 64-151):

```js
export function applyItem(item, creatureParty, itemBuffs, targetIndex = null) {
  const allCreatures = [...creatureParty.active, ...creatureParty.reserves].filter(Boolean);
  const targetCreature = targetIndex !== null ? creatureParty.active[targetIndex] : null;

  if (item.type === 'heal') {
    if (item.effect.healPercent) {
      // If target specified, heal that creature; otherwise heal lowest HP
      const target = targetCreature && targetCreature.hp > 0 ? targetCreature : (() => {
        const alive = allCreatures.filter(r => r.hp > 0);
        return alive.length > 0 ? alive.reduce((min, r) => r.hp < min.hp ? r : min, alive[0]) : null;
      })();
      if (target && target.hp > 0) {
        const heal = Math.floor(target.maxHp * item.effect.healPercent);
        target.hp = Math.min(target.maxHp, target.hp + heal);
      }
    }
    if (item.effect.healAllPercent) {
      const alive = allCreatures.filter(r => r.hp > 0);
      for (const creature of alive) {
        const heal = Math.floor(creature.maxHp * item.effect.healAllPercent);
        creature.hp = Math.min(creature.maxHp, creature.hp + heal);
      }
    }
    if (item.effect.healMostDamaged) {
      const alive = allCreatures.filter(r => r.hp > 0);
      if (alive.length > 0) {
        const mostDamaged = alive.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
        mostDamaged.hp = mostDamaged.maxHp;
      }
    }
    return { applied: true };
  }

  if (item.type === 'boost') {
    if (item.effect.field && item.effect.value) {
      applyStat(item.effect.field, item.effect.value, itemBuffs);
    }
    if (item.effect.tempBoost) {
      const tb = item.effect.tempBoost;
      const targets = tb.target === 'all' ? allCreatures : [allCreatures[0]];
      for (const creature of targets.filter(Boolean)) {
        applyTempAttackFlat(creature, {
          value: tb.value,
          duration: tb.turns,
          sourceId: item.id,
        });
      }
    }
    return { applied: true };
  }

  if (item.type === 'mpRestore') {
    const alive = allCreatures.filter(r => r.hp > 0);
    for (const creature of alive) {
      const restore = Math.floor((creature.maxMp || 0) * (item.effect.mpRestorePercent || 0));
      creature.mp = Math.min(creature.maxMp || 0, (creature.mp || 0) + restore);
    }
    return { applied: true };
  }

  if (item.type === 'revive') {
    if (item.effect.revivePercent) {
      // If target specified and KO'd, revive that creature; otherwise random KO'd
      const kos = allCreatures.filter(r => r.hp <= 0);
      const target = (targetCreature && targetCreature.hp <= 0) ? targetCreature
        : (kos.length > 0 ? kos[Math.floor(Math.random() * kos.length)] : null);
      if (target) {
        target.hp = Math.floor(target.maxHp * item.effect.revivePercent);
      }
    }
    return { applied: true };
  }

  if (item.type === 'keepsake') {
    for (const [field, value] of Object.entries(item.effect)) {
      applyStat(field, value, itemBuffs);
    }
    return { applied: true };
  }

  if (item.type === 'xpCharm') {
    itemBuffs.xpMultiplier = (itemBuffs.xpMultiplier || 1.0) * (1 + item.effect.value);
    return { applied: true };
  }

  if (item.type === 'xpBalance') {
    itemBuffs.xpBalanceStacks = (itemBuffs.xpBalanceStacks || 0) + item.effect.value;
    return { applied: true };
  }

  return { applied: false };
}
```

- [ ] **Step 4: Update route to pass targetCreatureIndex**

In `src/routes/game/run.js`, update `friendly-npc-choose` route (line 628):

```js
// Old:
const { itemId } = req.body;

// New:
const { itemId, targetCreatureIndex } = req.body;
```

And the applyItem call (line 650):

```js
// Old:
applyItem(item, gm.run.creatureParty, gm.run.itemBuffs);

// New:
const targetIdx = Number.isInteger(targetCreatureIndex) ? targetCreatureIndex : null;
applyItem(item, gm.run.creatureParty, gm.run.itemBuffs, targetIdx);
```

- [ ] **Step 5: Update API function to accept targetCreatureIndex**

In `public/js/api.js`, line 587-588, update the function:

```js
// Old:
async function chooseFriendlyNpcItem(itemId) {
  return apiCall('/friendly-npc-choose', 'POST', { itemId });
}

// New:
async function chooseFriendlyNpcItem(itemId, targetCreatureIndex = null) {
  const body = { itemId };
  if (targetCreatureIndex !== null) body.targetCreatureIndex = targetCreatureIndex;
  return apiCall('/friendly-npc-choose', 'POST', body);
}
```

- [ ] **Step 6: Update frontend item click handler to show creature selector**

In `public/js/ui/exploration.js`, replace the click handler inside `renderFriendlyNpc` (lines 1208-1240). After the player clicks an item card, show a creature targeting step before calling the API.

Replace the card click handler block (from `card.addEventListener('click', async () => {` through to its closing `});`):

```js
    card.addEventListener('click', async () => {
      if (friendlyNpcState.choosing) return;
      friendlyNpcState.choosing = true;
      const itemId = card.dataset.itemId;

      playSFX('creature-equip');

      // Visually mark selected and disable others
      cards.forEach(c => {
        c.style.pointerEvents = 'none';
        c.style.opacity = '0.5';
      });
      card.classList.add('selected');
      card.style.opacity = '1';

      // Show creature targeting UI
      const gameState = getGameState();
      const party = gameState.run?.creatureParty?.active || [];
      const creatureCards = party.map((creature, idx) => {
        if (!creature) return '';
        const hpPct = Math.round((creature.hp / creature.maxHp) * 100);
        return `
          <div class="shop-item-card creature-target-card" data-creature-index="${idx}"
               style="cursor:pointer;text-align:center;padding:12px;">
            <div style="font-weight:800;font-size:16px;">${creature.name}</div>
            <div style="font-size:12px;color:var(--text-secondary);">${creature.nameEn} Lv.${creature.level}</div>
            <div style="font-size:11px;margin-top:4px;">HP: ${creature.hp}/${creature.maxHp} (${hpPct}%)</div>
          </div>
        `;
      }).join('');

      actions.setContent(`
        <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:420px;">
          <div style="text-align:center;font-weight:800;">どのクリーチャーに？</div>
          <div style="text-align:center;color:var(--text-secondary);font-size:13px;">Choose a creature.</div>
          <div class="shop-items" style="gap:10px">${creatureCards}</div>
        </div>
      `);

      document.querySelectorAll('.creature-target-card').forEach(tCard => {
        tCard.addEventListener('click', async () => {
          const targetIdx = parseInt(tCard.dataset.creatureIndex, 10);
          tCard.classList.add('selected');
          document.querySelectorAll('.creature-target-card').forEach(c => {
            c.style.pointerEvents = 'none';
          });

          let result;
          try {
            result = await apiChooseFriendlyNpcItem?.(itemId, targetIdx);
          } catch (err) {
            friendlyNpcState.choosing = false;
            sceneModule?.showNarration?.('Failed to choose item.', { autoDismiss: 1800 });
            renderFriendlyNpc();
            return;
          }

          if (result?.state) {
            updateGameState(result.state);
            updateUI();
          }
        });
      });
    });
```

- [ ] **Step 7: Syntax check**

Run: `node --check src/game/services/item-service.js && node --check src/routes/game/run.js && echo "OK"`
Expected: `OK`

- [ ] **Step 8: Run tests**

Run: `npm run test:unit -- --grep "targetIndex\|applyItem" 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/game/services/item-service.js src/routes/game/run.js public/js/ui/exploration.js public/js/api.js
git commit -m "feat: add creature targeting to friendly NPC item selection"
```

---

### Task 12: Final Verification

- [ ] **Step 1: Run full unit test suite**

Run: `npm run test:unit 2>&1 | tail -10`
Expected: All tests pass

- [ ] **Step 2: Run integration tests**

Run: `npm run test:integration 2>&1 | tail -10`
Expected: All tests pass

- [ ] **Step 3: Start server and verify it loads**

Run: `npm start &` then `sleep 3 && curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`
Expected: `200`

- [ ] **Step 4: Verify data loads correctly**

Run: `curl -s http://localhost:3000/api/game/state 2>&1 | head -5` (or check via browser if auth is needed)

- [ ] **Step 5: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: Starting Meadow R1 content wiring complete"
```
