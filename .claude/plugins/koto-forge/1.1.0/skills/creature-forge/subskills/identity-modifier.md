# Identity & Modifier Generator (Subagent 3)

You are suggesting archetype, element, and modifier candidates for a Japanese vocabulary learning RPG creature.

## Input

Read the baton JSON file at the path provided to you. Key fields you need:

- `meaning` — the creature's concept
- `name`, `reading` — Japanese word
- `frequencyTier`, `visualTier` — tiers
- `tierCeilings.modPreferred` / `tierCeilings.modCeiling` — frequency rank limits for modifier words

## Your Task

1. Suggest an **archetype**
2. Suggest an **element**
3. Produce **3 modifier candidates**

### Archetype

Choose one of: **Fighter | Tank/Healer | Mage | Trickster**

Provide 1 sentence of reasoning based on the creature's concept. Example: "A scissors creature naturally snips and cuts — Fighter fits its aggressive, precise style."

### Element

Choose one of: **Fire | Wood | Earth | Metal | Water**

Provide 1 sentence of reasoning. Example: "Scissors are forged metal — Metal is the natural fit."

### Concept-Visual Alignment (the "Mouse Rule")

Before suggesting modifiers, verify the visual tier is correct. The visual tier is the **lower** of frequency tier and concept's max visual tier:

| Concept Scale | Examples | Max Visual Tier |
|---------------|----------|-----------------|
| Tiny/Cute | mouse, hamster, sparrow, ladybug, snail, goldfish, kitten | Uncommon |
| Small/Mundane | scissors, pencil, sock, eraser, spoon, cup, key, leaf | Rare |
| Medium/Neutral | dog, cat, horse, desk, clock, umbrella, guitar, lantern | Epic |
| Large/Impressive | bear, eagle, shark, cannon, volcano, storm, fortress | Legendary |
| Mythical/Abstract | dragon, phoenix, void, time, fate, cosmos, death | Legendary |

If the visual tier in the baton seems wrong based on this table, note it in your output.

### Modifier Rules

A modifier is a title/epithet describing personality, origin, or nature — e.g., "Ancient", "Wild", "Silent". It completes: "[Name] the [Modifier] [Base Meaning]".

For each of 3 candidates:

1. **Must be a Japanese adjective, な-adjective, or descriptor noun** that works as "[Modifier]の[Base]" in Japanese. 古代の亀 (ancient turtle) reads naturally. A Japanese player hearing "[modifier]の[base]" should immediately picture a coherent concept.

2. **JPDB rank within tier modifier ceilings.** Prefer below `modPreferred`, hard ceiling at `modCeiling`. Hard-discard rank 30000+.

3. **Use the most common spelling form.** Run JPDB lookup to resolve.

4. **Translation accuracy is NON-NEGOTIABLE.**
   - Use primary dictionary definition from JPDB
   - NEVER change transitivity or embellish meanings
   - Show raw JPDB `meanings` array
   - If accurate translation feels weak, pick a different word

5. **Include an appearance sketch** — 1-2 sentences showing how this modifier would influence the creature's visual design. Each sketch should pull the creature in a meaningfully different visual direction.

6. **Should thematically match** the creature's archetype, element, or concept.

### Stage-Aware Modifier Selection

Use the forge-discovery script to find stage-appropriate modifiers:

```bash
node scripts/forge-discovery.mjs --type creature-modifier --stage ${CREATURE_STAGE} --limit 20
```

This returns adjectives from `descriptors.json`, `emotions.json`, and `colors.json` filtered to the creature's stage. Use these as a starting pool — you may still use JPDB to look up additional words, but prefer words from this list as they are pre-verified for stage appropriateness.

The `stage` value comes from the baton's `stage` field.

### JPDB Lookup

Write a temp script to `/tmp/creature-identity-lookup.mjs` and run it:

```javascript
#!/usr/bin/env node
const { resolveCommonForms, tierFromRank } = await import(process.cwd() + '/scripts/lib/jpdb-helpers.mjs');
import { readFile } from 'fs/promises';

const words = ['古代', '静か', '野生']; // your modifier candidates
const apiKey = (await readFile(process.cwd() + '/data/.creature-forge-jpdb-key', 'utf8')).trim();
const results = await resolveCommonForms(words, apiKey);

for (const r of results) {
  console.log(JSON.stringify(r));
}
```

## Output

Read the baton JSON, add your output fields, write it back. Append:

```json
{
  "archetype": {
    "value": "Fighter",
    "reasoning": "A scissors creature naturally snips and cuts — Fighter fits its aggressive, precise style."
  },
  "element": {
    "value": "Metal",
    "reasoning": "Scissors are forged metal — Metal is the natural fit."
  },
  "modifierCandidates": [
    {
      "label": "A",
      "word": "古代",
      "reading": "こだい",
      "meaning": "Ancient",
      "rank": 5500,
      "allForms": "古代(5,500)",
      "rawMeanings": [["ancient times", "antiquity"]],
      "appearanceSketch": "Crumbling temple-dome shell, oxidized bronze plates, fossilized coral, dusty golden aura"
    },
    { "label": "B", ... },
    { "label": "C", ... }
  ]
}
```

Read the baton file, add these fields to the existing object, and write the entire object back to the same file.
