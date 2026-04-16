# NPC Defeat Line — Replace Post-Combat Quiz — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 3-round post-combat NPC dialogue quiz with a single i+1-validated defeat line from a shared frame pool, then go straight to skill selection.

**Architecture:** New `npcDefeat` category in frame-sources.json → tokenize pipeline → dialogue-loader partition → combat route rewrites `/npc-dialogue-start` to use shop-flow selection pattern (assembleFrame + isEligible + scoreCandidate) → frontend `runNpcDialogue()` branches on `mode: 'defeat_line'` to show single narration.

**Tech Stack:** Node.js, Express, Sudachi tokenizer, existing frames pipeline (frame-sources.json → tokenize-static.js → frames.json → dialogue-loader.js → token-format.js)

**Spec:** `docs/superpowers/specs/2026-04-13-npc-defeat-line-replace-quiz-design.md`

---

## Chunk 1: Content & Loader

### Task 1: Add npcDefeat frames to frame-sources.json

**Files:**
- Modify: `data/dialogue/frame-sources.json` (append to end of array, before closing `]`)

**Context:** frame-sources.json is a JSON array of objects. Each entry has `id`, `category`, `raw` (Japanese text), and `slots` (array of slot names). The `{randomPlayerCreature}` slot name must appear in `slots` for frames that use it. Content words must be in dictionary form (base/lemma). Glue (particles, auxiliaries) is allowed but minimal. All content words must exist in `data/dictionary.json`.

See existing entries for format — e.g., `shopGreeting` frames have no `group` field and no slots. `shopPurchase` frames have `"slots": ["item"]`.

- [ ] **Step 1: Author 18 npcDefeat frames**

Append these entries to the end of frame-sources.json (before the closing `]`). The frames scale from 1 to 5-6 content words. `{randomPlayerCreature}` appears in 5 of 18 frames.

```json
  {
    "id": "npcDefeat_0",
    "category": "npcDefeat",
    "raw": "すごい！",
    "slots": []
  },
  {
    "id": "npcDefeat_1",
    "category": "npcDefeat",
    "raw": "強い！",
    "slots": []
  },
  {
    "id": "npcDefeat_2",
    "category": "npcDefeat",
    "raw": "負ける！",
    "slots": []
  },
  {
    "id": "npcDefeat_3",
    "category": "npcDefeat",
    "raw": "やるね！",
    "slots": []
  },
  {
    "id": "npcDefeat_4",
    "category": "npcDefeat",
    "raw": "本当にすごい！",
    "slots": []
  },
  {
    "id": "npcDefeat_5",
    "category": "npcDefeat",
    "raw": "{randomPlayerCreature}、強い！",
    "slots": ["randomPlayerCreature"]
  },
  {
    "id": "npcDefeat_6",
    "category": "npcDefeat",
    "raw": "完全に負ける！",
    "slots": []
  },
  {
    "id": "npcDefeat_7",
    "category": "npcDefeat",
    "raw": "楽しい戦い！",
    "slots": []
  },
  {
    "id": "npcDefeat_8",
    "category": "npcDefeat",
    "raw": "すごい、{randomPlayerCreature}は強い！",
    "slots": ["randomPlayerCreature"]
  },
  {
    "id": "npcDefeat_9",
    "category": "npcDefeat",
    "raw": "良い勝負、私は負ける！",
    "slots": []
  },
  {
    "id": "npcDefeat_10",
    "category": "npcDefeat",
    "raw": "{randomPlayerCreature}はとても強い！",
    "slots": ["randomPlayerCreature"]
  },
  {
    "id": "npcDefeat_11",
    "category": "npcDefeat",
    "raw": "次は絶対に勝つ！",
    "slots": []
  },
  {
    "id": "npcDefeat_12",
    "category": "npcDefeat",
    "raw": "あなたと{randomPlayerCreature}は本当にすごい！",
    "slots": ["randomPlayerCreature"]
  },
  {
    "id": "npcDefeat_13",
    "category": "npcDefeat",
    "raw": "私も強い、また戦う！",
    "slots": []
  },
  {
    "id": "npcDefeat_14",
    "category": "npcDefeat",
    "raw": "一緒に練習する、友達になる！",
    "slots": []
  },
  {
    "id": "npcDefeat_15",
    "category": "npcDefeat",
    "raw": "{randomPlayerCreature}の力はすごい、私も頑張る！",
    "slots": ["randomPlayerCreature"]
  },
  {
    "id": "npcDefeat_16",
    "category": "npcDefeat",
    "raw": "あなたは本当に上手、次は私が勝つ！",
    "slots": []
  },
  {
    "id": "npcDefeat_17",
    "category": "npcDefeat",
    "raw": "良い勝負、また会う時は絶対に勝つ！",
    "slots": []
  }
```

- [ ] **Step 2: Verify content words exist in dictionary**

Before tokenizing, spot-check that key content words exist in the dictionary. Run:

```bash
node -e "
  const dict = JSON.parse(require('fs').readFileSync('data/dictionary.json','utf-8'));
  const words = ['すごい','強い','負ける','本当','完全','楽しい','戦い','私','良い','勝負','次','絶対','勝つ','力','頑張る','上手','会う','練習','友達','一緒','とても','あなた','また','時'];
  for (const w of words) {
    const entry = dict.find(e => e.word === w || e.reading === w);
    console.log(w, entry ? 'OK' : 'MISSING');
  }
"
```

Expected: All words print `OK`. If any are `MISSING`, add them to `data/dictionary.json` before proceeding. (The word dictionary is loaded as an overlay — see `src/game/word-dictionary.js` for format.)

- [ ] **Step 3: Run tokenize pipeline**

```bash
node scripts/tokenize-static.js
```

Expected: Prints `Tokenized N frames` where N is previous count + 18 (was 269, expect ~287). Generates updated `data/dialogue/frames.json`.

- [ ] **Step 4: Run validation**

```bash
node scripts/validate-dialogue.js
```

Expected: `All frames valid` (or no errors). If any npcDefeat frames fail, fix the content word in frame-sources.json or dictionary.json and re-run steps 3-4.

- [ ] **Step 5: Commit**

```bash
git add data/dialogue/frame-sources.json data/dialogue/frames.json
git commit -m "feat: add 18 npcDefeat frames to frame-sources"
```

---

### Task 2: Add getNpcDefeatFrames() to dialogue-loader

**Files:**
- Modify: `src/game/dialogue-loader.js`
- Modify: `tests/unit/dialogue-loader.test.js`

**Context:** dialogue-loader.js partitions frames.json by category at startup. Each category gets a module-level variable and an exported accessor. Follow the exact pattern used by `_shopGreetingFrames` / `getShopGreetingFrames()`.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/dialogue-loader.test.js`, inside the existing `describe('dialogue-loader (frames.json)')` block, after the `getGameMasterAskFrames` test (line 97):

```javascript
  it('getNpcDefeatFrames returns npcDefeat category frames', () => {
    const frames = getNpcDefeatFrames();
    assert.ok(Array.isArray(frames));
    assert.ok(frames.length >= 18, `expected at least 18 npcDefeat frames, got ${frames.length}`);
    assert.ok(frames.every(f => f.category === 'npcDefeat'));
    for (const f of frames) {
      assert.ok(Array.isArray(f.tokens), `frame ${f.id} should have tokens`);
      assert.ok(Array.isArray(f.words), `frame ${f.id} should have words`);
    }
  });
```

Also add `getNpcDefeatFrames` to the import statement at the top (line 3-13):

```javascript
import {
  loadDialoguePools,
  getBarkPool,
  getCidScripts,
  getNpcLines,
  getShopPurchaseFrames,
  getShopGreetingFrames,
  getBefriendFrames,
  getDialogueWordSet,
  getGameMasterAskFrames,
  getNpcDefeatFrames,
} from '../../src/game/dialogue-loader.js';
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/unit/dialogue-loader.test.js 2>&1 | tail -20
```

Expected: FAIL — `getNpcDefeatFrames is not a function` (not exported yet).

- [ ] **Step 3: Implement getNpcDefeatFrames**

In `src/game/dialogue-loader.js`:

Add module-level variable after line 11 (`let _befriendFrames = {};`):
```javascript
let _npcDefeatFrames = [];
```

Add partition inside `loadDialoguePools()`, after the `_gameMasterAskFrames` line (line 26):
```javascript
  _npcDefeatFrames = _frames.filter(f => f.category === 'npcDefeat');
```

Add accessor after `getBefriendFrames` export (line 76):
```javascript
export function getNpcDefeatFrames() { return _npcDefeatFrames; }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/unit/dialogue-loader.test.js 2>&1 | tail -20
```

Expected: All tests PASS including the new `getNpcDefeatFrames` test.

- [ ] **Step 5: Run full test suite**

```bash
npm test 2>&1 | tail -30
```

Expected: All pass. No regressions.

- [ ] **Step 6: Commit**

```bash
git add src/game/dialogue-loader.js tests/unit/dialogue-loader.test.js
git commit -m "feat: add getNpcDefeatFrames() to dialogue-loader"
```

---

## Chunk 2: Route & Frontend

### Task 3: Rewrite /npc-dialogue-start route

**Files:**
- Modify: `src/routes/game/combat.js:530-632` (the `/npc-dialogue-start` route handler)

**Context:** The route currently loads AI-generated dialogue or hardcoded English defaults, shuffles quiz options, sets `gameManager.run.npcDialogue`, and returns 3 rounds. We replace this with the shop-flow pattern: load shared pool → assembleFrame → isEligible → scoreCandidate → return single line.

**Critical:** Do NOT set `gameManager.run.npcDialogue`. That would trap the phase machine in `NPC_DIALOGUE` phase (phase-machine.js:190). Instead, set `skillSelectionPending = true` directly on the room.

The creature entity uses fields `baseWord`, `baseReading`, `baseMeaning` (see `data/creatures.json`). `entityToToken()` in `src/game/token-format.js:15-19` resolves via `entity.word || entity.baseWord || entity.name` — `word` takes priority, then `baseWord`, then `name`. Creatures have `baseWord` (no `word`), so it falls through to `baseWord` correctly.

- [ ] **Step 1: Add new imports to combat.js**

At the top of `src/routes/game/combat.js`, add to existing imports (after line 14):

```javascript
import { getNpcDefeatFrames } from '../../game/dialogue-loader.js';
import { assembleFrame, isEligible, scoreCandidate } from '../../game/token-format.js';
```

Note: `getNpcLines` and `selectNpcLine` imports on lines 13-14 stay — they're used by the pre-combat bootstrap (lines 77-115), not by this route.

- [ ] **Step 2: Rewrite the route handler**

Replace the entire `/npc-dialogue-start` route handler including its comment (lines 529-632) with:

```javascript
  // Start NPC post-combat dialogue
  router.post('/npc-dialogue-start', (req, res) => {
    const gameManager = req.gameManager;
    const combat = gameManager.combat;

    if (!combat?.npcId) {
      return res.status(400).json({ error: 'No NPC in this combat' });
    }

    const npcs = loadNpcs();
    const npc = npcs[combat.npcId];
    if (!npc) {
      return res.status(400).json({ error: 'NPC not found' });
    }

    // --- v1: defeat line from shared npcDefeat pool ---
    const defeatFrames = getNpcDefeatFrames();
    const knownWords = new Set(getKnownWordsFromFsrs(req.user.id));

    // Pick a random active party creature for {randomPlayerCreature} slot
    const activeParty = gameManager.run.creatureParty?.active || [];
    const randomCreature = activeParty.length > 0
      ? activeParty[Math.floor(Math.random() * activeParty.length)]
      : null;
    const entities = randomCreature
      ? { randomPlayerCreature: randomCreature }
      : {};

    // Assemble frames (fills slots), then filter by i+1 and score
    // Same pattern as shop-flow in run.js (assembleFrame + isEligible + scoreCandidate)
    const candidates = defeatFrames.map(frame => {
      const assembled = assembleFrame(frame, entities);
      return { ...assembled, raw: frame.raw, id: frame.id };
    });
    const eligible = candidates.filter(c => isEligible(c.tokens, knownWords));

    let selectedLine;
    if (eligible.length > 0) {
      // Pre-compute scores to avoid redundant calls
      const scored = eligible.map(c => ({ ...c, _score: scoreCandidate(c.tokens, knownWords) }));
      scored.sort((a, b) => b._score - a._score);
      // Pick randomly among top-scoring (all with same score as best)
      const topTier = scored.filter(c => c._score === scored[0]._score);
      selectedLine = topTier[Math.floor(Math.random() * topTier.length)];
    } else {
      // Fallback: simplest frame even if not eligible
      selectedLine = candidates[0] || { tokens: [], raw: '', words: [] };
    }

    // Do NOT set gameManager.run.npcDialogue — that traps phase machine in NPC_DIALOGUE.
    // Set skillSelectionPending directly for immediate phase transition.
    const currentRoom = gameManager.getCurrentRoom();
    if (currentRoom?.npcBattle) {
      currentRoom.npcBattle.skillSelectionPending = true;
    }

    req.saveGame();

    res.json({
      mode: 'defeat_line',
      npc: { id: npc.id, name: npc.name, nameEn: npc.nameEn, speakerId: npc.speakerId }, // speakerId for future TTS
      line: { tokens: selectedLine.tokens, raw: selectedLine.raw },
    });
  });
```

- [ ] **Step 3: Verify syntax**

```bash
node --check src/routes/game/combat.js && echo "OK"
```

Expected: `OK`

- [ ] **Step 4: Run full test suite**

```bash
npm test 2>&1 | tail -30
```

Expected: All pass. The route change doesn't break existing unit tests because the route isn't directly unit tested — it's integration tested via the server.

- [ ] **Step 5: Commit**

```bash
git add src/routes/game/combat.js
git commit -m "feat: rewrite /npc-dialogue-start to return i+1 defeat line"
```

---

### Task 4: Update frontend runNpcDialogue()

**Files:**
- Modify: `public/js/ui/combat-loop.js:3626-3698` (the `runNpcDialogue` function)

**Context:** The current function calls `apiStartNpcDialogue()`, destructures `{ npc, freed, rounds, userId, greetingTts, freedTts }`, shows a "freed" narration, loops 3 quiz rounds with buttons, calls `apiRespondNpcDialogue()` per round, then shows a bond summary toast. We replace this with: call API → check `mode` → if `'defeat_line'`, show NPC sprite + single narration line → dismiss → done. The existing quiz code moves into an `else` branch for future `'quiz'` mode.

The narration box is shown via `narration.showNarration(text, { speaker, html })`. Player taps/clicks to dismiss (returns a promise). The `renderEnFirst()` helper renders English-first text display.

For showing tokenized Japanese text in the narration box, we need to render the tokens as readable text. The simplest approach: join token surfaces to create the display text. The narration system already handles clicking to dismiss.

- [ ] **Step 1: Rewrite runNpcDialogue**

Replace the `runNpcDialogue` function body (lines 3626-3698) in `public/js/ui/combat-loop.js`:

```javascript
export async function runNpcDialogue() {
  if (npcDialogueActive) return;
  if (!apiStartNpcDialogue) return;
  npcDialogueActive = true;

  try {
    const dialogueData = await apiStartNpcDialogue();
    if (!dialogueData) return;

    if (dialogueData.mode === 'defeat_line') {
      // v1: single i+1 defeat line — show in narration, tap to dismiss
      const { npc, line } = dialogueData;
      const npcName = npc.nameEn || npc.name;

      if (showNpcSprite) showNpcSprite(npcName, npc.id, npc);

      // Build display text from tokens
      const displayText = line.tokens.map(t => t.surface || '').join('');
      await narration.showNarration(displayText, { speaker: npcName });

      if (hideNpcSprite) hideNpcSprite();
      // Re-render scene after hiding NPC sprite (same as showNpcGreeting pattern)
      if (updateUI) updateUI();
    } else {
      // Future: quiz mode — original flow preserved here
      const { npc, freed, rounds, userId, greetingTts, freedTts } = dialogueData;
      const npcName = npc.nameEn || npc.name;

      if (showNpcSprite) showNpcSprite(npcName, npc.id, npc);

      if (freedTts && userId) {
        playDialogueAudio(userId, freedTts);
      }
      await narration.showNarration(renderEnFirst(freed), { speaker: npcName, html: true });

      let totalDelta = 0;

      for (let i = 0; i < rounds.length; i++) {
        const round = rounds[i];

        if (round.npcLineTts && userId) {
          playDialogueAudio(userId, round.npcLineTts);
        }
        await narration.showNarration(renderEnFirst(round.npcLine), { speaker: npcName, persistent: true, html: true });

        const selectedIndex = await renderButtonsAsync(
          round.options.map(o => ({
            label: renderEnFirst(typeof o === 'string' ? o : o.text),
          }))
        );

        if (round.options[selectedIndex]?.tts && userId) {
          playDialogueAudio(userId, round.options[selectedIndex].tts);
        }

        if (narration.forceHideNarration) narration.forceHideNarration();

        const result = await apiRespondNpcDialogue(i, selectedIndex);
        if (!result) break;

        if (result.dialogueComplete) {
          totalDelta = result.totalDelta;
          if (result.state) {
            updateGameState(result.state);
          }
          break;
        }
      }

      if (hideNpcSprite) hideNpcSprite();

      showBondSummary(npcName, totalDelta);
      await delay(2200);
      document.querySelector('.bond-summary')?.remove();
    }
  } finally {
    npcDialogueActive = false;
  }
}
```

Key changes:
- Removed the guard on `apiRespondNpcDialogue` (line 3628) — it's only needed for quiz mode, and the else branch can check it
- Added `mode` check: `defeat_line` shows single narration; everything else falls through to original quiz flow
- Defeat line path: show NPC sprite → narrate joined token surfaces → dismiss → hide sprite → updateUI() to re-render scene
- No bond summary, no quiz rounds, no calls to `/npc-dialogue-respond`

- [ ] **Step 2: Verify syntax**

```bash
node --check public/js/ui/combat-loop.js && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: update runNpcDialogue to show single defeat line for mode=defeat_line"
```

---

### Task 5: End-to-end verification

- [ ] **Step 1: Run full test suite**

```bash
npm test 2>&1 | tail -30
```

Expected: All tests pass.

- [ ] **Step 2: Syntax check all modified files**

```bash
node --check src/routes/game/combat.js && node --check src/game/dialogue-loader.js && node --check public/js/ui/combat-loop.js && echo "All OK"
```

Expected: `All OK`

- [ ] **Step 3: Start dev server and verify it boots**

```bash
npm run dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Expected: `200`. Kill the server after verification.

- [ ] **Step 4: Manual playtest checklist**

If Playwright browser is available, test the following (ask user before opening Playwright):

1. Start a run, navigate to an NPC battle room (room indices 5, 11, 17, or 23)
2. Win the combat
3. Verify: a single Japanese defeat line appears in the narration box (not 3 quiz rounds)
4. Tap to dismiss the narration
5. Verify: skill selection screen appears immediately (pick 1 of 3 skills)
6. Pick a skill, verify return to exploring

- [ ] **Step 5: Final commit if any fixes needed**

If manual testing reveals issues, fix and commit incrementally.
