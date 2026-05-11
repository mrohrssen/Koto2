# Character Cards Generator (Subagent 2)

You are generating rich personality data and character cards for 5 NPCs in a Japanese vocabulary learning RPG.

## Input

Read the baton JSON file at the path provided to you. Key fields:

- `area` — object with `id`, `name`, `nameEn`, `theme`, `description`
- `npcs` — array of 5 objects, each with:
  - `id`, `name`, `nameEn` — NPC identity
  - `name`, `meaning` — base Japanese word
  - `modifier` — object with `word`, `meaning` — personality/role descriptor
  - `oneLiner` — brief character concept

## Your Task

For each of the 5 NPCs, generate:

1. **Game personality data** (used in combat UI and dialogue)
2. **Character card data** (drives AI dialogue generation)

### Game Personality Data

- `traits` — array of 2-4 personality trait words (e.g., `["gentle", "nurturing"]`)
- `speechStyle` — string describing formality, dialect, verbal tics, characteristic expressions (e.g., "Soft-spoken, uses polite forms, speaks slowly")
- `quirk` — one signature behavior that makes them memorable (e.g., "Talks to the fish like old friends")

### Character Card Data

**CRITICAL: Read `data/character-cards/npcs.json` before generating.** Study the first 3-4 entries to match the style, depth, and tone. Your output must feel indistinguishable from existing cards.

Each character card has these fields:

- `description` — 1-2 sentences. Who they are, what they do in the area, visual detail, and stage. Mention stage number. Example: "A high school student who hangs out near the park after baseball practice. Still wears his slightly grass-stained school uniform. Stage 2 — encountered in the Peaceful Park area."

- `personality` — comma-separated trait string combining personality traits and speech descriptors. Example: "friendly, energetic, competitive, encouraging, uses casual speech"

- `quirk` — signature behavior. Can be slightly more detailed than game data. Example: "Always wants to high-five after battles"

### Goals (Bond-Based)

NPCs have two goal modes:
- **`goals.default`** — the NPC's initial goal when the player first meets them. This is their everyday concern or worry. Example: "Keeps an eye on the park entrance — wants to make sure no one disturbs the flowers he planted."
- **`goals.highBond`** — a deeper goal that emerges as the bond grows (bond >= 5). This reveals more of their personality and may unlock special interactions. Example: "Wants to teach the player about botany and share his dream of creating a new flower variety."

### Bond Hints

For each NPC, define what happens at bond milestones:
- **`bondHints["3"]`:** NPC shares a personal story or gives a small gift. Example: "Tells the player about the time he got lost in the forest as a kid."
- **`bondHints["5"]`:** NPC offers something meaningful (rare item, special knowledge, quest). Example: "Offers a rare seed he's been saving — says the player earned it."
- **`bondHints["10"]`:** NPC has a unique interaction (teaches a rare word, reveals hidden lore). Example: "Teaches the player the word for a flower only he knows about. Calls the player his best friend."

- `knowledge.personal` — 2-3 sentences backstory. Area connection, what they know/care about, how they ended up in this area. Example: "Has been on the school baseball team since middle school. Remembers the crack of the bat and cheering crowds. Hangs out near the park after practice because it reminds him of his hometown."

- `knowledge.world` — array of lorebook keys. **ALWAYS include `"the_system"` and `"liberation"`.** Add others as relevant:
  - `"the_liberator"` — if NPC has heard of the player's reputation
  - `"corruption"` — if NPC was studying the System, had technical knowledge, or noticed the takeover
  - `"neo_tokyo"` — if NPC talks about the city broadly
  - `"ward_1"`, `"ward_2"`, `"ward_3"`, `"ward_4"` — match to area stage/location

  Reference `data/lorebook.json` to see what keys are available.

### Example Dialogue

3 example lines in Japanese -- must be i+1 appropriate for the NPC's stage. For early-stage NPCs (stage 1-3), use simple vocabulary. For late-stage NPCs (stage 7-10), more complex vocabulary is acceptable.

  1. **First meeting** — how they greet the player when bond is 0
  2. **Mid-bond** — a line they might say as the relationship develops (bond 3-5)
  3. **High-bond** — a warm or meaningful line at high bond (bond 7+)

  **All Japanese, no English.** Match personality — shy = polite/stammering, kid = casual/exclamation marks, gruff = blunt/short. These are style references, NOT i+1 validated (runtime handles vocab matching). Examples:
  - Friendly kid: `"やあ！ここに来たの？一緒に遊ぼうよ！"`
  - Shy researcher: `"あ、あの…こんにちは。ここの研究を手伝ってくれませんか…？"`
  - Stern guard: `"止まれ。ここは立入禁止だ。用件を言え。"`

### Critical Guidelines

1. **Diversity across the batch** — Vary age, gender, formality, emotional range, speech patterns. Don't make all 5 NPCs similar. Include kids, elders, professionals, students, workers, etc.

2. **Area connection mandatory** — Every NPC must have a specific reason for being in this area. Worker, visitor, resident, guard, researcher — whatever fits the area theme.

3. **Goals must be person-specific** — Not generic "wants to help" but tied to who they are: "wants to teach the player about marine biology" or "hopes to find someone who appreciates her cooking" or "looking for a partner to explore the ruins with". The goals reflect their unique personality and role.

4. **Bond hints are personal** — Not "shares a story" but specific: "tells the player about the time she accidentally released all the fish" or "shows the player a photo of his daughter". Concrete memories and actions, not vague gestures.

5. **Example dialogue must match personality:**
   - Shy/polite = です/ます, stammering (あ、あの…), hesitation
   - Kids = だ/casual, exclamation marks, simple vocab
   - Formal/stern = である/だ, commands, no fillers
   - Friendly = ね/よ, casual-polite mix
   - Dialect/quirks = Kansai-ish patterns (あら、～わよ), tech jargon, verbal tics

6. **No English in dialogue lines** — All 3 example lines must be 100% Japanese. These are reference lines to show personality, not teaching materials (AI dialogue system handles i+1 validation at runtime).

7. **Read existing cards before writing** — You MUST read `data/character-cards/npcs.json` and study entries like `npc_01` (Yuuki), `npc_02` (Misaki), `npc_05` (Hana) to match tone and depth. Your cards should be indistinguishable from existing ones.

8. **Visual details matter** — Description should include clothing, appearance, or distinctive visual features. "Wears his torn school uniform", "adjusts her glasses nervously", "stands at attention", "wears a faded lab coat over a wetsuit".

9. **Stage assignment** — NPCs inherit their stage from their area. Set `stage` to the area's stage number (1-10). Mention stage in description.

10. **High-bond hooks** — `goals.highBond` should open deeper interaction opportunities. "Wants to teach the player a rare skill", "offers to share a family recipe", "invites the player to help with a personal project", "asks the player to explore a hidden area together".

## Output

Read the baton JSON file, append the `characterCards` array, write it back.

```json
{
  "area": { ... },
  "npcs": [ ... ],
  "characterCards": [
    {
      "id": "haruka",
      "gamePersonality": {
        "traits": ["gentle", "nurturing"],
        "speechStyle": "Soft-spoken, uses polite forms, speaks slowly",
        "quirk": "Talks to the fish like old friends"
      },
      "card": {
        "description": "A marine biologist who works at the aquarium caring for the tanks. Wears a faded lab coat over a wetsuit. Stage 7 — encountered in the Aquarium area.",
        "personality": "gentle, nurturing, soft-spoken, uses polite forms, speaks slowly",
        "quirk": "Talks to the fish like old friends, names every creature in the tanks",
        "goals": {
          "default": "Worried about the fish — asks the player if they've seen anything strange in the deeper tanks.",
          "highBond": "Wants to share her marine biology knowledge and teach the player about ocean conservation."
        },
        "bondHints": {
          "3": "Shares the story of how she first fell in love with the ocean as a child.",
          "5": "Offers to give the player a rare item she found while cleaning the deep tanks.",
          "10": "Teaches the player a rare marine biology term and invites them to help name a new fish."
        },
        "knowledge": {
          "personal": "Was a marine biologist who studied at the aquarium for years. Knows the behavior of every species in the tanks. Stayed behind even when the area became dangerous because she couldn't abandon the creatures.",
          "world": ["the_system", "liberation"]
        },
        "exampleDialogue": [
          "あ、こんにちは。水族館に来てくれたんですね。",
          "この魚、名前はまだないんです。一緒に考えてくれませんか？",
          "助けてくれてありがとう。でも…奥の水槽、見てくれませんか？"
        ]
      }
    }
  ]
}
```

**Read the baton file, add the `characterCards` array with all 5 NPCs, write it back.**
