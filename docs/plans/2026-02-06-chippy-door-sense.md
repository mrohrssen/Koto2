# Chippy's Door Sense — AI-Narrated Door Hints

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current plain room-type labels at branch points with atmospheric Japanese narration from companion character "Chippy", who senses what's behind each door. Player must read Japanese to make informed choices. Narration is always fresh via seed phrase + AI remix.

**Architecture:** 100+ seed phrases per room type (5 types × 20 archetypes × ~5 phrases each) stored in a JSON data file. At runtime, a random seed is selected and sent to the AI for vocab-constrained remixing into Chippy's voice. A new API endpoint `/api/game/door-hints` generates both hints in a single AI call. Frontend shows Chippy sprite, narration box with speaker label, and auto-plays TTS via VOICEVOX. Falls back to raw seed phrases when no AI key is configured.

**Tech Stack:** Express backend, vanilla JS frontend, VOICEVOX TTS, existing AI provider abstraction (`src/ai-providers.js`), existing DM/narration system (`src/game/dm.js`)

**Room types:** encounter, shrine, quiz, wordDiscovery, shop (new)

---

## Task 1: Create Seed Phrase Data File

**Files:**
- Create: `data/door-hints.json`

This is the corpus of ~500 seed phrases (100 per room type × 5 room types). Each phrase is tagged with an archetype. The phrases are written in Japanese at ~N3 level — the AI remix step will adapt them to the player's actual vocab level.

**Step 1: Generate the seed phrase corpus using parallel subagents**

Use 5 parallel Opus 4.6 subagents, one per room type. Each subagent generates 100 seed phrases across the 20 archetypes (~5 per archetype). The archetypes are:

| # | Archetype Key | Chippy's vibe |
|---|---------------|---------------|
| 1 | `dread` | Genuine fear, wants to run |
| 2 | `curiosity` | Fascinated, drawn toward the door |
| 3 | `warning` | Protective, telling player to be careful |
| 4 | `bravado` | Hyping up the player, "we got this" |
| 5 | `whisper` | Something faint, hard to read |
| 6 | `overwhelming` | Massive energy, almost too much to sense |
| 7 | `nostalgia` | Reminds Chippy of something |
| 8 | `comic` | Chippy being dramatic/silly |
| 9 | `analytical` | Coldly reading the energy signature |
| 10 | `pleading` | Begging the player to pick/avoid this one |
| 11 | `awe` | Stunned, speechless at what he senses |
| 12 | `suspicion` | Something feels off, not what it seems |
| 13 | `calm` | Peaceful, nothing to worry about |
| 14 | `urgency` | Time pressure, we need to decide now |
| 15 | `physical` | Chippy physically reacting (shaking, glowing) |
| 16 | `sound` | Describes what he hears |
| 17 | `smell` | Describes what he smells |
| 18 | `temperature` | Hot/cold/static energy |
| 19 | `instinct` | Gut feeling, can't explain why |
| 20 | `storytelling` | Frames it like a tale or legend |

Each subagent prompt should specify:
- The room type and what it contains (encounter = enemy fight, shrine = chip upgrade with fox spirit, quiz = knowledge test from quiz master, wordDiscovery = learn new vocabulary, shop = robot dealer selling/buying chips)
- Chippy's personality: loyal companion, a small digital sprite. Sometimes brave, sometimes scared. Speaks casually. Genuinely cares about the player.
- Each phrase should be 2-4 sentences in Japanese
- Phrases describe what Chippy senses BEFORE entering — he's reading energy signatures through the door
- For encounters: sometimes name the enemy type vaguely ("something mechanical", "a person"), sometimes hint at strength
- For shrine: peaceful/sacred energy, healing/upgrade vibes
- For quiz: intellectual energy, someone waiting with questions
- For wordDiscovery: knowledge/learning energy, new words floating in the air
- For shop: commercial energy, a mechanical presence, the sound of transactions
- Semi-direct style: sometimes name things, sometimes describe indirectly

**After generation, use a writer agent to review and approve/reject each phrase.** The writer checks:
- Natural Japanese (not machine-translated sounding)
- Actually hints at the correct room type
- Unique from other phrases with the same archetype
- Captures the archetype's emotional tone
- 2-4 sentences, not longer

**Step 2: Save the approved phrases to `data/door-hints.json`**

Schema:
```json
{
  "version": 1,
  "archetypes": ["dread", "curiosity", "warning", ...],
  "hints": {
    "encounter": [
      { "id": "enc_001", "archetype": "dread", "text": "...Japanese seed phrase..." },
      { "id": "enc_002", "archetype": "curiosity", "text": "..." }
    ],
    "shrine": [...],
    "quiz": [...],
    "wordDiscovery": [...],
    "shop": [...]
  }
}
```

**Step 3: Verify the file is valid JSON and has correct structure**

Run: `node -e "const d = JSON.parse(require('fs').readFileSync('data/door-hints.json','utf8')); const types = Object.keys(d.hints); console.log(types.map(t => t + ': ' + d.hints[t].length).join(', ')); console.log('Total:', types.reduce((s,t) => s+d.hints[t].length, 0))"`

Expected: Each type has ~100 phrases, total ~500.

**Step 4: Commit**

```bash
git add data/door-hints.json
git commit -m "feat: add Chippy door hint seed phrases (500 phrases across 5 room types)"
```

---

## Task 2: Add Shop Room Type

The user wants a shop room (robot dealer) where players can sell chips and buy rare chips. This must exist as a room type before door hints can reference it.

**Files:**
- Modify: `src/game/rooms.js` (ROOM_TYPES, generateSingleRoom, createRoom, getRoomEntryNarration, getRoomActions, isSpecialType)

**Step 1: Add shop to ROOM_TYPES constant**

In `src/game/rooms.js:241-247`, add `shop: 'shop'` to ROOM_TYPES:

```javascript
export const ROOM_TYPES = {
  encounter: 'encounter',
  shrine: 'shrine',
  quiz: 'quiz',
  wordDiscovery: 'wordDiscovery',
  shop: 'shop',
  boss: 'boss'
};
```

**Step 2: Add shop to isSpecialType**

In `src/game/rooms.js:256-260`, add shop:

```javascript
function isSpecialType(type) {
  return type === ROOM_TYPES.shrine ||
         type === ROOM_TYPES.quiz ||
         type === ROOM_TYPES.wordDiscovery ||
         type === ROOM_TYPES.shop;
}
```

**Step 3: Add shop chance to generateSingleRoom**

In `src/game/rooms.js:270-304`, add a `SHOP_CHANCE` of 0.10 (10%) and adjust the roll thresholds. The total special room chance becomes 65% which is fine since encounter is the default:

```javascript
const SHRINE_CHANCE = 0.20;
const QUIZ_CHANCE = 0.20;
const WORD_DISCOVERY_CHANCE = 0.15;
const SHOP_CHANCE = 0.10;

// In the roll block:
if (roll < SHRINE_CHANCE) {
  type = ROOM_TYPES.shrine;
} else if (roll < SHRINE_CHANCE + QUIZ_CHANCE) {
  type = ROOM_TYPES.quiz;
} else if (roll < SHRINE_CHANCE + QUIZ_CHANCE + WORD_DISCOVERY_CHANCE) {
  type = ROOM_TYPES.wordDiscovery;
} else if (roll < SHRINE_CHANCE + QUIZ_CHANCE + WORD_DISCOVERY_CHANCE + SHOP_CHANCE) {
  type = ROOM_TYPES.shop;
} else {
  type = ROOM_TYPES.encounter;
}
```

**Step 4: Add shop case to createRoom**

In `src/game/rooms.js:381-402`, add:

```javascript
case ROOM_TYPES.shop:
  room.shop = { visited: false };
  break;
```

**Step 5: Add shop narration to getRoomEntryNarration**

In `src/game/rooms.js:416-435`, add before the default case:

```javascript
case ROOM_TYPES.shop:
  return `${roomNum}に入った。ロボットの商人がいる...「いらっしゃい」`;
```

**Step 6: Add shop actions to getRoomActions**

In `src/game/rooms.js:440-466`, add a case for shop:

```javascript
case ROOM_TYPES.shop:
  if (!room.shop.visited) {
    actions.push({ id: 'shop_browse', name: '商品を見る', description: 'ロボット商人の商品を見る' });
  }
  break;
```

**Step 7: Verify syntax**

Run: `node --check src/game/rooms.js && echo "OK"`
Expected: OK

**Step 8: Commit**

```bash
git add src/game/rooms.js
git commit -m "feat: add shop room type (robot dealer) to room generation"
```

> **Note:** Full shop UI (browsing, buying, selling) is out of scope for this plan. This task only adds the room type so door hints can reference it. The shop interaction logic is a separate feature.

---

## Task 3: Backend Door Hint Service

Creates the service that selects seed phrases and remixes them via AI.

**Files:**
- Create: `src/game/services/door-hint-service.js`

**Step 1: Create the door hint service**

```javascript
/**
 * @file door-hint-service.js - Chippy's Door Sense
 *
 * Generates atmospheric Japanese narration for branch door choices.
 * Selects random seed phrases from data/door-hints.json and optionally
 * remixes them via AI using the player's known vocabulary.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load seed phrases once at startup
const hintsPath = join(__dirname, '../../../data/door-hints.json');
let hintsData = null;

function loadHints() {
  if (!hintsData) {
    hintsData = JSON.parse(readFileSync(hintsPath, 'utf-8'));
  }
  return hintsData;
}

/**
 * Pick a random seed phrase for a room type
 * @param {string} roomType - encounter, shrine, quiz, wordDiscovery, shop
 * @returns {{ id: string, archetype: string, text: string }}
 */
function pickSeed(roomType) {
  const data = loadHints();
  const pool = data.hints[roomType];
  if (!pool || pool.length === 0) {
    return { id: 'fallback', archetype: 'calm', text: '何かを感じる...' };
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Build the AI remix prompt for both doors
 * @param {object} seed1 - Seed phrase for door 1
 * @param {object} seed2 - Seed phrase for door 2
 * @param {object} context - { floor, playerHp, playerMaxHp, wardName }
 * @returns {string} User prompt for AI
 */
function buildRemixPrompt(seed1, seed2, context) {
  const hpPercent = context.playerHp && context.playerMaxHp
    ? Math.round((context.playerHp / context.playerMaxHp) * 100)
    : 100;

  return `チッピーは仲間のデジタル精霊。二つの扉の先を感じ取る能力がある。
今は${context.wardName || 'ダンジョン'}の${context.floor || 1}階。プレイヤーのHP：${hpPercent}%。

以下のヒントを、チッピーの声でリミックスして。意味と感情は同じ。でも言葉を変えて、新鮮にして。

【扉1のヒント原文】
${seed1.text}

【扉2のヒント原文】
${seed2.text}

出力形式（厳守）：
DOOR1: [チッピーのリミックス版。2-4文]
DOOR2: [チッピーのリミックス版。2-4文]

ルール：
- 使える言葉リストの中の言葉だけ使う
- チッピーは「僕」を使う、カジュアルに話す
- 扉1と扉2は全く違う雰囲気にする
- 原文の感情（怖い、楽しい、etc）を保つ
- 日本語だけ。英語禁止`;
}

/**
 * Parse AI response into two door hints
 * @param {string} response - AI response with DOOR1: and DOOR2: markers
 * @returns {{ door1: string, door2: string }}
 */
function parseRemixResponse(response) {
  const door1Match = response.match(/DOOR1:\s*([\s\S]*?)(?=DOOR2:|$)/);
  const door2Match = response.match(/DOOR2:\s*([\s\S]*?)$/);

  return {
    door1: door1Match ? door1Match[1].trim() : null,
    door2: door2Match ? door2Match[1].trim() : null
  };
}

/**
 * Generate door hints for a branch point
 * @param {string} roomType1 - Type of room behind door 1
 * @param {string} roomType2 - Type of room behind door 2
 * @param {object} context - { floor, playerHp, playerMaxHp, wardName }
 * @param {Function|null} chatFn - AI chat function (null = fallback to raw seeds)
 * @param {string[]} vocabulary - Player's known words
 * @param {string} jlptLevel - N5-N1
 * @param {object} aiConfig - { provider, apiKey, openaiModel, openrouterModel }
 * @returns {Promise<{ door1: string, door2: string, seeds: { seed1: object, seed2: object } }>}
 */
export async function generateDoorHints(roomType1, roomType2, context, chatFn, vocabulary, jlptLevel, aiConfig) {
  const seed1 = pickSeed(roomType1);
  const seed2 = pickSeed(roomType2);

  // Fallback: no AI available, return raw seeds
  if (!chatFn || !aiConfig?.apiKey || !vocabulary || vocabulary.length === 0) {
    return {
      door1: seed1.text,
      door2: seed2.text,
      seeds: { seed1, seed2 }
    };
  }

  // Build the remix prompt
  const userPrompt = buildRemixPrompt(seed1, seed2, context);

  // Build a Chippy-specific system prompt using vocab constraints
  // We import buildDmSystemPrompt but override the persona section
  const vocabList = vocabulary.slice(0, 8000).join(', ');

  const systemPrompt = `=== チッピー（CHIPPY）===
あなたはチッピー、冒険者の仲間のデジタル精霊。
扉の先にあるものを感じ取る能力がある。

【性格】
・忠実で勇敢だけど、時々怖がり
・カジュアルに話す（「僕」「〜だよ」「〜かも」）
・プレイヤーのことを本当に心配している
・感情豊か：怖い時は怖い、嬉しい時は嬉しい

=== 使える言葉（重要）===
この言葉リストからだけ使う：
${vocabList || '(基本的な言葉)'}

【ルール】
1. リストにない言葉は使わない
2. 助詞OK：は、が、を、に、で、へ、と、も、の、か、よ、ね
3. 擬音OK：ゾクゾク、ビリビリ、フワフワ、ガタガタ
4. 数字は漢字：一、二、三、十

文法：JLPT ${jlptLevel || 'N4'}
日本語だけ出力。英語禁止。`;

  try {
    const response = await chatFn({
      provider: aiConfig.provider,
      apiKey: aiConfig.apiKey,
      messages: [{ role: 'user', content: userPrompt }],
      vocabulary,
      jlptLevel: jlptLevel || 'N4',
      customSystemPrompt: systemPrompt,
      openaiModel: aiConfig.openaiModel,
      openrouterModel: aiConfig.openrouterModel,
      purpose: 'narration'
    });

    if (response) {
      const parsed = parseRemixResponse(response);
      return {
        door1: parsed.door1 || seed1.text,
        door2: parsed.door2 || seed2.text,
        seeds: { seed1, seed2 }
      };
    }
  } catch (error) {
    console.error('[DoorHints] AI remix failed, using raw seeds:', error.message);
  }

  // Fallback to raw seeds
  return {
    door1: seed1.text,
    door2: seed2.text,
    seeds: { seed1, seed2 }
  };
}
```

**Step 2: Verify syntax**

Run: `node --check src/game/services/door-hint-service.js && echo "OK"`
Expected: OK

**Step 3: Commit**

```bash
git add src/game/services/door-hint-service.js
git commit -m "feat: add door hint service (seed selection + AI remix)"
```

---

## Task 4: Backend API Endpoint

Adds the `/api/game/door-hints` endpoint that the frontend calls when entering a branch point.

**Files:**
- Modify: `src/routes/game/run.js` (add endpoint)
- Modify: `src/routes/game/index.js` (if needed to pass dependencies)
- Modify: `server.js` (wire up generateDoorHints to route dependencies)

**Step 1: Read current route wiring to understand dependency injection**

Read `src/routes/game/index.js` to see how `generateGameNarration` is passed to `createRunRoutes`.

**Step 2: Add a `generateDoorHints` wrapper in `server.js`**

Similar to `generateGameNarration`, add a wrapper function in `server.js` that:
1. Gets vocabulary from `getVocabulary()`
2. Gets AI config from userKeys
3. Calls `generateDoorHints` from the service

```javascript
// In server.js, near generateGameNarration:
import { generateDoorHints as _generateDoorHints } from './src/game/services/door-hint-service.js';

async function generateDoorHintsForRoute(roomType1, roomType2, context, userKeys = {}) {
  const { aiApiKey, aiProvider, openaiModel, openrouterModel, jlptLevel } = userKeys;
  const vocabResult = getVocabulary();
  const vocabulary = vocabResult.words;
  const aiConfig = {
    provider: aiProvider || 'openai',
    apiKey: aiApiKey,
    openaiModel: openaiModel || 'gpt-4o-mini',
    openrouterModel: openrouterModel || ''
  };

  return _generateDoorHints(roomType1, roomType2, context, chat, vocabulary, jlptLevel || 'N4', aiConfig);
}
```

Pass `generateDoorHintsForRoute` into the route factory alongside `generateGameNarration`.

**Step 3: Add the endpoint to `src/routes/game/run.js`**

```javascript
// After the /select-branch route:
router.post('/door-hints', async (req, res) => {
  const gameManager = req.gameManager;
  try {
    if (!gameManager.run?.pendingBranch) {
      return res.status(400).json({ error: 'No branch selection pending' });
    }

    const pair = gameManager.run.rooms[gameManager.run.currentRoom];
    if (!Array.isArray(pair) || pair.length !== 2) {
      return res.status(400).json({ error: 'Current room is not a branch pair' });
    }

    const context = {
      floor: gameManager.run.floor,
      playerHp: gameManager.run.player?.hp,
      playerMaxHp: gameManager.run.player?.maxHp,
      wardName: gameManager.run.ward?.name || ''
    };

    const hints = await generateDoorHints(pair[0].type, pair[1].type, context, req.userKeys);
    res.json({ hints });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

**Step 4: Verify syntax**

Run: `node --check src/routes/game/run.js && node --check server.js && echo "OK"`
Expected: OK

**Step 5: Commit**

```bash
git add server.js src/routes/game/run.js src/routes/game/index.js
git commit -m "feat: add /api/game/door-hints endpoint"
```

---

## Task 5: Frontend API Function

**Files:**
- Modify: `public/js/api.js` (add `doorHints` function + export)

**Step 1: Add the API function**

In `public/js/api.js`, near the `selectBranch` function:

```javascript
/** Fetch Chippy's door hints for current branch point */
async function doorHints() {
  return apiCall('/door-hints', 'POST');
}
```

**Step 2: Add to exports**

Add `doorHints` to the exports object in `public/js/api.js`.

**Step 3: Commit**

```bash
git add public/js/api.js
git commit -m "feat: add doorHints API function to frontend"
```

---

## Task 6: Chippy Sprite in Scene Module

**Files:**
- Modify: `public/js/ui/scene.js` (add `showChippy` and `hideChippy` functions)

**Step 1: Add Chippy sprite functions**

In `public/js/ui/scene.js`, after `showQuizMaster`:

```javascript
/** Show Chippy companion sprite (no HP bar) */
export function showChippy() {
  dom.enemyName.textContent = 'Chippy';
  dom.enemyInfo.classList.add('visible');
  dom.enemyHpBar.style.display = 'none';
  if (dom.enemySkillBar) dom.enemySkillBar.style.display = 'none';

  dom.enemySprite.src = '/assets/sprites/chippy.webp';
  dom.enemySprite.onerror = () => {
    dom.enemySprite.classList.remove('visible');
    // Fallback: show sparkle emoji
    removePlaceholder();
    const el = document.createElement('div');
    el.id = 'enemy-placeholder';
    el.style.cssText = 'width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,0.9);display:flex;align-items:center;justify-content:center;font-size:48px;box-shadow:0 4px 20px rgba(0,0,0,0.2);z-index:2;position:relative;';
    el.textContent = '✨';
    dom.enemySpriteContainer.appendChild(el);
  };
  dom.enemySprite.onload = () => {
    removePlaceholder();
    dom.enemySprite.classList.add('visible');
  };
}

/** Hide Chippy (alias for hideEnemy) */
export function hideChippy() {
  hideEnemy();
}
```

**Step 2: Verify scene.js exports are picked up**

Check how scene.js is imported in game.js / the main UI coordinator, and confirm the new exports will be available through `sceneModule`.

**Step 3: Commit**

```bash
git add public/js/ui/scene.js
git commit -m "feat: add Chippy sprite to scene module"
```

---

## Task 7: Wire Chippy into the UI Coordinator

**Files:**
- Modify: The file that builds `sceneModule` (likely where `scene` is spread into the module passed to exploration.js)

**Step 1: Find where sceneModule is assembled**

Search for where `showShrineFox` or `showQuizMaster` is exposed on the scene module object. This is where `showChippy` and `hideChippy` need to be added.

**Step 2: Add showChippy/hideChippy to sceneModule**

Wherever the scene module is assembled (likely in the main UI coordinator or game initialization), add:

```javascript
showChippy: () => scene.showChippy(),
hideChippy: () => scene.hideChippy(),
```

**Step 3: Commit**

```bash
git add <modified file>
git commit -m "feat: wire Chippy sprite into scene module"
```

---

## Task 8: Frontend Branch Selection with Door Hints

This is the main UI change. Replace the current branch selection rendering with Chippy's narrated door hints.

**Files:**
- Modify: `public/js/ui/exploration.js` (rewrite `renderBranchSelection`)

**Step 1: Add `apiDoorHints` to the module's API function references**

In `exploration.js`, near line 79 where `apiSelectBranch` is declared, add:

```javascript
let apiDoorHints = null;
```

Wire it up in the `init` function wherever `apiSelectBranch` is wired.

**Step 2: Rewrite `renderBranchSelection`**

Replace the current implementation (`exploration.js:238-302`) with:

```javascript
/** Branch selection phase - Chippy senses what's behind each door */
export async function renderBranchSelection() {
  const gameState = getGameState();
  const currentRoomIndex = gameState.run?.currentRoom;
  const pair = gameState.run?.rooms?.[currentRoomIndex];

  if (!Array.isArray(pair) || pair.length !== 2) {
    console.error('[BranchSelection] Invalid room pair');
    return;
  }

  // Show Chippy sprite and two-door background
  sceneModule.showChippy();
  sceneModule.setBackground('/assets/sprites/backgrounds/branch_doors.webp');

  // Show loading state while fetching hints
  actions.setContent(`
    <div class="branch-loading">チッピーが扉を調べている...</div>
  `);

  // Fetch AI-remixed door hints from backend
  let door1Hint = '何かを感じる...';
  let door2Hint = '何かを感じる...';

  try {
    const result = await apiDoorHints();
    if (result?.hints) {
      door1Hint = result.hints.door1;
      door2Hint = result.hints.door2;
    }
  } catch (e) {
    console.warn('[BranchSelection] Failed to fetch door hints:', e);
  }

  // Show door 1 hint with Chippy as speaker
  await sceneModule.showNarration(door1Hint, { speaker: 'チッピー' });

  // Auto-play TTS for door 1 hint
  if (typeof speakNarration === 'function') {
    speakNarration(door1Hint);
  }

  // Show door 2 hint with Chippy as speaker
  await sceneModule.showNarration(door2Hint, { speaker: 'チッピー' });

  // Auto-play TTS for door 2 hint
  if (typeof speakNarration === 'function') {
    speakNarration(door2Hint);
  }

  // Now show the door selection UI
  let selectedDoor = null;

  actions.setContent(`
    <div class="ward-selection-list">
      <div class="ward-option branch-option" data-door="0">
        <strong>扉1</strong>
      </div>
      <div class="ward-option branch-option" data-door="1">
        <strong>扉2</strong>
      </div>
    </div>
    <button class="action-btn action-btn-primary" id="branch-proceed-btn" disabled>進む</button>
  `);

  // Allow re-reading hints by clicking doors before confirming
  document.querySelectorAll('.branch-option').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.branch-option').forEach(o => o.classList.remove('selected'));
      el.classList.add('selected');
      selectedDoor = parseInt(el.dataset.door, 10);
      const btn = document.getElementById('branch-proceed-btn');
      if (btn) btn.disabled = false;

      // Re-show the hint for the clicked door
      const hint = selectedDoor === 0 ? door1Hint : door2Hint;
      sceneModule.showNarration(hint, { speaker: 'チッピー', persistent: true });
    });
  });

  document.getElementById('branch-proceed-btn')?.addEventListener('click', async () => {
    if (selectedDoor === null) return;

    // Hide persistent narration and Chippy
    if (sceneModule.forceHideNarration) sceneModule.forceHideNarration();
    sceneModule.hideChippy();

    const result = await apiSelectBranch(selectedDoor);
    if (result?.state) {
      updateGameState(result.state);
      updateUI();
    }
  });
}
```

**Step 3: Import TTS function**

At the top of `exploration.js`, add:

```javascript
import { speakNarration } from '../tts.js';
```

**Step 4: Verify syntax**

Run: `node --check public/js/ui/exploration.js && echo "OK"`
Expected: OK

**Step 5: Commit**

```bash
git add public/js/ui/exploration.js
git commit -m "feat: rewrite branch selection UI with Chippy door hints + TTS"
```

---

## Task 9: Wire Up apiDoorHints in UI Initialization

**Files:**
- Modify: The file that calls `exploration.init()` and passes API functions (likely the main UI coordinator)

**Step 1: Find where exploration.init is called**

Search for `exploration.init` or where `apiSelectBranch` is passed to the exploration module.

**Step 2: Add apiDoorHints to the init call**

Pass the `doorHints` function from `api.js` alongside `selectBranch`:

```javascript
apiDoorHints: api.doorHints,
```

**Step 3: Update exploration.js init to accept it**

In the `init` function of `exploration.js`, add:

```javascript
apiDoorHints = callbacks.apiDoorHints;
```

**Step 4: Commit**

```bash
git add <modified files>
git commit -m "feat: wire apiDoorHints into exploration module init"
```

---

## Task 10: Add Placeholder Assets

**Files:**
- Create: `public/assets/sprites/chippy.webp` (placeholder — user will replace)
- Create: `public/assets/sprites/backgrounds/branch_doors.webp` (placeholder — user will replace)

**Step 1: Create placeholder image files**

For now, create simple placeholder images. The user said they will generate proper assets. Use a minimal approach:

```bash
# Create placeholder chippy sprite (1x1 transparent webp or copy an existing sprite)
cp public/assets/sprites/shrine_fox.webp public/assets/sprites/chippy.webp

# Create placeholder branch doors background (copy existing floor background)
cp public/assets/sprites/backgrounds/floor1_1.webp public/assets/sprites/backgrounds/branch_doors.webp
```

**Step 2: Commit**

```bash
git add public/assets/sprites/chippy.webp public/assets/sprites/backgrounds/branch_doors.webp
git commit -m "feat: add placeholder Chippy and branch doors assets"
```

---

## Task 11: Integration Test — Full Flow

Run the full game and test the branch selection flow end-to-end.

**Step 1: Syntax check all modified files**

```bash
node --check src/game/rooms.js && \
node --check src/game/services/door-hint-service.js && \
node --check src/routes/game/run.js && \
node --check server.js && \
node --check public/js/api.js && \
node --check public/js/ui/scene.js && \
node --check public/js/ui/exploration.js && \
echo "All OK"
```

**Step 2: Run unit tests**

```bash
npm run test:unit
```

Expected: All existing tests pass (154+).

**Step 3: Run e2e tests**

```bash
./scripts/e2e-test.sh
```

Expected: 60+/66 passing (threshold per CLAUDE.md).

**Step 4: Manual smoke test**

1. Start server: `npm run dev`
2. Open game in browser
3. Start a run, proceed past first room
4. At branch point: verify Chippy sprite appears, narration shows Japanese text with "チッピー" speaker label, TTS auto-plays
5. Click each door option to verify hint re-displays
6. Select a door and proceed — verify Chippy hides and game continues normally

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes for Chippy door hints"
```

---

## Summary of All Files Changed

**New files:**
- `data/door-hints.json` — 500 seed phrases
- `src/game/services/door-hint-service.js` — Seed selection + AI remix logic
- `public/assets/sprites/chippy.webp` — Chippy sprite (placeholder)
- `public/assets/sprites/backgrounds/branch_doors.webp` — Two-door background (placeholder)

**Modified files:**
- `src/game/rooms.js` — Add shop room type
- `src/routes/game/run.js` — Add `/door-hints` endpoint
- `src/routes/game/index.js` — Pass `generateDoorHints` to run routes
- `server.js` — Add `generateDoorHintsForRoute` wrapper, pass to routes
- `public/js/api.js` — Add `doorHints()` function
- `public/js/ui/scene.js` — Add `showChippy()`/`hideChippy()`
- `public/js/ui/exploration.js` — Rewrite `renderBranchSelection()` with Chippy hints + TTS
- UI coordinator file — Wire `apiDoorHints` into exploration init
