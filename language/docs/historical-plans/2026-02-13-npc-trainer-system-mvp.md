# NPC Trainer System MVP

Every encounter in the game becomes a meeting with a named character. Players fight an NPC's team of 3 robots, free the NPC from system control, then build (or damage) a persistent bond through dialogue choices.

---

## Core Concept

NPCs replace anonymous enemy encounters. Like Pokemon trainers, each NPC greets the player, battles with a team of robots, and — once defeated — becomes a freed character the player can form a relationship with.

**Bond** is an unbounded integer per NPC, persisted in meta-progression. Each post-combat dialogue contributes +3 to -3 depending on the player's choices. Bond survives across runs.

---

## Data Model

### NPC Definition (`data/npcs.json`)

```json
{
  "npc_01": {
    "id": "npc_01",
    "name": "トレーナーA",
    "nameEn": "Trainer A",
    "area": null,
    "tier": 1,
    "personality": {
      "traits": ["friendly", "energetic"],
      "speechStyle": "Upbeat and encouraging",
      "quirk": "Placeholder quirk"
    },
    "greeting": "やあ！勝負だ！",
    "defeatLine": "まだ…システムに…支配されている…",
    "postCombat": {
      "freed": "ありがとう…目が覚めた。",
      "rounds": [
        {
          "npcLine": "助けてくれてありがとう。君は強いね。",
          "options": [
            { "text": "大丈夫？怪我はない？", "tone": "positive" },
            { "text": "うん、まあね。", "tone": "neutral" },
            { "text": "当然だろ。", "tone": "negative" }
          ]
        },
        {
          "npcLine": "この街、前はもっと平和だったのに…",
          "options": [
            { "text": "一緒に取り戻そう。", "tone": "positive" },
            { "text": "そうみたいだね。", "tone": "neutral" },
            { "text": "知らないな。", "tone": "negative" }
          ]
        },
        {
          "npcLine": "また会えるかな？",
          "options": [
            { "text": "もちろん！また会おう。", "tone": "positive" },
            { "text": "たぶんね。", "tone": "neutral" },
            { "text": "さあ、どうかな。", "tone": "negative" }
          ]
        }
      ]
    }
  }
}
```

**Fields:**
- `area` — reserved for future area-based placement (null for now)
- `tier` — difficulty tier, reserved for future scaling (ignored for now)
- `greeting` — shown in narration box before combat
- `defeatLine` — shown if the player loses (NPC stays possessed)
- `postCombat.freed` — first line after liberation
- `postCombat.rounds` — 3 dialogue rounds, each with 3 toned options
- Option order is **randomized at serve time** so position reveals nothing

### Bond Storage (`meta.npcBonds`)

Stored in meta-progression alongside `robotCollection` and `essence`:

```json
{
  "npcBonds": {
    "npc_01": { "bond": 3, "encounters": 2, "lastInteraction": "2026-02-13" },
    "npc_05": { "bond": -1, "encounters": 1, "lastInteraction": "2026-02-12" }
  }
}
```

---

## Game Flow

### Encounter Room (previously anonymous combat)

```
Player enters encounter/boss room
    │
    ▼
NPC sprite appears (centered, with name)
    │
    ▼
Narration box: NPC greeting (click to dismiss)
    │
    ▼
Robot combat (NPC's 3 robots vs player's 3)
Befriend action DISABLED during NPC battles
    │
    ├── Player wins ──────────── Player loses
    │        │                        │
    │        ▼                        ▼
    │   Narration: freed line     Narration: defeatLine
    │        │                   ("still controlled")
    │        ▼                        │
    │   3 dialogue rounds             ▼
    │   (see below)              Normal defeat flow
    │        │
    │        ▼
    │   Bond updated (sum of 3 choices)
    │   Encounter count incremented
    │        │
    │        ▼
    │   Post-combat shop (existing)
```

### Dialogue Round Detail

Each round:
1. NPC line appears in narration box (with NPC name as speaker)
2. Three response buttons appear in action area (shuffled order)
3. Player taps one
4. Visual feedback:
   - **Positive (+1):** heart floats up over NPC with `+1`
   - **Neutral (0):** empty heart, no number
   - **Negative (-1):** broken heart with `-1`
5. 800ms pause, then next round

After 3 rounds: toast shows total bond change (e.g. `"カイとの絆 +2"`), auto-dismisses after 2 seconds, then transitions to post-combat shop.

---

## Backend Architecture

### New Files

| File | Purpose |
|------|---------|
| `data/npcs.json` | NPC roster (~10 placeholder characters) |
| `src/game/services/npc-service.js` | NPC selection, bond read/write |

### `src/game/services/npc-service.js`

```javascript
// Load NPC roster
loadNpcs() → Object<npcId, NpcDefinition>

// Pick an NPC for a regular encounter
selectNpcForEncounter(floor, alreadyUsedNpcIds) → NpcDefinition
  // Random from roster, avoids repeats on same floor

// Pick a boss-tier NPC
selectNpcForBoss(floor) → NpcDefinition
  // Higher tier NPC (for now, just pick any — tier filtering comes later)

// Bond operations
getNpcBond(meta, npcId) → { bond, encounters, lastInteraction } | null
updateBond(meta, npcId, delta) → updated bond entry
recordEncounter(meta, npcId) → increments counter, sets lastInteraction
```

### Modified Files

**`src/game/state.js`**
- Add `npcBonds: {}` to `createMetaProgression()`

**`src/game/phase-machine.js`**
- Add `npc_dialogue` phase between `victory` and `post_combat_shop`

**`src/game/services/combat-service.js`**
- `startRobotEncounter()` sets `combat.npcId` and `combat.npcData` on combat state
- When `combat.npcId` is set: befriend action returns error

**`src/game/loop.js`**
- Wire NPC selection into encounter start
- Expose `updateNpcBond()` delegate method

**`src/routes/game/combat.js`**
- Add `POST /api/game/npc-dialogue-respond`
  - Input: `{ roundIndex, selectedIndex }`
  - Validates round sequence
  - Looks up tone from `npcs.json` (tone not sent to client)
  - Returns: `{ tone, bondDelta, totalBond, roundsRemaining }`
  - After round 3: also returns `{ dialogueComplete: true, totalDelta, npcName }`

**`public/js/api.js`**
- Add `apiNpcDialogueRespond(roundIndex, selectedIndex)`

**`public/js/ui/combat-loop.js`**
- `showNpcGreeting(npc)` — narration with NPC name as speaker
- `showNpcDialogueRounds(rounds, npcName)` — 3-round dialogue loop
- `showBondFeedback(tone)` — heart animation (+1 / 0 / -1)
- `showBondSummary(npcName, totalDelta)` — auto-dismiss toast
- Hide befriend card when `combat.npcId` is set

**`public/game.css`**
- Bond heart float animation (positive/neutral/negative variants)

---

## NPC Roster (Placeholders)

10 generic NPCs. Real characters provided later.

| ID | Name | Tier | Archetype |
|----|------|------|-----------|
| npc_01 | Trainer A | 1 | Friendly student |
| npc_02 | Trainer B | 1 | Shy researcher |
| npc_03 | Trainer C | 1 | Energetic kid |
| npc_04 | Trainer D | 2 | Stern guard |
| npc_05 | Trainer E | 2 | Cheerful shopkeeper |
| npc_06 | Trainer F | 2 | Mysterious hacker |
| npc_07 | Trainer G | 3 | Tired office worker |
| npc_08 | Trainer H | 3 | Proud martial artist |
| npc_09 | Trainer I | 3 | Calm scientist |
| npc_10 | Trainer J | 4 | Boss-tier rival |

Each NPC has: greeting, defeat line, freed line, 3 dialogue rounds (9 options).

---

## What's NOT in the MVP

- AI-generated dialogue (pre-seeded only, architecture ready for narration engine)
- Area-based NPC placement (`area` field exists, unused)
- Bond milestones or rewards
- NPC fixed teams (robots randomly generated, scaled to player level)
- NPC memory across encounters (same dialogue each time)
- Different dialogue based on bond level or encounter count
- NPC sprites (reuse existing enemy sprite slot for now)

---

## Future Path

This MVP establishes the NPC encounter pattern and persistent bond tracking. The narration engine design doc (`docs/plans/2026-02-12-living-world-narration-design.md`) describes the full evolution:

1. **Tier 1:** Vocab-personalized dialogue replaces pre-seeded text
2. **Tier 2:** Character cards drive personality-distinct generation
3. **Tier 3:** NPCs remember past encounters, dialogue changes with bond level
4. **Tier 4:** NPCs gossip about the player's reputation across the world

The `npcBonds` data structure and `npc-service.js` module support all four tiers without restructuring.
